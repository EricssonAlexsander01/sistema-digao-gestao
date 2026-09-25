/* ============================================================
   DIGÃO GESTÃO — Módulo Pedidos (com envio para entrega)
   FIX Ciclo 5 / AUD-ARQ-01: modal de detalhes marca adicionais
     com prefixo '+' e destaque visual.
   FIX Ciclo 5 / AUD-ENT-01: modal de envio agora permite editar
     a taxa da entrega (fee) por pedido, pré-preenchida com o
     default_fee do entregador.
   ============================================================ */

let pedidosFiltro = { status: '', channel: '', date: '' };
let driversCache = [];

// ============================================================
// LOADER PRINCIPAL
// ============================================================
window.loadPedidos = async function (container) {
  // Carrega entregadores para o modal de envio
  driversCache = await Digao.get('/drivers');

  container.innerHTML = renderPedidosLayout();
  bindPedidosEvents();
  await carregarPedidos();
};

// ============================================================
// LAYOUT
// ============================================================
function renderPedidosLayout() {
  return `
    <div class="page-padding" style="display:flex;flex-direction:column;gap:16px;overflow:hidden">

      <div class="card" style="padding:14px 18px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:200px">
          <i class="fa-solid fa-filter" style="color:var(--text-muted)"></i>
          <select class="select" id="f-status" style="max-width:180px">
            <option value="">Todos os status</option>
            <option value="NOVO">Novo</option>
            <option value="EM PREPARO">Em preparo</option>
            <option value="PRONTO">Pronto</option>
            <option value="EM ROTA">Em rota</option>
            <option value="CONCLUIDO">Concluído</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
          <select class="select" id="f-channel" style="max-width:160px">
            <option value="">Todos os canais</option>
            <option value="BALCAO">Balcão</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="IFOOD">iFood</option>
          </select>
          <input class="input" type="date" id="f-date" style="max-width:170px">
        </div>
        <div style="font-size:12px;color:var(--text-muted)">
          <strong id="total-pedidos" style="color:var(--primary)">0</strong> pedidos
        </div>
        <button class="btn btn-secondary" id="btn-refresh">
          <i class="fa-solid fa-rotate"></i> Atualizar
        </button>
      </div>

      <div id="pedidos-list" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px"></div>
    </div>
  `;
}

// ============================================================
// CARREGAR PEDIDOS
// ============================================================
async function carregarPedidos() {
  const list = document.getElementById('pedidos-list');
  list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Carregando…</div>';

  const params = new URLSearchParams();
  if (pedidosFiltro.status) params.set('status', pedidosFiltro.status);
  if (pedidosFiltro.channel) params.set('channel', pedidosFiltro.channel);
  if (pedidosFiltro.date) params.set('date', pedidosFiltro.date);

  const pedidos = await Digao.get('/orders?' + params.toString());
  document.getElementById('total-pedidos').textContent = pedidos.length;

  if (pedidos.length === 0) {
    list.innerHTML = `
      <div class="card" style="text-align:center;padding:50px;color:var(--text-muted)">
        <i class="fa-solid fa-receipt" style="font-size:40px;opacity:0.3;display:block;margin-bottom:14px"></i>
        Nenhum pedido encontrado com os filtros aplicados.
      </div>
    `;
    return;
  }

  list.innerHTML = pedidos.map(p => renderPedidoCard(p)).join('');
}

