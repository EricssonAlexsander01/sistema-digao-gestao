/* ============================================================
   DIGÃO GESTÃO — Módulo Financeiro Geral
   Despesas, Perdas e Resultado
   FIX Bug #4: card de destaque = hoje (consistente).
   FIX Ciclo 8 / DEC-04: datalist de categorias já existentes.
   FIX Ciclo 8 / DEC-05: soft delete + reativação de lançamentos.
   ============================================================ */

let expensesCache = [];
let lossesCache = [];
let finAba = 'despesas';
let finPeriodo = 'hoje';
let finMostrarInativos = false;
let finCategoriasSugeridas = []; // DEC-04

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

// ============================================================
// HELPERS DE PERÍODO
// ============================================================
function getPeriodoRange(periodo) {
  if (periodo === 'todos') return { from: null, to: null };

  const hoje = new Date();
  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const hojeStr = fmt(hoje);

  switch (periodo) {
    case 'hoje':
      return { from: hojeStr, to: hojeStr };

    case 'ontem': {
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);
      const ontemStr = fmt(ontem);
      return { from: ontemStr, to: ontemStr };
    }

    case '7d': {
      const d = new Date(hoje);
      d.setDate(d.getDate() - 6);
      return { from: fmt(d), to: hojeStr };
    }

    case '30d': {
      const d = new Date(hoje);
      d.setDate(d.getDate() - 29);
      return { from: fmt(d), to: hojeStr };
    }

    case 'mes': {
      const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return { from: fmt(primeiroDia), to: hojeStr };
    }

    default:
      return { from: hojeStr, to: hojeStr };
  }
}

// ============================================================
// RECARREGAR DADOS
// ============================================================
async function recarregarDados() {
  const { from, to } = getPeriodoRange(finPeriodo);
  const qs = [];
  if (from) qs.push(`from=${from}`);
  if (to)   qs.push(`to=${to}`);
  if (finMostrarInativos) qs.push('show_inactive=1');
  const query = qs.length ? '?' + qs.join('&') : '';

  [expensesCache, lossesCache] = await Promise.all([
    Digao.get('/expenses' + query),
    Digao.get('/losses' + query)
  ]);

  // DEC-04: coleta categorias únicas (ativas + inativas) para o datalist
  const todasCategorias = [...expensesCache, ...lossesCache]
    .map(x => x.category)
    .filter(Boolean);
  finCategoriasSugeridas = [...new Set(todasCategorias)].sort();
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

          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);cursor:pointer">
              <input type="checkbox" id="fin-show-inactive"> Mostrar desativados
            </label>

            <select class="select" id="fin-filtro-periodo" style="padding:6px 10px;font-size:12px">
              <option value="hoje">Hoje</option>
              <option value="ontem">Ontem</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="mes">Mês atual</option>
              <option value="todos">Todos</option>
            </select>
            <button class="btn btn-primary" id="btn-novo-lancamento">
              <i class="fa-solid fa-plus"></i> Novo lançamento
            </button>
          </div>
        </div>
        <div id="fin-list" style="flex:1;overflow-y:auto"></div>
      </div>
    </div>
  `;
}

// ============================================================
// RESUMO
// ============================================================
async function renderResumo() {
  const dash = await Digao.get('/dashboard');
  const el = document.getElementById('fin-resumo');
  if (!el) return;

  const totalDespesas = dash.despesas || 0;
  const totalPerdas = dash.perdas || 0;
  const resultado = dash.resultado || 0;

  el.innerHTML = `
    <div class="card" style="padding:18px">
      <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">DESPESAS (HOJE)</div>
      <div style="font-size:22px;font-weight:800;color:var(--danger);margin-top:8px">− ${Digao.money(totalDespesas)}</div>
    </div>
    <div class="card" style="padding:18px">
      <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">PERDAS (HOJE)</div>
      <div style="font-size:22px;font-weight:800;color:var(--warning);margin-top:8px">− ${Digao.money(totalPerdas)}</div>
    </div>
    <div class="card" style="padding:18px">
      <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">FATURAMENTO (HOJE)</div>
      <div style="font-size:22px;font-weight:800;color:var(--success);margin-top:8px">+ ${Digao.money(dash.faturamento)}</div>
    </div>
    <div class="card" style="padding:18px;background:linear-gradient(135deg,rgba(251,191,36,0.1),transparent);border:1px solid rgba(251,191,36,0.3)">
      <div style="font-size:11px;color:var(--primary);font-weight:600;letter-spacing:0.5px">RESULTADO DO DIA</div>
      <div style="font-size:22px;font-weight:800;color:${resultado >= 0 ? 'var(--primary)' : 'var(--danger)'};margin-top:8px">
        ${resultado >= 0 ? '+' : ''} ${Digao.money(resultado)}
      </div>
    </div>
  `;
}

// ============================================================
// LISTA
// ============================================================
function renderLista() {
  const el = document.getElementById('fin-list');
  if (!el) return;
  const data = finAba === 'despesas' ? expensesCache : lossesCache;
  const icon = finAba === 'despesas' ? 'fa-arrow-up' : 'fa-triangle-exclamation';
  const color = finAba === 'despesas' ? 'var(--danger)' : 'var(--warning)';

  const sel = document.getElementById('fin-filtro-periodo');
  if (sel) sel.value = finPeriodo;

  const chk = document.getElementById('fin-show-inactive');
  if (chk) chk.checked = finMostrarInativos;

  // Soma só ativos
  const total = data.filter(d => d.active !== 0).reduce((s, d) => s + d.amount, 0);

  const labelPeriodo = {
    hoje: 'hoje',
    ontem: 'ontem',
    '7d': 'nos últimos 7 dias',
    '30d': 'nos últimos 30 dias',
    mes: 'no mês atual',
    todos: 'no histórico'
  }[finPeriodo] || '';

  if (data.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:60px;color:var(--text-muted)">
        <i class="fa-solid ${icon}" style="font-size:40px;opacity:0.25;display:block;margin-bottom:14px"></i>
        Nenhum lançamento de ${finAba} ${labelPeriodo}.
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div style="padding:10px 20px;background:var(--bg-dark);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;font-size:12px">
      <span style="color:var(--text-muted)">
        <strong style="color:var(--text-main)">${data.length}</strong> ${data.length === 1 ? 'lançamento' : 'lançamentos'} ${labelPeriodo}
      </span>
      <span style="color:var(--text-muted)">
        Total: <strong style="color:${color}">− ${Digao.money(total)}</strong>
      </span>
    </div>
    ${data.map(item => renderLancamento(item, icon, color)).join('')}
  `;

  // Bind botões de desativar/reativar
  el.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const isActive = btn.dataset.active === '1';
      await toggleLancamento(id, isActive);
    });
  });
}

