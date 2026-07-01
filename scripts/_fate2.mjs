import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
p.on('pageerror', e => errors.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const phase = async () => {
  const t = await p.locator('body').innerText();
  if (/ACCIÓN DESTINO/i.test(t)) return 'FATE';
  if (/\bACTIVAR\b/.test(t)) return 'ACTIVATE';
  if (/\bMOVER\b/.test(t)) return 'MOVE';
  return '?';
};
const clickLoc = async (re) => {
  const loc = p.getByRole('button', { name: re });
  const n = await loc.count();
  for (let k = 0; k < n; k++) { const e = loc.nth(k); if (await e.isVisible() && await e.isEnabled()) { try { await e.click({ timeout: 1500 }); return true; } catch {} } }
  return false;
};
const clickFateToken = async () => {
  const fate = p.locator('button:has(img[alt="Destino"])');
  const n = await fate.count();
  for (let k = 0; k < n; k++) { const e = fate.nth(k); if (await e.isVisible() && await e.isEnabled()) { try { await e.click({ timeout: 1500 }); return true; } catch {} } }
  return false;
};

let human = false;
for (let i = 0; i < 8 && !human; i++) {
  await p.goto('http://localhost:4173', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  await p.getByText(/jugador vs ia/i).click({ timeout: 8000 });
  await p.getByText(/selecciona villano/i).waitFor({ timeout: 5000 });
  await p.locator('button:visible:has(img[alt="Maléfica"])').first().click();
  await p.waitForTimeout(150);
  await p.getByRole('button', { name: /comenzar partida/i }).click();
  await p.waitForTimeout(1100);
  const mb = p.locator('[class*="fixed"] button:visible');
  if (await mb.count()) { try { await mb.last().click({ timeout: 1200 }); } catch {} }
  await p.waitForTimeout(700);
  human = (await p.locator('button:has-text("MANO"):visible').count()) > 0;
}
console.log('human:', human);
if (!human) { await b.close(); process.exit(0); }

// Intentar abrir Destino en hasta 4 turnos del humano.
let fateOpen = false;
for (let turn = 0; turn < 4 && !fateOpen; turn++) {
  let ph = await phase();
  // MOVE: ir a montañas si se puede (stay turno1) o a cabaña; luego intentar montañas.
  if (ph === 'MOVE') {
    if (!(await clickLoc(/monta/i))) await clickLoc(/cabaña|cabana/i);
    await p.waitForTimeout(600);
    ph = await phase();
  }
  if (ph === 'ACTIVATE' || ph === 'MOVE') {
    if (await clickFateToken()) { await p.waitForTimeout(700); if (await phase() === 'FATE') { fateOpen = true; break; } }
  }
  // terminar turno
  const fin = p.getByRole('button', { name: /terminar/i });
  if (await fin.count()) { try { await fin.first().click({ timeout: 1500 }); } catch {} }
  await p.waitForTimeout(1500); // dejar jugar a la IA
}
console.log('FateModal abierto:', fateOpen, '| turno-fase:', await phase());
if (!fateOpen) { console.log('errores:', errors); await b.close(); process.exit(0); }

// ── PROBAR DRAG-DROP de la carta de Destino sobre una ubicación del rival ──
const fateCard = p.locator('.villainous-card.touch-none:visible').first();
console.log('cartas Destino arrastrables:', await fateCard.count());
const cb = await fateCard.boundingBox();
// localizar una ubicación del rival (su tablero). Buscamos un drop div con ref => usamos los títulos de loc de hook.
const oppLoc = p.getByRole('button', { name: /lagoon|rock|forest|roger|laguna|calavera|bosque de nunca|jolly/i }).first();
const hasOpp = await oppLoc.count();
console.log('ubicación rival encontrada:', hasOpp);

const fateBefore = await p.getByText(/acción destino/i).count();
if (cb) {
  await p.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await p.mouse.down();
  await p.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2 + 20, { steps: 3 });
  // arrastrar hacia el borde inferior para auto-scroll hasta el tablero rival
  for (let s = 0; s < 12; s++) { await p.mouse.move(cb.x + cb.width / 2, 860, { steps: 2 }); await p.waitForTimeout(120); }
  // ahora soltar sobre una ubicación del rival si la vemos
  const ob = (await oppLoc.count()) ? await oppLoc.boundingBox() : null;
  if (ob) { await p.mouse.move(ob.x + ob.width / 2, ob.y + ob.height / 2, { steps: 4 }); }
  await p.waitForTimeout(150);
  await p.mouse.up();
}
await p.waitForTimeout(800);
const fateAfter = await p.getByText(/acción destino/i).count();
console.log('Fate antes/después del drop:', fateBefore, fateAfter, '→ colocada:', fateBefore > 0 && fateAfter === 0);
console.log('errores:', errors.length ? errors : 'ninguno');
await b.close();
