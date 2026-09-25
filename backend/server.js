// server.js — API REST do Digão Gestão (Seção 23 do documento)
// + Módulo de Mesas e Garçons
// + Módulo de Impressão (Bematech MP-4200 TH)
// + FIX Bug #1: 1 mesa = 1 pedido ativo
// + FIX Bug #2: impressão automática para TODOS os canais
// + FIX Bug #4: timezone local em todas as queries de data
// + FIX Bug #2b: envio explícito para cozinha (só MESA)
// + FIX v1.6.1: todo pagamento exige caixa aberto (RN017)
// + FIX Ciclo 1: helpers financeiros, multi-pagamentos, saldo, cash/close
// + FIX Ciclo 2 / AUD-PD-01..05: validação server-side de itens
// + FIX Ciclo 3 / AUD-ME-07: separação itens existentes vs novos
// + FIX Ciclo 4 / AUD-ME-02 / 05 / 06: force-free c/ auditoria, waiter, pedido PAGO inativo
// + FIX Ciclo 5 / AUD-ARQ-01: order_items.is_additional + marcação em comanda
// + FIX Ciclo 6 / AUD-PG-07: estorno (payments_refunds), financial_status ESTORNADO,
//   cash_movements ESTORNO, endpoints de histórico de caixa
// + FIX Ciclo 6 / BUG-D: expõe payments (plural) preservando payment (singular)
// + FIX Ciclo 7 / AUTH: autenticação server-side com sessão + cookie HttpOnly.
//   Toda rota é protegida por requireAuth/requireRole. Backend é a autoridade.
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const printer = require('./printer');
const auth = require('./auth');

const app = express();
const PORT = 3000;

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Identifica req.user a partir do cookie (não bloqueia — só popula)
app.use(auth.identifyUser);

app.use((req, res, next) => {
  const user = req.user ? req.user.username : 'anon';
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${req.method} ${req.url} (${user})`);
  next();
});

// ============================================================
// HELPERS DE ESTADO
// ============================================================

function getOpenCashRegister() {
  return db.prepare(
    "SELECT * FROM cash_registers WHERE status='ABERTO' ORDER BY id DESC LIMIT 1"
  ).get();
}

function getActiveOrderByTable(tableId) {
  const candidatos = db.prepare(`
    SELECT * FROM orders
    WHERE table_id = ? AND status NOT IN ('CONCLUIDO','CANCELADO')
    ORDER BY id ASC
  `).all(tableId);

  for (const pedido of candidatos) {
    const fs = getOrderFinancialStatus(pedido.id);
    if (fs !== 'PAGO' && fs !== 'ESTORNADO') {
      return pedido;
    }
  }
  return undefined;
}

function recalcularTotaisPedido(orderId) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0);
  const order = db.prepare('SELECT delivery_fee FROM orders WHERE id = ?').get(orderId);
  const fee = order?.delivery_fee || 0;
  const total = subtotal + fee;
  db.prepare(`
    UPDATE orders SET subtotal = ?, total = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(subtotal, total, orderId);
  return { subtotal, delivery_fee: fee, total };
}

function getPendingItems(orderId) {
  return db.prepare(`
    SELECT * FROM order_items
    WHERE order_id = ? AND print_status = 0
    ORDER BY id ASC
  `).all(orderId);
}

// ============================================================
// HELPERS FINANCEIROS
// ============================================================

function getOrderGrossPaid(orderId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM payments
    WHERE order_id = ?
  `).get(orderId);
  return Number(row.total) || 0;
}

function getOrderRefundsTotal(orderId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM payments_refunds
    WHERE order_id = ?
  `).get(orderId);
  return Number(row.total) || 0;
}

function getOrderNetPaid(orderId) {
  const gross = getOrderGrossPaid(orderId);
  const refunded = getOrderRefundsTotal(orderId);
  return Math.max(0, gross - refunded);
}

function getOrderPaymentsTotal(orderId) {
  return getOrderNetPaid(orderId);
}

function getOrderRemaining(orderId) {
  const order = db.prepare('SELECT total FROM orders WHERE id = ?').get(orderId);
  if (!order) return 0;
  const paid = getOrderNetPaid(orderId);
  const remaining = Number(order.total) - paid;
  return remaining > 0 ? remaining : 0;
}

function getOrderFinancialStatus(orderId) {
  const order = db.prepare('SELECT total FROM orders WHERE id = ?').get(orderId);
  if (!order) return 'ABERTO';

  const total = Number(order.total) || 0;
  const grossPaid = getOrderGrossPaid(orderId);
  const netPaid = getOrderNetPaid(orderId);

  if (grossPaid <= 0) return 'ABERTO';
  if (netPaid <= 0) return 'ESTORNADO';

  if (Math.abs(netPaid - total) < 0.01 || netPaid > total) return 'PAGO';
  return 'PARCIAL';
}

function enrichOrderFinancials(order) {
  if (!order) return order;
  order.financial_status = getOrderFinancialStatus(order.id);
  order.payments_total = getOrderNetPaid(order.id);
  order.refunds_total = getOrderRefundsTotal(order.id);
  order.remaining = getOrderRemaining(order.id);
  return order;
}

