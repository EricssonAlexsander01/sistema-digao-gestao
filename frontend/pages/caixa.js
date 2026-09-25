/* ============================================================
   DIGÃO GESTÃO — Módulo Controle de Caixa
   FIX Ciclo 6 / AUD-PG-07: botão "Estornar pedido" no card de
     destaque + modal de estorno. Adicionado histórico de caixas
     fechados com filtro from/to e paginação.
   ============================================================ */

let historicoPagina = 1;
let historicoFiltro = { from: '', to: '' };

// ============================================================
// LOADER
// ============================================================
window.loadCaixa = async function (container) {
  await carregarCaixa(container);
};

// ============================================================
// CARREGAR ESTADO DO CAIXA
// ============================================================
async function carregarCaixa(container) {
  const data = await Digao.get('/cash/current');

  if (!data) {
    renderCaixaFechado(container);
  } else {
    renderCaixaAberto(container, data);
  }
}

// ============================================================
// TELA — CAIXA FECHADO
// ============================================================
function renderCaixaFechado(container) {
  container.innerHTML = `
    <div class="page-padding" style="display:flex;flex-direction:column;gap:16px;overflow-y:auto;height:100%">

      <div style="display:flex;align-items:center;justify-content:center;padding:20px 0">
        <div class="card" style="max-width:420px;width:100%;text-align:center;padding:34px">
          <div style="width:64px;height:64px;background:rgba(239,68,68,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;color:var(--danger);font-size:26px">
            <i class="fa-solid fa-lock"></i>
          </div>
          <h3 style="font-size:18px;font-weight:700;margin-bottom:8px">Caixa fechado</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:22px">
            Abra o caixa informando o valor inicial em dinheiro.
          </p>
          <label class="label" style="text-align:left">Valor inicial (R$)</label>
          <input class="input" type="number" id="initial-value" value="100.00" step="0.01" min="0" style="margin-bottom:18px">
          <button class="btn btn-primary btn-block btn-lg" id="btn-abrir-caixa">
            <i class="fa-solid fa-unlock"></i> Abrir caixa
          </button>
        </div>
      </div>

      <div id="historico-caixa-wrapper"></div>
    </div>
  `;

  document.getElementById('btn-abrir-caixa').addEventListener('click', async () => {
    const value = Number(document.getElementById('initial-value').value);
    if (isNaN(value) || value < 0) {
      Digao.toast('Informe um valor válido', 'error');
      return;
    }
    await Digao.post('/cash/open', { initial_value: value });
    Digao.toast('Caixa aberto com sucesso!', 'success');
    refreshCaixaStatus();
    carregarCaixa(container);
  });

  // Renderiza o histórico também no estado fechado
  renderHistorico();
}

