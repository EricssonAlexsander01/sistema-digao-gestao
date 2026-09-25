// seed.js — Popula o banco com o cardápio oficial do documento
// + Mesas e Garçons (Módulo de Mesas)
require('dotenv').config();
const db = require('./database');

console.log('🌱 Populando banco com dados iniciais...');

// ============================================================
// LIMPEZA — apaga tudo (incluindo tabelas novas)
// ============================================================
db.exec(`
  DELETE FROM order_items;
  DELETE FROM payments;
  DELETE FROM deliveries;
  DELETE FROM driver_payments;
  DELETE FROM orders;
  DELETE FROM products;
  DELETE FROM categories;
  DELETE FROM drivers;
  DELETE FROM users;
  DELETE FROM cash_movements;
  DELETE FROM cash_registers;
  DELETE FROM expenses;
  DELETE FROM losses;
  DELETE FROM tables;
  DELETE FROM waiters;
`);

db.exec(`
  DELETE FROM sqlite_sequence WHERE name IN (
    'categories','products','orders','order_items','payments',
    'cash_registers','cash_movements','expenses','losses',
    'drivers','deliveries','driver_payments','users',
    'tables','waiters'
  );
`);
console.log('🔄 IDs resetados para começar em 1');

// ============================================================
// CATEGORIAS E PRODUTOS — SEÇÃO 6 DO DOCUMENTO
// ============================================================
const cardapio = {
  'Lanches': [
    ['X-Salada', 21],
    ['X-Burguer', 20],
    ['X-Burguer Duplo', 27],
    ['X-Tudo', 30],
    ['X-Bacon', 27],
    ['X-Frango com Catupiry', 27],
    ['X-da Casa', 29],
    ['X-Digão', 40],
    ['X-Calabresa', 27],
    ['X-Egg', 24]
  ],
  'Adicionais': [
    ['Ovo', 4],
    ['Hambúrguer', 9],
    ['Salsicha', 3],
    ['Bacon', 6],
    ['Calabresa', 6]
  ],
  'Porções': [
    ['Batata Frita', 20],
    ['Frango', 25],
    ['Peixe', 50],
    ['Calabresa', 25],
    ['Bolinho de Peixe', 35],
    ['Batata com Bacon e Cheddar', 25]
  ],
  'Shawarma': [
    ['Shawarma Frango', 24],
    ['Shawarma Misto', 25],
    ['Shawarma Carne', 26]
  ],
  'Bebidas': [
    ['Refrigerante lata', 6],
    ['Refrigerante 2L', 15],
    ['Suco', 6],
    ['Água', 5],
    ['Chopp (3 un.)', 15],
    ['Coca-Cola litro', 10],
    ['Refrigerante Kuat 2L', 12],
    ['Refrigerante 600ml', 8]
  ]
};

const insertCat = db.prepare('INSERT INTO categories (name) VALUES (?)');
const insertProd = db.prepare(
  'INSERT INTO products (category_id, name, price, is_additional) VALUES (?,?,?,?)'
);

const popularCardapio = db.transaction(() => {
  Object.entries(cardapio).forEach(([catName, items]) => {
    const catId = insertCat.run(catName).lastInsertRowid;
    const isAdd = catName === 'Adicionais' ? 1 : 0;
    items.forEach(([nome, preco]) => insertProd.run(catId, nome, preco, isAdd));
  });
});

popularCardapio();

// ============================================================
// USUÁRIO ADMINISTRATIVO — SEÇÃO 28
// FIX Ciclo 7: senha configurável via DIGAO_ADMIN_PASSWORD.
// Sem a variável, o admin NÃO é criado.
// ============================================================
const { hashPassword } = require('./auth');
const adminPassword = process.env.DIGAO_ADMIN_PASSWORD;

if (!adminPassword) {
  console.log('');
  console.log('⚠️  DIGAO_ADMIN_PASSWORD não definido no .env');
  console.log('   O usuário admin NÃO foi criado.');
  console.log('   Defina a variável e rode o seed novamente.');
  console.log('');
} else if (adminPassword.length < 8) {
  console.log('');
  console.log('⚠️  DIGAO_ADMIN_PASSWORD tem menos de 8 caracteres.');
  console.log('   O usuário admin NÃO foi criado.');
  console.log('');
} else {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('joao');
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, active = 1 WHERE id = ?')
      .run(hashPassword(adminPassword), existing.id);
    console.log('✅ Senha do admin "joao" atualizada.');
  } else {
    db.prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)')
      .run('João Silva', 'joao', hashPassword(adminPassword), 'admin');
    console.log('✅ Usuário admin "joao" criado.');
  }
}

// ============================================================
// ENTREGADORES EXEMPLO — SEÇÃO 18
// ============================================================
const insertDriver = db.prepare(
  `INSERT INTO drivers (name, phone, default_fee) VALUES (?, ?, ?)`
);

const entregadores = [
  ['Carlos', '(45) 99999-0000', 8],
  ['Pedro',  '(45) 98888-1111', 8],
  ['Lucas',  '(45) 97777-2222', 10]
];

entregadores.forEach(([nome, tel, taxa]) => insertDriver.run(nome, tel, taxa));

// ============================================================
// GARÇONS — NOVO
// ============================================================
const insertWaiter = db.prepare(
  `INSERT INTO waiters (name, phone, code) VALUES (?, ?, ?)`
);

const garcons = [
  ['Rafael', '(45) 91111-1111', '1001'],
  ['Bruno',  '(45) 92222-2222', '1002'],
  ['Diego',  '(45) 93333-3333', '1003']
];

garcons.forEach(([nome, tel, codigo]) => insertWaiter.run(nome, tel, codigo));

// ============================================================
// MESAS — NOVO (25 mesas)
// ============================================================
const insertTable = db.prepare(
  `INSERT INTO tables (number, name, status) VALUES (?, ?, 'LIVRE')`
);

const totalMesas = 25;

const popularMesas = db.transaction(() => {
  for (let i = 1; i <= totalMesas; i++) {
    insertTable.run(i, `Mesa ${String(i).padStart(2, '0')}`);
  }
});

popularMesas();

// ============================================================
// RELATÓRIO FINAL
// ============================================================
const totalCats = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
const totalProds = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
const totalDrivers = db.prepare('SELECT COUNT(*) AS n FROM drivers').get().n;
const totalWaiters = db.prepare('SELECT COUNT(*) AS n FROM waiters').get().n;
const totalTables = db.prepare('SELECT COUNT(*) AS n FROM tables').get().n;

console.log('');
console.log('✅ Seed concluído com sucesso!');
console.log(`   - ${totalCats} categorias`);
console.log(`   - ${totalProds} produtos`);
console.log(`   - 1 usuário admin (joao)`);
console.log(`   - ${totalDrivers} entregadores (Carlos, Pedro, Lucas)`);
console.log(`   - ${totalWaiters} garçons (Rafael, Bruno, Diego)`);
console.log(`   - ${totalTables} mesas (01 a ${totalMesas})`);
console.log('');