/* ============================================================
   create-admin.js — Cria ou atualiza o usuário "joao" (admin)
   SEM resetar o banco. Lê a senha de DIGAO_ADMIN_PASSWORD.

   Uso:
     node scripts/create-admin.js            → só cria se não existir
     node scripts/create-admin.js --force    → cria ou REDEFINE senha

   FIX Ciclo 8 / Item 10: comportamento seguro por padrão.
   ============================================================ */

require('dotenv').config();

const db = require('../database');
const { hashPassword } = require('../auth');

const username = 'joao';
const password = process.env.DIGAO_ADMIN_PASSWORD;
const force = process.argv.includes('--force');

console.log('');
console.log('🔐 Gerenciador do usuário admin');
console.log('   Modo:', force ? 'FORCE (pode redefinir senha)' : 'SEGURO (só cria se não existir)');
console.log('');

if (!password) {
  console.error('❌ DIGAO_ADMIN_PASSWORD não definida no .env');
  console.error('   Adicione a variável e rode novamente.');
  process.exit(1);
}

if (password.length < 8) {
  console.error('❌ DIGAO_ADMIN_PASSWORD precisa ter pelo menos 8 caracteres.');
  process.exit(1);
}

const existing = db.prepare(
  'SELECT id, name, username, role, active FROM users WHERE username = ?'
).get(username);

// ---------- CENÁRIO 1: usuário não existe → sempre cria ----------
if (!existing) {
  const hash = hashPassword(password);
  const result = db.prepare(`
    INSERT INTO users (name, username, password_hash, role, active)
    VALUES (?, ?, ?, 'admin', 1)
  `).run('João Silva', username, hash);

  console.log('✅ Usuário "joao" criado:');
  console.log(`   - ID: ${result.lastInsertRowid}`);
  console.log(`   - Nome: João Silva`);
  console.log(`   - Role: admin`);
  console.log(`   - Ativo: sim`);
  console.log('');
  console.log('ℹ️  Nenhum outro dado foi alterado.');
  console.log('ℹ️  O cardápio, mesas, garçons e entregadores permanecem intactos.');
  process.exit(0);
}

// ---------- CENÁRIO 2: usuário existe + sem --force → não toca ----------
if (existing && !force) {
  console.log(`ℹ️  O usuário "${username}" já existe (ID ${existing.id}).`);
  console.log(`   Role atual: ${existing.role}`);
  console.log(`   Ativo: ${existing.active ? 'sim' : 'não'}`);
  console.log('');
  console.log('   Nenhuma alteração foi feita.');
  console.log('   Para redefinir a senha, rode com --force:');
  console.log('   node scripts/create-admin.js --force');
  process.exit(0);
}

// ---------- CENÁRIO 3: usuário existe + --force → redefine ----------
if (existing && force) {
  const hash = hashPassword(password);
  db.prepare(`
    UPDATE users
    SET password_hash = ?, role = 'admin', active = 1
    WHERE id = ?
  `).run(hash, existing.id);

  // Revoga todas as sessões do usuário (força novo login)
  try {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
  } catch (e) {
    // tabela sessions pode não existir em bancos antigos — ignora
  }

  console.log('✅ Senha do usuário "joao" REDEFINIDA (--force):');
  console.log(`   - ID: ${existing.id}`);
  console.log(`   - Nome: ${existing.name}`);
  console.log(`   - Role: admin`);
  console.log(`   - Ativo: sim`);
  console.log(`   - Sessões ativas: revogadas`);
  console.log('');
  console.log('ℹ️  Nenhum outro dado foi alterado.');
  process.exit(0);
}