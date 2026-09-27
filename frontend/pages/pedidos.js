/* ============================================================
   DIGÃO GESTÃO — Módulo Pedidos (com envio para entrega)
   FIX Ciclo 5 / AUD-ARQ-01: modal de detalhes marca adicionais.
   FIX Ciclo 5 / AUD-ENT-01: modal de envio permite editar taxa.
   FIX Ciclo 6 / BUG-D: modal de detalhes lista TODOS os pagamentos.
   FIX Ciclo 10 / AUTZ: ações por role via Digao.can.
   FIX Ciclo 10.1 / PEDIDOS 5.1: reformulação de UX.
     - Card com 5 linhas (identidade, contexto, itens, financeiro, ações).
     - Situação financeira explícita: Total / Pago / Falta.
     - Ações contextuais por status/canal/role.
     - Busca por número/cliente.
     - Filtros: status, situação, canal, data.
     - Contadores segmentados.
     - Modal de detalhes com contexto de mesa/garçom.
     - Botão "Registrar pagamento" para ABERTO/PARCIAL.
     - Status por <select> respeitando a matriz.
     - Impressão renomeada para "Imprimir cupom (A4)".
     - Estados loading/erro/vazio explícitos.
   ============================================================ */

let pedidosFiltro = {
  status: '',
  situacao: '',       // '', 'pendentes', 'pagas'
  channel: '',
  date: '',
  busca: ''           // client-side
};
let driversCache = [];
let pedidosCache = [];

// ============================================================
// LOADER PRINCIPAL
// ============================================================
window.loadPedidos = async function (container) {
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
    <div class="page-padding" style="display:flex;flex-direction:column;gap:14px;overflow:hidden">

      <div class="card" style="padding:14px 18px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <div style="position:relative;flex:1;min-width:220px;max-width:320px">
          <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:12px"></i>
          <input class="input" id="f-busca" placeholder="Buscar por # ou cliente..." style="padding-left:34px">
        </div>
        <select class="select" id="f-status" style="max-width:160px">
          <option value="">Todos os status</option>
          <option value="NOVO">Novo</option>
          <option value="EM PREPARO">Em preparo</option>
          <option value="PRONTO">Pronto</option>
          <option value="EM ROTA">Em rota</option>
          <option value="CONCLUIDO">Concluído</option>
          <option value="CANCELADO">Cancelado</option>
        </select>
        <select class="select" id="f-situacao" style="max-width:160px">
          <option value="">Toda situação</option>
          <option value="pendentes">Pendentes</option>
          <option value="pagas">Pagas</option>
        </select>
        <select class="select" id="f-channel" style="max-width:160px">
          <option value="">Todos os canais</option>
          <option value="BALCAO">Balcão</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="IFOOD">iFood</option>
          <option value="MESA">Mesa</option>
        </select>
        <input class="input" type="date" id="f-date" style="max-width:160px">
        <button class="btn btn-secondary" id="btn-refresh">
          <i class="fa-solid fa-rotate"></i> Atualizar
        </button>
      </div>

      <div id="pedidos-contadores" style="display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:var(--text-muted);padding:0 4px">
        <span>Pendentes: <strong id="ct-pendentes" style="color:var(--warning)">0</strong></span>
        <span>Em preparo: <strong id="ct-preparo" style="color:var(--info)">0</strong></span>
        <span>Prontos: <strong id="ct-prontos" style="color:var(--success)">0</strong></span>
        <span>Em rota: <strong id="ct-rota" style="color:var(--primary)">0</strong></span>
        <span>Total: <strong id="ct-total" style="color:var(--text-main)">0</strong></span>
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
  list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)"><i class="fa-solid fa-spinner fa-spin"></i> Carregando…</div>';

  try {
    const params = new URLSearchParams();
    if (pedidosFiltro.status) params.set('status', pedidosFiltro.status);
    if (pedidosFiltro.channel) params.set('channel', pedidosFiltro.channel);
    if (pedidosFiltro.date) params.set('date', pedidosFiltro.date);

    pedidosCache = await Digao.get('/orders?' + params.toString());
  } catch (e) {
    list.innerHTML = `
      <div class="card" style="text-align:center;padding:50px;color:var(--danger)">
        <i class="fa-solid fa-triangle-exclamation" style="font-size:36px;opacity:0.6;display:block;margin-bottom:12px"></i>
        Não foi possível carregar os pedidos. Tente novamente.
      </div>
    `;
    return;
  }

  renderListaPedidos();
}