function renderPedidoCard(p) {
  const statusClass = statusColorClass(p.status);
  const podeEnviar = ['PRONTO', 'EM PREPARO', 'NOVO'].includes(p.status);

  return `
    <div class="card" style="padding:14px 18px;display:grid;grid-template-columns:80px 1fr auto auto;gap:16px;align-items:center" data-order-id="${p.id}">
      <div>
        <div style="font-size:11px;color:var(--text-muted);font-weight:600">PEDIDO</div>
        <div style="font-size:20px;font-weight:800;color:var(--primary);letter-spacing:-0.5px">
          #${Digao.pad(p.number)}
        </div>
      </div>
      <div style="min-width:0;cursor:pointer" data-action="detalhes">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
          <span class="badge ${statusClass}">${p.status}</span>
          <span class="badge badge-channel">
            ${p.channel === 'WHATSAPP' ? '<i class="fa-brands fa-whatsapp"></i> WhatsApp' : p.channel === 'IFOOD' ? 'iFood' : '<i class="fa-solid fa-store"></i> Balcão'}
          </span>
          <span style="font-size:11.5px;color:var(--text-muted)">${Digao.date(p.created_at)}</span>
        </div>
        <div style="font-size:12.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${p.items.map(i => `${i.quantity}x ${escapeHtml(i.name)}`).join(' · ')}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:var(--text-muted)">TOTAL</div>
        <div style="font-size:17px;font-weight:800;color:var(--primary)">${Digao.money(p.total)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${podeEnviar ? `
          <button class="btn btn-primary" data-action="enviar" data-id="${p.id}" style="padding:8px 12px;font-size:12px">
            <i class="fa-solid fa-motorcycle"></i> Enviar
          </button>
        ` : ''}
        <i class="fa-solid fa-chevron-right" style="color:var(--text-dim);cursor:pointer" data-action="detalhes"></i>
      </div>
    </div>
  `;
}

function statusColorClass(status) {
  const map = {
    'NOVO': 'badge-info',
    'EM PREPARO': 'badge-warning',
    'PRONTO': 'badge-success',
    'EM ROTA': 'badge-primary',
    'CONCLUIDO': 'badge-muted',
    'CANCELADO': 'badge-danger'
  };
  return map[status] || 'badge-muted';
}

// ============================================================
// EVENTOS
// ============================================================
function bindPedidosEvents() {
  document.getElementById('f-status').addEventListener('change', (e) => {
    pedidosFiltro.status = e.target.value;
    carregarPedidos();
  });
  document.getElementById('f-channel').addEventListener('change', (e) => {
    pedidosFiltro.channel = e.target.value;
    carregarPedidos();
  });
  document.getElementById('f-date').addEventListener('change', (e) => {
    pedidosFiltro.date = e.target.value;
    carregarPedidos();
  });
  document.getElementById('btn-refresh').addEventListener('click', carregarPedidos);

  document.getElementById('pedidos-list').addEventListener('click', (e) => {
    const btnEnviar = e.target.closest('[data-action="enviar"]');
    if (btnEnviar) {
      e.stopPropagation();
      abrirModalEnvio(Number(btnEnviar.dataset.id));
      return;
    }

    const card = e.target.closest('[data-order-id]');
    const detalhes = e.target.closest('[data-action="detalhes"]');
    if (card && detalhes) {
      abrirDetalhesPedido(Number(card.dataset.orderId));
    }
  });
}

