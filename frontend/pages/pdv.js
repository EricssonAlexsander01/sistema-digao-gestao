/* ============================================================
   DIGÃO GESTÃO — Módulo PDV (com suporte a MESA)
   ============================================================ */

let produtosCache = [];
let categoriasCache = [];
let filtroCategoria = 'Todos';
let filtroBusca = '';

// Contexto de mesa (preenchido pelo roteador via ?table=X)
let mesaCtx = null;

// ============================================================
// LOADER PRINCIPAL
// ============================================================
window.loadPDV = async function (container, params = {}) {
  // Reset do contexto de mesa
  mesaCtx = null;

  // Se veio ?table=X, carrega o contexto da mesa
  if (params.table) {
    await carregarContextoMesa(params.table);
  }

  [produtosCache, categoriasCache] = await Promise.all([
    Digao.get('/products'),
    Digao.get('/categories')
  ]);

  // Reset do estado
  Digao.state.cart = [];
  Digao.state.channel = mesaCtx ? 'MESA' : 'BALCAO';
  Digao.state.paymentMethod = 'PIX';
  Digao.state.deliveryFee = 0;

  container.innerHTML = renderPDV();
  bindPDVEvents();

  // Se a mesa já tem pedido aberto, carrega os itens no carrinho
  if (mesaCtx && mesaCtx.open_order) {
    carregarItensDoPedidoAberto(mesaCtx.open_order);
  }

  renderProdutos();
  renderCarrinho();
};

// ============================================================
// CONTEXTO DE MESA
// ============================================================
async function carregarContextoMesa(tableId) {
  try {
    const mesas = await Digao.get('/tables');
    const mesa = mesas.find(m => m.id === Number(tableId));
    if (!mesa) {
      Digao.toast('Mesa não encontrada', 'error');
      return;
    }

    mesaCtx = {
      table_id: mesa.id,
      table_number: mesa.number,
      table_name: mesa.name,
      waiter_id: mesa.waiter_id,
      waiter_name: mesa.waiter_name,
      open_order: mesa.open_order
    };

    Digao.state.tableId = mesa.id;
    Digao.state.waiterId = mesa.waiter_id;
  } catch (e) {
    console.error('[pdv] erro ao carregar mesa:', e);
  }
}

function carregarItensDoPedidoAberto(order) {
  Digao.state.cart = order.items.map(it => ({
    product_id: it.product_id,
    name: it.name,
    price: it.price,
    quantity: it.quantity,
    observation: it.observation || ''
  }));
}

