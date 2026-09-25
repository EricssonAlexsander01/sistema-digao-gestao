/* ============================================================
   DIGÃO GESTÃO — Módulo Mesas (Mapa visual)
   ============================================================ */

let mesasCache = [];
let garconsCache = [];
let mesasRefreshTimer = null;

// ============================================================
// LOADER
// ============================================================
window.loadMesas = async function (container) {
  [mesasCache, garconsCache] = await Promise.all([
    Digao.get('/tables'),
    Digao.get('/waiters')
  ]);

  container.innerHTML = renderMesasLayout();
  bindMesasEvents();
  renderMesasGrid();

  // Auto-refresh a cada 15s (para sincronizar com outros dispositivos)
  if (mesasRefreshTimer) clearInterval(mesasRefreshTimer);
  mesasRefreshTimer = setInterval(async () => {
    if (!location.hash.includes('mesas')) return;
    try {
      mesasCache = await Digao.get('/tables');
      renderMesasGrid();
    } catch (e) { /* silencioso */ }
  }, 15000);
};

// Para o auto-refresh ao sair
window.addEventListener('hashchange', () => {
  if (mesasRefreshTimer && !location.hash.includes('mesas')) {
    clearInterval(mesasRefreshTimer);
    mesasRefreshTimer = null;
  }
});

// ============================================================
// LAYOUT
// ============================================================
function renderMesasLayout() {
  const livres = mesasCache.filter(m => m.status === 'LIVRE').length;
  const ocupadas = mesasCache.filter(m => m.status === 'OCUPADA').length;

  return `
    <div class="page-padding" style="display:flex;flex-direction:column;gap:16px;overflow-y:auto;height:100%">

      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <h3 style="font-size:16px;font-weight:700">Mapa de Mesas</h3>
          <p style="font-size:12px;color:var(--text-muted);margin-top:4px">
            Clique numa mesa para abrir ou gerenciar o pedido.
          </p>
        </div>

        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <span class="badge badge-success">LIVRES: <strong id="count-livres" style="margin-left:6px">${livres}</strong></span>
          <span class="badge badge-warning">OCUPADAS: <strong id="count-ocupadas" style="margin-left:6px">${ocupadas}</strong></span>
          <button class="btn btn-secondary" id="mesas-refresh">
            <i class="fa-solid fa-rotate"></i> Atualizar
          </button>
        </div>
      </div>

      <div id="mesas-grid" class="mesas-grid"></div>
    </div>
  `;
}

// ============================================================
// GRID
// ============================================================
function renderMesasGrid() {
  const grid = document.getElementById('mesas-grid');
  if (!grid) return;

  const livres = mesasCache.filter(m => m.status === 'LIVRE').length;
  const ocupadas = mesasCache.filter(m => m.status === 'OCUPADA').length;
  document.getElementById('count-livres').textContent = livres;
  document.getElementById('count-ocupadas').textContent = ocupadas;

  grid.innerHTML = mesasCache.map(m => renderMesaCard(m)).join('');
}

function renderMesaCard(m) {
  const isLivre = m.status === 'LIVRE';
  const isOcupada = m.status === 'OCUPADA';

  let totalTxt = '';
  let waiterTxt = '';
  let itensTxt = '';

  if (isOcupada && m.open_order) {
    totalTxt = Digao.money(m.open_order.total);
    itensTxt = `${m.open_order.items.length} ${m.open_order.items.length === 1 ? 'item' : 'itens'}`;
    waiterTxt = m.waiter_name || '—';
  }

  return `
    <div class="mesa-card ${isLivre ? 'livre' : 'ocupada'}" data-id="${m.id}">
      <div class="mesa-numero">${String(m.number).padStart(2, '0')}</div>
      <div class="mesa-status">${m.status}</div>
      ${isOcupada ? `
        <div class="mesa-info">
          <div class="mesa-total">${totalTxt}</div>
          <div class="mesa-detalhe">${itensTxt} · ${waiterTxt}</div>
        </div>
      ` : `
        <div class="mesa-info">
          <div class="mesa-detalhe" style="opacity:0.6">Toque para abrir</div>
        </div>
      `}
    </div>
  `;
}

// ============================================================
// EVENTOS
// ============================================================
function bindMesasEvents() {
  document.getElementById('mesas-refresh').addEventListener('click', async () => {
    mesasCache = await Digao.get('/tables');
    renderMesasGrid();
    Digao.toast('Mesas atualizadas', 'success', 1500);
  });

  document.getElementById('mesas-grid').addEventListener('click', (e) => {
    const card = e.target.closest('.mesa-card');
    if (!card) return;
    const id = Number(card.dataset.id);
    const mesa = mesasCache.find(m => m.id === id);
    if (!mesa) return;

    if (mesa.status === 'LIVRE') {
      abrirModalAbrirMesa(mesa);
    } else {
      abrirModalGerenciarMesa(mesa);
    }
  });
}

