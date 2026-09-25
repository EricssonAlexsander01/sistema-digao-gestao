/* ============================================================
   DIGÃO GESTÃO — Módulo WhatsApp
   Pedidos recebidos via WhatsApp — Retirada ou Entrega
   ============================================================ */

let wsProdutos = [];
let wsCategorias = [];
let wsCarrinho = [];
let wsTipo = 'ENTREGA'; // ou 'RETIRADA'
let wsFormaPgto = 'PIX';

// ============================================================
// LOADER
// ============================================================
window.loadWhatsApp = async function (container) {
  [wsProdutos, wsCategorias] = await Promise.all([
    Digao.get('/products'),
    Digao.get('/categories')
  ]);

  wsCarrinho = [];
  wsTipo = 'ENTREGA';
  wsFormaPgto = 'PIX';

  container.innerHTML = renderWhatsAppLayout();
  bindWhatsAppEvents();
  renderWsProdutos();
  renderWsCarrinho();
};

// ============================================================
// LAYOUT
// ============================================================
function renderWhatsAppLayout() {
  return `
    <div class="pdv-container">

      <section class="products-section">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <div style="width:42px;height:42px;background:rgba(37,211,102,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#25d366;font-size:20px">
            <i class="fa-brands fa-whatsapp"></i>
          </div>
          <div>
            <h3 style="font-size:15px;font-weight:700">Registrar pedido via WhatsApp</h3>
            <p style="font-size:12px;color:var(--text-muted)">Selecione os produtos e escolha Retirada ou Entrega.</p>
          </div>
        </div>

        <div class="categories">
          <button class="cat-btn active" data-cat="Todos">Todos</button>
          ${wsCategorias.map(c => `<button class="cat-btn" data-cat="${c.name}">${c.name}</button>`).join('')}
        </div>

        <div class="product-grid" id="ws-product-grid"></div>
      </section>

      <aside class="cart-section">
        <div class="cart-header">
          <h3>Novo pedido WhatsApp</h3>
        </div>

        <div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;gap:8px">
          <button class="cat-btn active" data-tipo="ENTREGA" style="flex:1">Entrega</button>
          <button class="cat-btn" data-tipo="RETIRADA" style="flex:1">Retirada</button>
        </div>

        <div class="cart-items" id="ws-cart-items"></div>

        <!-- Botão que abre o modal de dados -->
        <button class="btn btn-secondary" id="ws-btn-dados" style="margin:12px 20px;width:calc(100% - 40px)">
          <i class="fa-solid fa-user-pen"></i>
          <span id="ws-dados-label">Preencher dados de entrega</span>
        </button>

        <!-- Campos escondidos (o modal escreve neles) -->
        <input type="hidden" id="ws-name" value="">
        <input type="hidden" id="ws-phone" value="">
        <input type="hidden" id="ws-address" value="">
        <input type="hidden" id="ws-neighborhood" value="">
        <input type="hidden" id="ws-complement" value="">
        <input type="hidden" id="ws-fee" value="8.00">

        <div class="cart-summary">
          <div class="summary-row">
            <span>Subtotal</span>
            <span id="ws-subtotal">R$ 0,00</span>
          </div>
          <div class="summary-row">
            <span>Taxa de entrega</span>
            <span id="ws-taxa">R$ 0,00</span>
          </div>
          <div class="summary-row total">
            <span>Total</span>
            <span id="ws-total">R$ 0,00</span>
          </div>
        </div>

        <div class="payment-methods" id="ws-payment-methods">
          <button class="pay-btn" data-method="DINHEIRO">Dinheiro</button>
          <button class="pay-btn active" data-method="PIX">Pix</button>
          <button class="pay-btn" data-method="DEBITO">Débito</button>
          <button class="pay-btn" data-method="CREDITO">Crédito</button>
        </div>

        <button class="confirm-btn" id="ws-confirm-btn" disabled>
          <i class="fa-solid fa-check"></i>
          <span>Confirmar pedido</span>
        </button>
      </aside>
    </div>
  `;
}

// ============================================================
// PRODUTOS
// ============================================================
let wsFiltroCat = 'Todos';

