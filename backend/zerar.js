const db = require('./database');

console.log('🧹 Zerando dados operacionais...');

// 1. Apaga tudo dos dados operacionais
db.exec(`
  DELETE FROM order_items;
  DELETE FROM payments;
  DELETE FROM deliveries;
  DELETE FROM driver_payments;
  DELETE FROM orders;
  DELETE FROM cash_movements;
  DELETE FROM cash_registers;
  DELETE FROM expenses;
  DELETE FROM losses;
`);

// 2. Reseta os IDs autoincrementais
db.exec(`
  DELETE FROM sqlite_sequence WHERE name IN (
    'orders','order_items','payments','deliveries','driver_payments',
    'cash_registers','cash_movements','expenses','losses'
  );
`);

// 3. Libera TODAS as mesas
db.exec(`
  UPDATE tables
  SET status = 'LIVRE',
      waiter_id = NULL,
      opened_at = NULL,
      closed_at = NULL;
`);

console.log('✅ Dados operacionais zerados. Cardápio e mesas mantidos.');
console.log('✅ Todas as 25 mesas estão LIVRES.');