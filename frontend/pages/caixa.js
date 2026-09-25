/* ============================================================
   DIGÃO GESTÃO — Módulo Controle de Caixa
   ============================================================ */

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
    <div class="page-padding" style="display:flex;align-items:center;justify-content:center;flex:1">
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
}

// ============================================================
// TELA — CAIXA ABERTO
// ============================================================
function renderCaixaAberto(container, data) {
  const { movements, sales, entries, exits, current, initial_value, opened_at } = data;

  container.innerHTML = `
    <div class="page-padding" style="display:flex;flex-direction:column;gap:16px;overflow:hidden">

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

      <div class="card" style="padding:22px;background:linear-gradient(135deg,rgba(251,191,36,0.12),rgba(251,191,36,0.02));border:1px solid rgba(251,191,36,0.35);display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:12px;color:var(--primary);font-weight:700;letter-spacing:0.5px">SALDO ESPERADO EM CAIXA</div>
          <div style="font-size:32px;font-weight:800;color:var(--primary);margin-top:6px;letter-spacing:-1px">${Digao.money(current)}</div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px">Aberto em ${Digao.date(opened_at)}</div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" id="btn-add-mov"><i class="fa-solid fa-plus"></i> Movimentação</button>
          <button class="btn btn-danger" id="btn-fechar"><i class="fa-solid fa-lock"></i> Fechar caixa</button>
        </div>
      </div>

      <div class="card" style="flex:1;display:flex;flex-direction:column;overflow:hidden;padding:0">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <h4 style="font-size:14px;font-weight:700">Movimentações (${movements.length})</h4>
          <button class="btn btn-secondary" id="btn-refresh-mov" style="padding:6px 10px;font-size:11.5px"><i class="fa-solid fa-rotate"></i></button>
        </div>
        <div style="flex:1;overflow-y:auto">
          ${movements.length === 0 ? `
            <div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">Nenhuma movimentação ainda.</div>
          ` : movements.map(m => renderMovimentacao(m)).join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-add-mov').addEventListener('click', () => abrirModalMovimentacao(container));
  document.getElementById('btn-fechar').addEventListener('click', () => abrirModalFechamento(container, data));
  document.getElementById('btn-refresh-mov').addEventListener('click', () => carregarCaixa(container));
}

function renderMovimentacao(m) {
  const icons = { VENDA: 'fa-cart-shopping', ENTRADA: 'fa-arrow-down', SAIDA: 'fa-arrow-up' };
  const colors = { VENDA: 'var(--success)', ENTRADA: 'var(--info)', SAIDA: 'var(--danger)' };
  const signals = { VENDA: '+', ENTRADA: '+', SAIDA: '−' };

  return `
    <div style="display:grid;grid-template-columns:42px 1fr auto;gap:14px;align-items:center;padding:12px 20px;border-bottom:1px solid var(--border)">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--bg-dark);display:flex;align-items:center;justify-content:center;color:${colors[m.type]};font-size:13px">
        <i class="fa-solid ${icons[m.type]}"></i>
      </div>
      <div>
        <div style="font-size:13px;font-weight:600">${escapeHtml(m.description)}</div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${Digao.date(m.created_at)}</div>
      </div>
      <div style="text-align:right;font-weight:800;font-size:14px;color:${colors[m.type]}">
        ${signals[m.type]} ${Digao.money(m.amount)}
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
// HELPERS
// ============================================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}