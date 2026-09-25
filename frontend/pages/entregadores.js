/* ============================================================
   DIGÃO GESTÃO — Módulo Entregadores (com filtros + total)
   ============================================================ */

let driversCache = [];
let deliveriesCache = [];
let delivFiltro = { periodo: 'hoje', driverId: 'todos' };

// ============================================================
// LOADER
// ============================================================
window.loadEntregadores = async function (container) {
  await recarregarDados();
  container.innerHTML = renderEntregadoresLayout();
  bindEntregadoresEvents();
  renderResumoTopo();
  renderDriversGrid();
  renderDeliveryHistory();
};

async function recarregarDados() {
  [driversCache, deliveriesCache] = await Promise.all([
    Digao.get('/drivers'),
    Digao.get('/deliveries')
  ]);
}

// ============================================================
// FILTROS DE PERÍODO
// ============================================================
function filtrarDeliveries() {
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

  return deliveriesCache.filter(d => {
    // Filtro por entregador
    if (delivFiltro.driverId !== 'todos' && d.driver_id !== Number(delivFiltro.driverId)) {
      return false;
    }

    // Filtro por período
    const data = new Date(d.created_at.replace(' ', 'T'));
    if (delivFiltro.periodo === 'hoje') {
      return data >= hoje;
    }
    if (delivFiltro.periodo === 'ontem') {
      const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
      return data >= ontem && data < hoje;
    }
    if (delivFiltro.periodo === 'semana') {
      const semana = new Date(hoje); semana.setDate(semana.getDate() - 7);
      return data >= semana;
    }
    if (delivFiltro.periodo === 'mes') {
      const mes = new Date(hoje); mes.setDate(mes.getDate() - 30);
      return data >= mes;
    }
    return true;
  });
}

// ============================================================
// LAYOUT
// ============================================================
function renderEntregadoresLayout() {
  return `
    <div class="page-padding" style="display:flex;flex-direction:column;gap:16px;overflow-y:auto;height:100%">

      <!-- Card de total -->
      <div id="total-card"></div>

      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <h3 style="font-size:16px;font-weight:700">Entregadores ativos</h3>
          <p style="font-size:12px;color:var(--text-muted);margin-top:4px">
            Controle de entregas e valores devidos por entregador.
          </p>
        </div>
        <button class="btn btn-primary" id="btn-novo-entregador">
          <i class="fa-solid fa-plus"></i> Novo entregador
        </button>
      </div>

      <div id="drivers-grid" class="grid-2"></div>

      <!-- Histórico com filtros -->
      <div class="card" style="padding:0;overflow:hidden;flex-shrink:0">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <h4 style="font-size:14px;font-weight:700">Histórico de entregas</h4>

          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <select class="select" id="filtro-periodo" style="padding:6px 10px;font-size:12px">
              <option value="hoje">Hoje</option>
              <option value="ontem">Ontem</option>
              <option value="semana">Últimos 7 dias</option>
              <option value="mes" selected>Últimos 30 dias</option>
              <option value="todos">Todos</option>
            </select>
            <select class="select" id="filtro-driver" style="padding:6px 10px;font-size:12px">
              <option value="todos">Todos os entregadores</option>
              ${driversCache.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="deliveries-list" style="max-height:none"></div>
      </div>
    </div>
  `;
}