// ============================================================
// MODAL — ENVIAR PARA ENTREGA
// FIX Ciclo 5 / AUD-ENT-01: taxa editável por pedido.
// ============================================================
function abrirModalEnvio(orderId) {
  const html = `
    <h3 style="margin-bottom:6px">Enviar para entrega</h3>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px">
      Selecione o entregador e ajuste a taxa se necessário. Pedido #${Digao.pad(orderId)}.
    </p>

    <div style="display:flex;flex-direction:column;gap:10px;max-height:340px;overflow-y:auto">
      ${driversCache.filter(d => d.active).map(d => {
        const initials = d.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        return `
          <button class="driver-pick" data-driver-id="${d.id}" data-driver-name="${escapeAttr(d.name)}" data-driver-fee="${d.default_fee}" data-selected="0" style="
            display:flex;align-items:center;gap:14px;padding:14px 16px;
            background:var(--bg-dark);border:1px solid var(--border);
            border-radius:10px;cursor:pointer;text-align:left;
            color:var(--text-main);font-family:inherit;transition:0.15s;width:100%
          ">
            <div style="width:42px;height:42px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#000;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0">
              ${initials}
            </div>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:700">${escapeHtml(d.name)}</div>
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:3px">
                Taxa padrão: R$ ${Number(d.default_fee).toFixed(2).replace('.', ',')}
              </div>
            </div>
            <i class="fa-solid fa-chevron-right" style="color:var(--text-dim)"></i>
          </button>
        `;
      }).join('')}
    </div>

    <div id="envio-taxa-wrap" style="display:none;margin-top:16px;padding:14px;background:var(--bg-dark);border-radius:10px;border:1px solid var(--border)">
      <label class="label" style="margin-bottom:6px;display:block">Taxa desta entrega (R$)</label>
      <input class="input" type="number" id="envio-taxa" step="0.01" min="0" value="0">
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
        Valor pago ao entregador por esta entrega. Pode diferir do valor cobrado do cliente em <code>orders.delivery_fee</code>.
      </div>
      <div id="envio-erro" style="display:none;font-size:11.5px;color:var(--danger);margin-top:8px"></div>
    </div>

    <div style="margin-top:16px;padding:12px;background:rgba(251,191,36,0.08);border-radius:8px;border:1px solid rgba(251,191,36,0.25);font-size:12px;color:var(--text-muted)">
      <strong style="color:var(--primary)">💡 Valor da entrega:</strong> o valor histórico fica preservado mesmo se a taxa padrão do entregador mudar depois.
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="envio-cancel">Cancelar</button>
      <button class="btn btn-primary" id="envio-confirm" disabled>
        <i class="fa-solid fa-check"></i> Enviar
      </button>
    </div>
  `;

  const m = Digao.modal(html);

  let driverSelecionado = null;
  const taxaWrap = document.getElementById('envio-taxa-wrap');
  const taxaInput = document.getElementById('envio-taxa');
  const errEl = document.getElementById('envio-erro');
  const btnConfirm = document.getElementById('envio-confirm');

  function validar() {
    const v = Number(taxaInput.value);
    if (!Number.isFinite(v) || v < 0) {
      errEl.textContent = 'Informe um valor válido (≥ 0).';
      errEl.style.display = 'block';
      btnConfirm.disabled = true;
      return false;
    }
    errEl.style.display = 'none';
    btnConfirm.disabled = false;
    return true;
  }

  taxaInput.addEventListener('input', validar);

  document.getElementById('envio-cancel').addEventListener('click', () => m.close());

  m.overlay.querySelectorAll('.driver-pick').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--bg-hover)';
      btn.style.borderColor = 'var(--primary)';
    });
    btn.addEventListener('mouseleave', () => {
      if (btn.dataset.selected === '1') return;
      btn.style.background = 'var(--bg-dark)';
      btn.style.borderColor = 'var(--border)';
    });
    btn.addEventListener('click', () => {
      // Remove seleção anterior
      m.overlay.querySelectorAll('.driver-pick').forEach(b => {
        b.dataset.selected = '0';
        b.style.background = 'var(--bg-dark)';
        b.style.borderColor = 'var(--border)';
      });

      // Marca este como selecionado
      btn.dataset.selected = '1';
      btn.style.background = 'rgba(251,191,36,0.12)';
      btn.style.borderColor = 'var(--primary)';

      driverSelecionado = {
        id: Number(btn.dataset.driverId),
        name: btn.dataset.driverName,
        fee: Number(btn.dataset.driverFee)
      };

      // Pré-preenche taxa com default_fee do entregador
      taxaInput.value = driverSelecionado.fee.toFixed(2);
      taxaWrap.style.display = 'block';
      validar();
    });
  });

  btnConfirm.addEventListener('click', async () => {
    if (!driverSelecionado) {
      Digao.toast('Selecione um entregador primeiro.', 'warning');
      return;
    }
    if (!validar()) return;

    const fee = Number(taxaInput.value);

    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando…';

    try {
      const res = await Digao.post('/deliveries', {
        order_id: orderId,
        driver_id: driverSelecionado.id,
        fee
      });

      Digao.toast(`Pedido enviado com ${driverSelecionado.name} (R$ ${res.fee.toFixed(2).replace('.', ',')})`, 'success');
      m.close();
      carregarPedidos();
    } catch (e) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = '<i class="fa-solid fa-check"></i> Enviar';
    }
  });
}

