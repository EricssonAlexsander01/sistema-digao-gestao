/* ============================================================
   DIGÃO GESTÃO — app.js
   Roteador SPA + utilitários globais
   FIX Ciclo 7 / AUTH: trata 401 automaticamente, identifica
   usuário logado, esconde menus incompatíveis com a role e
   adiciona logout.
   FIX Ciclo 10.1 / MODAL: Digao.abrirModalPagamento compartilhado.
   ============================================================ */

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const API = '/api';

// Helper local para escapar HTML em templates de modal/UI do próprio app.js.
// Não é exposto em window.
function escapeHtmlDigao(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

  // ---------- AUTORIZAÇÃO (UI) ----------
  // Espelha a matriz de política do backend. A autoridade real é o backend;
  // este helper serve para esconder/mostrar ações na UI de forma consistente.
  // Fecha por padrão: ação não listada ou role não autorizada → false.
  _permissoes: {
    'pdv.pagar':                   ['admin','caixa'],
    'pdv.fecharConta':             ['admin','caixa'],
    'whatsapp.pagar':              ['admin','caixa'],
    'mesa.fecharConta':            ['admin','caixa'],
    'mesa.trocarGarcom':           ['admin','garcom'],
    'mesa.forceFree':              ['admin'],
    'pedido.transicao.NOVO':       ['admin','caixa'],
    'pedido.transicao.EM PREPARO': ['admin','caixa','cozinha'],
    'pedido.transicao.PRONTO':     ['admin','caixa','cozinha'],
    'pedido.transicao.EM ROTA':    ['admin','caixa'],
    'pedido.transicao.CONCLUIDO':  ['admin','caixa'],
    'pedido.transicao.CANCELADO':  ['admin','caixa'],
    'caixa.estornar':              ['admin'],
    'entregador.cadastrar':        ['admin'],
    'entregador.editar':           ['admin'],
    'entregador.ativar':           ['admin'],
    'entregador.pagar':            ['admin','caixa']
  },

  can(action, role) {
    if (!action) return false;
    const alvo = role || Digao.state?.user?.role;
    if (!alvo) return false;
    const permitidos = Digao._permissoes[action];
    if (!permitidos) return false;
    return permitidos.includes(alvo);
  },

  // ---------- MODAL DE PAGAMENTO (compartilhado) ----------
  // Cópia fiel da lógica que vivia em pages/pdv.js (abrirModalPagamentoMesa).
  // Aceita qualquer order (MESA, BALCAO, WHATSAPP). Suporta múltiplos pagamentos,
  // permanece aberto enquanto houver saldo, nenhum método pré-selecionado.
  //
  // opts aceitos:
  //   - title           → título exibido no topo
  //   - onClose({ quitado, ordem }) → chamado ao fechar (Concluir, Fechar/Pagar depois ou auto-fechamento)
  //   - autoCloseOnPaid → se true, fecha automaticamente ~1,5s após quitar
  abrirModalPagamento(order, opts = {}) {
    const renderConteudo = (ordem) => {
      const total = Number(ordem.total) || 0;
      const pago = Number(ordem.payments_total) || 0;
      const restante = Number(ordem.remaining) || 0;
      const pagamentos = ordem.payments || [];
      const saldoDevido = restante > 0 ? restante : total;

      const linhasItens = (ordem.items || []).map(it => `
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0">
          <span><strong>${it.quantity}x</strong> ${escapeHtmlDigao(it.name)}</span>
          <strong style="color:var(--primary)">${Digao.money(it.price * it.quantity)}</strong>
        </div>
      `).join('');

      const linhasPagamentos = pagamentos.length === 0
        ? '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:8px">Nenhum pagamento registrado ainda.</div>'
        : pagamentos.map(p => `
            <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0">
              <span>${escapeHtmlDigao(p.method)}</span>
              <strong style="color:var(--success)">${Digao.money(p.amount)}</strong>
            </div>
          `).join('');

      const totalLabel = restante <= 0
        ? `<div style="display:flex;justify-content:space-between;font-size:17px;font-weight:800;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);color:var(--success)">
             <span>PAGO</span><span>${Digao.money(total)}</span>
           </div>`
        : `
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;color:var(--text-muted)">
            <span>TOTAL</span><span>${Digao.money(total)}</span>
          </div>
          ${pago > 0 ? `
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;color:var(--success)">
              <span>JÁ PAGO</span><strong>${Digao.money(pago)}</strong>
            </div>
          ` : ''}
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;padding:6px 0 0;color:var(--warning)">
            <span>RESTANTE</span><span>${Digao.money(restante)}</span>
          </div>
        `;

      const titulo = opts.title || `Fechar conta — Pedido #${Digao.pad(ordem.number || 0)}`;

      return `
        <h3 style="margin-bottom:14px">${escapeHtmlDigao(titulo)}</h3>

        <div style="background:var(--bg-dark);border-radius:8px;padding:14px;margin-bottom:14px;max-height:180px;overflow-y:auto">
          ${linhasItens}
          <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
            ${totalLabel}
          </div>
        </div>

        ${pagamentos.length > 0 ? `
          <div style="background:var(--bg-dark);border-radius:8px;padding:12px;margin-bottom:14px">
            <div style="font-size:11px;color:var(--text-muted);font-weight:700;letter-spacing:0.5px;margin-bottom:6px">PAGAMENTOS REGISTRADOS</div>
            ${linhasPagamentos}
          </div>
        ` : ''}

        ${restante <= 0 ? `
          <div class="modal-actions">
            <button class="btn btn-success btn-block" id="mpg-fechar-pago">
              <i class="fa-solid fa-check"></i> Concluir
            </button>
          </div>
        ` : `
          <div class="label">Forma de pagamento</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px" id="mpg-payment-methods">
            <button class="pay-btn" data-method="DINHEIRO">Dinheiro</button>
            <button class="pay-btn" data-method="PIX">Pix</button>
            <button class="pay-btn" data-method="DEBITO">Débito</button>
            <button class="pay-btn" data-method="CREDITO">Crédito</button>
          </div>

          <div style="margin-bottom:14px">
            <label class="label">Valor deste pagamento (R$)</label>
            <input class="input" type="number" id="mpg-valor" step="0.01" min="0" value="${saldoDevido.toFixed(2)}">
          </div>

          <div id="mpg-troco-wrap" style="margin-bottom:14px;display:none">
            <label class="label">Valor recebido em DINHEIRO (R$)</label>
            <input class="input" type="number" id="mpg-recebido" step="0.01" min="0" value="${saldoDevido.toFixed(2)}">
            <div style="margin-top:6px;font-size:12px;color:var(--text-muted)">
              Troco: <strong id="mpg-troco" style="color:var(--success)">R$ 0,00</strong>
            </div>
          </div>

          <div id="mpg-erro" style="display:none;font-size:12px;color:var(--danger);margin-bottom:10px"></div>

          <div class="modal-actions" style="flex-wrap:wrap;gap:8px">
            <button class="btn btn-secondary" id="mpg-fechar-parcial">
              <i class="fa-solid fa-clock"></i> Fechar / Pagar depois
            </button>
            <button class="btn btn-primary" id="mpg-confirm" disabled>
              <i class="fa-solid fa-money-bill"></i> Registrar pagamento
            </button>
          </div>
        `}
      `;
    };

    const m = Digao.modal(renderConteudo(order));

    let method = null;
    let ordemAtual = order;

    function bindConteudo() {
      const overlay = m.overlay;

      const btnConcluir = overlay.querySelector('#mpg-fechar-pago');
      if (btnConcluir) {
        btnConcluir.addEventListener('click', () => {
          m.close();
          if (typeof refreshCaixaStatus === 'function') refreshCaixaStatus();
          if (typeof opts.onClose === 'function') opts.onClose({ quitado: true, ordem: ordemAtual });
        });
        return;
      }

      const btnFecharParcial = overlay.querySelector('#mpg-fechar-parcial');
      const btnConfirm = overlay.querySelector('#mpg-confirm');
      const valorInput = overlay.querySelector('#mpg-valor');
      const trocoWrap = overlay.querySelector('#mpg-troco-wrap');
      const recInput = overlay.querySelector('#mpg-recebido');
      const trocoEl = overlay.querySelector('#mpg-troco');
      const erroEl = overlay.querySelector('#mpg-erro');

      const saldoDevido = Number(ordemAtual.remaining) || Number(ordemAtual.total);

      function atualizarBotao() {
        btnConfirm.disabled = !method;
      }

      function validarValor() {
        erroEl.style.display = 'none';
        const v = Number(valorInput.value);
        if (!Number.isFinite(v) || v <= 0) {
          erroEl.textContent = 'Valor inválido.';
          erroEl.style.display = 'block';
          btnConfirm.disabled = true;
          return false;
        }
        if (v > saldoDevido + 0.01) {
          erroEl.textContent = `Valor excede o saldo (R$ ${saldoDevido.toFixed(2)}).`;
          erroEl.style.display = 'block';
          btnConfirm.disabled = true;
          return false;
        }
        atualizarBotao();
        return true;
      }

      function atualizarTroco() {
        if (method !== 'DINHEIRO') return;
        const r = Number(recInput.value) || 0;
        const valor = Number(valorInput.value) || 0;
        const troco = r - valor;
        trocoEl.textContent = Digao.money(Math.max(troco, 0));
        trocoEl.style.color = troco >= 0 ? 'var(--success)' : 'var(--danger)';
      }

      valorInput.addEventListener('input', () => { validarValor(); atualizarTroco(); });
      if (recInput) recInput.addEventListener('input', atualizarTroco);

      overlay.querySelectorAll('#mpg-payment-methods .pay-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          overlay.querySelectorAll('#mpg-payment-methods .pay-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          method = btn.dataset.method;
          if (trocoWrap) {
            trocoWrap.style.display = method === 'DINHEIRO' ? 'block' : 'none';
          }
          atualizarTroco();
          atualizarBotao();
        });
      });

      validarValor();

      btnFecharParcial.addEventListener('click', () => {
        m.close();
        if (typeof refreshCaixaStatus === 'function') refreshCaixaStatus();
        if (typeof opts.onClose === 'function') opts.onClose({ quitado: false, ordem: ordemAtual });
      });

      btnConfirm.addEventListener('click', async () => {
        if (!method) return;
        if (!validarValor()) return;

        const valor = Number(valorInput.value);
        const received = method === 'DINHEIRO' ? Number(recInput.value) || valor : null;

        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando…';

        try {
          await Digao.post(`/orders/${ordemAtual.id}/payment`, {
            method,
            amount: valor,
            received
          });

          const atualizado = await Digao.get(`/orders/${ordemAtual.id}`);
          ordemAtual = atualizado;

          m.overlay.querySelector('.modal').innerHTML = renderConteudo(ordemAtual);
          method = null;
          bindConteudo();

          if (Number(ordemAtual.remaining) <= 0) {
            if (typeof refreshCaixaStatus === 'function') refreshCaixaStatus();
            if (opts.autoCloseOnPaid) {
              setTimeout(() => {
                m.close();
                if (typeof opts.onClose === 'function') opts.onClose({ quitado: true, ordem: ordemAtual });
              }, 1500);
            }
          }
        } catch (e) {
          btnConfirm.disabled = false;
          btnConfirm.innerHTML = '<i class="fa-solid fa-money-bill"></i> Registrar pagamento';
          erroEl.textContent = e.message || 'Erro ao registrar pagamento.';
          erroEl.style.display = 'block';
        }
      });
    }

    bindConteudo();
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