// ============================================================
// RESUMO — TOTAL A PAGAR HOJE
// ============================================================
function renderResumoTopo() {
  const hoje = new Date();
  const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  const doDia = deliveriesCache.filter(d => new Date(d.created_at.replace(' ', 'T')) >= inicioDia);
  const pendentes = doDia.filter(d => d.status === 'PENDENTE');
  const totalPendente = pendentes.reduce((s, d) => s + d.fee, 0);
  const totalPago = doDia.filter(d => d.status === 'PAGO').reduce((s, d) => s + d.fee, 0);
  const totalDia = totalPendente + totalPago;

  const drivers = [...new Set(pendentes.map(d => d.driver_id))];

  const el = document.getElementById('total-card');
  el.innerHTML = `
    <div class="card" style="padding:22px;background:linear-gradient(135deg,rgba(251,191,36,0.12),rgba(251,191,36,0.02));border:1px solid rgba(251,191,36,0.35);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px">
      <div>
        <div style="font-size:12px;color:var(--primary);font-weight:700;letter-spacing:0.5px">TOTAL A PAGAR HOJE</div>
        <div style="font-size:32px;font-weight:800;color:var(--primary);margin-top:6px;letter-spacing:-1px">
          ${Digao.money(totalPendente)}
        </div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px">
          ${pendentes.length} ${pendentes.length === 1 ? 'entrega pendente' : 'entregas pendentes'}
          ${drivers.length > 0 ? `· ${drivers.length} ${drivers.length === 1 ? 'entregador' : 'entregadores'}` : ''}
        </div>
      </div>

      <div style="display:flex;gap:24px">
        <div>
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">ENTREGAS HOJE</div>
          <div style="font-size:22px;font-weight:800;margin-top:4px">${doDia.length}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">JÁ PAGO</div>
          <div style="font-size:22px;font-weight:800;margin-top:4px;color:var(--success)">${Digao.money(totalPago)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">TOTAL DO DIA</div>
          <div style="font-size:22px;font-weight:800;margin-top:4px">${Digao.money(totalDia)}</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// GRID DE ENTREGADORES
// ============================================================
function renderDriversGrid() {
  const grid = document.getElementById('drivers-grid');

  if (driversCache.length === 0) {
    grid.innerHTML = `
      <div class="card" style="grid-column:1/-1;text-align:center;padding:50px;color:var(--text-muted)">
        <i class="fa-solid fa-motorcycle" style="font-size:40px;opacity:0.3;display:block;margin-bottom:12px"></i>
        Nenhum entregador cadastrado.
      </div>
    `;
    return;
  }

  grid.innerHTML = driversCache.map(d => renderDriverCard(d)).join('');

  // Carrega pendências de cada um
  driversCache.forEach(async d => {
    try {
      const summary = await Digao.get(`/drivers/${d.id}/summary`);
      const el = document.querySelector(`[data-driver-pending="${d.id}"]`);
      if (!el) return;

      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px">
          <span style="color:var(--text-muted)">Entregas pendentes</span>
          <strong>${summary.pending.count}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12.5px">
          <span style="color:var(--text-muted)">Valor devido</span>
          <strong style="color:var(--primary);font-size:14px">${Digao.money(summary.pending.total)}</strong>
        </div>
        ${summary.pending.total > 0 ? `
          <button class="btn btn-success btn-block" style="margin-top:12px" data-action="pay" data-driver="${d.id}">
            <i class="fa-solid fa-money-bill-transfer"></i> Pagar ${Digao.money(summary.pending.total)}
          </button>
        ` : '<div style="font-size:11.5px;color:var(--success);text-align:center;margin-top:10px">✓ Sem pendências</div>'}
      `;

      el.querySelector('[data-action="pay"]')?.addEventListener('click', () => pagarEntregador(d.id, summary.pending.total));
    } catch (e) { /* silent */ }
  });
}

function renderDriverCard(d) {
  const initials = d.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return `
    <div class="card" style="padding:18px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
        <div style="width:48px;height:48px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#000;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex-shrink:0">
          ${initials}
        </div>
        <div style="min-width:0;flex:1">
          <div style="font-size:15px;font-weight:700">${escapeHtml(d.name)}</div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">
            ${d.phone ? `📞 ${escapeHtml(d.phone)} · ` : ''}R$ ${Number(d.default_fee).toFixed(2)}/entrega
          </div>
        </div>
        ${d.active
          ? '<span class="badge badge-success">Ativo</span>'
          : '<span class="badge badge-muted">Inativo</span>'}
      </div>

      <div style="background:var(--bg-dark);border-radius:8px;padding:12px" data-driver-pending="${d.id}">
        <div style="font-size:12px;color:var(--text-muted)">Carregando…</div>
      </div>

      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-secondary" style="flex:1" data-action="edit" data-driver="${d.id}">
          <i class="fa-solid fa-pen"></i> Editar
        </button>
        <button class="btn btn-secondary" data-action="toggle" data-driver="${d.id}">
          <i class="fa-solid ${d.active ? 'fa-eye-slash' : 'fa-eye'}"></i>
        </button>
      </div>
    </div>
  `;
}

