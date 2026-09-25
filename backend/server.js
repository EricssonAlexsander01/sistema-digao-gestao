// server.js — API REST do Digão Gestão (Seção 23 do documento)
// + Módulo de Mesas e Garçons
// + Módulo de Impressão (Bematech MP-4200 TH)
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const printer = require('./printer');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Serve o frontend automaticamente
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Log simples de requisições
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${req.method} ${req.url}`);
  next();
});

// Helper: garante que existe caixa aberto
function getOpenCashRegister() {
  return db.prepare(
    "SELECT * FROM cash_registers WHERE status='ABERTO' ORDER BY id DESC LIMIT 1"
  ).get();
}

// ============================================================
// ROTA RAIZ
// ============================================================
app.get('/api', (req, res) => {
  res.json({
    sistema: 'Digão Gestão',
    versao: '1.2.0',
    cliente: 'Digão Burger & Shawarma — Toledo/PR',
    modulos: ['PDV', 'Pedidos', 'WhatsApp', 'Cozinha', 'Caixa', 'Entregadores', 'Produtos', 'Financeiro', 'Relatórios', 'Mesas', 'Garçom', 'Impressão']
  });
});

// ============================================================
// CATEGORIES (Seção 6)
// ============================================================
app.get('/api/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories WHERE active = 1').all());
});

app.post('/api/categories', (req, res) => {
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
// PRODUCTS (Seção 6)
// ============================================================
app.get('/api/products', (req, res) => {
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

// Busca por código de barras (Fase 3 — leitor)
app.get('/api/products/barcode/:code', (req, res) => {
  const p = db.prepare(`
    SELECT p.*, c.name AS category
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.barcode = ? AND p.active = 1
  `).get(req.params.code);
  if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json(p);
});

app.post('/api/products', (req, res) => {
  const { category_id, name, price, is_additional, barcode } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'Nome e preço obrigatórios' });
  const r = db.prepare(
    'INSERT INTO products (category_id, name, price, is_additional, barcode) VALUES (?,?,?,?,?)'
  ).run(category_id || null, name, price, is_additional ? 1 : 0, barcode || null);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/products/:id', (req, res) => {
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

app.delete('/api/products/:id', (req, res) => {
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// WAITERS — Garçons
// ============================================================
app.get('/api/waiters', (req, res) => {
  res.json(db.prepare('SELECT * FROM waiters WHERE active = 1 ORDER BY name').all());
});

app.post('/api/waiters', (req, res) => {
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

app.put('/api/waiters/:id', (req, res) => {
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
// TABLES — Mesas
// ============================================================
app.get('/api/tables', (req, res) => {
  const tables = db.prepare(`
    SELECT t.*, w.name AS waiter_name
    FROM tables t
    LEFT JOIN waiters w ON w.id = t.waiter_id
    ORDER BY t.number
  `).all();

  tables.forEach(t => {
    const order = db.prepare(`
      SELECT * FROM orders
      WHERE table_id = ? AND status NOT IN ('CONCLUIDO','CANCELADO')
      ORDER BY id DESC LIMIT 1
    `).get(t.id);
    if (order) {
      order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      t.open_order = order;
    } else {
      t.open_order = null;
    }
  });

  res.json(tables);
});

app.post('/api/tables', (req, res) => {
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

app.post('/api/tables/:id/open', (req, res) => {
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

app.post('/api/tables/:id/close', (req, res) => {
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

app.post('/api/tables/:id/force-free', (req, res) => {
  db.prepare(`
    UPDATE tables
    SET status = 'LIVRE', waiter_id = NULL, closed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// ORDERS + MESA
// ============================================================
app.get('/api/orders', (req, res) => {
  const { status, channel, limit, date, table_id } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (channel) { sql += ' AND channel = ?'; params.push(channel); }
  if (table_id) { sql += ' AND table_id = ?'; params.push(table_id); }
  if (date) { sql += ' AND date(created_at) = date(?)'; params.push(date); }
  sql += ' ORDER BY id DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(Number(limit)); }

  const orders = db.prepare(sql).all(...params);
  orders.forEach(o => {
    o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
    o.payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(o.id);
    if (o.table_id) {
      o.table = db.prepare('SELECT * FROM tables WHERE id = ?').get(o.table_id);
    }
    if (o.waiter_id) {
      o.waiter = db.prepare('SELECT * FROM waiters WHERE id = ?').get(o.waiter_id);
    }
  });
  res.json(orders);
});

