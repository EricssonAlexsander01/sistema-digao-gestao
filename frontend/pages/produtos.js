/* ============================================================
   DIGÃO GESTÃO — Módulo Produtos
   Cadastro / Edição / Ativação de produtos e categorias
   ============================================================ */

let prodCache = [];
let catCache = [];
let prodFiltro = { categoria: 'Todas', busca: '', mostrarInativos: false };

// ============================================================
// LOADER
// ============================================================
window.loadProdutos = async function (container) {
  await recarregarDados();
  container.innerHTML = renderProdutosLayout();
  bindProdutosEvents();
  renderTabelaProdutos();
  renderCategoriasSidebar();
};

async function recarregarDados() {
  [prodCache, catCache] = await Promise.all([
    Digao.get('/products?active=all'),
    Digao.get('/categories')
  ]);
}

// ============================================================
// LAYOUT
// ============================================================
function renderProdutosLayout() {
  return `
    <div class="page-padding" style="display:flex;gap:16px;overflow:hidden;flex:1">

      <!-- Sidebar de categorias -->
      <aside style="width:230px;flex-shrink:0;display:flex;flex-direction:column;gap:12px">
        <button class="btn btn-primary btn-block" id="btn-nova-categoria">
          <i class="fa-solid fa-plus"></i> Nova categoria
        </button>

        <div class="card" style="padding:12px">
          <div class="label" style="margin-bottom:10px">Categorias</div>
          <div id="categorias-list" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>
      </aside>

      <!-- Tabela de produtos -->
      <section style="flex:1;display:flex;flex-direction:column;gap:14px;overflow:hidden;min-width:0">

        <div class="card" style="padding:14px 18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div style="flex:1;min-width:200px;position:relative">
            <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:13px"></i>
            <input class="input" id="prod-search" placeholder="Buscar produto..." style="padding-left:38px">
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text-muted);cursor:pointer">
            <input type="checkbox" id="prod-show-inactive"> Mostrar inativos
          </label>
          <button class="btn btn-primary" id="btn-novo-produto">
            <i class="fa-solid fa-plus"></i> Novo produto
          </button>
        </div>

        <div class="card" style="flex:1;overflow:hidden;padding:0;display:flex;flex-direction:column">
          <div style="overflow-y:auto;flex:1">
            <table style="width:100%;border-collapse:collapse">
              <thead style="position:sticky;top:0;background:var(--bg-sidebar);z-index:1">
                <tr style="border-bottom:1px solid var(--border)">
                  <th style="text-align:left;padding:12px 18px;font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">PRODUTO</th>
                  <th style="text-align:left;padding:12px 18px;font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">CATEGORIA</th>
                  <th style="text-align:right;padding:12px 18px;font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">PREÇO</th>
                  <th style="text-align:center;padding:12px 18px;font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">STATUS</th>
                  <th style="width:110px"></th>
                </tr>
              </thead>
              <tbody id="prod-tbody"></tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  `;
}

// ============================================================
// RENDER — lista de categorias
// ============================================================
function renderCategoriasSidebar() {
  const el = document.getElementById('categorias-list');
  const counts = {};
  prodCache.forEach(p => counts[p.category] = (counts[p.category] || 0) + 1);
  const allCount = prodCache.length;

  el.innerHTML = `
    <button class="cat-side-btn ${prodFiltro.categoria === 'Todas' ? 'active' : ''}" data-cat="Todas">
      <span>Todas</span>
      <span class="count">${allCount}</span>
    </button>
    ${catCache.map(c => `
      <button class="cat-side-btn ${prodFiltro.categoria === c.name ? 'active' : ''}" data-cat="${c.name}">
        <span>${escapeHtml(c.name)}</span>
        <span class="count">${counts[c.name] || 0}</span>
      </button>
    `).join('')}
  `;

  el.querySelectorAll('.cat-side-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      prodFiltro.categoria = btn.dataset.cat;
      renderCategoriasSidebar();
      renderTabelaProdutos();
    });
  });
}

