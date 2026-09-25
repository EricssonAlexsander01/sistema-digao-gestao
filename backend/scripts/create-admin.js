/* ============================================================
   create-admin.js — Cria ou atualiza o usuário "joao" (admin)
   SEM resetar o banco. Lê a senha de DIGAO_ADMIN_PASSWORD.
   Uso: node scripts/create-admin.js
   ============================================================ */

require('dotenv').config();

const db = require('../database');
const { hashPassword } = require('../auth');

const username = 'joao';
const password = process.env.DIGAO_ADMIN_PASSWORD;

console.log('🔐 Criando/atualizando usuário admin...\n');

if (!password) {
  console.error('❌ DIGAO_ADMIN_PASSWORD não definida no .env');
  console.error('   Adicione a variável e rode novamente.');
  process.exit(1);
}

if (password.length < 8) {
  console.error('❌ DIGAO_ADMIN_PASSWORD precisa ter pelo menos 8 caracteres.');
  process.exit(1);
}

const hash = hashPassword(password);
const existing = db.prepare('SELECT id, name, username, role, active FROM users WHERE username = ?').get(username);

if (existing) {
  db.prepare(`
    UPDATE users
    SET password_hash = ?, role = 'admin', active = 1
    WHERE id = ?
  `).run(hash, existing.id);

  console.log(`✅ Usuário "${username}" atualizado:`);
  console.log(`   - ID: ${existing.id}`);
  console.log(`   - Nome: ${existing.name}`);
  console.log(`   - Role: admin`);
  console.log(`   - Ativo: sim`);
  console.log(`   - Senha: redefinida`);
} else {
  const result = db.prepare(`
    INSERT INTO users (name, username, password_hash, role, active)
    VALUES (?, ?, ?, 'admin', 1)
  `).run('João Silva', username, hash);

  console.log(`✅ Usuário "${username}" criado:`);
  console.log(`   - ID: ${result.lastInsertRowid}`);
  console.log(`   - Nome: João Silva`);
  console.log(`   - Role: admin`);
  console.log(`   - Ativo: sim`);
}

console.log('');
console.log('ℹ️  Nenhum outro dado foi alterado.');
console.log('ℹ️  O cardápio, mesas, garçons e entregadores permanecem intactos.');