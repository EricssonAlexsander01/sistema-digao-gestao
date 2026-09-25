/* ============================================================
   DIGÃO GESTÃO — Módulo Relatórios + Dashboard
   ============================================================ */

// ============================================================
// LOADER — DASHBOARD (Página Início)
// ============================================================
window.loadDashboard = async function (container) {
  const dash = await Digao.get('/dashboard');
  container.innerHTML = renderDashboard(dash);

  // Gráfico simples (vendas por canal)
  renderCanalChart(dash);
};

function renderDashboard(d) {
  const canalTotal = (d.balcao + d.whatsapp + d.ifood) || 1;

  return `
    <div class="page-padding" style="display:flex;flex-direction:column;gap:16px;overflow-y:auto">

      <div>
        <h3 style="font-size:16px;font-weight:700">Resumo de hoje</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-top:4px">${Digao.date(d.data)}</p>
      </div>

      <!-- KPI principal -->
      <div class="card" style="padding:26px;background:linear-gradient(135deg,rgba(251,191,36,0.12),transparent);border:1px solid rgba(251,191,36,0.3);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-size:12px;color:var(--primary);font-weight:700;letter-spacing:1px">FATURAMENTO HOJE</div>
          <div style="font-size:42px;font-weight:800;color:var(--primary);letter-spacing:-1.5px;margin-top:6px">${Digao.money(d.faturamento)}</div>
        </div>
        <div style="display:flex;gap:30px">
          <div>
            <div style="font-size:11px;color:var(--text-muted);font-weight:600">PEDIDOS</div>
            <div style="font-size:24px;font-weight:800;margin-top:6px">${d.pedidos}</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-muted);font-weight:600">TICKET MÉDIO</div>
            <div style="font-size:24px;font-weight:800;margin-top:6px;color:var(--info)">${Digao.money(d.ticket_medio)}</div>
          </div>
        </div>
      </div>

      <!-- KPIs secundários -->
      <div class="grid-4">
        <div class="card" style="padding:18px">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">BALCÃO</div>
          <div style="font-size:22px;font-weight:800;margin-top:8px">${Digao.money(d.balcao)}</div>
        </div>
        <div class="card" style="padding:18px">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">WHATSAPP</div>
          <div style="font-size:22px;font-weight:800;margin-top:8px;color:#25d366">${Digao.money(d.whatsapp)}</div>
        </div>
        <div class="card" style="padding:18px">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">IFOOD</div>
          <div style="font-size:22px;font-weight:800;margin-top:8px;color:#ea1d2c">${Digao.money(d.ifood || 0)}</div>
        </div>
        <div class="card" style="padding:18px">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">ENTREGAS</div>
          <div style="font-size:22px;font-weight:800;margin-top:8px">${Digao.money(d.entregas_total)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${d.entregas_count} entregas</div>
        </div>
      </div>

      <!-- Barra: distribuição por canal -->
      <div class="card" style="padding:20px">
        <h4 style="font-size:14px;font-weight:700;margin-bottom:16px">Distribuição por canal</h4>
        <div style="display:flex;height:28px;border-radius:6px;overflow:hidden;background:var(--bg-dark)">
          ${d.balcao > 0 ? `<div style="background:var(--primary);width:${(d.balcao/canalTotal*100).toFixed(1)}%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#000" title="Balcão: ${Digao.money(d.balcao)}">BALCÃO</div>` : ''}
          ${d.whatsapp > 0 ? `<div style="background:#25d366;width:${(d.whatsapp/canalTotal*100).toFixed(1)}%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#000" title="WhatsApp: ${Digao.money(d.whatsapp)}">WHATS</div>` : ''}
          ${d.ifood > 0 ? `<div style="background:#ea1d2c;width:${(d.ifood/canalTotal*100).toFixed(1)}%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff" title="iFood: ${Digao.money(d.ifood)}">IFOOD</div>` : ''}
        </div>
        <div style="display:flex;gap:18px;margin-top:14px;font-size:12px;color:var(--text-muted);flex-wrap:wrap">
          <span><span style="display:inline-block;width:10px;height:10px;background:var(--primary);border-radius:2px;margin-right:6px"></span>Balcão: <strong style="color:var(--text-main)">${Digao.money(d.balcao)}</strong></span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#25d366;border-radius:2px;margin-right:6px"></span>WhatsApp: <strong style="color:var(--text-main)">${Digao.money(d.whatsapp)}</strong></span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#ea1d2c;border-radius:2px;margin-right:6px"></span>iFood: <strong style="color:var(--text-main)">${Digao.money(d.ifood || 0)}</strong></span>
        </div>
      </div>

      <!-- Resultado -->
      <div class="grid-3">
        <div class="card" style="padding:18px">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">DESPESAS</div>
          <div style="font-size:20px;font-weight:800;color:var(--danger);margin-top:8px">− ${Digao.money(d.despesas)}</div>
        </div>
        <div class="card" style="padding:18px">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">PERDAS</div>
          <div style="font-size:20px;font-weight:800;color:var(--warning);margin-top:8px">− ${Digao.money(d.perdas)}</div>
        </div>
        <div class="card" style="padding:18px;background:${d.resultado >= 0 ? 'linear-gradient(135deg,rgba(16,185,129,0.1),transparent)' : 'linear-gradient(135deg,rgba(239,68,68,0.1),transparent)'};border:1px solid ${d.resultado >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}">
          <div style="font-size:11px;color:${d.resultado >= 0 ? 'var(--success)' : 'var(--danger)'};font-weight:600;letter-spacing:0.5px">RESULTADO</div>
          <div style="font-size:20px;font-weight:800;color:${d.resultado >= 0 ? 'var(--success)' : 'var(--danger)'};margin-top:8px">${d.resultado >= 0 ? '+' : ''} ${Digao.money(d.resultado)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderCanalChart() { /* já incorporado na barra acima */ }

// ============================================================
// LOADER — RELATÓRIOS
// ============================================================
let relFiltro = { from: '', to: '' };

window.loadRelatorios = async function (container) {
  // Padrão: últimos 30 dias
  const today = new Date().toISOString().substring(0, 10);
  const past = new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10);
  relFiltro = { from: past, to: today };

  container.innerHTML = renderRelatoriosLayout();
  bindRelatoriosEvents();
  await carregarRelatorios();
};

function renderRelatoriosLayout() {
  return `
    <div class="page-padding" style="display:flex;flex-direction:column;gap:16px;overflow-y:auto">

      <!-- Filtros -->
      <div class="card" style="padding:14px 18px;display:flex;gap:12px;align-items:end;flex-wrap:wrap">
        <div>
          <label class="label">De</label>
          <input class="input" type="date" id="rel-from" value="${relFiltro.from}">
        </div>
        <div>
          <label class="label">Até</label>
          <input class="input" type="date" id="rel-to" value="${relFiltro.to}">
        </div>
        <button class="btn btn-primary" id="rel-aplicar">
          <i class="fa-solid fa-filter"></i> Aplicar
        </button>
        <div style="flex:1"></div>
        <button class="btn btn-secondary" id="rel-print">
          <i class="fa-solid fa-print"></i> Imprimir
        </button>
      </div>

      <div id="rel-content"></div>
    </div>
  `;
}

async function carregarRelatorios() {
  const el = document.getElementById('rel-content');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Carregando…</div>';

  const params = new URLSearchParams();
  if (relFiltro.from) params.set('from', relFiltro.from);
  if (relFiltro.to) params.set('to', relFiltro.to);

  const r = await Digao.get('/reports?' + params.toString());

  el.innerHTML = `
    <!-- KPIs principais -->
    <div class="grid-3" style="margin-bottom:16px">
      <div class="card" style="padding:20px">
        <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">FATURAMENTO</div>
        <div style="font-size:26px;font-weight:800;color:var(--primary);margin-top:8px">${Digao.money(r.faturamento)}</div>
      </div>
      <div class="card" style="padding:20px">
        <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">PEDIDOS</div>
        <div style="font-size:26px;font-weight:800;margin-top:8px">${r.pedidos}</div>
      </div>
      <div class="card" style="padding:20px">
        <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px">TICKET MÉDIO</div>
        <div style="font-size:26px;font-weight:800;color:var(--info);margin-top:8px">${Digao.money(r.ticket_medio)}</div>
      </div>
    </div>

    <!-- Vendas por canal -->
    <div class="card" style="padding:20px;margin-bottom:16px">
      <h4 style="font-size:14px;font-weight:700;margin-bottom:14px">Vendas por canal</h4>
      ${r.byChannel.length === 0 ? '<p style="font-size:13px;color:var(--text-muted)">Sem dados no período.</p>' :
      `<div style="display:flex;flex-direction:column;gap:10px">
        ${r.byChannel.map(c => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg-dark);border-radius:6px">
            <div>
              <strong style="font-size:13px">${c.channel === 'WHATSAPP' ? '📱 WhatsApp' : c.channel === 'IFOOD' ? '🍔 iFood' : '🏪 Balcão'}</strong>
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${c.count} pedidos</div>
            </div>
            <strong style="color:var(--primary);font-size:15px">${Digao.money(c.total)}</strong>
          </div>
        `).join('')}
      </div>`}
    </div>

    <!-- Vendas por forma de pagamento -->
    <div class="card" style="padding:20px;margin-bottom:16px">
      <h4 style="font-size:14px;font-weight:700;margin-bottom:14px">Vendas por forma de pagamento</h4>
      ${r.byPayment.length === 0 ? '<p style="font-size:13px;color:var(--text-muted)">Sem dados no período.</p>' :
      `<div style="display:flex;flex-direction:column;gap:10px">
        ${r.byPayment.map(p => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg-dark);border-radius:6px">
            <div>
              <strong style="font-size:13px">${formatPayment(p.method)}</strong>
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${p.count} pagamentos</div>
            </div>
            <strong style="color:var(--primary);font-size:15px">${Digao.money(p.total)}</strong>
          </div>
        `).join('')}
      </div>`}
    </div>

    <!-- Resumo financeiro -->
    <div class="card" style="padding:20px">
      <h4 style="font-size:14px;font-weight:700;margin-bottom:14px">Resumo financeiro</h4>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:13.5px">
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--text-muted)">Faturamento</span>
          <strong style="color:var(--success)">+ ${Digao.money(r.faturamento)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--text-muted)">Despesas</span>
          <strong style="color:var(--danger)">− ${Digao.money(r.expenses)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--text-muted)">Perdas</span>
          <strong style="color:var(--warning)">− ${Digao.money(r.losses)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--text-muted)">Entregas (${r.deliveries_count} un.)</span>
          <strong style="color:var(--danger)">− ${Digao.money(r.deliveries_total)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--text-muted)">Pagamentos a entregadores</span>
          <strong>${Digao.money(r.driver_payments)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:14px 0 4px;font-size:17px;font-weight:800">
          <span>Resultado</span>
          <span style="color:${r.resultado >= 0 ? 'var(--success)' : 'var(--danger)'}">
            ${r.resultado >= 0 ? '+' : ''} ${Digao.money(r.resultado)}
          </span>
        </div>
      </div>
    </div>
  `;
}

function formatPayment(m) {
  return { DINHEIRO: '💵 Dinheiro', PIX: '⚡ Pix', DEBITO: '💳 Débito', CREDITO: '💳 Crédito' }[m] || m;
}

// ============================================================
// EVENTOS
// ============================================================
function bindRelatoriosEvents() {
  document.getElementById('rel-aplicar').addEventListener('click', () => {
    relFiltro.from = document.getElementById('rel-from').value;
    relFiltro.to = document.getElementById('rel-to').value;
    carregarRelatorios();
  });

  document.getElementById('rel-print').addEventListener('click', () => {
    window.print();
  });
}

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}