// ============================================================
// MODAL — ABRIR MESA
// ============================================================
function abrirModalAbrirMesa(mesa) {
  const html = `
    <h3>Abrir ${escapeHtml(mesa.name)}</h3>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px">
      Selecione o garçom responsável por esta mesa.
    </p>

    <div class="label">Garçom</div>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto">
      ${garconsCache.map(g => `
        <button class="garcom-pick" data-id="${g.id}" data-name="${escapeAttr(g.name)}" style="
          display:flex;align-items:center;gap:12px;padding:12px 14px;
          background:var(--bg-dark);border:1px solid var(--border);
          border-radius:10px;cursor:pointer;text-align:left;
          color:var(--text-main);font-family:inherit;transition:0.15s;width:100%
        ">
          <div style="width:38px;height:38px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#000;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">
            ${g.name.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
          </div>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:700">${escapeHtml(g.name)}</div>
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">Código: ${escapeHtml(g.code || '—')}</div>
          </div>
          <i class="fa-solid fa-chevron-right" style="color:var(--text-dim)"></i>
        </button>
      `).join('')}
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="mesa-cancel">Cancelar</button>
    </div>
  `;

  const m = Digao.modal(html);

  document.getElementById('mesa-cancel').addEventListener('click', () => m.close());

  m.overlay.querySelectorAll('.garcom-pick').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--bg-hover)';
      btn.style.borderColor = 'var(--primary)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'var(--bg-dark)';
      btn.style.borderColor = 'var(--border)';
    });
    btn.addEventListener('click', async () => {
      const waiterId = Number(btn.dataset.id);
      const waiterName = btn.dataset.name;
      try {
        await Digao.post(`/tables/${mesa.id}/open`, { waiter_id: waiterId });
        Digao.toast(`${mesa.name} aberta com ${waiterName}`, 'success');
        m.close();

        // Redireciona pro PDV com contexto de mesa
        location.hash = `pdv?table=${mesa.id}&waiter=${waiterId}`;
      } catch (e) { /* já tratado */ }
    });
  });
}

// ============================================================
// MODAL — GERENCIAR MESA OCUPADA
// ============================================================
function abrirModalGerenciarMesa(mesa) {
  const order = mesa.open_order;

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div>
        <h3 style="margin:0">${escapeHtml(mesa.name)}</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-top:4px">
          ${mesa.waiter_name ? 'Garçom: ' + escapeHtml(mesa.waiter_name) : 'Sem garçom vinculado'}
        </p>
      </div>
      <span class="badge badge-warning">OCUPADA</span>
    </div>

    ${order ? `
      <div style="background:var(--bg-dark);border-radius:8px;padding:12px;margin-bottom:14px">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;font-weight:600">ITENS DO PEDIDO #${String(order.number).padStart(3,'0')}</div>
        ${order.items.map(it => `
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0">
            <span><strong>${it.quantity}x</strong> ${escapeHtml(it.name)}</span>
            <strong style="color:var(--primary)">${Digao.money(it.price * it.quantity)}</strong>
          </div>
        `).join('')}
        <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
          <span>Total</span>
          <span style="color:var(--primary)">${Digao.money(order.total)}</span>
        </div>
      </div>
    ` : '<p style="font-size:13px;color:var(--text-muted);margin-bottom:14px">Nenhum pedido em aberto.</p>'}

    <div class="modal-actions" style="flex-direction:column;align-items:stretch">
      ${order ? `
        <button class="btn btn-primary btn-block" id="mesa-adicionar">
          <i class="fa-solid fa-plus"></i> Adicionar mais itens
        </button>
        <button class="btn btn-success btn-block" id="mesa-pagar">
          <i class="fa-solid fa-money-bill"></i> Fechar conta (${Digao.money(order.total)})
        </button>
      ` : `
        <button class="btn btn-primary btn-block" id="mesa-iniciar">
          <i class="fa-solid fa-plus"></i> Iniciar pedido
        </button>
      `}
      <button class="btn btn-secondary btn-block" id="mesa-cancelar">
        Cancelar
      </button>
      <button class="btn btn-danger btn-block" id="mesa-force-free" style="font-size:11.5px;padding:8px">
        <i class="fa-solid fa-triangle-exclamation"></i> Forçar liberação da mesa
      </button>
    </div>
  `;

  const m = Digao.modal(html);

  document.getElementById('mesa-cancelar').addEventListener('click', () => m.close());

  document.getElementById('mesa-adicionar')?.addEventListener('click', () => {
    m.close();
    location.hash = `pdv?table=${mesa.id}`;
  });

  document.getElementById('mesa-iniciar')?.addEventListener('click', () => {
    m.close();
    location.hash = `pdv?table=${mesa.id}`;
  });

  document.getElementById('mesa-pagar')?.addEventListener('click', async () => {
    if (!order) return;
    m.close();
    location.hash = `pdv?table=${mesa.id}&pay=${order.id}`;
  });

  document.getElementById('mesa-force-free').addEventListener('click', async () => {
    if (!confirm(`Tem certeza que quer FORÇAR a liberação da ${mesa.name}? Isso NÃO cancela pedidos abertos.`)) return;
    await Digao.post(`/tables/${mesa.id}/force-free`);
    Digao.toast(`${mesa.name} liberada à força`, 'warning');
    m.close();
    mesasCache = await Digao.get('/tables');
    renderMesasGrid();
  });
}

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function escapeAttr(str) { return escapeHtml(str); }