function renderWsProdutos() {
  const grid = document.getElementById('ws-product-grid');
  const filtrados = wsProdutos.filter(p => {
    if (wsFiltroCat === 'Todos') return true;
    if (wsFiltroCat === 'Adicionais') return p.is_additional;
    return p.category === wsFiltroCat;
  });

  grid.innerHTML = filtrados.map(p => `
    <div class="product-card ${p.is_additional ? 'add-additional' : ''}" data-id="${p.id}">
      <div class="icon-wrap"><i class="fa-solid ${p.is_additional ? 'fa-plus' : 'fa-utensils'}"></i></div>
      <div>
        <h4>${escapeHtml(p.name)}</h4>
        <div class="price">${Digao.money(p.price)}</div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// CARRINHO
// ============================================================
function renderWsCarrinho() {
  const el = document.getElementById('ws-cart-items');

  if (wsCarrinho.length === 0) {
    el.innerHTML = `
      <div class="cart-empty">
        <i class="fa-solid fa-cart-shopping"></i>
        <span>Nenhum item adicionado</span>
      </div>
    `;
  } else {
    el.innerHTML = wsCarrinho.map((item, i) => `
      <div class="cart-item">
        <div class="cart-item-info">
          <h4>${escapeHtml(item.name)}</h4>
          <span>${Digao.money(item.price)} un.</span>
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

  const subtotal = wsCarrinho.reduce((s, i) => s + i.price * i.quantity, 0);
  const taxa = wsTipo === 'ENTREGA' ? (Number(document.getElementById('ws-fee')?.value) || 0) : 0;
  const total = subtotal + taxa;

  document.getElementById('ws-subtotal').textContent = Digao.money(subtotal);
  document.getElementById('ws-taxa').textContent = Digao.money(taxa);
  document.getElementById('ws-total').textContent = Digao.money(total);
  document.getElementById('ws-confirm-btn').disabled = wsCarrinho.length === 0;
}

// ============================================================
// EVENTOS
// ============================================================
function bindWhatsAppEvents() {
  const container = document.getElementById('app-view');

  // Botão "Preencher dados"
  document.getElementById('ws-btn-dados')?.addEventListener('click', abrirModalDadosCliente);

  // Adicionar produto
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    if (card) {
      const prod = wsProdutos.find(p => p.id === Number(card.dataset.id));
      const ex = wsCarrinho.find(i => i.product_id === prod.id);
      if (ex) ex.quantity++;
      else wsCarrinho.push({ product_id: prod.id, name: prod.name, price: prod.price, quantity: 1 });
      renderWsCarrinho();
    }
  });

  // Categorias
  document.querySelector('.categories').addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    document.querySelectorAll('.categories .cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    wsFiltroCat = btn.dataset.cat;
    renderWsProdutos();
  });

  // Tipo (Entrega / Retirada)
  document.querySelectorAll('[data-tipo]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tipo]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      wsTipo = btn.dataset.tipo;

      // Atualiza o texto do botão de dados
      const label = document.getElementById('ws-dados-label');
      if (label) {
        const nome = document.getElementById('ws-name').value.trim();
        if (nome) {
          label.textContent = wsTipo === 'ENTREGA'
            ? `${nome} · ${document.getElementById('ws-address').value || 'sem endereço'}`
            : nome;
        } else {
          label.textContent = wsTipo === 'ENTREGA'
            ? 'Preencher dados de entrega'
            : 'Preencher dados do cliente';
        }
      }

      renderWsCarrinho();
    });
  });

  // Pagamento
  document.getElementById('ws-payment-methods').addEventListener('click', (e) => {
    const btn = e.target.closest('.pay-btn');
    if (!btn) return;
    document.querySelectorAll('#ws-payment-methods .pay-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    wsFormaPgto = btn.dataset.method;
  });

  // Carrinho +/-
  document.getElementById('ws-cart-items').addEventListener('click', (e) => {
    const btn = e.target.closest('.qty-btn');
    if (!btn) return;
    const i = Number(btn.dataset.index);
    wsCarrinho[i].quantity += btn.dataset.action === 'inc' ? 1 : -1;
    if (wsCarrinho[i].quantity <= 0) wsCarrinho.splice(i, 1);
    renderWsCarrinho();
  });

  // Confirmar
  document.getElementById('ws-confirm-btn').addEventListener('click', confirmarWhatsApp);
}