function getPaymentRefundable(paymentId) {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!payment) return 0;
  const refunded = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM payments_refunds WHERE payment_id = ?
  `).get(paymentId).total;
  return Math.max(0, Number(payment.amount) - Number(refunded));
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================

// Login — público
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  if (!user.active) {
    return res.status(401).json({ error: 'Usuário inativo' });
  }

  if (!user.password_hash) {
    return res.status(401).json({ error: 'Usuário sem senha definida' });
  }

  if (!auth.verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  // Limpa sessões expiradas oportunisticamente
  auth.cleanupExpiredSessions();

  // Cria sessão
  const { token } = auth.createSession(user.id);
  auth.setSessionCookie(res, token);

  res.json({
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role
    }
  });
});

// Logout — autenticado
app.post('/api/auth/logout', auth.requireAuth, (req, res) => {
  const token = auth.getCookieToken(req);
  if (token) auth.revokeSession(token);
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

// Me — autenticado
app.get('/api/auth/me', auth.requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      username: req.user.username,
      role: req.user.role
    }
  });
});

// Alterar a própria senha — autenticado
app.put('/api/auth/password', auth.requireAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Senha atual e nova senha obrigatórias' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'Nova senha precisa ter pelo menos 8 caracteres' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  if (!auth.verifyPassword(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(auth.hashPassword(new_password), user.id);

  // Revoga todas as sessões do usuário (incluindo a atual)
  auth.revokeAllUserSessions(user.id);
  auth.clearSessionCookie(res);

  res.json({ ok: true, message: 'Senha alterada. Faça login novamente.' });
});

// ============================================================
// ADMINISTRAÇÃO DE USUÁRIOS — somente admin
// ============================================================

app.get('/api/users', auth.requireRole('admin'), (req, res) => {
  const users = db.prepare(`
    SELECT id, name, username, role, active, created_at
    FROM users ORDER BY id ASC
  `).all();
  res.json(users);
});

app.post('/api/users', auth.requireRole('admin'), (req, res) => {
  const { name, username, password, role } = req.body || {};

  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Nome, username e senha obrigatórios' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Senha precisa ter pelo menos 8 caracteres' });
  }
  if (!['admin', 'caixa', 'cozinha', 'garcom'].includes(role)) {
    return res.status(400).json({ error: 'Role inválida' });
  }

  try {
    const r = db.prepare(`
      INSERT INTO users (name, username, password_hash, role, active)
      VALUES (?, ?, ?, ?, 1)
    `).run(name, username, auth.hashPassword(password), role);

    res.json({ id: r.lastInsertRowid, name, username, role });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username já em uso' });
    }
    console.error('[users] erro:', e);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

app.put('/api/users/:id', auth.requireRole('admin'), (req, res) => {
  const { name, role, active } = req.body || {};
  const id = Number(req.params.id);

  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });

  if (role && !['admin', 'caixa', 'cozinha', 'garcom'].includes(role)) {
    return res.status(400).json({ error: 'Role inválida' });
  }

  // Impede que o admin desative a si mesmo
  if (id === req.user.id && active === false) {
    return res.status(400).json({ error: 'Você não pode desativar a própria conta' });
  }

  db.prepare(`
    UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?
  `).run(
    name ?? u.name,
    role ?? u.role,
    active != null ? (active ? 1 : 0) : u.active,
    id
  );

  // Se desativou, revoga todas as sessões do alvo
  if (active === false) {
    auth.revokeAllUserSessions(id);
  }

  res.json({ ok: true });
});

app.put('/api/users/:id/password', auth.requireRole('admin'), (req, res) => {
  const { new_password } = req.body || {};
  const id = Number(req.params.id);

  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'Nova senha precisa ter pelo menos 8 caracteres' });
  }

  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(auth.hashPassword(new_password), id);

  // Revoga todas as sessões do alvo
  auth.revokeAllUserSessions(id);

  res.json({ ok: true, message: 'Senha redefinida. Sessões do usuário foram encerradas.' });
});

// ============================================================
// ROTA RAIZ (pública — health/info)
// ============================================================
app.get('/api', (req, res) => {
  res.json({
    sistema: 'Digão Gestão',
    versao: '1.7.0',
    cliente: 'Digão Burger & Shawarma — Toledo/PR',
    modulos: ['PDV', 'Pedidos', 'WhatsApp', 'Cozinha', 'Caixa', 'Entregadores', 'Produtos', 'Financeiro', 'Relatórios', 'Mesas', 'Garçom', 'Impressão', 'Estorno', 'Usuários']
  });
});

// ============================================================
// CATEGORIES
// ============================================================
app.get('/api/categories', auth.requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM categories WHERE active = 1').all());
});

app.post('/api/categories', auth.requireRole('admin'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const r = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
    res.json({ id: r.lastInsertRowid, name });
  } catch (e) {
    res.status(400).json({ error: 'Categoria já existe' });
  }
});

// ============================================================
// PRODUCTS
// ============================================================
app.get('/api/products', auth.requireAuth, (req, res) => {
  const { category, active } = req.query;
  let sql = `
    SELECT p.*, c.name AS category
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE 1=1
  `;
  const params = [];
  if (category) { sql += ' AND c.name = ?'; params.push(category); }
  if (active !== 'all') { sql += ' AND p.active = 1'; }
  sql += ' ORDER BY c.name, p.name';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/products/barcode/:code', auth.requireAuth, (req, res) => {
  const p = db.prepare(`
    SELECT p.*, c.name AS category
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.barcode = ? AND p.active = 1
  `).get(req.params.code);
  if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json(p);
});

app.post('/api/products', auth.requireRole('admin'), (req, res) => {
  const { category_id, name, price, is_additional, barcode } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'Nome e preço obrigatórios' });
  const r = db.prepare(
    'INSERT INTO products (category_id, name, price, is_additional, barcode) VALUES (?,?,?,?,?)'
  ).run(category_id || null, name, price, is_additional ? 1 : 0, barcode || null);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/products/:id', auth.requireRole('admin'), (req, res) => {
  const { name, price, active, category_id, barcode } = req.body;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produto não encontrado' });
  db.prepare(`
    UPDATE products SET name = ?, price = ?, active = ?, category_id = ?, barcode = ?
    WHERE id = ?
  `).run(
    name ?? existing.name,
    price ?? existing.price,
    active != null ? (active ? 1 : 0) : existing.active,
    category_id ?? existing.category_id,
    barcode !== undefined ? barcode : existing.barcode,
    req.params.id
  );
  res.json({ ok: true });
});

app.delete('/api/products/:id', auth.requireRole('admin'), (req, res) => {
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// WAITERS
// ============================================================
app.get('/api/waiters', auth.requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM waiters WHERE active = 1 ORDER BY name').all());
});

app.post('/api/waiters', auth.requireRole('admin'), (req, res) => {
  const { name, phone, code } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const r = db.prepare('INSERT INTO waiters (name, phone, code) VALUES (?,?,?)')
      .run(name, phone || null, code || null);
    res.json({ id: r.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Código já em uso' });
  }
});

app.put('/api/waiters/:id', auth.requireRole('admin'), (req, res) => {
  const { name, phone, code, active } = req.body;
  const w = db.prepare('SELECT * FROM waiters WHERE id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Garçom não encontrado' });
  db.prepare(`
    UPDATE waiters SET name = ?, phone = ?, code = ?, active = ? WHERE id = ?
  `).run(
    name ?? w.name,
    phone ?? w.phone,
    code ?? w.code,
    active != null ? (active ? 1 : 0) : w.active,
    req.params.id
  );
  res.json({ ok: true });
});

// ============================================================
// TABLES
// ============================================================
app.get('/api/tables', auth.requireAuth, (req, res) => {
  const tables = db.prepare(`
    SELECT t.*, w.name AS waiter_name
    FROM tables t
    LEFT JOIN waiters w ON w.id = t.waiter_id
    ORDER BY t.number
  `).all();

  tables.forEach(t => {
    const order = getActiveOrderByTable(t.id);
    if (order) {
      order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      enrichOrderFinancials(order);
      t.open_order = order;
    } else {
      t.open_order = null;
    }
  });

  res.json(tables);
});

app.post('/api/tables', auth.requireRole('admin'), (req, res) => {
  const { number, name } = req.body;
  if (!number) return res.status(400).json({ error: 'Número obrigatório' });
  try {
    const r = db.prepare('INSERT INTO tables (number, name) VALUES (?,?)')
      .run(number, name || `Mesa ${String(number).padStart(2,'0')}`);
    res.json({ id: r.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Mesa já existe' });
  }
});

app.post('/api/tables/:id/open', auth.requireRole('admin','caixa','garcom'), (req, res) => {
  const { waiter_id } = req.body;
  const t = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Mesa não encontrada' });
  if (t.status !== 'LIVRE') return res.status(400).json({ error: 'Mesa já está ocupada' });

  db.prepare(`
    UPDATE tables
    SET status = 'OCUPADA', waiter_id = ?, opened_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(waiter_id || null, t.id);

  res.json({ ok: true });
});