// ============================================================
// DETALHES DO PEDIDO
// FIX Ciclo 5 / AUD-ARQ-01: marca adicionais com prefixo '+'
// ============================================================
async function abrirDetalhesPedido(id) {
  const order = await Digao.get(`/orders/${id}`);
  const comanda = await Digao.get(`/orders/${id}/comanda`);

  const statusOptions = ['NOVO','EM PREPARO','PRONTO','EM ROTA','CONCLUIDO','CANCELADO'];

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div>
        <h3 style="margin:0">Pedido #${Digao.pad(order.number)}</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-top:4px">${Digao.date(order.created_at)}</p>
      </div>
      <span class="badge ${statusColorClass(order.status)}">${order.status}</span>
    </div>

    <div style="background:var(--bg-dark);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12.5px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--text-muted)">Canal</span>
        <strong>${order.channel}</strong>
      </div>
      ${order.customer_name ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="color:var(--text-muted)">Cliente</span>
          <strong>${escapeHtml(order.customer_name)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="color:var(--text-muted)">Telefone</span>
          <strong>${escapeHtml(order.customer_phone || '—')}</strong>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-muted)">Endereço</span>
          <strong style="text-align:right;max-width:60%">${escapeHtml(order.customer_address || '—')} ${escapeHtml(order.customer_neighborhood || '')}</strong>
        </div>
      ` : ''}
    </div>

    <div style="margin-bottom:14px">
      <div class="label">Itens</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${order.items.map(i => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg-dark);border-radius:6px">
            <div>
              <strong style="font-size:13px;${i.is_additional ? 'color:var(--primary)' : ''}">${i.is_additional ? '+ ' : ''}${i.quantity}x ${escapeHtml(i.name)}</strong>
              ${i.observation ? `<div style="font-size:11px;color:var(--text-muted);font-style:italic;margin-top:2px">Obs: ${escapeHtml(i.observation)}</div>` : ''}
            </div>
            <strong style="color:var(--primary);font-size:13px">${Digao.money(i.price * i.quantity)}</strong>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="background:var(--bg-dark);border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:var(--text-muted)">
        <span>Subtotal</span><span>${Digao.money(order.subtotal)}</span>
      </div>
      ${order.delivery_fee > 0 ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:var(--text-muted)">
          <span>Taxa de entrega</span><span>${Digao.money(order.delivery_fee)}</span>
        </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px dashed var(--border);font-weight:800;font-size:15px">
        <span>Total</span><span style="color:var(--primary)">${Digao.money(order.total)}</span>
      </div>
      ${order.payment ? `
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:12px;color:var(--text-muted)">
          Pago via <strong style="color:var(--text-main)">${order.payment.method}</strong>
          ${order.payment.change_amount > 0 ? ` · Troco: <strong style="color:var(--success)">${Digao.money(order.payment.change_amount)}</strong>` : ''}
        </div>` : ''}
    </div>

    <div style="margin-bottom:14px">
      <label class="label">Alterar status</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${statusOptions.map(s => `
          <button class="btn ${s === order.status ? 'btn-primary' : 'btn-secondary'} btn-status" data-status="${s}" style="padding:6px 12px;font-size:11.5px">${s}</button>
        `).join('')}
      </div>
    </div>

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
    const w = window.open('', '', 'width=380,height=600');
    w.document.write(`<pre style="font-family:'Courier New',monospace;font-size:12px;line-height:1.5;padding:10px">${escapeHtml(comanda.text)}</pre>`);
    w.document.close();
    w.focus();
    w.print();
    setTimeout(() => w.close(), 500);
  });

  m.overlay.querySelectorAll('.btn-status').forEach(btn => {
    btn.addEventListener('click', async () => {
      await Digao.put(`/orders/${order.id}`, { status: btn.dataset.status });
      Digao.toast('Status atualizado', 'success');
      m.close();
      carregarPedidos();
    });
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