// ============================================================
// TELA — CAIXA ABERTO
// ============================================================
function renderCaixaAberto(container, data) {
  const { movements, sales, entries, exits, refunds = 0, current, initial_value, opened_at } = data;

  container.innerHTML = `
    <div class="page-padding" style="display:flex;flex-direction:column;gap:16px;overflow-y:auto;height:100%">

      <div class="grid-4">
        <div class="card" style="padding:18px">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">VALOR INICIAL</div>
          <div style="font-size:20px;font-weight:800;margin-top:8px">${Digao.money(initial_value)}</div>
        </div>
        <div class="card" style="padding:18px">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">VENDAS (DINHEIRO)</div>
          <div style="font-size:20px;font-weight:800;margin-top:8px;color:var(--success)">+ ${Digao.money(sales)}</div>
        </div>
        <div class="card" style="padding:18px">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">ENTRADAS</div>
          <div style="font-size:20px;font-weight:800;margin-top:8px;color:var(--info)">+ ${Digao.money(entries)}</div>
        </div>
        <div class="card" style="padding:18px">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">SAÍDAS</div>
          <div style="font-size:20px;font-weight:800;margin-top:8px;color:var(--danger)">− ${Digao.money(exits)}</div>
        </div>
      </div>

      <div class="card" style="padding:22px;background:linear-gradient(135deg,rgba(251,191,36,0.12),rgba(251,191,36,0.02));border:1px solid rgba(251,191,36,0.35);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-size:12px;color:var(--primary);font-weight:700;letter-spacing:0.5px">SALDO ESPERADO EM CAIXA</div>
          <div style="font-size:32px;font-weight:800;color:var(--primary);margin-top:6px;letter-spacing:-1px">${Digao.money(current)}</div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px">
            Aberto em ${Digao.date(opened_at)}
            ${refunds > 0 ? ` · <span style="color:var(--danger)">${Digao.money(refunds)} estornado</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-warning" id="btn-estornar"><i class="fa-solid fa-rotate-left"></i> Estornar pedido</button>
          <button class="btn btn-secondary" id="btn-add-mov"><i class="fa-solid fa-plus"></i> Movimentação</button>
          <button class="btn btn-danger" id="btn-fechar"><i class="fa-solid fa-lock"></i> Fechar caixa</button>
        </div>
      </div>

      <div class="card" style="display:flex;flex-direction:column;overflow:hidden;padding:0">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <h4 style="font-size:14px;font-weight:700">Movimentações (${movements.length})</h4>
          <button class="btn btn-secondary" id="btn-refresh-mov" style="padding:6px 10px;font-size:11.5px"><i class="fa-solid fa-rotate"></i></button>
        </div>
        <div style="max-height:400px;overflow-y:auto">
          ${movements.length === 0 ? `
            <div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">Nenhuma movimentação ainda.</div>
          ` : movements.map(m => renderMovimentacao(m)).join('')}
        </div>
      </div>

      <div id="historico-caixa-wrapper"></div>
    </div>
  `;

  document.getElementById('btn-add-mov').addEventListener('click', () => abrirModalMovimentacao(container));
  document.getElementById('btn-fechar').addEventListener('click', () => abrirModalFechamento(container, data));
  document.getElementById('btn-refresh-mov').addEventListener('click', () => carregarCaixa(container));
  document.getElementById('btn-estornar').addEventListener('click', () => abrirModalEstorno(container));

  // Renderiza o histórico também no estado aberto
  renderHistorico();
}

function renderMovimentacao(m) {
  const icons = {
    VENDA: 'fa-cart-shopping',
    ENTRADA: 'fa-arrow-down',
    SAIDA: 'fa-arrow-up',
    ESTORNO: 'fa-rotate-left'
  };
  const colors = {
    VENDA: 'var(--success)',
    ENTRADA: 'var(--info)',
    SAIDA: 'var(--danger)',
    ESTORNO: 'var(--warning)'
  };
  const signals = { VENDA: '+', ENTRADA: '+', SAIDA: '−', ESTORNO: '−' };

  const icon = icons[m.type] || 'fa-circle';
  const color = colors[m.type] || 'var(--text-muted)';
  const signal = signals[m.type] || '';

  return `
    <div style="display:grid;grid-template-columns:42px 1fr auto;gap:14px;align-items:center;padding:12px 20px;border-bottom:1px solid var(--border)">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--bg-dark);display:flex;align-items:center;justify-content:center;color:${color};font-size:13px">
        <i class="fa-solid ${icon}"></i>
      </div>
      <div>
        <div style="font-size:13px;font-weight:600">${escapeHtml(m.description)}</div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${Digao.date(m.created_at)}</div>
      </div>
      <div style="text-align:right;font-weight:800;font-size:14px;color:${color}">
        ${signal} ${Digao.money(m.amount)}
      </div>
    </div>
  `;
}

// ============================================================
// MODAL — NOVA MOVIMENTAÇÃO
// ============================================================
function abrirModalMovimentacao(container) {
  const html = `
    <h3>Nova movimentação</h3>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div>
        <label class="label">Tipo</label>
        <select class="select" id="mov-type">
          <option value="ENTRADA">Entrada (suprimento)</option>
          <option value="SAIDA">Saída (retirada / sangria)</option>
        </select>
      </div>
      <div>
        <label class="label">Descrição</label>
        <input class="input" id="mov-desc" placeholder="Ex: Reforço de troco, Retirada para banco...">
      </div>
      <div>
        <label class="label">Valor (R$)</label>
        <input class="input" type="number" id="mov-value" step="0.01" min="0" value="0.00">
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="mov-cancel">Cancelar</button>
      <button class="btn btn-primary" id="mov-save">Registrar</button>
    </div>
  `;

  const m = Digao.modal(html);

  document.getElementById('mov-cancel').addEventListener('click', () => m.close());

  document.getElementById('mov-save').addEventListener('click', async () => {
    const type = document.getElementById('mov-type').value;
    const description = document.getElementById('mov-desc').value.trim();
    const amount = Number(document.getElementById('mov-value').value);

    if (!description) return Digao.toast('Informe uma descrição', 'error');
    if (!amount || amount <= 0) return Digao.toast('Valor inválido', 'error');

    await Digao.post('/cash/movement', { type, description, amount });
    Digao.toast('Movimentação registrada', 'success');
    m.close();
    refreshCaixaStatus();
    carregarCaixa(container);
  });
}

// ============================================================
// MODAL — FECHAR CAIXA
// ============================================================
function abrirModalFechamento(container, data) {
  const refunds = data.refunds || 0;

  const html = `
    <h3>Fechar caixa</h3>
    <div style="background:var(--bg-dark);border-radius:8px;padding:14px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px">
        <span style="color:var(--text-muted)">Valor inicial</span>
        <strong>${Digao.money(data.initial_value)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px">
        <span style="color:var(--text-muted)">Vendas em dinheiro</span>
        <strong style="color:var(--success)">+ ${Digao.money(data.sales)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px">
        <span style="color:var(--text-muted)">Entradas</span>
        <strong style="color:var(--info)">+ ${Digao.money(data.entries)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px">
        <span style="color:var(--text-muted)">Saídas</span>
        <strong style="color:var(--danger)">− ${Digao.money(data.exits)}</strong>
      </div>
      ${refunds > 0 ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px">
          <span style="color:var(--text-muted)">Estornos</span>
          <strong style="color:var(--warning)">− ${Digao.money(refunds)}</strong>
        </div>
      ` : ''}
      <div style="display:flex;justify-content:space-between;padding-top:10px;border-top:1px dashed var(--border);font-size:15px;font-weight:800">
        <span>Saldo esperado</span>
        <span style="color:var(--primary)">${Digao.money(data.current)}</span>
      </div>
    </div>

    <label class="label">Valor informado (contado em caixa)</label>
    <input class="input" type="number" id="close-value" step="0.01" min="0" value="${data.current.toFixed(2)}">

    <div id="diff-preview" style="margin-top:12px;font-size:12.5px;padding:10px;border-radius:6px;background:var(--bg-dark);color:var(--text-muted)">
      Diferença: <strong id="diff-value" style="color:var(--success)">R$ 0,00</strong>
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="close-cancel">Cancelar</button>
      <button class="btn btn-danger" id="close-confirm"><i class="fa-solid fa-lock"></i> Confirmar fechamento</button>
    </div>
  `;

  const m = Digao.modal(html);

  const input = document.getElementById('close-value');
  const diffEl = document.getElementById('diff-value');

  function updateDiff() {
    const informed = Number(input.value) || 0;
    const diff = informed - data.current;
    diffEl.textContent = Digao.money(Math.abs(diff));
    diffEl.style.color = Math.abs(diff) < 0.01 ? 'var(--success)' : diff > 0 ? 'var(--info)' : 'var(--danger)';
  }
  input.addEventListener('input', updateDiff);
  updateDiff();

  document.getElementById('close-cancel').addEventListener('click', () => m.close());

  document.getElementById('close-confirm').addEventListener('click', async () => {
    const informed = Number(input.value);
    if (isNaN(informed)) return Digao.toast('Valor inválido', 'error');

    const res = await Digao.post('/cash/close', { informed_value: informed });
    Digao.toast(`Caixa fechado. Diferença: ${Digao.money(res.difference)}`, 'success', 5000);
    m.close();
    refreshCaixaStatus();
    carregarCaixa(container);
  });
}

// ============================================================
// MODAL — ESTORNO (Ciclo 6 / AUD-PG-07)
// ============================================================
function abrirModalEstorno(container) {
  const html = `
    <h3 style="margin-bottom:6px">Estornar pedido</h3>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px">
      Informe o número do pedido e o valor a estornar. O estorno gera um movimento de caixa.
    </p>

    <div style="display:flex;flex-direction:column;gap:14px">
      <div>
        <label class="label">Número do pedido</label>
        <input class="input" type="number" id="rf-order" placeholder="Ex: 5" min="1">
      </div>
      <div>
        <label class="label">Valor a estornar (R$)</label>
        <input class="input" type="number" id="rf-amount" step="0.01" min="0" value="0.00">
      </div>
      <div>
        <label class="label">Motivo *</label>
        <textarea class="input" id="rf-reason" rows="2" style="resize:none;font-family:inherit;font-size:13px" placeholder="Ex: Cliente desistiu / Erro de cobrança / Cancelamento"></textarea>
      </div>
      <div id="rf-info" style="display:none;padding:10px 12px;background:var(--bg-dark);border-radius:6px;font-size:12px;color:var(--text-muted)"></div>
      <div id="rf-erro" style="display:none;font-size:12px;color:var(--danger)"></div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="rf-cancel">Cancelar</button>
      <button class="btn btn-warning" id="rf-confirm"><i class="fa-solid fa-rotate-left"></i> Estornar</button>
    </div>
  `;

  const m = Digao.modal(html);

  const orderInput = document.getElementById('rf-order');
  const amountInput = document.getElementById('rf-amount');
  const reasonInput = document.getElementById('rf-reason');
  const infoEl = document.getElementById('rf-info');
  const errEl = document.getElementById('rf-erro');

  let pedidoCarregado = null;

  orderInput.addEventListener('blur', async () => {
    const num = Number(orderInput.value);
    if (!num || num <= 0) return;

    errEl.style.display = 'none';
    infoEl.style.display = 'none';
    pedidoCarregado = null;

    try {
      // Busca o pedido por número — usa a rota de listagem e filtra
      const lista = await Digao.get('/orders?limit=200');
      const found = lista.find(o => o.number === num);

      if (!found) {
        errEl.textContent = `Pedido #${num} não encontrado.`;
        errEl.style.display = 'block';
        return;
      }

      // Carrega detalhes atualizados
      const det = await Digao.get(`/orders/${found.id}`);

      if (!det.payments || det.payments.length === 0) {
        errEl.textContent = `Pedido #${num} não possui pagamentos.`;
        errEl.style.display = 'block';
        return;
      }

      const netPaid = det.payments_total || 0;
      const refunded = det.refunds_total || 0;

      if (netPaid <= 0) {
        errEl.textContent = `Pedido #${num} já foi totalmente estornado.`;
        errEl.style.display = 'block';
        return;
      }

      pedidoCarregado = det;
      infoEl.innerHTML = `
        <div><strong>Pedido #${det.number}</strong> · total ${Digao.money(det.total)}</div>
        <div style="margin-top:4px">Pago (líquido): <strong style="color:var(--primary)">${Digao.money(netPaid)}</strong></div>
        ${refunded > 0 ? `<div style="margin-top:2px">Já estornado: ${Digao.money(refunded)}</div>` : ''}
        <div style="margin-top:2px">Status: <strong>${det.financial_status}</strong></div>
      `;
      infoEl.style.display = 'block';

      amountInput.value = netPaid.toFixed(2);
    } catch (e) {
      errEl.textContent = 'Erro ao buscar pedido.';
      errEl.style.display = 'block';
    }
  });

  document.getElementById('rf-cancel').addEventListener('click', () => m.close());

  document.getElementById('rf-confirm').addEventListener('click', async () => {
    errEl.style.display = 'none';

    if (!pedidoCarregado) {
      errEl.textContent = 'Informe um número de pedido válido.';
      errEl.style.display = 'block';
      return;
    }

    const amount = Number(amountInput.value);
    const reason = reasonInput.value.trim();

    if (!reason || reason.length < 3) {
      errEl.textContent = 'Motivo obrigatório (mínimo 3 caracteres).';
      errEl.style.display = 'block';
      return;
    }
    if (!amount || amount <= 0) {
      errEl.textContent = 'Valor deve ser positivo.';
      errEl.style.display = 'block';
      return;
    }

    const btn = document.getElementById('rf-confirm');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Estornando…';

    try {
      const res = await Digao.post(`/orders/${pedidoCarregado.id}/refund`, { amount, reason });
      Digao.toast(`Estorno de ${Digao.money(res.refunded_amount)} registrado. Status: ${res.financial_status}`, 'success', 4000);
      m.close();
      refreshCaixaStatus();
      carregarCaixa(container);
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Estornar';
      errEl.textContent = e.message || 'Erro ao estornar.';
      errEl.style.display = 'block';
    }
  });
}

// ============================================================
// HISTÓRICO DE CAIXAS — Ciclo 6
// ============================================================
async function renderHistorico() {
  const wrapper = document.getElementById('historico-caixa-wrapper');
  if (!wrapper) return;

  wrapper.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <h4 style="font-size:14px;font-weight:700">Histórico de caixas fechados</h4>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input class="input" type="date" id="hist-from" style="padding:6px 10px;font-size:12px;max-width:160px">
          <input class="input" type="date" id="hist-to" style="padding:6px 10px;font-size:12px;max-width:160px">
          <button class="btn btn-secondary" id="hist-aplicar" style="padding:6px 12px;font-size:12px">Aplicar</button>
          <button class="btn btn-secondary" id="hist-limpar" style="padding:6px 12px;font-size:12px">Limpar</button>
        </div>
      </div>
      <div id="hist-list" style="max-height:400px;overflow-y:auto">
        <div style="text-align:center;padding:30px;color:var(--text-muted);font-size:13px">Carregando…</div>
      </div>
      <div id="hist-pagination" style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text-muted)"></div>
    </div>
  `;

  document.getElementById('hist-from').value = historicoFiltro.from;
  document.getElementById('hist-to').value = historicoFiltro.to;

  document.getElementById('hist-aplicar').addEventListener('click', () => {
    historicoFiltro.from = document.getElementById('hist-from').value;
    historicoFiltro.to = document.getElementById('hist-to').value;
    historicoPagina = 1;
    carregarHistorico();
  });

  document.getElementById('hist-limpar').addEventListener('click', () => {
    historicoFiltro = { from: '', to: '' };
    document.getElementById('hist-from').value = '';
    document.getElementById('hist-to').value = '';
    historicoPagina = 1;
    carregarHistorico();
  });

  carregarHistorico();
}

async function carregarHistorico() {
  const list = document.getElementById('hist-list');
  const pag = document.getElementById('hist-pagination');
  if (!list) return;

  list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:13px">Carregando…</div>';

  const params = new URLSearchParams();
  params.set('page', historicoPagina);
  params.set('limit', 10);
  if (historicoFiltro.from) params.set('from', historicoFiltro.from);
  if (historicoFiltro.to) params.set('to', historicoFiltro.to);

  try {
    const res = await Digao.get('/cash/history?' + params.toString());

    if (!res.items || res.items.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:13px">Nenhum caixa fechado no período.</div>';
      pag.innerHTML = '';
      return;
    }

    list.innerHTML = res.items.map(c => `
      <div class="hist-item" data-id="${c.id}" style="padding:14px 20px;border-bottom:1px solid var(--border);cursor:pointer;transition:0.15s">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:13.5px;font-weight:700">Caixa #${c.id}</div>
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">
              Fechado em ${Digao.date(c.closed_at)}
            </div>
          </div>
          <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
            <div style="text-align:right;font-size:11.5px;color:var(--text-muted)">
              Esperado<br><strong style="color:var(--text-main);font-size:13px">${Digao.money(c.expected_value)}</strong>
            </div>
            <div style="text-align:right;font-size:11.5px;color:var(--text-muted)">
              Informado<br><strong style="color:var(--text-main);font-size:13px">${Digao.money(c.informed_value)}</strong>
            </div>
            <div style="text-align:right;font-size:11.5px;color:var(--text-muted)">
              Diferença<br><strong style="color:${Math.abs(c.difference||0) < 0.01 ? 'var(--success)' : 'var(--danger)'};font-size:13px">${Digao.money(Math.abs(c.difference || 0))}</strong>
            </div>
            <i class="fa-solid fa-chevron-right" style="color:var(--text-dim)"></i>
          </div>
        </div>
      </div>
    `).join('');

    // Paginação
    pag.innerHTML = `
      <span>Página ${res.page} de ${res.total_pages} (${res.total} caixa${res.total === 1 ? '' : 's'})</span>
      <div style="display:flex;gap:6px">
        <button class="btn btn-secondary" id="hist-prev" style="padding:4px 10px;font-size:11px" ${res.page <= 1 ? 'disabled' : ''}>‹ Anterior</button>
        <button class="btn btn-secondary" id="hist-next" style="padding:4px 10px;font-size:11px" ${res.page >= res.total_pages ? 'disabled' : ''}>Próxima ›</button>
      </div>
    `;

    document.getElementById('hist-prev')?.addEventListener('click', () => {
      if (historicoPagina > 1) { historicoPagina--; carregarHistorico(); }
    });
    document.getElementById('hist-next')?.addEventListener('click', () => {
      if (historicoPagina < res.total_pages) { historicoPagina++; carregarHistorico(); }
    });

    // Clique no item → abre detalhes
    list.querySelectorAll('.hist-item').forEach(item => {
      item.addEventListener('click', () => abrirDetalhesCaixa(Number(item.dataset.id)));
      item.addEventListener('mouseenter', () => item.style.background = 'var(--bg-hover)');
      item.addEventListener('mouseleave', () => item.style.background = '');
    });

  } catch (e) {
    list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--danger);font-size:13px">Erro ao carregar histórico.</div>';
  }
}

async function abrirDetalhesCaixa(id) {
  const c = await Digao.get(`/cash/${id}`);

  const html = `
    <h3 style="margin-bottom:14px">Caixa #${c.id}</h3>

    <div style="background:var(--bg-dark);border-radius:8px;padding:14px;margin-bottom:14px;font-size:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--text-muted)">Aberto em</span>
        <strong>${Digao.date(c.opened_at)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--text-muted)">Fechado em</span>
        <strong>${Digao.date(c.closed_at)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--text-muted)">Valor inicial</span>
        <strong>${Digao.money(c.initial_value)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--text-muted)">Vendas (dinheiro)</span>
        <strong style="color:var(--success)">+ ${Digao.money(c.sales)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--text-muted)">Entradas</span>
        <strong style="color:var(--info)">+ ${Digao.money(c.entries)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--text-muted)">Saídas</span>
        <strong style="color:var(--danger)">− ${Digao.money(c.exits)}</strong>
      </div>
      ${c.refunds > 0 ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="color:var(--text-muted)">Estornos</span>
          <strong style="color:var(--warning)">− ${Digao.money(c.refunds)}</strong>
        </div>
      ` : ''}
      <div style="display:flex;justify-content:space-between;padding-top:10px;border-top:1px dashed var(--border);font-size:15px;font-weight:800">
        <span>Esperado</span>
        <span style="color:var(--primary)">${Digao.money(c.expected_value)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px">
        <span style="color:var(--text-muted)">Informado</span>
        <strong>${Digao.money(c.informed_value)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px">
        <span style="color:var(--text-muted)">Diferença</span>
        <strong style="color:${Math.abs(c.difference||0) < 0.01 ? 'var(--success)' : 'var(--danger)'}">${Digao.money(c.difference)}</strong>
      </div>
    </div>

    <div class="label">Movimentações (${c.movements.length})</div>
    <div style="max-height:240px;overflow-y:auto;background:var(--bg-dark);border-radius:8px;padding:8px">
      ${c.movements.length === 0 ? `
        <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">Nenhuma movimentação.</div>
      ` : c.movements.map(m => {
        const color = { VENDA:'var(--success)', ENTRADA:'var(--info)', SAIDA:'var(--danger)', ESTORNO:'var(--warning)' }[m.type] || 'var(--text-muted)';
        const signal = { VENDA:'+', ENTRADA:'+', SAIDA:'−', ESTORNO:'−' }[m.type] || '';
        return `
          <div style="display:flex;justify-content:space-between;padding:6px 8px;font-size:12px;border-bottom:1px solid var(--border)">
            <span style="flex:1">${escapeHtml(m.description)}</span>
            <strong style="color:${color}">${signal} ${Digao.money(m.amount)}</strong>
          </div>
        `;
      }).join('')}
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="hist-close">Fechar</button>
    </div>
  `;

  const m = Digao.modal(html);
  document.getElementById('hist-close').addEventListener('click', () => m.close());
}

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}