function aplicarFiltrosClientSide(lista) {
  let out = lista;

  if (pedidosFiltro.situacao === 'pendentes') {
    out = out.filter(p => p.financial_status === 'ABERTO' || p.financial_status === 'PARCIAL');
  } else if (pedidosFiltro.situacao === 'pagas') {
    out = out.filter(p => p.financial_status === 'PAGO');
  }

  const busca = (pedidosFiltro.busca || '').trim().toLowerCase();
  if (busca) {
    const alvo = busca.replace(/^#?0*/, '');
    out = out.filter(p => {
      const num = String(p.number);
      const numPadded = String(p.number).padStart(3, '0');
      const nome = (p.customer_name || '').toLowerCase();
      return num === alvo
        || numPadded === busca
        || num.includes(alvo)
        || nome.includes(busca);
    });
  }

  return out;
}

function renderContadores() {
  const base = pedidosCache;
  const pendentes = base.filter(p => p.financial_status === 'ABERTO' || p.financial_status === 'PARCIAL').length;
  const preparo = base.filter(p => p.status === 'EM PREPARO').length;
  const prontos = base.filter(p => p.status === 'PRONTO').length;
  const rota = base.filter(p => p.status === 'EM ROTA').length;

  document.getElementById('ct-pendentes').textContent = pendentes;
  document.getElementById('ct-preparo').textContent = preparo;
  document.getElementById('ct-prontos').textContent = prontos;
  document.getElementById('ct-rota').textContent = rota;
  document.getElementById('ct-total').textContent = base.length;
}

function renderListaPedidos() {
  const list = document.getElementById('pedidos-list');
  const filtrados = aplicarFiltrosClientSide(pedidosCache);

  renderContadores();

  if (filtrados.length === 0) {
    list.innerHTML = `
      <div class="card" style="text-align:center;padding:50px;color:var(--text-muted)">
        <i class="fa-solid fa-receipt" style="font-size:40px;opacity:0.3;display:block;margin-bottom:14px"></i>
        Nenhum pedido encontrado com os filtros aplicados.
      </div>
    `;
    return;
  }

  list.innerHTML = filtrados.map(p => renderPedidoCard(p)).join('');
}

// ============================================================
// CARD
// ============================================================
function renderPedidoCard(p) {
  const statusClass = statusColorClass(p.status);
  const total = Number(p.total) || 0;
  const pago = Number(p.payments_total) || 0;
  const falta = Number(p.remaining) || 0;
  const fs = p.financial_status || 'ABERTO';

  // Canal amigável
  let canalLabel = '';
  if (p.channel === 'MESA') {
    canalLabel = p.table ? `Mesa ${String(p.table.number).padStart(2, '0')}` : 'Mesa';
  } else if (p.channel === 'WHATSAPP') {
    canalLabel = p.customer_address ? 'WhatsApp · Entrega' : 'WhatsApp · Retirada';
  } else if (p.channel === 'IFOOD') {
    canalLabel = 'iFood';
  } else {
    canalLabel = 'Balcão';
  }

  // Contexto (linha 2)
  const contexto = renderContexto(p);

  // Horário HH:MM
  const hora = formatHora(p.created_at);

  // Ação primária
  const acao = renderAcaoPrimaria(p);

  // Financeiro (linha 4)
  const financeiro = renderFinanceiro(p, total, pago, falta, fs);

  return `
    <div class="card" style="padding:14px 18px;display:flex;flex-direction:column;gap:8px" data-order-id="${p.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:20px;font-weight:800;color:var(--primary);letter-spacing:-0.5px">#${Digao.pad(p.number)}</span>
          <span class="badge badge-channel" style="text-transform:none">${escapeHtml(canalLabel)}</span>
          <span class="badge ${statusClass}">${p.status}</span>
          ${fs === 'PARCIAL' ? `<span class="badge badge-warning">PARCIAL</span>` : ''}
        </div>
        <span style="font-size:12px;color:var(--text-muted);font-weight:600">${hora}</span>
      </div>

      ${contexto ? `
        <div style="font-size:12px;color:var(--text-muted);display:flex;gap:10px;flex-wrap:wrap">
          ${contexto}
        </div>
      ` : ''}

      <div style="font-size:12.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${p.items.map(i => `${i.quantity}x ${escapeHtml(i.name)}`).join(' · ')}
      </div>

      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;font-size:12.5px;padding-top:4px;border-top:1px dashed var(--border)">
        ${financeiro}
      </div>

      ${acao ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:2px">${acao}</div>` : ''}

      <div style="display:flex;justify-content:flex-end;margin-top:-4px">
        <i class="fa-solid fa-chevron-right" data-action="detalhes" style="color:var(--text-dim);cursor:pointer;padding:4px"></i>
      </div>
    </div>
  `;
}

function renderContexto(p) {
  if (p.channel === 'MESA') {
    const mesa = p.table ? `Mesa ${String(p.table.number).padStart(2, '0')}` : null;
    const garcom = p.waiter ? p.waiter.name : (p.waiter_id ? '(garçom)' : null);
    return [mesa, garcom].filter(Boolean).map(escapeHtml).join(' · ');
  }
  if (p.channel === 'WHATSAPP' || p.channel === 'IFOOD') {
    const partes = [];
    if (p.customer_name) partes.push(escapeHtml(p.customer_name));
    if (p.customer_phone) partes.push(escapeHtml(p.customer_phone));
    if (p.customer_address) {
      partes.push(escapeHtml(p.customer_address));
      if (p.customer_neighborhood) partes.push(escapeHtml(p.customer_neighborhood));
    }
    return partes.join(' · ');
  }
  return '';
}

function renderFinanceiro(p, total, pago, falta, fs) {
  if (fs === 'PAGO') {
    return `
      <span style="color:var(--text-muted)">Total <strong style="color:var(--text-main)">${Digao.money(total)}</strong></span>
      <span class="badge badge-success" style="font-size:11px">✓ Pago</span>
    `;
  }
  if (fs === 'ESTORNADO') {
    return `
      <span style="color:var(--text-muted)">Total <strong style="color:var(--text-main)">${Digao.money(total)}</strong></span>
      <span class="badge badge-danger" style="font-size:11px">Estornado</span>
    `;
  }
  // ABERTO ou PARCIAL
  return `
    <span style="color:var(--text-muted)">Total <strong style="color:var(--text-main)">${Digao.money(total)}</strong></span>
    <span style="color:var(--text-muted)">Pago <strong style="color:var(--success)">${Digao.money(pago)}</strong></span>
    <span style="color:var(--text-muted)">Falta <strong style="color:var(--warning)">${Digao.money(falta)}</strong></span>
  `;
}

function renderAcaoPrimaria(p) {
  const botoes = [];

  // Registrar pagamento
  const podePagar = (p.financial_status === 'ABERTO' || p.financial_status === 'PARCIAL')
    && Digao.can('pdv.pagar');
  if (podePagar) {
    const label = p.financial_status === 'PARCIAL'
      ? `Registrar pagamento (falta ${Digao.money(p.remaining)})`
      : `Registrar pagamento (${Digao.money(p.total)})`;
    botoes.push(`
      <button class="btn btn-success" data-action="pagar" data-id="${p.id}" style="padding:8px 12px;font-size:12px">
        <i class="fa-solid fa-money-bill"></i> ${label}
      </button>
    `);
  }

  // Enviar para entrega
  const podeEnviar = p.status === 'PRONTO' && p.channel !== 'MESA';
  if (podeEnviar) {
    botoes.push(`
      <button class="btn btn-primary" data-action="enviar" data-id="${p.id}" style="padding:8px 12px;font-size:12px">
        <i class="fa-solid fa-motorcycle"></i> Enviar para entrega
      </button>
    `);
  }

  return botoes.join('');
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

function formatHora(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// EVENTOS
// ============================================================
function bindPedidosEvents() {
  document.getElementById('f-status').addEventListener('change', (e) => {
    pedidosFiltro.status = e.target.value;
    carregarPedidos();
  });
  document.getElementById('f-situacao').addEventListener('change', (e) => {
    pedidosFiltro.situacao = e.target.value;
    renderListaPedidos();
  });
  document.getElementById('f-channel').addEventListener('change', (e) => {
    pedidosFiltro.channel = e.target.value;
    carregarPedidos();
  });
  document.getElementById('f-date').addEventListener('change', (e) => {
    pedidosFiltro.date = e.target.value;
    carregarPedidos();
  });
  const buscaInput = document.getElementById('f-busca');
  if (buscaInput) {
    buscaInput.addEventListener('input', (e) => {
      pedidosFiltro.busca = e.target.value;
      renderListaPedidos();
    });
  }
  document.getElementById('btn-refresh').addEventListener('click', carregarPedidos);

  document.getElementById('pedidos-list').addEventListener('click', (e) => {
    const btnEnviar = e.target.closest('[data-action="enviar"]');
    if (btnEnviar) {
      e.stopPropagation();
      abrirModalEnvio(Number(btnEnviar.dataset.id));
      return;
    }

    const btnPagar = e.target.closest('[data-action="pagar"]');
    if (btnPagar) {
      e.stopPropagation();
      abrirPagamentoPedido(Number(btnPagar.dataset.id));
      return;
    }

    const card = e.target.closest('[data-order-id]');
    if (card) {
      abrirDetalhesPedido(Number(card.dataset.orderId));
    }
  });
}

// ============================================================
// PAGAMENTO DIRETO DO CARD
// ============================================================
async function abrirPagamentoPedido(orderId) {
  try {
    const order = await Digao.get(`/orders/${orderId}`);
    Digao.abrirModalPagamento(order, {
      title: `Pedido #${Digao.pad(order.number)} — pagamento`,
      onClose: () => {
        carregarPedidos();
      }
    });
  } catch (e) { /* Digao.api já avisa */ }
}