app.post('/api/tables/:id/close', auth.requireRole('admin','caixa','garcom'), (req, res) => {
  const t = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Mesa não encontrada' });

  const open = db.prepare(`
    SELECT COUNT(*) AS n FROM orders
    WHERE table_id = ? AND status NOT IN ('CONCLUIDO','CANCELADO')
  `).get(t.id).n;

  if (open > 0) {
    return res.status(400).json({ error: 'Existem pedidos em aberto nesta mesa' });
  }

  db.prepare(`
    UPDATE tables
    SET status = 'LIVRE', waiter_id = NULL, closed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(t.id);

  res.json({ ok: true });
});

app.post('/api/tables/:id/force-free', auth.requireRole('admin'), (req, res) => {
  const tableId = Number(req.params.id);
  const { reason } = req.body || {};

  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    return res.status(400).json({
      error: 'RN030: Motivo obrigatório (mínimo 3 caracteres) para liberar a mesa à força.'
    });
  }
  const motivoLimpo = reason.trim();

  const mesa = db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId);
  if (!mesa) {
    return res.status(404).json({ error: 'Mesa não encontrada' });
  }

  try {
    const executar = db.transaction(() => {
      const pedidoAtivo = db.prepare(`
        SELECT * FROM orders
        WHERE table_id = ? AND status NOT IN ('CONCLUIDO','CANCELADO')
        ORDER BY id ASC LIMIT 1
      `).get(tableId);

      if (pedidoAtivo) {
        db.prepare(`
          UPDATE orders
          SET table_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(pedidoAtivo.id);
      }

      db.prepare(`
        UPDATE tables
        SET status = 'LIVRE', waiter_id = NULL, closed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(tableId);

      db.prepare(`
        INSERT INTO table_force_free_log (table_id, order_id, reason)
        VALUES (?, ?, ?)
      `).run(tableId, pedidoAtivo ? pedidoAtivo.id : null, motivoLimpo);

      return {
        table_id: tableId,
        order_desvinculado: pedidoAtivo ? pedidoAtivo.id : null,
        reason: motivoLimpo
      };
    });

    const resultado = executar();
    res.json({ ok: true, ...resultado });

  } catch (e) {
    console.error('[force-free] erro na transação:', e);
    res.status(500).json({ error: 'Erro ao liberar mesa à força' });
  }
});

app.put('/api/tables/:id/waiter', auth.requireRole('admin','garcom'), (req, res) => {
  const tableId = Number(req.params.id);
  const { waiter_id } = req.body || {};

  const mesa = db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId);
  if (!mesa) {
    return res.status(404).json({ error: 'Mesa não encontrada' });
  }

  const novoWaiterId = Number(waiter_id);
  if (!Number.isInteger(novoWaiterId) || novoWaiterId <= 0) {
    return res.status(400).json({ error: 'waiter_id inválido' });
  }

  const garcom = db.prepare('SELECT * FROM waiters WHERE id = ? AND active = 1').get(novoWaiterId);
  if (!garcom) {
    return res.status(400).json({ error: 'Garçom não encontrado ou inativo' });
  }

  db.prepare(`
    UPDATE tables
    SET waiter_id = ?
    WHERE id = ?
  `).run(novoWaiterId, tableId);

  res.json({ ok: true, table_id: tableId, waiter_id: novoWaiterId, waiter_name: garcom.name });
});

// ============================================================
// ORDERS
// ============================================================
app.get('/api/orders', auth.requireAuth, (req, res) => {
  const { status, channel, limit, date, table_id } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (channel) { sql += ' AND channel = ?'; params.push(channel); }
  if (table_id) { sql += ' AND table_id = ?'; params.push(table_id); }
  if (date) { sql += " AND date(created_at, 'localtime') = date(?)"; params.push(date); }
  sql += ' ORDER BY id DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(Number(limit)); }

  const orders = db.prepare(sql).all(...params);
  orders.forEach(o => {
    o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
    o.payments = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id ASC').all(o.id);
    o.payment = o.payments[0] || null;
    enrichOrderFinancials(o);
    if (o.table_id) {
      o.table = db.prepare('SELECT * FROM tables WHERE id = ?').get(o.table_id);
    }
    if (o.waiter_id) {
      o.waiter = db.prepare('SELECT * FROM waiters WHERE id = ?').get(o.waiter_id);
    }
  });
  res.json(orders);
});

app.get('/api/orders/:id', auth.requireAuth, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado' });
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
  o.payments = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id ASC').all(o.id);
  o.payment = o.payments[0] || null;
  enrichOrderFinancials(o);
  if (o.table_id) {
    o.table = db.prepare('SELECT * FROM tables WHERE id = ?').get(o.table_id);
  }
  if (o.waiter_id) {
    o.waiter = db.prepare('SELECT * FROM waiters WHERE id = ?').get(o.waiter_id);
  }
  res.json(o);
});

app.post('/api/orders', auth.requireRole('admin','caixa','garcom'), (req, res) => {
  const {
    channel, items, observation,
    customer_name, customer_phone, customer_address,
    customer_neighborhood, customer_complement, delivery_fee,
    table_id, waiter_id
  } = req.body;

  if (!['BALCAO', 'WHATSAPP', 'MESA', 'IFOOD'].includes(channel)) {
    return res.status(400).json({ error: 'Canal inválido' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'RN001: Pedido precisa de pelo menos um produto' });
  }

  if (channel === 'MESA' && !table_id) {
    return res.status(400).json({ error: 'Pedido de mesa precisa de table_id' });
  }

  const itensResolvidos = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') {
      return res.status(400).json({ error: 'Item inválido no pedido' });
    }

    const productId = Number(it.product_id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Item sem product_id válido' });
    }

    const qtd = Number(it.quantity);
    if (!Number.isInteger(qtd) || qtd <= 0) {
      return res.status(400).json({ error: 'Quantidade inválida no item' });
    }

    const prod = db.prepare('SELECT id, name, price, active, is_additional FROM products WHERE id = ?').get(productId);
    if (!prod) {
      return res.status(400).json({ error: `Produto ${productId} não encontrado` });
    }

    if (!prod.active) {
      return res.status(400).json({ error: `Produto ${prod.name} está inativo` });
    }

    itensResolvidos.push({
      product_id: prod.id,
      name: prod.name,
      price: prod.price,
      quantity: qtd,
      observation: (it.observation != null && String(it.observation).trim())
        ? String(it.observation).trim()
        : null,
      is_additional: prod.is_additional ? 1 : 0
    });
  }

  const subtotal = itensResolvidos.reduce((s, i) => s + i.price * i.quantity, 0);
  const fee = Number(delivery_fee || 0);
  const total = subtotal + fee;

  try {
    const executar = db.transaction(() => {

      if (channel === 'MESA') {
        const mesa = db.prepare('SELECT * FROM tables WHERE id = ?').get(table_id);
        if (!mesa) {
          const err = new Error('Mesa não encontrada');
          err.status = 404;
          throw err;
        }

        if (mesa.status === 'LIVRE') {
          db.prepare(`
            UPDATE tables
            SET status = 'OCUPADA', waiter_id = ?, opened_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(waiter_id || null, mesa.id);
        }

        const pedidoExistente = getActiveOrderByTable(table_id);

        if (pedidoExistente) {
          const insertItem = db.prepare(`
            INSERT INTO order_items (order_id, product_id, name, price, quantity, observation, print_status, is_additional)
            VALUES (?,?,?,?,?,?,0,?)
          `);

          itensResolvidos.forEach(it => {
            insertItem.run(
              pedidoExistente.id,
              it.product_id,
              it.name,
              it.price,
              it.quantity,
              it.observation,
              it.is_additional
            );
          });

          if (observation) {
            const obsAtual = pedidoExistente.observation || '';
            const novaObs = obsAtual ? `${obsAtual} | ${observation}` : observation;
            db.prepare('UPDATE orders SET observation = ? WHERE id = ?')
              .run(novaObs, pedidoExistente.id);
          }

          const totais = recalcularTotaisPedido(pedidoExistente.id);

          return {
            id: pedidoExistente.id,
            number: pedidoExistente.number,
            ...totais,
            itensAdicionados: itensResolvidos.length,
            jaExistia: true,
            financial_status: getOrderFinancialStatus(pedidoExistente.id),
            payments_total: getOrderNetPaid(pedidoExistente.id),
            remaining: getOrderRemaining(pedidoExistente.id)
          };
        }
      }

      const nextNum = db.prepare('SELECT COALESCE(MAX(number),0)+1 AS n FROM orders').get().n;

      const result = db.prepare(`
        INSERT INTO orders (
          number, channel, status, subtotal, delivery_fee, total, observation,
          customer_name, customer_phone, customer_address, customer_neighborhood, customer_complement,
          table_id, waiter_id
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        nextNum, channel, 'NOVO', subtotal, fee, total, observation || null,
        customer_name || null, customer_phone || null, customer_address || null,
        customer_neighborhood || null, customer_complement || null,
        table_id || null, waiter_id || null
      );

      const orderId = result.lastInsertRowid;
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, name, price, quantity, observation, print_status, is_additional)
        VALUES (?,?,?,?,?,?,0,?)
      `);
      itensResolvidos.forEach(it => {
        insertItem.run(orderId, it.product_id, it.name, it.price, it.quantity, it.observation, it.is_additional);
      });

      return {
        id: orderId,
        number: nextNum,
        subtotal,
        delivery_fee: fee,
        total,
        jaExistia: false,
        financial_status: 'ABERTO',
        payments_total: 0,
        remaining: total
      };
    });

    const resultado = executar();
    return res.json(resultado);

  } catch (e) {
    if (e.status === 404) {
      return res.status(404).json({ error: e.message });
    }
    console.error('[orders] erro na transação:', e);
    return res.status(500).json({ error: 'Erro ao criar pedido' });
  }
});

