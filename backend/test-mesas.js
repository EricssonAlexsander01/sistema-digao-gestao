const db = require('./database');

console.log('\nMesas:');
db.prepare('SELECT * FROM tables ORDER BY number').all()
  .forEach(t => console.log(` #${String(t.number).padStart(2,'0')} - ${t.name} - ${t.status}`));

console.log('\nGarçons:');
db.prepare('SELECT * FROM waiters').all()
  .forEach(w => console.log(` ${w.name} (código ${w.code})`));
  