// ============================================================
// RENDER — estrutura da tela
// ============================================================
function renderPDV() {
  const bannerMesa = mesaCtx ? `
    <div style="background:linear-gradient(135deg,rgba(251,191,36,0.15),rgba(251,191,36,0.05));border-bottom:1px solid rgba(251,191,36,0.35);padding:12px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;flex-shrink:0">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;background:var(--primary);color:#000;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px">
          <i class="fa-solid fa-chair"></i>
        </div>
        <div>
          <div style="font-size:11px;color:var(--primary);font-weight:700;letter-spacing:1px">MODO MESA</div>
          <div style="font-size:15px;font-weight:800;color:var(--text-main);margin-top:2px">
            ${escapeHtml(mesaCtx.table_name)}
            ${mesaCtx.waiter_name ? `<span style="color:var(--text-muted);font-weight:500;font-size:12.5px"> · ${escapeHtml(mesaCtx.waiter_name)}</span>` : ''}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        ${mesaCtx.open_order ? `
          <button class="btn btn-success" id="btn-fechar-conta">
            <i class="fa-solid fa-money-bill"></i> Fechar conta (${Digao.money(mesaCtx.open_order.total)})
          </button>
        ` : ''}
        <button class="btn btn-secondary" id="btn-voltar-mesas">
          <i class="fa-solid fa-arrow-left"></i> Voltar
        </button>
      </div>
    </div>
  ` : '';

  return `
    <div style="display:flex;flex-direction:column;flex:1;overflow:hidden;min-height:0">
      ${bannerMesa}
      <div class="pdv-container">

        <section class="products-section">
          <div class="search-bar">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="search-input" placeholder="Buscar produto...">
          </div>

          <div class="categories" id="categories">
            <button class="cat-btn active" data-cat="Todos">Todos</button>
            ${categoriasCache.map(c =>
              `<button class="cat-btn" data-cat="${c.name}">${c.name}</button>`
            ).join('')}
          </div>

          <div class="product-grid" id="product-grid"></div>
        </section>

        <aside class="cart-section">
          <div class="cart-header">
            <h3>${mesaCtx ? escapeHtml(mesaCtx.table_name) : 'Pedido'} <span id="order-number" style="color:var(--primary)">#—</span></h3>
            ${mesaCtx ? '' : `
              <div class="channel-toggle" id="channel-toggle">
                <button class="active" data-channel="BALCAO">BALCÃO</button>
                <button data-channel="WHATSAPP">WHATSAPP</button>
              </div>
            `}
          </div>

          <div class="cart-items" id="cart-items"></div>

          ${mesaCtx ? '' : `
            <div class="delivery-data" id="delivery-data">
              <h4>DADOS DE ENTREGA — WHATSAPP</h4>
              <div class="input-row">
                <input class="input" type="text" id="cust-name" placeholder="Nome">
                <input class="input" type="text" id="cust-phone" placeholder="Telefone">
              </div>
              <input class="input" type="text" id="cust-address" placeholder="Endereço">
              <div class="input-row">
                <input class="input" type="text" id="cust-neighborhood" placeholder="Bairro">
                <input class="input" type="text" id="cust-complement" placeholder="Nº / Complemento">
              </div>
              <div class="input-row">
                <input class="input" type="number" id="delivery-fee" placeholder="Taxa de entrega (R$)" step="0.01" min="0" value="8.00">
              </div>
            </div>
          `}

          <div style="padding: 12px 20px; border-top: 1px solid var(--border);">
            <label class="label" style="margin-bottom: 6px; display: block;">Observação do pedido</label>
            <textarea
              class="input"
              id="order-observation"
              placeholder="Ex: Embalar separado, sem talher, cliente com pressa..."
              rows="2"
              style="resize: none; font-family: inherit; font-size: 12.5px;"
            ></textarea>
          </div>

          <div class="cart-summary">
            <div class="summary-row">
              <span>Subtotal dos itens</span>
              <span id="subtotal">R$ 0,00</span>
            </div>
            <div class="summary-row">
              <span>Taxa de entrega</span>
              <span id="taxa-entrega">R$ 0,00</span>
            </div>
            <div class="summary-row total">
              <span>Total</span>
              <span id="total">R$ 0,00</span>
            </div>
            <div class="troco-row hidden" id="troco-row">
              <span>Troco para R$ <input type="number" id="valor-recebido" value="50" step="1" min="0" style="width:60px;background:none;border:none;color:inherit;font-weight:700;font-size:12px;text-align:right;outline:none;font-family:inherit"></span>
              <span id="troco">R$ 0,00</span>
            </div>
          </div>

          <div class="payment-methods" id="payment-methods">
            <button class="pay-btn" data-method="DINHEIRO">Dinheiro</button>
            <button class="pay-btn active" data-method="PIX">Pix</button>
            <button class="pay-btn" data-method="DEBITO">Débito</button>
            <button class="pay-btn" data-method="CREDITO">Crédito</button>
          </div>

          <button class="confirm-btn" id="confirm-btn" disabled>
            <i class="fa-solid fa-print"></i>
            <span>${mesaCtx ? 'Adicionar à comanda' : 'Confirmar & Gerar Comanda'}</span>
          </button>
        </aside>
      </div>
    </div>
  `;
}