app.put('/api/orders/:id', auth.requireRole('admin','caixa','garcom','cozinha'), (req, res) => {
  const { status } = req.body;
  const valid = ['NOVO','EM PREPARO','PRONTO','EM ROTA','CONCLUIDO','CANCELADO'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Status inválido' });

  const pedido = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });

  if (status === 'CANCELADO') {
    const total = getOrderNetPaid(req.params.id);
    if (total > 0) {
      return res.status(400).json({
        error: 'RN016: Pedido já possui pagamento registrado. Estorne o pagamento antes de cancelar.'
      });
    }
  }

  db.prepare(`
    UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(status, req.params.id);
  res.json({ ok: true });
});

// ============================================================
// PAYMENTS
// ============================================================
app.post('/api/orders/:id/payment', auth.requireRole('admin','caixa'), (req, res) => {
  const body = req.body || {};
  const { method, received } = body;

  if (!method) {
    return res.status(400).json({ error: 'RN002: Forma de pagamento obrigatória' });
  }

  const METODOS_VALIDOS = ['PIX', 'DINHEIRO', 'DEBITO', 'CREDITO'];
  if (!METODOS_VALIDOS.includes(method)) {
    return res.status(400).json({ error: 'RN002: Forma de pagamento inválida' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }

  const fsAtual = getOrderFinancialStatus(order.id);
  if (fsAtual === 'ESTORNADO') {
    return res.status(400).json({
      error: 'RN031: Pedido totalmente estornado não pode receber novo pagamento.'
    });
  }

  const register = getOpenCashRegister();
  if (!register) {
    return res.status(400).json({
      error: 'RN017: Nenhum caixa aberto. Abra o caixa antes de registrar pagamentos.'
    });
  }

  if (order.cash_register_id == null) {
    db.prepare('UPDATE orders SET cash_register_id = ? WHERE id = ?')
      .run(register.id, order.id);
    order.cash_register_id = register.id;
  } else if (order.cash_register_id !== register.id) {
    return res.status(400).json({
      error: 'RN018: Este pedido pertence a outro caixa. Feche o pedido antes de abrir outro caixa.'
    });
  }

  const saldoRestante = getOrderRemaining(order.id);

  if (saldoRestante <= 0) {
    return res.status(400).json({
      error: 'RN019: Este pedido já está totalmente pago.'
    });
  }

  const amountProvided =
    body.amount !== undefined &&
    body.amount !== null &&
    body.amount !== '';

  let amount;
  if (amountProvided) {
    amount = Number(body.amount);
    if (!Number.isFinite(amount)) {
      return res.status(400).json({ error: 'RN020: Valor do pagamento inválido.' });
    }
    if (amount <= 0) {
      return res.status(400).json({ error: 'RN021: Valor do pagamento deve ser positivo.' });
    }
    if (amount > saldoRestante + 0.01) {
      return res.status(400).json({
        error: `RN022: Valor excede o saldo devedor (R$ ${saldoRestante.toFixed(2)}).`
      });
    }
  } else {
    amount = saldoRestante;
  }

  let change = 0;
  let receivedValue = null;

  if (method === 'DINHEIRO') {
    if (received !== undefined && received !== null && received !== '') {
      receivedValue = Number(received);
      if (!Number.isFinite(receivedValue)) {
        return res.status(400).json({ error: 'RN023: Valor recebido inválido.' });
      }
      if (receivedValue < amount) {
        return res.status(400).json({ error: 'RN024: Valor recebido insuficiente.' });
      }
      change = receivedValue - amount;
    }
  }

  let novoFinancialStatus = 'ABERTO';

  try {
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO payments (order_id, method, amount, received, change_amount)
        VALUES (?,?,?,?,?)
      `).run(order.id, method, amount, receivedValue, change);

      db.prepare(`
        UPDATE orders SET status = 'EM PREPARO', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(order.id);

      if (method === 'DINHEIRO') {
        db.prepare(`
          INSERT INTO cash_movements (register_id, type, description, amount)
          VALUES (?, 'VENDA', ?, ?)
        `).run(register.id, `Pedido #${order.number} (Dinheiro)`, amount);
      } else {
        db.prepare(`
          INSERT INTO cash_movements (register_id, type, description, amount)
          VALUES (?, 'ENTRADA', ?, 0)
        `).run(register.id, `Pedido #${order.number} (${method} — não físico)`);
      }

      novoFinancialStatus = getOrderFinancialStatus(order.id);
    });

    tx();
  } catch (e) {
    console.error('[payment] erro na transação:', e);
    return res.status(500).json({ error: 'Erro ao registrar pagamento.' });
  }

  if (order.table_id) {
    const pedidosAtivos = db.prepare(`
      SELECT id FROM orders
      WHERE table_id = ? AND status NOT IN ('CONCLUIDO','CANCELADO')
    `).all(order.table_id);

    const todosEmEstadoFinal = pedidosAtivos.every(p => {
      const fs = getOrderFinancialStatus(p.id);
      return fs === 'PAGO' || fs === 'ESTORNADO';
    });

    if (todosEmEstadoFinal) {
      db.prepare(`
        UPDATE tables
        SET status = 'LIVRE', waiter_id = NULL, closed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(order.table_id);
    }
  }

  const mesaPgto = order.table_id
    ? db.prepare('SELECT * FROM tables WHERE id = ?').get(order.table_id)
    : null;
  const garcomPgto = order.waiter_id
    ? db.prepare('SELECT * FROM waiters WHERE id = ?').get(order.waiter_id)
    : null;

  if (order.channel === 'MESA') {
    const pendentes = getPendingItems(order.id);
    if (pendentes.length > 0) {
      printer.imprimirComanda(order, pendentes, mesaPgto, garcomPgto)
        .then(result => {
          if (result.ok) {
            const ids = pendentes.map(i => i.id);
            const ph = ids.map(() => '?').join(',');
            db.prepare(`
              UPDATE order_items SET print_status = 1 WHERE id IN (${ph})
            `).run(...ids);
          }
        })
        .catch(e => console.error('[payment] erro ao imprimir fallback:', e));
    }
  } else {
    const itemsPgto = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    printer.imprimirComanda(order, itemsPgto, mesaPgto, garcomPgto)
      .catch(e => console.error('[payment] erro ao imprimir:', e));
  }

  res.json({
    ok: true,
    method,
    amount,
    received: receivedValue,
    change,
    financial_status: novoFinancialStatus,
    remaining: getOrderRemaining(order.id)
  });
});

// ============================================================
// REFUND (Estorno) — somente admin
// ============================================================
app.post('/api/orders/:id/refund', auth.requireRole('admin'), (req, res) => {
  const orderId = Number(req.params.id);
  const { amount, reason, payment_id } = req.body || {};

  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    return res.status(400).json({ error: 'RN032: Motivo obrigatório (mínimo 3 caracteres).' });
  }

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'RN033: Valor do estorno deve ser positivo.' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }

  const netPaid = getOrderNetPaid(orderId);
  if (netPaid <= 0) {
    return res.status(400).json({ error: 'RN034: Pedido não possui valor líquido a estornar.' });
  }

  if (amt > netPaid + 0.01) {
    return res.status(400).json({
      error: `RN035: Valor excede o líquido estornável (R$ ${netPaid.toFixed(2)}).`
    });
  }

  const register = getOpenCashRegister();
  if (!register) {
    return res.status(400).json({
      error: 'RN017: Nenhum caixa aberto. Abra o caixa antes de estornar.'
    });
  }

  const motivoLimpo = reason.trim();

  try {
    const executar = db.transaction(() => {
      const refunds = [];
      let restante = amt;

      if (payment_id != null) {
        const pid = Number(payment_id);
        if (!Number.isInteger(pid) || pid <= 0) {
          const err = new Error('payment_id inválido');
          err.status = 400;
          throw err;
        }
        const payment = db.prepare('SELECT * FROM payments WHERE id = ? AND order_id = ?').get(pid, orderId);
        if (!payment) {
          const err = new Error('Pagamento não encontrado neste pedido');
          err.status = 400;
          throw err;
        }
        const refundable = getPaymentRefundable(pid);
        if (amt > refundable + 0.01) {
          const err = new Error(`RN036: Valor excede o estornável deste pagamento (R$ ${refundable.toFixed(2)}).`);
          err.status = 400;
          throw err;
        }
        refunds.push({ payment_id: pid, amount: amt });
      } else {
        const payments = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id ASC').all(orderId);
        for (const p of payments) {
          if (restante <= 0) break;
          const refundable = getPaymentRefundable(p.id);
          if (refundable <= 0) continue;
          const usar = Math.min(refundable, restante);
          refunds.push({ payment_id: p.id, amount: Number(usar.toFixed(2)) });
          restante -= usar;
        }
        if (restante > 0.01) {
          const err = new Error('RN037: Não há saldo estornável suficiente nos pagamentos do pedido.');
          err.status = 400;
          throw err;
        }
      }

      const insertRefund = db.prepare(`
        INSERT INTO payments_refunds (payment_id, order_id, amount, reason)
        VALUES (?, ?, ?, ?)
      `);
      refunds.forEach(r => insertRefund.run(r.payment_id, orderId, r.amount, motivoLimpo));

      db.prepare(`
        INSERT INTO cash_movements (register_id, type, description, amount)
        VALUES (?, 'ESTORNO', ?, ?)
      `).run(register.id, `Estorno Pedido #${order.number} — ${motivoLimpo}`, amt);

      if (order.table_id) {
        const pedidosAtivos = db.prepare(`
          SELECT id FROM orders
          WHERE table_id = ? AND status NOT IN ('CONCLUIDO','CANCELADO')
        `).all(order.table_id);

        const todosEmEstadoFinal = pedidosAtivos.every(p => {
          const fs = getOrderFinancialStatus(p.id);
          return fs === 'PAGO' || fs === 'ESTORNADO';
        });

        if (todosEmEstadoFinal) {
          db.prepare(`
            UPDATE tables
            SET status = 'LIVRE', waiter_id = NULL, closed_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(order.table_id);
        }
      }

      return { refunds };
    });

    const resultado = executar();
    const novoStatus = getOrderFinancialStatus(orderId);

    res.json({
      ok: true,
      order_id: orderId,
      refunded_amount: amt,
      refunds_created: resultado.refunds.length,
      financial_status: novoStatus,
      net_paid: getOrderNetPaid(orderId),
      remaining: getOrderRemaining(orderId),
      refunds_total: getOrderRefundsTotal(orderId)
    });

  } catch (e) {
    if (e.status === 400) {
      return res.status(400).json({ error: e.message });
    }
    console.error('[refund] erro na transação:', e);
    return res.status(500).json({ error: 'Erro ao registrar estorno' });
  }
});

// ============================================================
// SEND TO KITCHEN
// ============================================================
app.post('/api/orders/:id/send-to-kitchen', auth.requireRole('admin','caixa','garcom','cozinha'), async (req, res) => {
  const orderId = Number(req.params.id);

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }

  if (order.channel !== 'MESA') {
    return res.status(400).json({
      error: 'Apenas pedidos de mesa usam send-to-kitchen'
    });
  }

  const pendentes = getPendingItems(orderId);

  if (pendentes.length === 0) {
    return res.json({
      ok: true,
      itensEnviados: 0,
      order_id: order.id,
      order_number: order.number,
      message: 'Nenhum item pendente'
    });
  }

  const mesa = db.prepare('SELECT * FROM tables WHERE id = ?').get(order.table_id);
  const garcom = order.waiter_id
    ? db.prepare('SELECT * FROM waiters WHERE id = ?').get(order.waiter_id)
    : null;

  let resultado;
  try {
    resultado = await printer.imprimirComanda(order, pendentes, mesa, garcom);
  } catch (e) {
    resultado = { ok: false, error: e.message };
  }

  if (!resultado.ok) {
    return res.status(500).json({
      ok: false,
      error: 'Falha ao imprimir: ' + (resultado.error || 'desconhecido'),
      itensReservados: pendentes.length
    });
  }

  const ids = pendentes.map(i => i.id);
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`
    UPDATE order_items SET print_status = 1 WHERE id IN (${placeholders})
  `).run(...ids);

  res.json({
    ok: true,
    itensEnviados: pendentes.length,
    order_id: order.id,
    order_number: order.number
  });
});

// ============================================================
// ESTADO FINANCEIRO
// ============================================================
app.get('/api/orders/:id/financial', auth.requireRole('admin','caixa'), (req, res) => {
  const o = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado' });

  const payments = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id ASC').all(req.params.id);
  const refunds = db.prepare('SELECT * FROM payments_refunds WHERE order_id = ? ORDER BY id ASC').all(req.params.id);

  res.json({
    order_id: Number(req.params.id),
    financial_status: getOrderFinancialStatus(req.params.id),
    payments_total: getOrderNetPaid(req.params.id),
    gross_paid: getOrderGrossPaid(req.params.id),
    refunds_total: getOrderRefundsTotal(req.params.id),
    remaining: getOrderRemaining(req.params.id),
    payment: payments[0] || null,
    payments,
    refunds
  });
});

// ============================================================
// COMANDA
// ============================================================
app.get('/api/orders/:id/comanda', auth.requireAuth, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);

  let txt = '';
  txt += '================================\n';
  txt += '    DIGÃO BURGER & SHAWARMA\n';
  txt += '         Toledo — PR\n';
  txt += '================================\n';
  txt += `Pedido #${String(o.number).padStart(3, '0')}\n`;

  if (o.table_id) {
    const mesa = db.prepare('SELECT number FROM tables WHERE id = ?').get(o.table_id);
    if (mesa) txt += `MESA ${String(mesa.number).padStart(2,'0')}\n`;
  }
  if (o.waiter_id) {
    const w = db.prepare('SELECT name FROM waiters WHERE id = ?').get(o.waiter_id);
    if (w) txt += `Garçom: ${w.name}\n`;
  }

  txt += `Data: ${o.created_at}\n`;
  txt += `Canal: ${o.channel}\n`;
  txt += '--------------------------------\n';
  items.forEach(it => {
    const prefixo = it.is_additional ? '+ ' : '  ';
    txt += `${prefixo}${it.quantity}x ${it.name.padEnd(20)} R$ ${(it.price * it.quantity).toFixed(2)}\n`;
    if (it.observation) txt += `     Obs: ${it.observation}\n`;
  });
  txt += '--------------------------------\n';
  txt += `Subtotal: R$ ${o.subtotal.toFixed(2)}\n`;
  if (o.delivery_fee > 0) txt += `Taxa Entrega: R$ ${o.delivery_fee.toFixed(2)}\n`;
  txt += `TOTAL: R$ ${o.total.toFixed(2)}\n`;
  if (o.observation) txt += `Obs Geral: ${o.observation}\n`;
  txt += '================================\n';
  txt += '   Obrigado pela preferência!\n';
  txt += '================================\n';

  res.json({ text: txt, order: o, items });
});

// ============================================================
// KITCHEN
// ============================================================
app.get('/api/kitchen', auth.requireRole('admin','caixa','cozinha'), (req, res) => {
  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE status IN ('NOVO','EM PREPARO')
    ORDER BY id ASC
  `).all();
  orders.forEach(o => {
    o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
    enrichOrderFinancials(o);
    if (o.table_id) {
      o.table = db.prepare('SELECT * FROM tables WHERE id = ?').get(o.table_id);
    }
  });
  res.json(orders);
});

// ============================================================
// IMPRESSÃO
// ============================================================
app.post('/api/print/test', auth.requireRole('admin'), async (req, res) => {
  const result = await printer.imprimirTeste();
  if (result.ok) res.json({ ok: true });
  else res.status(500).json({ error: result.error });
});

app.post('/api/print/comanda/:id', auth.requireAuth, async (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado' });

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
  const mesa = o.table_id ? db.prepare('SELECT * FROM tables WHERE id = ?').get(o.table_id) : null;
  const garcom = o.waiter_id ? db.prepare('SELECT * FROM waiters WHERE id = ?').get(o.waiter_id) : null;

  const result = await printer.imprimirComanda(o, items, mesa, garcom);
  if (result.ok) res.json({ ok: true });
  else res.status(500).json({ error: result.error });
});

// ============================================================
// CASH REGISTER
// ============================================================
app.get('/api/cash/current', auth.requireRole('admin','caixa'), (req, res) => {
  const reg = getOpenCashRegister();
  if (!reg) return res.json(null);
  const movements = db.prepare(
    'SELECT * FROM cash_movements WHERE register_id = ? ORDER BY id DESC'
  ).all(reg.id);
  const sales = movements.filter(m => m.type === 'VENDA').reduce((s, m) => s + m.amount, 0);
  const entries = movements.filter(m => m.type === 'ENTRADA').reduce((s, m) => s + m.amount, 0);
  const exits = movements.filter(m => m.type === 'SAIDA').reduce((s, m) => s + m.amount, 0);
  const refunds = movements.filter(m => m.type === 'ESTORNO').reduce((s, m) => s + m.amount, 0);
  const current = reg.initial_value + sales + entries - exits - refunds;
  res.json({ ...reg, movements, sales, entries, exits, refunds, current });
});

app.post('/api/cash/open', auth.requireRole('admin','caixa'), (req, res) => {
  const { initial_value } = req.body;
  const existing = getOpenCashRegister();
  if (existing) return res.status(400).json({ error: 'Já existe um caixa aberto' });
  const r = db.prepare('INSERT INTO cash_registers (initial_value) VALUES (?)')
    .run(initial_value || 0);
  res.json({ id: r.lastInsertRowid });
});

app.post('/api/cash/close', auth.requireRole('admin','caixa'), (req, res) => {
  const { informed_value } = req.body;
  const reg = getOpenCashRegister();
  if (!reg) return res.status(400).json({ error: 'Nenhum caixa aberto' });

  const mesasAbertas = db.prepare(
    "SELECT COUNT(*) AS n FROM tables WHERE status != 'LIVRE'"
  ).get().n;

  if (mesasAbertas > 0) {
    return res.status(400).json({
      error: `RN015: Existem ${mesasAbertas} mesa(s) em aberto. Feche todas antes de fechar o caixa.`
    });
  }

  const pendentesDoCaixa = db.prepare(`
    SELECT id, number, total
    FROM orders
    WHERE cash_register_id = ?
      AND status NOT IN ('CONCLUIDO','CANCELADO')
  `).all(reg.id).filter(o => {
    const fs = getOrderFinancialStatus(o.id);
    return fs === 'ABERTO' || fs === 'PARCIAL';
  });

  const pendentesSemCaixa = db.prepare(`
    SELECT id, number, total
    FROM orders
    WHERE cash_register_id IS NULL
      AND status NOT IN ('CONCLUIDO','CANCELADO')
  `).all().filter(o => {
    const fs = getOrderFinancialStatus(o.id);
    return fs === 'ABERTO' || fs === 'PARCIAL';
  });

  const totalPendentes = pendentesDoCaixa.length + pendentesSemCaixa.length;

  if (totalPendentes > 0) {
    const numerosDoCaixa = pendentesDoCaixa.map(o => `#${o.number}`).join(', ');
    const numerosSemCaixa = pendentesSemCaixa.map(o => `#${o.number}`).join(', ');

    const partes = [];
    if (pendentesDoCaixa.length > 0) {
      partes.push(`${pendentesDoCaixa.length} pedido(s) deste caixa (${numerosDoCaixa})`);
    }
    if (pendentesSemCaixa.length > 0) {
      partes.push(`${pendentesSemCaixa.length} pedido(s) sem caixa associado (${numerosSemCaixa})`);
    }

    return res.status(400).json({
      error: `RN026: Existem ${totalPendentes} pedido(s) com pagamento pendente. Resolva antes de fechar o caixa: ${partes.join(' e ')}.`,
      pendentes_do_caixa: pendentesDoCaixa.map(o => ({ id: o.id, number: o.number, total: o.total })),
      pendentes_sem_caixa: pendentesSemCaixa.map(o => ({ id: o.id, number: o.number, total: o.total }))
    });
  }

  const movements = db.prepare('SELECT * FROM cash_movements WHERE register_id = ?').all(reg.id);
  const sales = movements.filter(m => m.type === 'VENDA').reduce((s, m) => s + m.amount, 0);
  const entries = movements.filter(m => m.type === 'ENTRADA').reduce((s, m) => s + m.amount, 0);
  const exits = movements.filter(m => m.type === 'SAIDA').reduce((s, m) => s + m.amount, 0);
  const refunds = movements.filter(m => m.type === 'ESTORNO').reduce((s, m) => s + m.amount, 0);
  const expected = reg.initial_value + sales + entries - exits - refunds;
  const diff = Number(informed_value) - expected;

  db.prepare(`
    UPDATE cash_registers
    SET status = 'FECHADO', closed_at = CURRENT_TIMESTAMP,
        expected_value = ?, informed_value = ?, difference = ?
    WHERE id = ?
  `).run(expected, informed_value, diff, reg.id);

  res.json({ expected, informed: Number(informed_value), difference: diff });
});

app.post('/api/cash/movement', auth.requireRole('admin','caixa'), (req, res) => {
  const { type, description, amount } = req.body;
  const reg = getOpenCashRegister();
  if (!reg) return res.status(400).json({ error: 'Caixa fechado' });
  if (!['ENTRADA','SAIDA'].includes(type)) return res.status(400).json({ error: 'Tipo inválido' });

  if (amount === undefined || amount === null || amount === '') {
    return res.status(400).json({ error: 'RN027: Valor da movimentação obrigatório.' });
  }
  const num = Number(amount);
  if (!Number.isFinite(num)) {
    return res.status(400).json({ error: 'RN028: Valor da movimentação inválido.' });
  }
  if (num <= 0) {
    return res.status(400).json({ error: 'RN029: Valor da movimentação deve ser positivo.' });
  }

  db.prepare(`
    INSERT INTO cash_movements (register_id, type, description, amount)
    VALUES (?,?,?,?)
  `).run(reg.id, type, description, num);
  res.json({ ok: true });
});

app.get('/api/cash/movements', auth.requireRole('admin','caixa'), (req, res) => {
  const reg = getOpenCashRegister();
  if (!reg) return res.json([]);
  res.json(db.prepare(
    'SELECT * FROM cash_movements WHERE register_id = ? ORDER BY id DESC'
  ).all(reg.id));
});

app.get('/api/cash/history', auth.requireRole('admin','caixa'), (req, res) => {
  const { from, to, page = 1, limit = 20 } = req.query;

  const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const pageNum = Math.max(parseInt(page) || 1, 1);
  const offset = (pageNum - 1) * limitNum;

  const where = ["status = 'FECHADO'"];
  const params = [];

  if (from) {
    where.push("date(closed_at, 'localtime') >= date(?)");
    params.push(from);
  }
  if (to) {
    where.push("date(closed_at, 'localtime') <= date(?)");
    params.push(to);
  }

  const whereSQL = 'WHERE ' + where.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) AS n FROM cash_registers ${whereSQL}`).get(...params).n;

  const rows = db.prepare(`
    SELECT * FROM cash_registers
    ${whereSQL}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limitNum, offset);

  const items = rows.map(r => {
    const movements = db.prepare('SELECT * FROM cash_movements WHERE register_id = ?').all(r.id);
    const sales = movements.filter(m => m.type === 'VENDA').reduce((s, m) => s + m.amount, 0);
    const entries = movements.filter(m => m.type === 'ENTRADA').reduce((s, m) => s + m.amount, 0);
    const exits = movements.filter(m => m.type === 'SAIDA').reduce((s, m) => s + m.amount, 0);
    const refunds = movements.filter(m => m.type === 'ESTORNO').reduce((s, m) => s + m.amount, 0);
    return { ...r, sales, entries, exits, refunds };
  });

  res.json({
    items,
    page: pageNum,
    limit: limitNum,
    total,
    total_pages: Math.ceil(total / limitNum)
  });
});

app.get('/api/cash/:id', auth.requireRole('admin','caixa'), (req, res) => {
  const id = Number(req.params.id);
  const reg = db.prepare('SELECT * FROM cash_registers WHERE id = ?').get(id);
  if (!reg) return res.status(404).json({ error: 'Caixa não encontrado' });

  const movements = db.prepare(
    'SELECT * FROM cash_movements WHERE register_id = ? ORDER BY id DESC'
  ).all(id);

  const sales = movements.filter(m => m.type === 'VENDA').reduce((s, m) => s + m.amount, 0);
  const entries = movements.filter(m => m.type === 'ENTRADA').reduce((s, m) => s + m.amount, 0);
  const exits = movements.filter(m => m.type === 'SAIDA').reduce((s, m) => s + m.amount, 0);
  const refunds = movements.filter(m => m.type === 'ESTORNO').reduce((s, m) => s + m.amount, 0);

  res.json({ ...reg, movements, sales, entries, exits, refunds });
});

// ============================================================
// EXPENSES / LOSSES
// ============================================================
app.get('/api/expenses', auth.requireRole('admin','caixa'), (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM expenses WHERE 1=1';
  const params = [];
  if (from) { sql += " AND date(created_at, 'localtime') >= date(?)"; params.push(from); }
  if (to)   { sql += " AND date(created_at, 'localtime') <= date(?)"; params.push(to); }
  sql += ' ORDER BY id DESC';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/expenses', auth.requireRole('admin','caixa'), (req, res) => {
  const { description, category, amount } = req.body;
  if (!description || amount == null) {
    return res.status(400).json({ error: 'Descrição e valor obrigatórios' });
  }
  const r = db.prepare('INSERT INTO expenses (description, category, amount) VALUES (?,?,?)')
    .run(description, category || null, amount);
  res.json({ id: r.lastInsertRowid });
});

app.get('/api/losses', auth.requireRole('admin','caixa'), (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM losses WHERE 1=1';
  const params = [];
  if (from) { sql += " AND date(created_at, 'localtime') >= date(?)"; params.push(from); }
  if (to)   { sql += " AND date(created_at, 'localtime') <= date(?)"; params.push(to); }
  sql += ' ORDER BY id DESC';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/losses', auth.requireRole('admin','caixa'), (req, res) => {
  const { description, category, amount } = req.body;
  if (!description || amount == null) {
    return res.status(400).json({ error: 'Descrição e valor obrigatórios' });
  }
  const r = db.prepare('INSERT INTO losses (description, category, amount) VALUES (?,?,?)')
    .run(description, category || null, amount);
  res.json({ id: r.lastInsertRowid });
});

// ============================================================
// DRIVERS
// ============================================================
app.get('/api/drivers', auth.requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM drivers ORDER BY id DESC').all());
});

