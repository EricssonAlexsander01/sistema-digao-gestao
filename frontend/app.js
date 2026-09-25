/* ============================================================
   DIGÃO GESTÃO — app.js
   Roteador SPA + utilitários globais
   FIX Ciclo 7 / AUTH: trata 401 automaticamente, identifica
   usuário logado, esconde menus incompatíveis com a role e
   adiciona logout.
   ============================================================ */

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const API = '/api';

// ============================================================
// UTILITÁRIOS GLOBAIS
// ============================================================
window.Digao = {

  // ---------- HTTP ----------
  async api(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : API + endpoint;
    const config = {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    };
    try {
      const res = await fetch(url, config);

      // 401 → sessão inválida/expirada → redireciona pra login
      if (res.status === 401 && !endpoint.includes('/auth/login')) {
        if (!location.pathname.includes('login')) {
          window.location.replace('/login.html');
        }
        throw new Error('Sessão expirada');
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
      return data;
    } catch (e) {
      if (e.message !== 'Sessão expirada') {
        Digao.toast(e.message, 'error');
      }
      throw e;
    }
  },

  get: (url) => Digao.api(url),
  post: (url, body) => Digao.api(url, { method: 'POST', body }),
  put: (url, body) => Digao.api(url, { method: 'PUT', body }),
  del: (url) => Digao.api(url, { method: 'DELETE' }),

  // ---------- FORMATAÇÃO ----------
  money(v) {
    return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  },

  date(iso) {
    if (!iso) return '—';
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  },

  pad(num, size = 3) {
    return String(num).padStart(size, '0');
  },

  // ---------- TOAST ----------
  toast(msg, type = 'info', duration = 3000) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show ' + type;
    clearTimeout(Digao._toastTimer);
    Digao._toastTimer = setTimeout(() => {
      el.classList.remove('show');
    }, duration);
  },

  // ---------- MODAL ----------
  modal(html, { onClose } = {}) {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal">${html}</div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    function close() {
      overlay.remove();
      onClose && onClose();
    }
    root.appendChild(overlay);
    return { close, overlay };
  },

  // ---------- ESTADO GLOBAL ----------
  state: {
    caixaAberto: null,
    cart: [],
    channel: 'BALCAO',
    paymentMethod: 'PIX',
    deliveryFee: 0,
    currentOrder: null,
    tableId: null,
    waiterId: null,
    user: null
  }
};

// Alias global
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

// ============================================================
// ROTEADOR SPA
// ============================================================
const ROUTES = {
  dashboard:   { title: 'Painel de Operações',     subtitle: 'Visão geral do dia',           loader: 'loadDashboard',    roles: ['admin','caixa'] },
  pdv:         { title: 'PDV — Ponto de Venda',    subtitle: 'Nova venda / balcão',          loader: 'loadPDV',          roles: ['admin','caixa','garcom'] },
  mesas:       { title: 'Mesas',                   subtitle: 'Mapa de mesas e comandas',     loader: 'loadMesas',        roles: ['admin','caixa','garcom'] },
  pedidos:     { title: 'Pedidos',                 subtitle: 'Todos os pedidos registrados', loader: 'loadPedidos',      roles: ['admin','caixa','garcom'] },
  whatsapp:    { title: 'Pedidos WhatsApp',        subtitle: 'Registrar pedidos recebidos',  loader: 'loadWhatsApp',     roles: ['admin','caixa','garcom'] },
  cozinha:     { title: 'Cozinha & Comandas',      subtitle: 'Pedidos em preparo',           loader: 'loadCozinha',      roles: ['admin','caixa','cozinha'] },
  caixa:       { title: 'Controle de Caixa',       subtitle: 'Abertura, movimentações e fechamento', loader: 'loadCaixa', roles: ['admin','caixa'] },
  entregadores:{ title: 'Entregadores',            subtitle: 'Cadastro, entregas e pagamentos', loader: 'loadEntregadores', roles: ['admin','caixa'] },
  produtos:    { title: 'Produtos',                subtitle: 'Cardápio e categorias',        loader: 'loadProdutos',     roles: ['admin'] },
  financeiro:  { title: 'Financeiro Geral',        subtitle: 'Despesas, perdas e resultado', loader: 'loadFinanceiro',   roles: ['admin','caixa'] },
  relatorios:  { title: 'Relatórios',              subtitle: 'Faturamento, canais e formas de pagamento', loader: 'loadRelatorios', roles: ['admin','caixa'] }
};

// ============================================================
// PARSER DO HASH
// ============================================================
function parseHash() {
  const raw = location.hash.replace('#', '') || 'pdv';
  const [page, query] = raw.split('?');
  const params = {};
  if (query) {
    query.split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
  }
  return { page, params };
}