function renderLancamento(item, icon, color) {
  const isActive = item.active !== 0;
  const opacidade = isActive ? '1' : '0.55';
  const bg = isActive ? '' : 'background:rgba(0,0,0,0.15);';

  return `
    <div style="display:grid;grid-template-columns:42px 1fr auto auto;gap:14px;align-items:center;padding:14px 20px;border-bottom:1px solid var(--border);opacity:${opacidade};${bg}">
      <div style="width:36px;height:36px;background:var(--bg-dark);border-radius:50%;display:flex;align-items:center;justify-content:center;color:${color};font-size:13px">
        <i class="fa-solid ${icon}"></i>
      </div>
      <div style="min-width:0">
        <div style="font-size:13.5px;font-weight:600;${!isActive ? 'text-decoration:line-through;' : ''}">${escapeHtml(item.description)}</div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">
          ${item.category ? `<span class="badge badge-info" style="margin-right:6px">${escapeHtml(item.category)}</span>` : ''}
          ${Digao.date(item.created_at)}
          ${!isActive ? ' · <span style="color:var(--warning);font-weight:600">DESATIVADO</span>' : ''}
        </div>
      </div>
      <div style="text-align:right;font-weight:700;color:${color};font-size:14px;${!isActive ? 'text-decoration:line-through;' : ''}">
        − ${Digao.money(item.amount)}
      </div>
      <button
        class="icon-btn"
        data-action="toggle"
        data-id="${item.id}"
        data-active="${isActive ? 1 : 0}"
        title="${isActive ? 'Desativar' : 'Reativar'}"
      >
        <i class="fa-solid ${isActive ? 'fa-eye-slash' : 'fa-eye'}"></i>
      </button>
    </div>
  `;
}

// ============================================================
// DESATIVAR / REATIVAR (DEC-05)
// ============================================================
async function toggleLancamento(id, isActive) {
  const endpoint = finAba === 'despesas' ? '/expenses' : '/losses';

  if (isActive) {
    // Desativar
    if (!confirm('Desativar este lançamento?\n\nEle continuará no banco, mas deixará de contar nos relatórios e no dashboard até ser reativado.')) {
      return;
    }
    try {
      await Digao.del(`${endpoint}/${id}`);
      Digao.toast('Lançamento desativado', 'warning');
      await recarregarDados();
      renderLista();
      await renderResumo();
    } catch (e) { /* já tratado */ }
  } else {
    // Reativar
    if (!confirm('Reativar este lançamento?\n\nEle voltará a contar nos relatórios e no dashboard.')) {
      return;
    }
    try {
      await Digao.put(`${endpoint}/${id}/reactivate`);
      Digao.toast('Lançamento reativado', 'success');
      await recarregarDados();
      renderLista();
      await renderResumo();
    } catch (e) { /* já tratado */ }
  }
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

  const filtro = document.getElementById('fin-filtro-periodo');
  if (filtro) {
    filtro.value = finPeriodo;
    filtro.addEventListener('change', async (e) => {
      finPeriodo = e.target.value;
      await recarregarDados();
      renderLista();
    });
  }

  const chkInativos = document.getElementById('fin-show-inactive');
  if (chkInativos) {
    chkInativos.checked = finMostrarInativos;
    chkInativos.addEventListener('change', async (e) => {
      finMostrarInativos = e.target.checked;
      await recarregarDados();
      renderLista();
    });
  }

  const btnNovo = document.getElementById('btn-novo-lancamento');
  if (btnNovo) btnNovo.addEventListener('click', abrirModalLancamento);
}

// ============================================================
// MODAL — NOVO LANÇAMENTO (com datalist DEC-04)
// ============================================================
function abrirModalLancamento() {
  const datalistHtml = finCategoriasSugeridas.length > 0
    ? `<datalist id="categorias-sugeridas">
        ${finCategoriasSugeridas.map(c => `<option value="${escapeHtml(c)}">`).join('')}
       </datalist>`
    : '';

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
        <input
          class="input"
          id="lanc-cat"
          placeholder="Ex: Insumos, Estoque, Quebra..."
          list="categorias-sugeridas"
          autocomplete="off"
        >
        ${datalistHtml}
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

    const endpoint = tipo === 'despesas' ? '/expenses' : '/losses';

    await Digao.post(endpoint, { description, category, amount });
    Digao.toast(`${tipo === 'despesas' ? 'Despesa' : 'Perda'} lançada`, 'success');
    m.close();

    await recarregarDados();
    renderLista();
    await renderResumo();
  });
}

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}