// ============================================================
// HISTÓRICO DE ENTREGAS (com filtros)
// ============================================================
function renderDeliveryHistory() {
  const el = document.getElementById('deliveries-list');
  const lista = filtrarDeliveries();

  if (lista.length === 0) {
    el.innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px">
        <i class="fa-solid fa-inbox" style="font-size:32px;opacity:0.3;display:block;margin-bottom:12px"></i>
        Nenhuma entrega encontrada com os filtros aplicados.
      </div>
    `;
    return;
  }

  const total = lista.reduce((s, d) => s + d.fee, 0);

  el.innerHTML = `
    <div style="padding:10px 20px;background:var(--bg-dark);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;font-size:12px">
      <span style="color:var(--text-muted)">
        <strong style="color:var(--text-main)">${lista.length}</strong> ${lista.length === 1 ? 'entrega' : 'entregas'}
      </span>
      <span style="color:var(--text-muted)">
        Total: <strong style="color:var(--primary)">${Digao.money(total)}</strong>
      </span>
    </div>
    ${lista.map(d => `
      <div style="display:grid;grid-template-columns:80px 1fr 1fr auto auto;gap:14px;align-items:center;padding:12px 20px;border-bottom:1px solid var(--border);font-size:13px">
        <strong style="color:var(--primary)">#${d.order_number ? Digao.pad(d.order_number) : '—'}</strong>
        <div>
          <div style="font-weight:600">${escapeHtml(d.driver_name || '—')}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${Digao.date(d.created_at)}</div>
        </div>
        <div style="text-align:right;font-weight:700">${Digao.money(d.fee)}</div>
        <div>${d.status === 'PAGO' ? '<span class="badge badge-success">Pago</span>' : '<span class="badge badge-warning">Pendente</span>'}</div>
        <div></div>
      </div>
    `).join('')}
  `;
}

// ============================================================
// AÇÕES
// ============================================================
async function pagarEntregador(driverId, total) {
  const driver = driversCache.find(d => d.id === driverId);
  const confirm = window.confirm(`Confirmar pagamento de ${Digao.money(total)} para ${driver.name}?`);
  if (!confirm) return;

  const res = await Digao.post(`/drivers/${driverId}/pay`);
  Digao.toast(`Pago ${Digao.money(res.paid)} referente a ${res.count} entregas`, 'success');
  await recarregarDados();
  renderResumoTopo();
  renderDriversGrid();
  renderDeliveryHistory();
}

// ============================================================
// MODAL — NOVO / EDITAR ENTREGADOR
// ============================================================
function abrirModalEntregador(driver = null) {
  const isEdit = !!driver;
  const d = driver || { name: '', phone: '', default_fee: 8, active: 1 };

  const html = `
    <h3>${isEdit ? 'Editar entregador' : 'Novo entregador'}</h3>

    <div style="display:flex;flex-direction:column;gap:14px">
      <div>
        <label class="label">Nome</label>
        <input class="input" id="drv-nome" value="${escapeAttr(d.name)}" placeholder="Ex: Carlos">
      </div>
      <div>
        <label class="label">Telefone</label>
        <input class="input" id="drv-phone" value="${escapeAttr(d.phone || '')}" placeholder="(45) 99999-0000">
      </div>
      <div>
        <label class="label">Valor padrão por entrega (R$)</label>
        <input class="input" id="drv-fee" type="number" step="0.01" min="0" value="${d.default_fee}">
        <p style="font-size:11px;color:var(--text-muted);margin-top:6px">
          Obs: o valor histórico de cada entrega fica preservado mesmo que este valor mude depois.
        </p>
      </div>

      ${isEdit ? `
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="drv-active" ${d.active ? 'checked' : ''}>
          Entregador ativo
        </label>
      ` : ''}
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="drv-cancel">Cancelar</button>
      <button class="btn btn-primary" id="drv-save">
        <i class="fa-solid fa-check"></i> ${isEdit ? 'Salvar' : 'Cadastrar'}
      </button>
    </div>
  `;

  const m = Digao.modal(html);

  document.getElementById('drv-cancel').addEventListener('click', () => m.close());

  document.getElementById('drv-save').addEventListener('click', async () => {
    const name = document.getElementById('drv-nome').value.trim();
    const phone = document.getElementById('drv-phone').value.trim();
    const default_fee = Number(document.getElementById('drv-fee').value);
    const active = isEdit ? document.getElementById('drv-active').checked : true;

    if (!name) return Digao.toast('Informe o nome', 'error');
    if (!default_fee || default_fee < 0) return Digao.toast('Valor inválido', 'error');

    if (isEdit) {
      await Digao.put(`/drivers/${driver.id}`, { name, phone, default_fee, active });
      Digao.toast('Entregador atualizado', 'success');
    } else {
      await Digao.post('/drivers', { name, phone, default_fee });
      Digao.toast('Entregador cadastrado', 'success');
    }
    m.close();
    await recarregarDados();
    renderResumoTopo();
    renderDriversGrid();
  });
}

// ============================================================
// EVENTOS
// ============================================================
function bindEntregadoresEvents() {
  document.getElementById('btn-novo-entregador').addEventListener('click', () => abrirModalEntregador());

  document.getElementById('filtro-periodo').addEventListener('change', (e) => {
    delivFiltro.periodo = e.target.value;
    renderDeliveryHistory();
  });

  document.getElementById('filtro-driver').addEventListener('change', (e) => {
    delivFiltro.driverId = e.target.value;
    renderDeliveryHistory();
  });

  document.getElementById('drivers-grid').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.driver);
    const d = driversCache.find(x => x.id === id);

    if (btn.dataset.action === 'edit') abrirModalEntregador(d);
    else if (btn.dataset.action === 'toggle') {
      await Digao.put(`/drivers/${id}`, { active: !d.active });
      Digao.toast(`Entregador ${d.active ? 'desativado' : 'ativado'}`, 'success');
      await recarregarDados();
      renderResumoTopo();
      renderDriversGrid();
    }
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