app.get('/api/orders/:id', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado' });
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
  o.payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(o.id);
  if (o.table_id) {
    o.table = db.prepare('SELECT * FROM tables WHERE id = ?').get(o.table_id);
  }
  if (o.waiter_id) {
    o.waiter = db.prepare('SELECT * FROM waiters WHERE id = ?').get(o.waiter_id);
  }
  res.json(o);
});

app.post('/api/orders', (req, res) => {
  const {
    channel, items, observation,
    customer_name, customer_phone, customer_address,
    customer_neighborhood, customer_complement, delivery_fee,
    table_id, waiter_id
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'RN001: Pedido precisa de pelo menos um produto' });
  }

  if (!['BALCAO', 'WHATSAPP', 'MESA', 'IFOOD'].includes(channel)) {
    return res.status(400).json({ error: 'Canal inválido' });
  }

  if (channel === 'MESA' && !table_id) {
    return res.status(400).json({ error: 'Pedido de mesa precisa de table_id' });
  }

  if (channel === 'MESA') {
    const mesa = db.prepare('SELECT * FROM tables WHERE id = ?').get(table_id);
    if (!mesa) return res.status(404).json({ error: 'Mesa não encontrada' });

    if (mesa.status === 'LIVRE') {
      db.prepare(`
        UPDATE tables
        SET status = 'OCUPADA', waiter_id = ?, opened_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(waiter_id || null, mesa.id);
    }
  }

  const subtotal = items.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0);
  const fee = Number(delivery_fee || 0);
  const total = subtotal + fee;

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
    INSERT INTO order_items (order_id, product_id, name, price, quantity, observation)
    VALUES (?,?,?,?,?,?)
  `);
  items.forEach(it => {
    insertItem.run(orderId, it.product_id || null, it.name, it.price, it.quantity, it.observation || null);
  });

  res.json({ id: orderId, number: nextNum, subtotal, delivery_fee: fee, total });
});