app.post('/api/drivers', auth.requireRole('admin'), (req, res) => {
  const { name, phone, default_fee } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const r = db.prepare('INSERT INTO drivers (name, phone, default_fee) VALUES (?,?,?)')
    .run(name, phone || null, default_fee || 8);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/drivers/:id', auth.requireRole('admin'), (req, res) => {
  const { name, phone, default_fee, active } = req.body;
  const d = db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Entregador não encontrado' });
  db.prepare(`
    UPDATE drivers SET name = ?, phone = ?, default_fee = ?, active = ? WHERE id = ?
  `).run(
    name ?? d.name,
    phone ?? d.phone,
    default_fee ?? d.default_fee,
    active != null ? (active ? 1 : 0) : d.active,
    req.params.id
  );
  res.json({ ok: true });
});

// ============================================================
// DELIVERIES
// ============================================================
app.get('/api/deliveries', auth.requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, dr.name AS driver_name, o.number AS order_number
    FROM deliveries d
    LEFT JOIN drivers dr ON dr.id = d.driver_id
    LEFT JOIN orders o ON o.id = d.order_id
    ORDER BY d.id DESC
  `).all();
  res.json(rows);
});

app.post('/api/deliveries', auth.requireRole('admin','caixa','garcom'), (req, res) => {
  const { order_id, driver_id, fee } = req.body;
  if (!order_id || !driver_id) {
    return res.status(400).json({ error: 'Pedido e entregador obrigatórios' });
  }

  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driver_id);
  const finalFee = fee != null ? Number(fee) : (driver?.default_fee || 0);

  const r = db.prepare('INSERT INTO deliveries (order_id, driver_id, fee) VALUES (?,?,?)')
    .run(order_id, driver_id, finalFee);

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('EM ROTA', order_id);

  res.json({ id: r.lastInsertRowid, fee: finalFee });
});

app.get('/api/drivers/:id/summary', auth.requireRole('admin','caixa'), (req, res) => {
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id);
  if (!driver) return res.status(404).json({ error: 'Entregador não encontrado' });

  const pending = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(fee),0) AS total
    FROM deliveries WHERE driver_id = ? AND status = 'PENDENTE'
  `).get(req.params.id);

  const paid = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(fee),0) AS total
    FROM deliveries WHERE driver_id = ? AND status = 'PAGO'
  `).get(req.params.id);

  const history = db.prepare(
    'SELECT * FROM driver_payments WHERE driver_id = ? ORDER BY id DESC'
  ).all(req.params.id);

  res.json({ driver, pending, paid, history });
});

app.post('/api/drivers/:id/pay', auth.requireRole('admin','caixa'), (req, res) => {
  const driverId = req.params.id;
  const unpaid = db.prepare(`
    SELECT * FROM deliveries WHERE driver_id = ? AND status = 'PENDENTE'
  `).all(driverId);

  if (unpaid.length === 0) {
    return res.status(400).json({ error: 'Nenhuma entrega pendente' });
  }

  const total = unpaid.reduce((s, d) => s + d.fee, 0);

  const payAll = db.transaction(() => {
    db.prepare(`UPDATE deliveries SET status='PAGO' WHERE driver_id = ? AND status='PENDENTE'`)
      .run(driverId);
    db.prepare(`
      INSERT INTO driver_payments (driver_id, amount, deliveries_count)
      VALUES (?,?,?)
    `).run(driverId, total, unpaid.length);
  });

  payAll();
  res.json({ paid: total, count: unpaid.length });
});

// ============================================================
// DASHBOARD
// ============================================================
app.get('/api/dashboard', auth.requireRole('admin','caixa'), (req, res) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE date(created_at, 'localtime') = date(?) AND status != 'CANCELADO'
  `).all(today);

  const faturamento = orders.reduce((s, o) => s + o.total, 0);
  const ticket = orders.length ? faturamento / orders.length : 0;

  const byChannel = (ch) =>
    orders.filter(o => o.channel === ch).reduce((s, o) => s + o.total, 0);

  const expenses = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS t FROM expenses
    WHERE date(created_at, 'localtime') = date(?)
  `).get(today).t;

  const losses = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS t FROM losses
    WHERE date(created_at, 'localtime') = date(?)
  `).get(today).t;

  const entregas = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(fee),0) AS total
    FROM deliveries WHERE date(created_at, 'localtime') = date(?)
  `).get(today);

  res.json({
    data: today,
    faturamento,
    pedidos: orders.length,
    ticket_medio: Number(ticket.toFixed(2)),
    balcao: byChannel('BALCAO'),
    whatsapp: byChannel('WHATSAPP'),
    ifood: byChannel('IFOOD'),
    mesa: byChannel('MESA'),
    despesas: expenses,
    perdas: losses,
    entregas_count: entregas.count,
    entregas_total: entregas.total,
    resultado: faturamento - expenses - losses - entregas.total
  });
});

// ============================================================
// RELATÓRIOS
// ============================================================
app.get('/api/reports', auth.requireRole('admin','caixa'), (req, res) => {
  const { from, to } = req.query;
  const fromDate = from || '2000-01-01';
  const toDate = to || '2100-01-01';

  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE date(created_at, 'localtime') BETWEEN date(?) AND date(?)
      AND status != 'CANCELADO'
  `).all(fromDate, toDate);

  const faturamento = orders.reduce((s, o) => s + o.total, 0);
  const ticket = orders.length ? faturamento / orders.length : 0;

  const byChannel = db.prepare(`
    SELECT channel, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
    FROM orders
    WHERE date(created_at, 'localtime') BETWEEN date(?) AND date(?)
      AND status != 'CANCELADO'
    GROUP BY channel
  `).all(fromDate, toDate);

  const byPayment = db.prepare(`
    SELECT p.method, COUNT(*) AS count, COALESCE(SUM(p.amount),0) AS total
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    WHERE date(o.created_at, 'localtime') BETWEEN date(?) AND date(?)
    GROUP BY p.method
  `).all(fromDate, toDate);

  const expenses = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS t FROM expenses
    WHERE date(created_at, 'localtime') BETWEEN date(?) AND date(?)
  `).get(fromDate, toDate).t;

  const losses = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS t FROM losses
    WHERE date(created_at, 'localtime') BETWEEN date(?) AND date(?)
  `).get(fromDate, toDate).t;

  const deliveries = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(fee),0) AS total
    FROM deliveries WHERE date(created_at, 'localtime') BETWEEN date(?) AND date(?)
  `).get(fromDate, toDate);

  const driverPayments = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS t FROM driver_payments
    WHERE date(paid_at, 'localtime') BETWEEN date(?) AND date(?)
  `).get(fromDate, toDate).t;

  res.json({
    periodo: { from: fromDate, to: toDate },
    faturamento,
    pedidos: orders.length,
    ticket_medio: Number(ticket.toFixed(2)),
    byChannel,
    byPayment,
    expenses,
    losses,
    deliveries_count: deliveries.count,
    deliveries_total: deliveries.total,
    driver_payments: driverPayments,
    resultado: faturamento - expenses - losses - deliveries.total
  });
});