// ============================================================
// RENDER — tabela de produtos
// ============================================================
function renderTabelaProdutos() {
  const tbody = document.getElementById('prod-tbody');
  const busca = prodFiltro.busca.toLowerCase().trim();

  const filtrados = prodCache.filter(p => {
    if (prodFiltro.categoria !== 'Todas' && p.category !== prodFiltro.categoria) return false;
    if (!prodFiltro.mostrarInativos && !p.active) return false;
    if (busca && !p.name.toLowerCase().includes(busca)) return false;
    return true;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">
        Nenhum produto encontrado.
      </td></tr>
    `;
    return;
  }

  tbody.innerHTML = filtrados.map(p => `
    <tr style="border-bottom:1px solid var(--border);transition:0.15s" class="prod-row">
      <td style="padding:12px 18px">
        <div style="font-size:13.5px;font-weight:600">${escapeHtml(p.name)}</div>
        ${p.is_additional ? `<span class="badge badge-info" style="margin-top:4px">Adicional</span>` : ''}
      </td>
      <td style="padding:12px 18px">
        <span style="font-size:12.5px;color:var(--text-muted)">${escapeHtml(p.category || '—')}</span>
      </td>
      <td style="padding:12px 18px;text-align:right">
        <span style="font-size:14px;font-weight:700;color:var(--primary)">${Digao.money(p.price)}</span>
      </td>
      <td style="padding:12px 18px;text-align:center">
        ${p.active
          ? '<span class="badge badge-success">Ativo</span>'
          : '<span class="badge badge-muted">Inativo</span>'}
      </td>
      <td style="padding:12px 18px;text-align:right">
        <button class="icon-btn" title="Editar" data-action="edit" data-id="${p.id}">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="icon-btn" title="${p.active ? 'Desativar' : 'Ativar'}" data-action="toggle" data-id="${p.id}">
          <i class="fa-solid ${p.active ? 'fa-eye-slash' : 'fa-eye'}"></i>
        </button>
      </td>
    </tr>
  `).join('');

  // Eventos
  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const prod = prodCache.find(p => p.id === id);

      if (btn.dataset.action === 'edit') {
        abrirModalProduto(prod);
      } else if (btn.dataset.action === 'toggle') {
        await Digao.put(`/products/${id}`, { active: !prod.active });
        Digao.toast(`Produto ${prod.active ? 'desativado' : 'ativado'}`, 'success');
        await recarregarDados();
        renderCategoriasSidebar();
        renderTabelaProdutos();
      }
    });
  });
}

// ============================================================
// MODAL — NOVO / EDITAR PRODUTO
// ============================================================
function abrirModalProduto(produto = null) {
  const isEdit = !!produto;
  const p = produto || { name: '', price: 0, category_id: '', is_additional: 0, active: 1 };

  const html = `
    <h3>${isEdit ? 'Editar produto' : 'Novo produto'}</h3>

    <div style="display:flex;flex-direction:column;gap:14px">
      <div>
        <label class="label">Nome</label>
        <input class="input" id="prod-nome" value="${escapeAttr(p.name)}" placeholder="Ex: X-Bacon">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label class="label">Preço (R$)</label>
          <input class="input" id="prod-preco" type="number" step="0.01" min="0" value="${p.price}">
        </div>
        <div>
          <label class="label">Categoria</label>
          <select class="select" id="prod-categoria">
            ${catCache.map(c => `
              <option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${escapeHtml(c.name)}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="prod-adicional" ${p.is_additional ? 'checked' : ''}>
        É um adicional (complemento)
      </label>

      ${isEdit ? `
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="prod-ativo" ${p.active ? 'checked' : ''}>
          Produto ativo
        </label>
      ` : ''}
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="prod-cancel">Cancelar</button>
      <button class="btn btn-primary" id="prod-save">
        <i class="fa-solid fa-check"></i> ${isEdit ? 'Salvar' : 'Cadastrar'}
      </button>
    </div>
  `;

  const m = Digao.modal(html);

  document.getElementById('prod-cancel').addEventListener('click', () => m.close());

  document.getElementById('prod-save').addEventListener('click', async () => {
    const name = document.getElementById('prod-nome').value.trim();
    const price = Number(document.getElementById('prod-preco').value);
    const category_id = Number(document.getElementById('prod-categoria').value);
    const is_additional = document.getElementById('prod-adicional').checked;
    const active = isEdit ? document.getElementById('prod-ativo').checked : true;

    if (!name) return Digao.toast('Informe o nome', 'error');
    if (!price || price <= 0) return Digao.toast('Preço inválido', 'error');

    const payload = { name, price, category_id, is_additional, active };

    if (isEdit) {
      await Digao.put(`/products/${produto.id}`, payload);
      Digao.toast('Produto atualizado', 'success');
    } else {
      await Digao.post('/products', payload);
      Digao.toast('Produto cadastrado', 'success');
    }

    m.close();
    await recarregarDados();
    renderCategoriasSidebar();
    renderTabelaProdutos();
  });
}

// ============================================================
// MODAL — NOVA CATEGORIA
// ============================================================
function abrirModalCategoria() {
  const html = `
    <h3>Nova categoria</h3>
    <label class="label">Nome</label>
    <input class="input" id="cat-nome" placeholder="Ex: Sobremesas">
    <div class="modal-actions">
      <button class="btn btn-secondary" id="cat-cancel">Cancelar</button>
      <button class="btn btn-primary" id="cat-save">Cadastrar</button>
    </div>
  `;

  const m = Digao.modal(html);

  document.getElementById('cat-cancel').addEventListener('click', () => m.close());

  document.getElementById('cat-save').addEventListener('click', async () => {
    const name = document.getElementById('cat-nome').value.trim();
    if (!name) return Digao.toast('Informe o nome', 'error');
    try {
      await Digao.post('/categories', { name });
      Digao.toast('Categoria criada', 'success');
      m.close();
      await recarregarDados();
      renderCategoriasSidebar();
    } catch (e) { /* já tratado */ }
  });
}

// ============================================================
// EVENTOS GLOBAIS
// ============================================================
function bindProdutosEvents() {
  document.getElementById('prod-search').addEventListener('input', (e) => {
    prodFiltro.busca = e.target.value;
    renderTabelaProdutos();
  });
  document.getElementById('prod-show-inactive').addEventListener('change', (e) => {
    prodFiltro.mostrarInativos = e.target.checked;
    renderTabelaProdutos();
  });
  document.getElementById('btn-novo-produto').addEventListener('click', () => abrirModalProduto());
  document.getElementById('btn-nova-categoria').addEventListener('click', () => abrirModalCategoria());
}

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function escapeAttr(str) { return escapeHtml(str); }