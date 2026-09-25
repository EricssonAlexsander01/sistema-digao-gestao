/* ============================================================
   DIGÃO GESTÃO — Módulo de Autenticação (Ciclo 7)
   - Hash de senha com scrypt nativo
   - Geração de token de sessão + hash SHA-256
   - Criação/leitura/revogação de sessões
   - Middlewares requireAuth e requireRole
   Sem dependências externas — só crypto nativo.
   ============================================================ */

const crypto = require('crypto');
const db = require('./database');

// ============================================================
// CONFIGURAÇÃO DE SESSÃO
// ============================================================
const SESSION_DURATION_HOURS = 8;
const SESSION_DURATION_MS = SESSION_DURATION_HOURS * 60 * 60 * 1000;
const COOKIE_NAME = 'digao_sid';
const COOKIE_MAX_AGE_SECONDS = SESSION_DURATION_HOURS * 60 * 60;

// Parâmetros do scrypt (padrão recomendado)
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

// ============================================================
// HASH DE SENHA (scrypt nativo)
// Formato do hash: scrypt$N$r$p$salt$hash
// ============================================================

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  }).toString('hex');

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, N, r, p, salt, expectedHash] = parts;

  try {
    const computed = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
      N: Number(N),
      r: Number(r),
      p: Number(p)
    }).toString('hex');

    // timingSafeEqual exige buffers do mesmo tamanho
    const a = Buffer.from(expectedHash, 'hex');
    const b = Buffer.from(computed, 'hex');
    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

// ============================================================
// TOKEN DE SESSÃO
// ============================================================

function generateToken() {
  // 32 bytes = 256 bits de entropia
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ============================================================
// SESSÕES
// ============================================================

function createSession(userId) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  db.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, tokenHash, expiresAt);

  return { token, expiresAt };
}

function getSessionByToken(token) {
  if (!token || typeof token !== 'string') return null;

  const tokenHash = hashToken(token);
  const session = db.prepare(`
    SELECT * FROM sessions WHERE token_hash = ?
  `).get(tokenHash);

  if (!session) return null;

  // Verifica expiração
  if (new Date(session.expires_at).getTime() < Date.now()) {
    // Remove sessão expirada
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    return null;
  }

  return session;
}

function revokeSession(token) {
  if (!token) return;
  const tokenHash = hashToken(token);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

function revokeAllUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// Remove sessões expiradas (chamado oportunisticamente no login)
function cleanupExpiredSessions() {
  const now = new Date().toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
}

// ============================================================
// COOKIE
// ============================================================

function setSessionCookie(res, token) {
  // Secure somente quando HTTPS estiver ativo (não no LAN HTTP atual)
  const secure = process.env.DIGAO_HTTPS === 'true' ? '; Secure' : '';

  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
  );
}

function getCookieToken(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  // Parse simples de cookie (evita dependência do cookie-parser)
  const cookies = cookieHeader.split(';').reduce((acc, pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return acc;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    acc[key] = decodeURIComponent(val);
    return acc;
  }, {});

  return cookies[COOKIE_NAME] || null;
}

// ============================================================
// MIDDLEWARES
// ============================================================

// Anexa req.user se houver sessão válida.
// NÃO bloqueia se não houver — apenas identifica.
function identifyUser(req, res, next) {
  req.user = null;

  try {
    const token = getCookieToken(req);
    if (!token) return next();

    const session = getSessionByToken(token);
    if (!session) return next();

    const user = db.prepare(`
      SELECT id, name, username, role, active FROM users WHERE id = ?
    `).get(session.user_id);

    if (!user || !user.active) {
      // Sessão órfã ou usuário desativado — revoga
      revokeSession(token);
      return next();
    }

    req.user = user;
    req.session = session;
    next();
  } catch (e) {
    console.error('[auth] identifyUser erro:', e);
    next();
  }
}

// Bloqueia se não estiver autenticado.
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  next();
}

// Bloqueia se não tiver uma das roles permitidas.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // Senha
  hashPassword,
  verifyPassword,

  // Sessão
  createSession,
  getSessionByToken,
  revokeSession,
  revokeAllUserSessions,
  cleanupExpiredSessions,

  // Cookie
  setSessionCookie,
  clearSessionCookie,
  getCookieToken,

  // Middlewares
  identifyUser,
  requireAuth,
  requireRole,

  // Constantes
  COOKIE_NAME,
  SESSION_DURATION_HOURS
};