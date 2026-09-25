/* ============================================================
   DIGÃO GESTÃO — Módulo Cozinha & Comandas
   FIX Bug #9: listeners vivem em #coz-root (recriado a cada render),
   eliminando o listener global em document que reagia a [data-action]
   de outras telas (ex: .qty-btn do PDV/WhatsApp) e disparava
   PUT /orders/undefined.
   FIX Ciclo 5 / AUD-ARQ-01: card de comanda marca adicionais
   com prefixo '+' e destaque visual (info).
   ============================================================ */

let cozinhaTimer = null;

// ============================================================
// LOADER PRINCIPAL
// ============================================================
window.loadCozinha = async function (container) {
  console.log('[cozinha] loadCozinha iniciado');
  container.innerHTML = renderCozinhaLayout();
  bindCozinhaEvents();
  await carregarCozinha();

  // Auto-refresh a cada 10s
  if (cozinhaTimer) clearInterval(cozinhaTimer);
  cozinhaTimer = setInterval(carregarCozinha, 10000);
};

// Para o auto-refresh quando sair da tela
window.addEventListener('hashchange', () => {
  if (cozinhaTimer && !location.hash.includes('cozinha')) {
    clearInterval(cozinhaTimer);
    cozinhaTimer = null;
  }
});

// ============================================================
// LAYOUT
// FIX Bug #9 — todo o HTML é envolvido em #coz-root.
// ============================================================
function renderCozinhaLayout() {
  return `
    <div id="coz-root" class="page-padding" style="display:flex;flex-direction:column;gap:16px;overflow-y:auto">

      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <h3 style="font-size:16px;font-weight:700">Comandas em andamento</h3>
          <p style="font-size:12px;color:var(--text-muted);margin-top:4px">
            Atualização automática a cada 10 segundos.
          </p>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <span class="badge badge-info">
            <i class="fa-solid fa-circle" style="font-size:6px"></i> Novos:
            <strong id="coz-novos" style="margin-left:4px">0</strong>
          </span>
          <span class="badge badge-warning">
            <i class="fa-solid fa-fire" style="font-size:9px"></i> Preparando:
            <strong id="coz-preparo" style="margin-left:4px">0</strong>
          </span>
          <button class="btn btn-secondary" id="coz-refresh">
            <i class="fa-solid fa-rotate"></i> Atualizar
          </button>
        </div>
      </div>

      <div id="cozinha-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;align-content:start;padding-bottom:24px"></div>
    </div>
  `;
}

// ============================================================
// EVENTOS
// FIX Bug #9 — listeners registrados em #coz-root (recriado a
// cada render), não em document. Ao sair da cozinha, o root é
// destruído e os listeners morrem junto.
// ============================================================
function bindCozinhaEvents() {
  const root = document.getElementById('coz-root');
  if (!root) return;

  // ===== Botão de refresh =====
  const refreshBtn = root.querySelector('#coz-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      carregarCozinha();
    });
  }

  // ===== Botões de ação nas comandas (delegado em #coz-root) =====
  // Restrito a elementos que tenham data-action="start" ou "ready"
  // E data-id (que só existem dentro dos cards da cozinha).
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    // Defesa: só processa ações próprias da cozinha
    const action = btn.dataset.action;
    if (action !== 'start' && action !== 'ready') return;

    const id = btn.dataset.id;
    if (!id) return;

    const status = action === 'start' ? 'EM PREPARO' : 'PRONTO';

    try {
      await Digao.put(`/orders/${id}`, { status });
      Digao.toast(`Pedido atualizado para ${status}`, 'success');
      carregarCozinha();
    } catch (err) {
      console.error('[cozinha] erro ao atualizar:', err);
    }
  });
}

// ============================================================
// CARREGAR COMANDAS
// ============================================================
async function carregarCozinha() {
  const grid = document.getElementById('cozinha-grid');
  if (!grid) return;

  try {
    const pedidos = await Digao.get('/kitchen');
    console.log('[cozinha] pedidos recebidos:', pedidos.length);

    const novos = pedidos.filter(p => p.status === 'NOVO').length;
    const preparo = pedidos.filter(p => p.status === 'EM PREPARO').length;

    const elNovos = document.getElementById('coz-novos');
    const elPreparo = document.getElementById('coz-preparo');
    if (elNovos) elNovos.textContent = novos;
    if (elPreparo) elPreparo.textContent = preparo;

    if (pedidos.length === 0) {
      grid.innerHTML = `
        <div class="card" style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-muted)">
          <i class="fa-solid fa-mug-hot" style="font-size:44px;opacity:0.3;display:block;margin-bottom:14px"></i>
          Nenhum pedido na fila. Cozinha em dia! 🎉
        </div>
      `;
      return;
    }

    grid.innerHTML = pedidos.map(p => renderComanda(p)).join('');
  } catch (e) {
    console.error('[cozinha] erro:', e);
    grid.innerHTML = `<div style="grid-column:1/-1;color:var(--danger);padding:20px">Erro ao carregar: ${e.message}</div>`;
  }
}

// ============================================================
// RENDER — comanda individual
// FIX Ciclo 5 / AUD-ARQ-01: adicionais marcados com '+ ' e
// destaque visual em azul (info).
// ============================================================
function renderComanda(p) {
  const isNovo = p.status === 'NOVO';
  const borderColor = isNovo ? 'var(--info)' : 'var(--warning)';

  return `
    <div class="card" style="padding:0;overflow:hidden;border-left:4px solid ${borderColor}">
      <div style="padding:14px 16px;background:var(--bg-dark);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;color:var(--text-muted);font-weight:600">PEDIDO</div>
          <div style="font-size:20px;font-weight:800;color:var(--primary)">#${Digao.pad(p.number)}</div>
        </div>
        <div style="text-align:right">
          <span class="badge ${isNovo ? 'badge-info' : 'badge-warning'}">${p.status}</span>
          <div style="font-size:11px;color:var(--text-muted);margin-top:6px">${Digao.date(p.created_at)}</div>
        </div>
      </div>

      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
        ${p.items.map(i => `
          <div style="padding:6px 0;border-bottom:1px dashed var(--border)">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <strong style="font-size:14px;${i.is_additional ? 'color:var(--info)' : 'color:var(--primary)'}">${i.is_additional ? '+ ' : ''}${i.quantity}x</strong>
              <span style="font-size:13.5px;font-weight:600;flex:1;margin-left:10px;${i.is_additional ? 'color:var(--info)' : ''}">${escapeHtml(i.name)}</span>
            </div>
            ${i.observation ? `<div style="font-size:11.5px;color:var(--warning);font-style:italic;margin-top:4px;padding-left:26px">⚠ ${escapeHtml(i.observation)}</div>` : ''}
          </div>
        `).join('')}
      </div>

      ${p.observation ? `
        <div style="padding:10px 16px;background:rgba(245,158,11,0.1);font-size:12px;color:var(--warning);border-top:1px solid var(--border)">
          <strong>Observação geral:</strong> ${escapeHtml(p.observation)}
        </div>` : ''}

      <div style="padding:12px 16px;background:var(--bg-dark);display:flex;gap:8px;border-top:1px solid var(--border)">
        ${isNovo ? `
          <button class="btn btn-primary" style="flex:1" data-action="start" data-id="${p.id}">
            <i class="fa-solid fa-fire"></i> Iniciar preparo
          </button>
        ` : `
          <button class="btn btn-success" style="flex:1" data-action="ready" data-id="${p.id}">
            <i class="fa-solid fa-check"></i> Marcar pronto
          </button>
        `}
      </div>
    </div>
  `;
}

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}