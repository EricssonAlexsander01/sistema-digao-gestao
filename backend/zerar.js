const db = require('./database');

console.log('🧹 Zerando dados operacionais...');

// FIX Ciclo 4 / AUD-ME-02: incluir table_force_free_log antes de apagar
// orders/tables (FK sem ON DELETE CASCADE).
// FIX Ciclo 6 / AUD-PG-07: incluir payments_refunds antes de payments.
// Envolvido em transação: se uma etapa falhar, nada é apagado.

const zerar = db.transaction(() => {
  // 1. Auditoria e estornos primeiro (referenciam orders/payments)
  db.exec(`DELETE FROM table_force_free_log;`);
  db.exec(`DELETE FROM payments_refunds;`);

  // 2. Dados operacionais
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

  // 3. Reseta os IDs autoincrementais
  db.exec(`
    DELETE FROM sqlite_sequence WHERE name IN (
      'table_force_free_log',
      'payments_refunds',
      'orders','order_items','payments','deliveries','driver_payments',
      'cash_registers','cash_movements','expenses','losses'
    );
  `);

  // 4. Libera TODAS as mesas
  db.exec(`
    UPDATE tables
    SET status = 'LIVRE',
        waiter_id = NULL,
        opened_at = NULL,
        closed_at = NULL;
  `);
});

zerar();

console.log('✅ Dados operacionais zerados. Cardápio e mesas mantidos.');
console.log('✅ Todas as 25 mesas estão LIVRES.');