app.put('/api/orders/:id', (req, res) => {
  const { status } = req.body;
  const valid = ['NOVO','EM PREPARO','PRONTO','EM ROTA','CONCLUIDO','CANCELADO'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Status inválido' });

  const pedido = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });

  if (status === 'CANCELADO') {
    const pago = db.prepare(
      'SELECT 1 FROM payments WHERE order_id = ? LIMIT 1'
    ).get(req.params.id);
    if (pago) {
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
app.post('/api/orders/:id/payment', (req, res) => {
  const { method, amount, received } = req.body;

  if (!method) return res.status(400).json({ error: 'RN002: Forma de pagamento obrigatória' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  const change = method === 'DINHEIRO' && received ? Number(received) - order.total : 0;

  db.prepare(`
    INSERT INTO payments (order_id, method, amount, received, change_amount)
    VALUES (?,?,?,?,?)
  `).run(order.id, method, amount || order.total, received || null, change);

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('EM PREPARO', order.id);

  // RN012 — Mesa só libera quando TODOS os pedidos dela estiverem PAGOS
  if (order.table_id) {
    const outrosSemPagamento = db.prepare(`
      SELECT COUNT(*) AS n
      FROM orders o
      WHERE o.table_id = ?
        AND o.id != ?
        AND o.status NOT IN ('CONCLUIDO','CANCELADO')
        AND NOT EXISTS (
          SELECT 1 FROM payments p WHERE p.order_id = o.id
        )
    `).get(order.table_id, order.id).n;

    if (outrosSemPagamento === 0) {
      db.prepare(`
        UPDATE tables
        SET status = 'LIVRE', waiter_id = NULL, closed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(order.table_id);
    }

    // Impressão automática da comanda (não bloqueia resposta)
    const mesaPgto = db.prepare('SELECT * FROM tables WHERE id = ?').get(order.table_id);
    const garcomPgto = order.waiter_id
      ? db.prepare('SELECT * FROM waiters WHERE id = ?').get(order.waiter_id)
      : null;
    const itemsPgto = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

    printer.imprimirComanda(order, itemsPgto, mesaPgto, garcomPgto)
      .catch(e => console.error('[payment] erro ao imprimir:', e));
  }

  const register = getOpenCashRegister();
  if (register) {
    if (method === 'DINHEIRO') {
      db.prepare(`
        INSERT INTO cash_movements (register_id, type, description, amount)
        VALUES (?, 'VENDA', ?, ?)
      `).run(register.id, `Pedido #${order.number} (Dinheiro)`, order.total);
    } else {
      db.prepare(`
        INSERT INTO cash_movements (register_id, type, description, amount)
        VALUES (?, 'ENTRADA', ?, 0)
      `).run(register.id, `Pedido #${order.number} (${method} — não físico)`);
    }
  }

  res.json({ ok: true, change, method });
});

// ============================================================
// COMANDA
// ============================================================
app.get('/api/orders/:id/comanda', (req, res) => {
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
    txt += `${it.quantity}x ${it.name.padEnd(22)} R$ ${(it.price * it.quantity).toFixed(2)}\n`;
    if (it.observation) txt += `   Obs: ${it.observation}\n`;
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
app.get('/api/kitchen', (req, res) => {
  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE status IN ('NOVO','EM PREPARO')
    ORDER BY id ASC
  `).all();
  orders.forEach(o => {
    o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
    if (o.table_id) {
      o.table = db.prepare('SELECT * FROM tables WHERE id = ?').get(o.table_id);
    }
  });
  res.json(orders);
});

// ============================================================
// IMPRESSÃO
// ============================================================
app.post('/api/print/test', async (req, res) => {
  const result = await printer.imprimirTeste();
  if (result.ok) res.json({ ok: true });
  else res.status(500).json({ error: result.error });
});

app.post('/api/print/comanda/:id', async (req, res) => {
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
app.get('/api/cash/current', (req, res) => {
  const reg = getOpenCashRegister();
  if (!reg) return res.json(null);
  const movements = db.prepare(
    'SELECT * FROM cash_movements WHERE register_id = ? ORDER BY id DESC'
  ).all(reg.id);
  const sales = movements.filter(m => m.type === 'VENDA').reduce((s, m) => s + m.amount, 0);
  const entries = movements.filter(m => m.type === 'ENTRADA').reduce((s, m) => s + m.amount, 0);
  const exits = movements.filter(m => m.type === 'SAIDA').reduce((s, m) => s + m.amount, 0);
  const current = reg.initial_value + sales + entries - exits;
  res.json({ ...reg, movements, sales, entries, exits, current });
});

app.post('/api/cash/open', (req, res) => {
  const { initial_value } = req.body;
  const existing = getOpenCashRegister();
  if (existing) return res.status(400).json({ error: 'Já existe um caixa aberto' });
  const r = db.prepare('INSERT INTO cash_registers (initial_value) VALUES (?)')
    .run(initial_value || 0);
  res.json({ id: r.lastInsertRowid });
});

app.post('/api/cash/close', (req, res) => {
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

  const movements = db.prepare('SELECT * FROM cash_movements WHERE register_id = ?').all(reg.id);
  const sales = movements.filter(m => m.type === 'VENDA').reduce((s, m) => s + m.amount, 0);
  const entries = movements.filter(m => m.type === 'ENTRADA').reduce((s, m) => s + m.amount, 0);
  const exits = movements.filter(m => m.type === 'SAIDA').reduce((s, m) => s + m.amount, 0);
  const expected = reg.initial_value + sales + entries - exits;
  const diff = Number(informed_value) - expected;

  db.prepare(`
    UPDATE cash_registers
    SET status = 'FECHADO', closed_at = CURRENT_TIMESTAMP,
        expected_value = ?, informed_value = ?, difference = ?
    WHERE id = ?
  `).run(expected, informed_value, diff, reg.id);

  res.json({ expected, informed: Number(informed_value), difference: diff });
});

app.post('/api/cash/movement', (req, res) => {
  const { type, description, amount } = req.body;
  const reg = getOpenCashRegister();
  if (!reg) return res.status(400).json({ error: 'Caixa fechado' });
  if (!['ENTRADA','SAIDA'].includes(type)) return res.status(400).json({ error: 'Tipo inválido' });
  db.prepare(`
    INSERT INTO cash_movements (register_id, type, description, amount)
    VALUES (?,?,?,?)
  `).run(reg.id, type, description, amount);
  res.json({ ok: true });
});

app.get('/api/cash/movements', (req, res) => {
  const reg = getOpenCashRegister();
  if (!reg) return res.json([]);
  res.json(db.prepare(
    'SELECT * FROM cash_movements WHERE register_id = ? ORDER BY id DESC'
  ).all(reg.id));
});

// ============================================================
// EXPENSES / LOSSES
// ============================================================
app.get('/api/expenses', (req, res) => {
  res.json(db.prepare('SELECT * FROM expenses ORDER BY id DESC').all());
});

app.post('/api/expenses', (req, res) => {
  const { description, category, amount } = req.body;
  if (!description || amount == null) {
    return res.status(400).json({ error: 'Descrição e valor obrigatórios' });
  }
  const r = db.prepare('INSERT INTO expenses (description, category, amount) VALUES (?,?,?)')
    .run(description, category || null, amount);
  res.json({ id: r.lastInsertRowid });
});

app.get('/api/losses', (req, res) => {
  res.json(db.prepare('SELECT * FROM losses ORDER BY id DESC').all());
});

app.post('/api/losses', (req, res) => {
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
app.get('/api/drivers', (req, res) => {
  res.json(db.prepare('SELECT * FROM drivers ORDER BY id DESC').all());
});

app.post('/api/drivers', (req, res) => {
  const { name, phone, default_fee } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const r = db.prepare('INSERT INTO drivers (name, phone, default_fee) VALUES (?,?,?)')
    .run(name, phone || null, default_fee || 8);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/drivers/:id', (req, res) => {
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
app.get('/api/deliveries', (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, dr.name AS driver_name, o.number AS order_number
    FROM deliveries d
    LEFT JOIN drivers dr ON dr.id = d.driver_id
    LEFT JOIN orders o ON o.id = d.order_id
    ORDER BY d.id DESC
  `).all();
  res.json(rows);
});

app.post('/api/deliveries', (req, res) => {
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

app.get('/api/drivers/:id/summary', (req, res) => {
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

app.post('/api/drivers/:id/pay', (req, res) => {
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
app.get('/api/dashboard', (req, res) => {
  const today = new Date().toISOString().substring(0, 10);

  const orders = db.prepare(`
    SELECT * FROM orders WHERE date(created_at) = date(?) AND status != 'CANCELADO'
  `).all(today);

  const faturamento = orders.reduce((s, o) => s + o.total, 0);
  const ticket = orders.length ? faturamento / orders.length : 0;

  const byChannel = (ch) =>
    orders.filter(o => o.channel === ch).reduce((s, o) => s + o.total, 0);

  const expenses = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS t FROM expenses
    WHERE date(created_at) = date(?)
  `).get(today).t;

  const losses = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS t FROM losses
    WHERE date(created_at) = date(?)
  `).get(today).t;

  const entregas = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(fee),0) AS total
    FROM deliveries WHERE date(created_at) = date(?)
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
app.get('/api/reports', (req, res) => {
  const { from, to } = req.query;
  const fromDate = from || '2000-01-01';
  const toDate = to || '2100-01-01';

  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE date(created_at) BETWEEN date(?) AND date(?) AND status != 'CANCELADO'
  `).all(fromDate, toDate);

  const faturamento = orders.reduce((s, o) => s + o.total, 0);
  const ticket = orders.length ? faturamento / orders.length : 0;

  const byChannel = db.prepare(`
    SELECT channel, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
    FROM orders
    WHERE date(created_at) BETWEEN date(?) AND date(?) AND status != 'CANCELADO'
    GROUP BY channel
  `).all(fromDate, toDate);

  const byPayment = db.prepare(`
    SELECT p.method, COUNT(*) AS count, COALESCE(SUM(p.amount),0) AS total
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    WHERE date(o.created_at) BETWEEN date(?) AND date(?)
    GROUP BY p.method
  `).all(fromDate, toDate);

  const expenses = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS t FROM expenses
    WHERE date(created_at) BETWEEN date(?) AND date(?)
  `).get(fromDate, toDate).t;

  const losses = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS t FROM losses
    WHERE date(created_at) BETWEEN date(?) AND date(?)
  `).get(fromDate, toDate).t;

  const deliveries = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(fee),0) AS total
    FROM deliveries WHERE date(created_at) BETWEEN date(?) AND date(?)
  `).get(fromDate, toDate);

  const driverPayments = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS t FROM driver_payments
    WHERE date(paid_at) BETWEEN date(?) AND date(?)
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
// BACKUP
// ============================================================
app.post('/api/backup', (req, res) => {
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

  // Coleta TODOS os IPv4 de rede (ignora localhost)
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push({ interface: name, ip: net.address });
      }
    }
  }

  console.log('');
  console.log('================================================');
  console.log('   🍔  DIGÃO GESTÃO — API REST v1.2');
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
  console.log(`   🖨️  Impressão:   ${process.env.PRINTER_SIMULATED === 'true' ? 'SIMULADA' : 'REAL'} (${process.env.PRINTER_NAME || 'mp4200'})`);
  console.log('================================================');
  console.log('');
});