// ============================================================
// RENDER — grade de produtos
// ============================================================
function renderProdutos() {
  const grid = document.getElementById('product-grid');
  const busca = filtroBusca.toLowerCase().trim();

  const filtrados = produtosCache.filter(p => {
    if (filtroCategoria !== 'Todos') {
      if (filtroCategoria === 'Adicionais' && !p.is_additional) return false;
      if (filtroCategoria !== 'Adicionais' && p.category !== filtroCategoria) return false;
    }
    if (busca && !p.name.toLowerCase().includes(busca)) return false;
    return true;
  });

  if (filtrados.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">
        <i class="fa-solid fa-search" style="font-size:32px;opacity:0.4;display:block;margin-bottom:12px"></i>
        Nenhum produto encontrado.
      </div>
    `;
    return;
  }

  grid.innerHTML = filtrados.map(p => {
    const icon = iconForCategory(p.category, p.is_additional);
    return `
      <div class="product-card ${p.is_additional ? 'add-additional' : ''}" data-id="${p.id}">
        <div class="icon-wrap"><i class="fa-solid ${icon}"></i></div>
        <div>
          <h4>${escapeHtml(p.name)}</h4>
          <div class="price">${Digao.money(p.price)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function iconForCategory(cat, isAdditional) {
  if (isAdditional) return 'fa-plus';
  const map = {
    'Lanches': 'fa-burger',
    'Porções': 'fa-bowl-food',
    'Shawarma': 'fa-utensils',
    'Bebidas': 'fa-bottle-water'
  };
  return map[cat] || 'fa-utensils';
}

// ============================================================
// RENDER — carrinho
// ============================================================
function renderCarrinho() {
  const itemsEl = document.getElementById('cart-items');
  const cart = Digao.state.cart;

  if (cart.length === 0) {
    itemsEl.innerHTML = `
      <div class="cart-empty">
        <i class="fa-solid fa-cart-shopping"></i>
        <span>Nenhum item adicionado</span>
      </div>
    `;
  } else {
    itemsEl.innerHTML = cart.map((item, i) => `
      <div class="cart-item" data-index="${i}">
        <div class="cart-item-info">
          <h4>${escapeHtml(item.name)}</h4>
          <span>${Digao.money(item.price)} un.</span>
          ${item.observation ? `<div class="cart-item-obs">Obs: ${escapeHtml(item.observation)}</div>` : ''}
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" data-action="dec" data-index="${i}">−</button>
          <span>${item.quantity}</span>
          <button class="qty-btn" data-action="inc" data-index="${i}">+</button>
        </div>
        <div class="cart-item-price">${Digao.money(item.price * item.quantity)}</div>
      </div>
    `).join('');
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const taxa = (!mesaCtx && Digao.state.channel === 'WHATSAPP') ? Digao.state.deliveryFee : 0;
  const total = subtotal + taxa;

  document.getElementById('subtotal').textContent = Digao.money(subtotal);
  document.getElementById('taxa-entrega').textContent = Digao.money(taxa);
  document.getElementById('total').textContent = Digao.money(total);

  const trocoRow = document.getElementById('troco-row');
  if (trocoRow) {
    if (Digao.state.paymentMethod === 'DINHEIRO') {
      trocoRow.classList.remove('hidden');
      const recebidoInput = document.getElementById('valor-recebido');
      const recebido = Number(recebidoInput.value) || 0;
      const troco = recebido - total;
      const trocoEl = document.getElementById('troco');
      trocoEl.textContent = Digao.money(Math.max(troco, 0));
      trocoEl.style.color = troco >= 0 ? 'var(--success)' : 'var(--danger)';
    } else {
      trocoRow.classList.add('hidden');
    }
  }

  const btn = document.getElementById('confirm-btn');
  btn.disabled = cart.length === 0;
}

// ============================================================
// AÇÕES
// ============================================================
function adicionarItem(produtoId) {
  const prod = produtosCache.find(p => p.id === Number(produtoId));
  if (!prod) return;

  const cart = Digao.state.cart;
  const existente = cart.find(i => i.product_id === prod.id && !i.observation);

  if (existente) {
    existente.quantity++;
  } else {
    cart.push({
      product_id: prod.id,
      name: prod.name,
      price: prod.price,
      quantity: 1,
      observation: ''
    });
  }
  renderCarrinho();
  Digao.toast(`${prod.name} adicionado`, 'success', 1500);
}

function alterarQtd(index, delta) {
  const cart = Digao.state.cart;
  if (!cart[index]) return;
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) {
    cart.splice(index, 1);
  }
  renderCarrinho();
}

// ============================================================
// EVENTOS
// ============================================================
function bindPDVEvents() {
  const container = document.getElementById('app-view');

  // 🔧 Remove listeners antigos clonando o container
  const oldContainer = container;
  const newContainer = container.cloneNode(true);
  oldContainer.parentNode.replaceChild(newContainer, container);

  // ===== Botões do modo mesa =====
  document.getElementById('btn-voltar-mesas')?.addEventListener('click', () => {
    location.hash = 'mesas';
  });

  document.getElementById('btn-fechar-conta')?.addEventListener('click', () => {
    if (mesaCtx && mesaCtx.open_order) {
      abrirModalPagamentoMesa(mesaCtx.open_order);
    }
  });

  // ===== Adicionar produto =====
  newContainer.addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    if (card) adicionarItem(card.dataset.id);
  });

  // ===== Busca =====
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filtroBusca = e.target.value;
      renderProdutos();
    });
  }

  // ===== Categorias =====
  const categories = document.getElementById('categories');
  if (categories) {
    categories.addEventListener('click', (e) => {
      const btn = e.target.closest('.cat-btn');
      if (!btn) return;
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filtroCategoria = btn.dataset.cat;
      renderProdutos();
    });
  }

  // ===== Canal (só sem mesa) =====
  const channelToggle = document.getElementById('channel-toggle');
  if (channelToggle) {
    channelToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      document.querySelectorAll('#channel-toggle button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Digao.state.channel = btn.dataset.channel;

      const delivery = document.getElementById('delivery-data');
      if (Digao.state.channel === 'WHATSAPP') {
        delivery.classList.add('show');
        if (!Digao.state.deliveryFee) Digao.state.deliveryFee = 8;
      } else {
        delivery.classList.remove('show');
        Digao.state.deliveryFee = 0;
      }
      renderCarrinho();
    });
  }

  // ===== Taxa de entrega =====
  const deliveryFee = document.getElementById('delivery-fee');
  if (deliveryFee) {
    deliveryFee.addEventListener('input', (e) => {
      Digao.state.deliveryFee = Number(e.target.value) || 0;
      renderCarrinho();
    });
  }

  // ===== Forma de pagamento =====
  const paymentMethods = document.getElementById('payment-methods');
  if (paymentMethods) {
    paymentMethods.addEventListener('click', (e) => {
      const btn = e.target.closest('.pay-btn');
      if (!btn) return;
      document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Digao.state.paymentMethod = btn.dataset.method;
      renderCarrinho();
    });
  }

  // ===== Valor recebido =====
  const valorRecebido = document.getElementById('valor-recebido');
  if (valorRecebido) valorRecebido.addEventListener('input', renderCarrinho);

  // ===== Carrinho +/− =====
  const cartItems = document.getElementById('cart-items');
  if (cartItems) {
    cartItems.addEventListener('click', (e) => {
      const btn = e.target.closest('.qty-btn');
      if (!btn) return;
      const idx = Number(btn.dataset.index);
      alterarQtd(idx, btn.dataset.action === 'inc' ? 1 : -1);
    });
  }

  // ===== Confirmar venda =====
  const confirmBtn = document.getElementById('confirm-btn');
  if (confirmBtn) confirmBtn.addEventListener('click', confirmarVenda);
}