async function navigate(page, params = {}) {
  if (!ROUTES[page]) page = 'pdv';

  const user = Digao.state.user;
  if (user && ROUTES[page].roles && !ROUTES[page].roles.includes(user.role)) {
    const fallback = Object.keys(ROUTES).find(p =>
      ROUTES[p].roles.includes(user.role)
    ) || 'pdv';
    Digao.toast('Você não tem acesso a este módulo.', 'warning');
    if (page !== fallback) {
      location.hash = fallback;
      return;
    }
  }

  $$('.menu-item').forEach(m => m.classList.toggle('active', m.dataset.page === page));

  const route = ROUTES[page];
  $('#page-title').textContent = route.title;
  $('#page-subtitle').textContent = route.subtitle;

  const container = $('#app-view');
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Carregando…</div>';

  if (typeof window[route.loader] === 'function') {
    try {
      await window[route.loader](container, params);
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div style="padding:40px;color:var(--danger)">Erro ao carregar: ${e.message}</div>`;
    }
  } else {
    container.innerHTML = `
      <div class="page-padding" style="display:flex;align-items:center;justify-content:center;flex:1">
        <div style="text-align:center;color:var(--text-muted)">
          <i class="fa-solid fa-screwdriver-wrench" style="font-size:48px;opacity:0.3;margin-bottom:16px;display:block"></i>
          <h3 style="color:var(--text-main);margin-bottom:8px">Módulo em desenvolvimento</h3>
          <p style="font-size:13px">Será entregue no próximo bloco.</p>
        </div>
      </div>
    `;
  }

  const currentHash = location.hash.replace('#', '');
  const targetHash = page + (Object.keys(params).length
    ? '?' + Object.entries(params).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    : '');
  if (currentHash !== targetHash) {
    location.hash = targetHash;
  }
}

// ============================================================
// RELÓGIO TOP-BAR
// ============================================================
function updateClock() {
  const now = new Date();
  const dias = ['dom','seg','ter','qua','qui','sex','sáb'];
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  $('#top-date').textContent = `${dias[now.getDay()]}, ${now.getDate()} ${meses[now.getMonth()]} ${now.getFullYear()}`;
  $('#top-time').textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// STATUS DO CAIXA (sidebar)
// ============================================================
async function refreshCaixaStatus() {
  const user = Digao.state.user;
  if (!user) return;
  if (!['admin','caixa'].includes(user.role)) return;

  try {
    const data = await Digao.get('/cash/current');
    const dot = $('#caixa-dot');
    const label = $('#caixa-label');
    const valor = $('#caixa-valor');

    if (data) {
      dot.classList.add('aberto');
      label.textContent = 'Caixa aberto';
      valor.textContent = Digao.money(data.current);
      Digao.state.caixaAberto = data;
    } else {
      dot.classList.remove('aberto');
      label.textContent = 'Caixa fechado';
      valor.textContent = 'R$ 0,00';
      Digao.state.caixaAberto = null;
    }
  } catch (e) {
    // silencioso
  }
}

// ============================================================
// USUÁRIO — carrega /me e atualiza UI
// ============================================================
async function loadUser() {
  try {
    const { user } = await Digao.get('/auth/me');
    Digao.state.user = user;

    const initials = user.name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const roleLabels = {
      admin: 'Administrador',
      caixa: 'Caixa',
      cozinha: 'Cozinha',
      garcom: 'Garçom'
    };

    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');
    const roleEl = document.getElementById('user-role');

    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl) nameEl.textContent = user.name;
    if (roleEl) roleEl.textContent = roleLabels[user.role] || user.role;

    hideIncompatibleMenus(user.role);

    return user;
  } catch (e) {
    throw e;
  }
}

function hideIncompatibleMenus(role) {
  $$('.menu-item').forEach(item => {
    const page = item.dataset.page;
    const route = ROUTES[page];
    if (!route) return;
    if (route.roles && !route.roles.includes(role)) {
      item.style.display = 'none';
    }
  });
}

// ============================================================
// LOGOUT
// ============================================================
async function doLogout() {
  if (!confirm('Deseja sair do sistema?')) return;
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (e) {
    // ignora
  }
  window.location.replace('/login.html');
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadUser();
  } catch (e) {
    return;
  }

  $$('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(item.dataset.page);
    });
  });

  updateClock();
  setInterval(updateClock, 30_000);

  refreshCaixaStatus();
  setInterval(refreshCaixaStatus, 15_000);

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', doLogout);
  }

  const menuBtn = document.getElementById('menu-mobile-btn');
  const menuOverlay = document.getElementById('menu-mobile-overlay');
  const menuClose = document.getElementById('menu-mobile-close');

  if (menuBtn && menuOverlay) {
    menuBtn.addEventListener('click', () => menuOverlay.classList.add('show'));
    menuClose.addEventListener('click', () => menuOverlay.classList.remove('show'));
    menuOverlay.addEventListener('click', (e) => {
      if (e.target === menuOverlay) menuOverlay.classList.remove('show');
    });
    menuOverlay.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', () => {
        menuOverlay.classList.remove('show');
      });
    });
  }

  const { page, params } = parseHash();
  navigate(page, params);

  window.addEventListener('hashchange', () => {
    const { page, params } = parseHash();
    navigate(page, params);
  });
});

window.navigate = navigate;
window.refreshCaixaStatus = refreshCaixaStatus;
window.parseHash = parseHash;