// ============================================================
// MODAL — DADOS DO CLIENTE
// ============================================================
function abrirModalDadosCliente() {
  const isEntrega = wsTipo === 'ENTREGA';

  const html = `
    <h3 style="margin-bottom:14px">
      ${isEntrega ? 'Dados de entrega' : 'Dados do cliente'}
    </h3>

    <div style="display:flex;flex-direction:column;gap:12px">
      <div>
        <label class="label">Nome do cliente *</label>
        <input class="input" id="mdl-nome" value="${escapeHtml(document.getElementById('ws-name').value)}" placeholder="Ex: João">
      </div>

      <div>
        <label class="label">Telefone</label>
        <input class="input" id="mdl-telefone" value="${escapeHtml(document.getElementById('ws-phone').value)}" placeholder="(45) 99999-0000">
      </div>

      ${isEntrega ? `
        <div>
          <label class="label">Endereço</label>
          <input class="input" id="mdl-endereco" value="${escapeHtml(document.getElementById('ws-address').value)}" placeholder="Rua, número">
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px">
          <div>
            <label class="label">Bairro</label>
            <input class="input" id="mdl-bairro" value="${escapeHtml(document.getElementById('ws-neighborhood').value)}" placeholder="Centro">
          </div>
          <div>
            <label class="label">Nº / Compl.</label>
            <input class="input" id="mdl-complemento" value="${escapeHtml(document.getElementById('ws-complement').value)}" placeholder="Apto 3">
          </div>
        </div>

        <div>
          <label class="label">Taxa de entrega (R$)</label>
          <input class="input" id="mdl-taxa" type="number" step="0.01" min="0" value="${document.getElementById('ws-fee').value || 8}">
        </div>
      ` : ''}
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="mdl-cancel">Cancelar</button>
      <button class="btn btn-primary" id="mdl-save">
        <i class="fa-solid fa-check"></i> Salvar
      </button>
    </div>
  `;

  const m = Digao.modal(html);

  document.getElementById('mdl-cancel').addEventListener('click', () => m.close());

  document.getElementById('mdl-save').addEventListener('click', () => {
    const nome = document.getElementById('mdl-nome').value.trim();
    if (!nome) {
      Digao.toast('Informe o nome do cliente', 'error');
      return;
    }

    document.getElementById('ws-name').value = nome;
    document.getElementById('ws-phone').value = document.getElementById('mdl-telefone').value.trim();

    if (isEntrega) {
      document.getElementById('ws-address').value = document.getElementById('mdl-endereco').value.trim();
      document.getElementById('ws-neighborhood').value = document.getElementById('mdl-bairro').value.trim();
      document.getElementById('ws-complement').value = document.getElementById('mdl-complemento').value.trim();
      document.getElementById('ws-fee').value = document.getElementById('mdl-taxa').value || 8;
    }

    // Atualiza o resumo no botão
    const resumo = isEntrega
      ? `${nome} · ${document.getElementById('ws-address').value || 'sem endereço'}`
      : nome;
    document.getElementById('ws-dados-label').textContent = resumo;

    m.close();
    renderWsCarrinho();
  });
}

// ============================================================
// CONFIRMAR PEDIDO WHATSAPP
// ============================================================
async function confirmarWhatsApp() {
  const btn = document.getElementById('ws-confirm-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Salvando…';

  try {
    const name = document.getElementById('ws-name').value.trim();
    if (!name) {
      Digao.toast('Informe o nome do cliente', 'error');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Confirmar pedido';
      return;
    }

    const payload = {
      channel: 'WHATSAPP',
      items: wsCarrinho.map(i => ({
        product_id: i.product_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity
      })),
      customer_name: name,
      customer_phone: document.getElementById('ws-phone').value.trim() || null,
      delivery_fee: wsTipo === 'ENTREGA' ? Number(document.getElementById('ws-fee').value) || 0 : 0
    };

    if (wsTipo === 'ENTREGA') {
      payload.customer_address = document.getElementById('ws-address').value.trim() || null;
      payload.customer_neighborhood = document.getElementById('ws-neighborhood').value.trim() || null;
      payload.customer_complement = document.getElementById('ws-complement').value.trim() || null;
    }

    const order = await Digao.post('/orders', payload);

    // Registra pagamento
    await Digao.post(`/orders/${order.id}/payment`, {
      method: wsFormaPgto,
      amount: order.total
    });

    Digao.toast(`Pedido #${Digao.pad(order.number)} registrado!`, 'success');

    // Reset
    wsCarrinho = [];
    document.getElementById('ws-name').value = '';
    document.getElementById('ws-phone').value = '';
    document.getElementById('ws-address').value = '';
    document.getElementById('ws-neighborhood').value = '';
    document.getElementById('ws-complement').value = '';
    document.getElementById('ws-fee').value = '8.00';
    document.getElementById('ws-dados-label').textContent = 'Preencher dados de entrega';
    renderWsCarrinho();

    refreshCaixaStatus();

  } catch (e) {
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Confirmar pedido';
  }
}

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}