// ============================================================
// BACKUP — somente admin
// ============================================================
app.post('/api/backup', auth.requireRole('admin'), (req, res) => {
  try {
    const fs = require('fs');
    const backupDir = path.join(__dirname, 'data', 'backup');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const backupPath = path.join(backupDir, `digao-backup-${stamp}.db`);
    fs.copyFileSync(path.join(__dirname, 'data', 'digao.db'), backupPath);
    res.json({ ok: true, file: backupPath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// TRATAMENTO DE ERROS
// ============================================================
app.use((err, req, res, next) => {
  console.error('❌ Erro:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ============================================================
// START
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  const ips = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push({ interface: name, ip: net.address });
      }
    }
  }

  console.log('');
  console.log('================================================');
  console.log('   🍔  DIGÃO GESTÃO — API REST v1.7.0');
  console.log('================================================');
  console.log(`   💻 Neste computador:  http://localhost:${PORT}`);
  console.log('');

  if (ips.length === 0) {
    console.log('   ⚠️  Nenhuma rede detectada. Verifique se está conectado ao Wi-Fi.');
  } else {
    console.log('   📱 Acessar do celular (mesmo Wi-Fi):');
    ips.forEach(({ interface: iface, ip }) => {
      console.log(`      http://${ip}:${PORT}     (${iface})`);
    });
  }

  console.log('');
  console.log(`   📂 Banco:       backend/data/digao.db`);
  console.log(`   🔐 Auth:        sessão em cookie HttpOnly (8h)`);
  console.log(`   🕐 Timezone:    LOCAL (created_at interpretado no fuso do servidor)`);
  console.log(`   🖨️  Impressão:   ${process.env.PRINTER_SIMULATED === 'true' ? 'SIMULADA' : 'REAL'} (${process.env.PRINTER_NAME || 'mp4200'})`);
  console.log('================================================');
  console.log('');
});