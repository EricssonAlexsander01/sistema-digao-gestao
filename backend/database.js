// database.js — Estrutura completa do banco (Seção 22 do documento)
// + Módulo de MESAS e GARÇONS
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Garante que a pasta data/ existe
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Conexão com o banco SQLite (digao.db)
const db = new Database(path.join(dataDir, 'digao.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// CRIAÇÃO DAS TABELAS — SEÇÃO 22 DO DOCUMENTO DE ESPECIFICAÇÃO
// ============================================================
db.exec(`

-- USERS (Seção 28 — Segurança e Acesso)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','caixa','cozinha','garcom')),
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CATEGORIES (Seção 6 — Produtos)
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  active INTEGER DEFAULT 1
);

-- PRODUCTS (Seção 6 — Produtos)
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id),
  name TEXT NOT NULL,
  price REAL NOT NULL CHECK(price >= 0),
  barcode TEXT,
  active INTEGER DEFAULT 1,
  is_additional INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- WAITERS (Garçons — NOVO)
CREATE TABLE IF NOT EXISTS waiters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  code TEXT UNIQUE,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- TABLES (Mesas — NOVO)
CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL UNIQUE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'LIVRE'
    CHECK(status IN ('LIVRE','OCUPADA','FECHANDO')),
  waiter_id INTEGER REFERENCES waiters(id),
  opened_at TEXT,
  closed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ORDERS (Seção 5 — PDV | Seção 12 — WhatsApp | Seção 13 — Status)
-- Nota: o CHECK do channel é recriado abaixo caso o banco seja antigo
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER,
  channel TEXT NOT NULL CHECK(channel IN ('BALCAO','WHATSAPP','IFOOD','MESA')),
  status TEXT NOT NULL DEFAULT 'NOVO'
    CHECK(status IN ('NOVO','EM PREPARO','PRONTO','EM ROTA','CONCLUIDO','CANCELADO')),
  table_id INTEGER REFERENCES tables(id),
  waiter_id INTEGER REFERENCES waiters(id),
  subtotal REAL DEFAULT 0,
  delivery_fee REAL DEFAULT 0,
  total REAL DEFAULT 0,
  observation TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_neighborhood TEXT,
  customer_complement TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ORDER_ITEMS (Seção 5.2 — Informações da venda)
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  observation TEXT
);

-- PAYMENTS (Seção 9 — Pagamentos)
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK(method IN ('PIX','DINHEIRO','DEBITO','CREDITO')),
  amount REAL NOT NULL,
  received REAL,
  change_amount REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CASH_REGISTERS (Seção 16 — Caixa)
CREATE TABLE IF NOT EXISTS cash_registers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  user_id INTEGER REFERENCES users(id),
  initial_value REAL NOT NULL DEFAULT 0,
  expected_value REAL,
  informed_value REAL,
  difference REAL,
  status TEXT NOT NULL DEFAULT 'ABERTO' CHECK(status IN ('ABERTO','FECHADO'))
);

-- CASH_MOVEMENTS (Seção 16 — Vendas, Entradas, Saídas)
CREATE TABLE IF NOT EXISTS cash_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  register_id INTEGER REFERENCES cash_registers(id),
  type TEXT NOT NULL CHECK(type IN ('VENDA','ENTRADA','SAIDA')),
  description TEXT,
  amount REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- EXPENSES (Seção 17 — Financeiro)
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  category TEXT,
  amount REAL NOT NULL CHECK(amount >= 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- LOSSES (Seção 17 — Perdas)
CREATE TABLE IF NOT EXISTS losses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  category TEXT,
  amount REAL NOT NULL CHECK(amount >= 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- DRIVERS (Seção 18 — Entregadores)
CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  default_fee REAL NOT NULL DEFAULT 8,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- DELIVERIES (Seção 18/19 — Entregas)
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  driver_id INTEGER REFERENCES drivers(id),
  fee REAL NOT NULL,
  status TEXT DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE','PAGO')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- DRIVER_PAYMENTS (Seção 19 — Pagamento de entregadores)
CREATE TABLE IF NOT EXISTS driver_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id INTEGER REFERENCES drivers(id),
  amount REAL NOT NULL,
  deliveries_count INTEGER,
  paid_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ÍNDICES (Performance — RNF06)
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_cash_mov_register ON cash_movements(register_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
`);

// ============================================================
// MIGRAÇÕES — adiciona colunas em bancos antigos
// ============================================================
function columnExists(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === column);
}

const migrations = [
  ['products', 'barcode',   'ALTER TABLE products ADD COLUMN barcode TEXT'],
  ['orders',   'table_id',  'ALTER TABLE orders ADD COLUMN table_id INTEGER REFERENCES tables(id)'],
  ['orders',   'waiter_id', 'ALTER TABLE orders ADD COLUMN waiter_id INTEGER REFERENCES waiters(id)']
];

migrations.forEach(([table, column, sql]) => {
  if (!columnExists(table, column)) {
    try {
      db.exec(sql);
      console.log(`🔧 Migração aplicada: ${table}.${column}`);
    } catch (e) {
      console.log(`⚠️  ${table}.${column}: ${e.message}`);
    }
  }
});

// ============================================================
// VERIFICA SE O CHECK DO channel PERMITE 'MESA'
// Se o banco é antigo, precisa recriar a tabela orders
// ============================================================
function ordersChannelAceitaMesa() {
  try {
    const row = db.prepare(`
      SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'
    `).get();
    return row && row.sql && row.sql.includes("'MESA'");
  } catch {
    return false;
  }
}

if (!ordersChannelAceitaMesa()) {
  console.log('');
  console.log('⚠️  ATENÇÃO: o CHECK do campo channel ainda NÃO aceita "MESA".');
  console.log('   O banco atual foi criado com a versão antiga do schema.');
  console.log('');
  console.log('   ➡️  Rode "npm run seed" para recriar o banco com o schema novo.');
  console.log('   ➡️  Isso vai apagar os dados atuais (faça backup antes!).');
  console.log('');
}

console.log('✅ Banco de dados inicializado: digao.db');

module.exports = db;