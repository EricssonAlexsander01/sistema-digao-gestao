/* ============================================================
   DIGÃO GESTÃO — Módulo Financeiro Geral
   Despesas, Perdas e Resultado
   ============================================================ */

let expensesCache = [];
let lossesCache = [];
let finAba = 'despesas'; // 'despesas' | 'perdas'

// ============================================================
// LOADER
// ============================================================
window.loadFinanceiro = async function (container) {
  await recarregarDados();
  container.innerHTML = renderFinanceiroLayout();
  bindFinanceiroEvents();
  renderLista();
  await renderResumo();
};

async function recarregarDados() {
  [expensesCache, lossesCache] = await Promise.all([
    Digao.get('/expenses'),
    Digao.get('/losses')
  ]);
}

// ============================================================
// LAYOUT
// ============================================================
function renderFinanceiroLayout() {
  return `
    <div class="page-padding" style="display:flex;flex-direction:column;gap:16px;overflow:hidden">

      <div class="grid-4" id="fin-resumo">
        <div class="card" style="padding:18px"><div style="color:var(--text-muted);font-size:12px">Carregando…</div></div>
      </div>

      <div class="card" style="padding:0;flex:1;display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">
          <div style="display:flex;gap:8px">
            <button class="cat-btn active" data-aba="despesas">Despesas</button>
            <button class="cat-btn" data-aba="perdas">Perdas</button>
          </div>
          <button class="btn btn-primary" id="btn-novo-lancamento">
            <i class="fa-solid fa-plus"></i> Novo lançamento
          </button>
        </div>
        <div id="fin-list" style="flex:1;overflow-y:auto"></div>
      </div>
    </div>
  `;
}

// ============================================================
// RESUMO (Despesas / Perdas / Resultado)
// ============================================================
async function renderResumo() {
  const dash = await Digao.get('/dashboard');
  const el = document.getElementById('fin-resumo');

  const totalDespesas = expensesCache.reduce((s, d) => s + d.amount, 0);
  const totalPerdas = lossesCache.reduce((s, d) => s + d.amount, 0);
  const lucro = dash.faturamento - totalDespesas - totalPerdas - (dash.entregas_total || 0);

  el.innerHTML = `
    <div class="card" style="padding:18px">
      <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">DESPESAS (TOTAL)</div>
      <div style="font-size:22px;font-weight:800;color:var(--danger);margin-top:8px">− ${Digao.money(totalDespesas)}</div>
    </div>
    <div class="card" style="padding:18px">
      <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">PERDAS (TOTAL)</div>
      <div style="font-size:22px;font-weight:800;color:var(--warning);margin-top:8px">− ${Digao.money(totalPerdas)}</div>
    </div>
    <div class="card" style="padding:18px">
      <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">FATURAMENTO (HOJE)</div>
      <div style="font-size:22px;font-weight:800;color:var(--success);margin-top:8px">+ ${Digao.money(dash.faturamento)}</div>
    </div>
    <div class="card" style="padding:18px;background:linear-gradient(135deg,rgba(251,191,36,0.1),transparent);border:1px solid rgba(251,191,36,0.3)">
      <div style="font-size:11px;color:var(--primary);font-weight:600;letter-spacing:0.5px">RESULTADO PARCIAL</div>
      <div style="font-size:22px;font-weight:800;color:${lucro >= 0 ? 'var(--primary)' : 'var(--danger)'};margin-top:8px">
        ${lucro >= 0 ? '+' : ''} ${Digao.money(lucro)}
      </div>
    </div>
  `;
}

// ============================================================
// LISTA (abas)
// ============================================================
function renderLista() {
  const el = document.getElementById('fin-list');
  const data = finAba === 'despesas' ? expensesCache : lossesCache;
  const icon = finAba === 'despesas' ? 'fa-arrow-up' : 'fa-triangle-exclamation';
  const color = finAba === 'despesas' ? 'var(--danger)' : 'var(--warning)';

  if (data.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:60px;color:var(--text-muted)">
        <i class="fa-solid ${icon}" style="font-size:40px;opacity:0.25;display:block;margin-bottom:14px"></i>
        Nenhum lançamento de ${finAba}.
      </div>
    `;
    return;
  }

  el.innerHTML = data.map(item => `
    <div style="display:grid;grid-template-columns:42px 1fr auto auto;gap:14px;align-items:center;padding:14px 20px;border-bottom:1px solid var(--border)">
      <div style="width:36px;height:36px;background:var(--bg-dark);border-radius:50%;display:flex;align-items:center;justify-content:center;color:${color};font-size:13px">
        <i class="fa-solid ${icon}"></i>
      </div>
      <div style="min-width:0">
        <div style="font-size:13.5px;font-weight:600">${escapeHtml(item.description)}</div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">
          ${item.category ? `<span class="badge badge-info" style="margin-right:6px">${escapeHtml(item.category)}</span>` : ''}
          ${Digao.date(item.created_at)}
        </div>
      </div>
      <div style="text-align:right;font-weight:700;color:${color};font-size:14px">
        − ${Digao.money(item.amount)}
      </div>
      <div></div>
    </div>
  `).join('');
}

// ============================================================
// EVENTOS
// ============================================================
function bindFinanceiroEvents() {
  document.querySelectorAll('[data-aba]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-aba]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      finAba = btn.dataset.aba;
      renderLista();
    });
  });

  document.getElementById('btn-novo-lancamento').addEventListener('click', abrirModalLancamento);
}

// ============================================================
// MODAL — NOVO LANÇAMENTO
// ============================================================
function abrirModalLancamento() {
  const html = `
    <h3>Novo lançamento</h3>

    <div style="display:flex;flex-direction:column;gap:14px">
      <div>
        <label class="label">Tipo</label>
        <select class="select" id="lanc-tipo">
          <option value="despesas">Despesa</option>
          <option value="perdas">Perda</option>
        </select>
      </div>
      <div>
        <label class="label">Descrição</label>
        <input class="input" id="lanc-desc" placeholder="Ex: Compra de pão, Perda de queijo...">
      </div>
      <div>
        <label class="label">Categoria (opcional)</label>
        <input class="input" id="lanc-cat" placeholder="Ex: Insumos, Estoque, Quebra...">
      </div>
      <div>
        <label class="label">Valor (R$)</label>
        <input class="input" id="lanc-valor" type="number" step="0.01" min="0" value="0.00">
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="lanc-cancel">Cancelar</button>
      <button class="btn btn-primary" id="lanc-save">
        <i class="fa-solid fa-check"></i> Lançar
      </button>
    </div>
  `;

  const m = Digao.modal(html);

  document.getElementById('lanc-cancel').addEventListener('click', () => m.close());

  document.getElementById('lanc-save').addEventListener('click', async () => {
    const tipo = document.getElementById('lanc-tipo').value;
    const description = document.getElementById('lanc-desc').value.trim();
    const category = document.getElementById('lanc-cat').value.trim() || null;
    const amount = Number(document.getElementById('lanc-valor').value);

    if (!description) return Digao.toast('Informe a descrição', 'error');
    if (!amount || amount <= 0) return Digao.toast('Valor inválido', 'error');

    // ✅ CORREÇÃO: mapeia tipo para endpoint correto
    const endpoint = tipo === 'despesas' ? '/expenses' : '/losses';

    await Digao.post(endpoint, { description, category, amount });
    Digao.toast(`${tipo === 'despesas' ? 'Despesa' : 'Perda'} lançada`, 'success');
    m.close();
    await recarregarDados();
    renderLista();
    renderResumo();
  });
}

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}