// ============================================================
// MODAL — ENVIAR PARA ENTREGA
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
      m.overlay.querySelectorAll('.driver-pick').forEach(b => {
        b.dataset.selected = '0';
        b.style.background = 'var(--bg-dark)';
        b.style.borderColor = 'var(--border)';
      });

      btn.dataset.selected = '1';
      btn.style.background = 'rgba(251,191,36,0.12)';
      btn.style.borderColor = 'var(--primary)';

      driverSelecionado = {
        id: Number(btn.dataset.driverId),
        name: btn.dataset.driverName,
        fee: Number(btn.dataset.driverFee)
      };

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
// MODAL — DETALHES DO PEDIDO
// ============================================================
async function abrirDetalhesPedido(id) {
  let order, comanda;
  try {
    order = await Digao.get(`/orders/${id}`);
    comanda = await Digao.get(`/orders/${id}/comanda`);
  } catch (e) {
    return;
  }

  const statusOptions = ['NOVO','EM PREPARO','PRONTO','EM ROTA','CONCLUIDO','CANCELADO']
    .filter(s => Digao.can(`pedido.transicao.${s}`));

  const payments = Array.isArray(order.payments) ? order.payments : (order.payment ? [order.payment] : []);
  const refunds = Array.isArray(order.refunds) ? order.refunds : [];

  const total = Number(order.total) || 0;
  const pago = Number(order.payments_total) || 0;
  const falta = Number(order.remaining) || 0;
  const fs = order.financial_status || 'ABERTO';

  const canalLabel = order.channel === 'MESA'
    ? 'Mesa'
    : order.channel === 'WHATSAPP'
      ? (order.customer_address ? 'WhatsApp · Entrega' : 'WhatsApp · Retirada')
      : order.channel === 'IFOOD' ? 'iFood' : 'Balcão';

  const podePagar = (fs === 'ABERTO' || fs === 'PARCIAL') && Digao.can('pdv.pagar');

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;gap:12px;flex-wrap:wrap">
      <div>
        <h3 style="margin:0">Pedido #${Digao.pad(order.number)}</h3>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">
          <span class="badge badge-channel" style="text-transform:none">${escapeHtml(canalLabel)}</span>
          <span class="badge ${statusColorClass(order.status)}">${order.status}</span>
          ${fs === 'PARCIAL' ? `<span class="badge badge-warning">PARCIAL</span>` : ''}
          ${fs === 'PAGO' ? `<span class="badge badge-success">PAGO</span>` : ''}
          ${fs === 'ESTORNADO' ? `<span class="badge badge-danger">ESTORNADO</span>` : ''}
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:6px">${Digao.date(order.created_at)}</p>
      </div>
    </div>

    <div style="background:var(--bg-dark);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12.5px">
      ${order.channel === 'MESA' ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="color:var(--text-muted)">Mesa</span>
          <strong>${order.table ? 'Mesa ' + String(order.table.number).padStart(2, '0') : '—'}</strong>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-muted)">Garçom</span>
          <strong>${order.waiter ? escapeHtml(order.waiter.name) : '—'}</strong>
        </div>
      ` : ''}
      ${order.customer_name ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="color:var(--text-muted)">Cliente</span>
          <strong>${escapeHtml(order.customer_name)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="color:var(--text-muted)">Telefone</span>
          <strong>${escapeHtml(order.customer_phone || '—')}</strong>
        </div>
        ${order.customer_address ? `
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text-muted)">Endereço</span>
            <strong style="text-align:right;max-width:60%">${escapeHtml(order.customer_address)} ${escapeHtml(order.customer_neighborhood || '')}${order.customer_complement ? ' · ' + escapeHtml(order.customer_complement) : ''}</strong>
          </div>
        ` : ''}
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
        <span>Total</span><span style="color:var(--primary)">${Digao.money(total)}</span>
      </div>

      ${fs === 'PAGO' ? `
        <div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:14px;color:var(--success);font-weight:700">
          <span>✓ Pago</span><span>${Digao.money(total)}</span>
        </div>
      ` : fs === 'ESTORNADO' ? `
        <div style="margin-top:10px;padding:8px 10px;background:rgba(245,158,11,0.12);border-radius:6px;font-size:12px;color:var(--warning);text-align:center;font-weight:700">
          Pedido totalmente estornado
        </div>
      ` : `
        <div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:13px;color:var(--text-muted)">
          <span>Pago</span><strong style="color:var(--success)">${Digao.money(pago)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:15px;font-weight:800">
          <span>FALTA</span><strong style="color:var(--warning)">${Digao.money(falta)}</strong>
        </div>
      `}

      ${payments.length > 0 ? `
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:6px">PAGAMENTOS (${payments.length})</div>
          ${payments.map(p => `
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
              <span>${formatPaymentMethod(p.method)}${p.change_amount > 0 ? ` · troco ${Digao.money(p.change_amount)}` : ''}</span>
              <strong style="color:var(--text-main)">${Digao.money(p.amount)}</strong>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${refunds.length > 0 ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <div style="font-size:11px;color:var(--warning);font-weight:600;margin-bottom:6px">ESTORNOS (${refunds.length})</div>
          ${refunds.map(r => `
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;color:var(--warning)">
              <span>${escapeHtml(r.reason)}</span>
              <strong>− ${Digao.money(r.amount)}</strong>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>

    ${podePagar ? `
      <div style="margin-bottom:14px">
        <button class="btn btn-success btn-block" id="btn-registrar-pagamento">
          <i class="fa-solid fa-money-bill"></i>
          ${fs === 'PARCIAL'
            ? `Registrar pagamento restante (${Digao.money(falta)})`
            : `Registrar pagamento (${Digao.money(total)})`}
        </button>
      </div>
    ` : ''}

    ${statusOptions.length > 0 ? `
      <div style="margin-bottom:14px">
        <label class="label">Alterar status</label>
        <select class="select" id="select-status">
          ${statusOptions.map(s => `<option value="${s}" ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
          Status atual: <strong>${order.status}</strong>
        </div>
      </div>
    ` : ''}

    <div class="modal-actions">
      <button class="btn btn-secondary" id="close-modal">Fechar</button>
      <button class="btn btn-secondary" id="print-modal">
        <i class="fa-solid fa-print"></i> Imprimir cupom (A4)
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

  document.getElementById('btn-registrar-pagamento')?.addEventListener('click', async () => {
    const atual = await Digao.get(`/orders/${order.id}`);
    Digao.abrirModalPagamento(atual, {
      title: `Pedido #${Digao.pad(atual.number)} — pagamento`,
      onClose: () => {
        m.close();
        carregarPedidos();
      }
    });
  });

  const selectStatus = document.getElementById('select-status');
  if (selectStatus) {
    selectStatus.addEventListener('change', async (e) => {
      const novo = e.target.value;
      if (novo === order.status) return;
      try {
        await Digao.put(`/orders/${order.id}`, { status: novo });
        Digao.toast('Status atualizado', 'success');
        m.close();
        carregarPedidos();
      } catch (err) {
        e.target.value = order.status;
      }
    });
  }
}

// ============================================================
// HELPERS
// ============================================================
function formatPaymentMethod(m) {
  return {
    'PIX': '⚡ Pix',
    'DINHEIRO': '💵 Dinheiro',
    'DEBITO': '💳 Débito',
    'CREDITO': '💳 Crédito'
  }[m] || m;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function escapeAttr(str) { return escapeHtml(str); }