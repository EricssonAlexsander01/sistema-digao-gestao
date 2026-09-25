/* ============================================================
   DIGÃO GESTÃO — app.js
   Roteador SPA + utilitários globais
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
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    };
    try {
      const res = await fetch(url, config);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
      return data;
    } catch (e) {
      Digao.toast(e.message, 'error');
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
    const d = new Date(iso.replace(' ', 'T'));
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  },

  pad(num, size = 3) {
    return String(num).padStart(size, '0');
  },

  // ---------- TOAST ----------
  toast(msg, type = 'info', duration = 3000) {
    const el = document.getElementById('toast');
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
    // NOVO — contexto de mesa/garçom
    tableId: null,
    waiterId: null
  }
};

// Alias global para praticidade
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

// ============================================================
// ROTEADOR SPA
// ============================================================
const ROUTES = {
  dashboard:   { title: 'Painel de Operações',     subtitle: 'Visão geral do dia',           loader: 'loadDashboard' },
  pdv:         { title: 'PDV — Ponto de Venda',    subtitle: 'Nova venda / balcão',          loader: 'loadPDV' },
  mesas:       { title: 'Mesas',                   subtitle: 'Mapa de mesas e comandas',     loader: 'loadMesas' },
  pedidos:     { title: 'Pedidos',                 subtitle: 'Todos os pedidos registrados', loader: 'loadPedidos' },
  whatsapp:    { title: 'Pedidos WhatsApp',        subtitle: 'Registrar pedidos recebidos',  loader: 'loadWhatsApp' },
  cozinha:     { title: 'Cozinha & Comandas',      subtitle: 'Pedidos em preparo',           loader: 'loadCozinha' },
  caixa:       { title: 'Controle de Caixa',       subtitle: 'Abertura, movimentações e fechamento', loader: 'loadCaixa' },
  entregadores:{ title: 'Entregadores',            subtitle: 'Cadastro, entregas e pagamentos', loader: 'loadEntregadores' },
  produtos:    { title: 'Produtos',                subtitle: 'Cardápio e categorias',        loader: 'loadProdutos' },
  financeiro:  { title: 'Financeiro Geral',        subtitle: 'Despesas, perdas e resultado', loader: 'loadFinanceiro' },
  relatorios:  { title: 'Relatórios',              subtitle: 'Faturamento, canais e formas de pagamento', loader: 'loadRelatorios' }
};

// ============================================================
// PARSER DO HASH — aceita "#pdv?table=5&waiter=2"
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

  // Atualiza menu
  $$('.menu-item').forEach(m => m.classList.toggle('active', m.dataset.page === page));

  // Atualiza header
  const route = ROUTES[page];
  $('#page-title').textContent = route.title;
  $('#page-subtitle').textContent = route.subtitle;

  // Chama o loader correspondente (definido em cada módulo)
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

  // Não mexer no hash se já estamos na mesma rota com mesmos params
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
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Menu de navegação
  $$('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(item.dataset.page);
    });
  });

  // Relógio
  updateClock();
  setInterval(updateClock, 30_000);

  // Status do caixa
  refreshCaixaStatus();
  setInterval(refreshCaixaStatus, 15_000);

    // ===== Menu mobile =====
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

  // Rota inicial (hash ou PDV)
  const { page, params } = parseHash();
  navigate(page, params);

  // Suporte a voltar/avançar do navegador + parâmetros
  window.addEventListener('hashchange', () => {
    const { page, params } = parseHash();
    navigate(page, params);
  });
});

// Expor funções usadas por outros módulos
window.navigate = navigate;
window.refreshCaixaStatus = refreshCaixaStatus;
window.parseHash = parseHash;