// ============================================================
// CONFIRMAR VENDA
// ============================================================
async function confirmarVenda() {
  const cart = Digao.state.cart;
  if (cart.length === 0) return;

  const btn = document.getElementById('confirm-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Processando…';

  try {
    const payload = {
      channel: mesaCtx ? 'MESA' : Digao.state.channel,
      items: cart.map(i => ({
        product_id: i.product_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        observation: i.observation || null
      })),
      observation: document.getElementById('order-observation')?.value.trim() || null,
      delivery_fee: (!mesaCtx && Digao.state.channel === 'WHATSAPP') ? Digao.state.deliveryFee : 0
    };

    // Contexto de mesa
    if (mesaCtx) {
      payload.table_id = mesaCtx.table_id;
      payload.waiter_id = mesaCtx.waiter_id;
    }

    // Contexto de WhatsApp
    if (!mesaCtx && Digao.state.channel === 'WHATSAPP') {
      payload.customer_name = document.getElementById('cust-name').value.trim() || null;
      payload.customer_phone = document.getElementById('cust-phone').value.trim() || null;
      payload.customer_address = document.getElementById('cust-address').value.trim() || null;
      payload.customer_neighborhood = document.getElementById('cust-neighborhood').value.trim() || null;
      payload.customer_complement = document.getElementById('cust-complement').value.trim() || null;
    }

    const order = await Digao.post('/orders', payload);

    // ===== FLUXO MESA: só acumula, não paga =====
    if (mesaCtx) {
      Digao.toast(
        `${mesaCtx.table_name}: +${cart.length} ${cart.length === 1 ? 'item' : 'itens'} adicionado(s)`,
        'success',
        2500
      );

      // Recarrega o contexto (com o pedido consolidado)
      await carregarContextoMesa(mesaCtx.table_id);

      // Limpa carrinho e recarrega itens atualizados
      Digao.state.cart = [];
      if (mesaCtx.open_order) {
        carregarItensDoPedidoAberto(mesaCtx.open_order);
      }
      renderCarrinho();

      return;
    }

    // ===== FLUXO BALCÃO / WHATSAPP: paga na hora =====
    const recebido = Digao.state.paymentMethod === 'DINHEIRO'
      ? Number(document.getElementById('valor-recebido').value) || order.total
      : null;

    const pagamento = await Digao.post(`/orders/${order.id}/payment`, {
      method: Digao.state.paymentMethod,
      amount: order.total,
      received: recebido
    });

    const comanda = await Digao.get(`/orders/${order.id}/comanda`);

    mostrarComanda(order, comanda.text, pagamento);

    refreshCaixaStatus();

    Digao.state.cart = [];
    const obsField = document.getElementById('order-observation');
    if (obsField) obsField.value = '';
    renderCarrinho();

  } catch (e) {
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = mesaCtx
      ? 'Adicionar à comanda'
      : 'Confirmar & Gerar Comanda';
  }
}

// ============================================================
// MODAL — FECHAR CONTA DA MESA
// ============================================================
function abrirModalPagamentoMesa(order) {
  const html = `
    <h3 style="margin-bottom:14px">Fechar conta — ${escapeHtml(mesaCtx.table_name)}</h3>

    <div style="background:var(--bg-dark);border-radius:8px;padding:14px;margin-bottom:16px;max-height:240px;overflow-y:auto">
      ${order.items.map(it => `
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0">
          <span><strong>${it.quantity}x</strong> ${escapeHtml(it.name)}</span>
          <strong style="color:var(--primary)">${Digao.money(it.price * it.quantity)}</strong>
        </div>
      `).join('')}
      <div style="display:flex;justify-content:space-between;font-size:17px;font-weight:800;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
        <span>TOTAL</span>
        <span style="color:var(--primary)">${Digao.money(order.total)}</span>
      </div>
    </div>

    <div class="label">Forma de pagamento</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px" id="mesa-payment-methods">
      <button class="pay-btn active" data-method="DINHEIRO">Dinheiro</button>
      <button class="pay-btn" data-method="PIX">Pix</button>
      <button class="pay-btn" data-method="DEBITO">Débito</button>
      <button class="pay-btn" data-method="CREDITO">Crédito</button>
    </div>

    <div id="mesa-troco-wrap" style="margin-bottom:16px">
      <label class="label">Valor recebido (R$)</label>
      <input class="input" type="number" id="mesa-recebido" step="0.01" min="0" value="${order.total.toFixed(2)}">
      <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">
        Troco: <strong id="mesa-troco" style="color:var(--success)">R$ 0,00</strong>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="mesa-pgto-cancel">Cancelar</button>
      <button class="btn btn-primary" id="mesa-pgto-confirm">
        <i class="fa-solid fa-check"></i> Confirmar pagamento
      </button>
    </div>
  `;

  const m = Digao.modal(html);
  let method = 'DINHEIRO';

  const recInput = document.getElementById('mesa-recebido');
  const trocoEl = document.getElementById('mesa-troco');
  const trocoWrap = document.getElementById('mesa-troco-wrap');

  function updateTroco() {
    const r = Number(recInput.value) || 0;
    const t = r - order.total;
    trocoEl.textContent = Digao.money(Math.max(t, 0));
    trocoEl.style.color = t >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  function toggleTroco() {
    trocoWrap.style.display = method === 'DINHEIRO' ? 'block' : 'none';
    if (method === 'DINHEIRO') updateTroco();
  }

  recInput.addEventListener('input', updateTroco);
  toggleTroco();

  m.overlay.querySelectorAll('#mesa-payment-methods .pay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      m.overlay.querySelectorAll('#mesa-payment-methods .pay-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      method = btn.dataset.method;
      toggleTroco();
    });
  });

  document.getElementById('mesa-pgto-cancel').addEventListener('click', () => m.close());

  document.getElementById('mesa-pgto-confirm').addEventListener('click', async () => {
    const recebido = method === 'DINHEIRO' ? Number(recInput.value) || order.total : null;
    try {
      await Digao.post(`/orders/${order.id}/payment`, {
        method,
        amount: order.total,
        received: recebido
      });

      const comanda = await Digao.get(`/orders/${order.id}/comanda`);
      m.close();

      Digao.toast(`${mesaCtx.table_name} paga com sucesso!`, 'success', 3000);
      refreshCaixaStatus();

      setTimeout(() => { location.hash = 'mesas'; }, 800);

    } catch (e) {
      console.error(e);
    }
  });
}

