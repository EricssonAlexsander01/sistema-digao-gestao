/* ============================================================
   DIGÃO GESTÃO — Módulo de Impressão
   Bematech MP-4200 TH (USB via compartilhamento do Windows)
   ============================================================ */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { printer: ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');

const PRINTER_NAME = process.env.PRINTER_NAME || 'mp4200';
const PRINTER_SIMULATED = process.env.PRINTER_SIMULATED === 'true';
const OUTPUT_FILE = path.join(__dirname, 'data', 'printer-output.txt');

// ============================================================
// CRIA A INSTÂNCIA DO PRINTER (sem interface)
// ============================================================
function criarPrinter() {
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: 'tcp://0.0.0.0:0', // placeholder, não usado
    characterSet: CharacterSet.PC860_PORTUGUESE,
    removeSpecialCharacters: false,
    lineCharacter: '='
  });
}

// ============================================================
// ENVIA O BUFFER (simulado ou real)
// ============================================================
async function enviarParaImpressora(printer) {
  if (PRINTER_SIMULATED) {
    // Modo simulado: salva o buffer em arquivo
    const buffer = printer.getBuffer();
    fs.writeFileSync(OUTPUT_FILE, buffer);
    console.log(`[printer] Comanda salva em: ${OUTPUT_FILE}`);
    return { ok: true };
  }

  // Modo real: usa a interface do compartilhamento
  printer.setPrinterDriver(require('printer'));
  printer.setInterface(`//localhost/${PRINTER_NAME}`);
  await printer.execute();
  return { ok: true };
}

// ============================================================
// IMPRIME COMANDA DE PEDIDO
// ============================================================
async function imprimirComanda(order, items, mesa = null, garcom = null) {
  try {
    const printer = criarPrinter();

    printer.alignCenter();
    printer.bold(true);
    printer.println('DIGAO BURGER & SHAWARMA');
    printer.bold(false);
    printer.println('Toledo - PR');
    printer.drawLine();

    printer.alignLeft();
    printer.println(`Pedido #${String(order.number).padStart(3, '0')}`);

    if (mesa) {
      printer.bold(true);
      printer.println(`MESA ${String(mesa.number).padStart(2, '0')}`);
      printer.bold(false);
    }
    if (garcom) printer.println(`Garcom: ${garcom.name}`);

    printer.println(`Data: ${formatarData(order.created_at)}`);
    printer.println(`Canal: ${order.channel}`);
    printer.drawLine();

    items.forEach(it => {
      printer.println(`${it.quantity}x ${it.name}`);
      printer.alignRight();
      printer.println(`R$ ${(it.price * it.quantity).toFixed(2)}`);
      printer.alignLeft();
      if (it.observation) printer.println(`   Obs: ${it.observation}`);
    });

    printer.drawLine();
    printer.alignRight();
    printer.println(`Subtotal: R$ ${order.subtotal.toFixed(2)}`);
    if (order.delivery_fee > 0) {
      printer.println(`Entrega:  R$ ${order.delivery_fee.toFixed(2)}`);
    }
    printer.bold(true);
    printer.println(`TOTAL:    R$ ${order.total.toFixed(2)}`);
    printer.bold(false);
    printer.alignLeft();

    if (order.observation) printer.println(`Obs Geral: ${order.observation}`);

    printer.drawLine();
    printer.alignCenter();
    printer.println('Obrigado pela preferencia!');
    printer.println('');
    printer.println('');
    printer.cut();

    return await enviarParaImpressora(printer);
  } catch (e) {
    console.error('[printer] Erro:', e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================
// IMPRIME PRÉ-CONTA
// ============================================================
async function imprimirPreConta(order, items, mesa, garcom) {
  try {
    const printer = criarPrinter();

    printer.alignCenter();
    printer.bold(true);
    printer.println('*** PRE-CONTA ***');
    printer.bold(false);
    printer.println('DIGAO BURGER & SHAWARMA');
    printer.drawLine();

    printer.alignLeft();
    if (mesa) printer.println(`MESA ${String(mesa.number).padStart(2, '0')}`);
    if (garcom) printer.println(`Garcom: ${garcom.name}`);
    printer.drawLine();

    items.forEach(it => {
      printer.println(`${it.quantity}x ${it.name}`);
      printer.alignRight();
      printer.println(`R$ ${(it.price * it.quantity).toFixed(2)}`);
      printer.alignLeft();
    });

    printer.drawLine();
    printer.bold(true);
    printer.alignRight();
    printer.println(`TOTAL: R$ ${order.total.toFixed(2)}`);
    printer.bold(false);
    printer.alignCenter();
    printer.println('');
    printer.println('NAO E DOCUMENTO FISCAL');
    printer.println('');
    printer.cut();

    return await enviarParaImpressora(printer);
  } catch (e) {
    console.error('[printer] Erro (pré-conta):', e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================
// TESTE DE IMPRESSÃO
// ============================================================
async function imprimirTeste() {
  try {
    const printer = criarPrinter();

    printer.alignCenter();
    printer.bold(true);
    printer.println('DIGAO GESTAO');
    printer.bold(false);
    printer.println('Teste de impressao');
    printer.drawLine();
    printer.println('Se voce esta lendo isso,');
    printer.println('a impressora esta OK!');
    printer.drawLine();
    printer.println(new Date().toLocaleString('pt-BR'));
    printer.println('');
    printer.println('');
    printer.cut();

    return await enviarParaImpressora(printer);
  } catch (e) {
    console.error('[printer] Erro (teste):', e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================
// HELPERS
// ============================================================
function formatarData(iso) {
  if (!iso) return '--';
  const d = new Date(iso.replace(' ', 'T'));
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

module.exports = {
  imprimirComanda,
  imprimirPreConta,
  imprimirTeste
};