// ============================================================
// MODAL DE COMANDA — formato 80mm
// ============================================================
function mostrarComanda(order, texto, pagamento) {
  window.__ultimaComanda = { order, texto, pagamento };

  const html = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="width:38px;height:38px;background:var(--success);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px">
        <i class="fa-solid fa-check"></i>
      </div>
      <div>
        <h3 style="margin:0">Pedido #${Digao.pad(order.number)} confirmado</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-top:2px">
          ${order.channel === 'WHATSAPP' ? 'Entrega/Retirada — WhatsApp' : 'Balcão'}
        </p>
      </div>
    </div>

    <pre style="background:var(--bg-dark);padding:16px;border-radius:8px;font-family:'Courier New',monospace;font-size:11.5px;line-height:1.5;color:var(--text-main);white-space:pre-wrap;border:1px solid var(--border);max-height:320px;overflow-y:auto">${escapeHtml(texto)}</pre>

    ${pagamento.change > 0 ? `
      <div style="margin-top:14px;padding:12px;background:rgba(16,185,129,0.1);border-radius:8px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px;color:var(--text-muted)">Troco</span>
        <strong style="color:var(--success);font-size:18px">${Digao.money(pagamento.change)}</strong>
      </div>
    ` : ''}

    <div class="modal-actions">
      <button class="btn btn-secondary" id="close-modal">Fechar</button>
      <button class="btn btn-primary" id="print-modal">
        <i class="fa-solid fa-print"></i> Imprimir
      </button>
    </div>
  `;

  const m = Digao.modal(html);

  document.getElementById('close-modal').addEventListener('click', () => m.close());

  document.getElementById('print-modal').addEventListener('click', () => {
    const w = window.open('', '', 'width=320,height=600');

    w.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Comanda #${Digao.pad(order.number)}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
            color: #000;
            background: #fff;
            padding: 8px;
            width: 80mm;
          }
          pre {
            font-family: inherit;
            font-size: 12px;
            line-height: 1.4;
            white-space: pre-wrap;
            word-wrap: break-word;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <pre>${escapeHtml(texto)}</pre>
      </body>
      </html>
    `);

    w.document.close();
    w.focus();

    setTimeout(() => {
      w.print();
      setTimeout(() => w.close(), 1000);
    }, 250);
  });
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