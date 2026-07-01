// Captura las pantallas clave en distintos viewports de móvil para revisar el responsive.
// Uso: node scripts/shots.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

// El juego es landscape-only (en vertical muestra "Gira el dispositivo"),
// así que solo tiene sentido capturar en horizontal.
// Nord 2 ≈ 1080×2400 px @ DPR 2.625 → CSS landscape ≈ 914×411. La barra del
// navegador recorta el alto útil, por eso probamos también un alto agresivo (360).
const VIEWPORTS = [
  { name: 'nord2-bars-hidden',     width: 915, height: 480 }, // barras del navegador ocultas
  { name: 'nord2-landscape',       width: 915, height: 412 },
  { name: 'nord2-landscape-tight', width: 915, height: 360 }, // barras visibles
  { name: 'nord2-landscape-worst', width: 915, height: 300 },
];

const browser = await chromium.launch();
let overflowReport = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  // Margen para que Vite termine de optimizar dependencias / recargar.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${vp.name}-1-menu.png` });

  // Entrar a la 2ª pantalla (selección de villanos).
  await page.getByText(/jugador vs ia/i).click({ timeout: 8000 });
  await page.getByText(/selecciona villano/i).waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(300);

  await page.screenshot({ path: `${OUT}/${vp.name}.png` });

  // ¿Se corta el botón "Comenzar Partida"? Comprobamos si está dentro del viewport.
  const btn = page.getByRole('button', { name: /Comenzar Partida/i });
  const box = await btn.boundingBox();
  const fitsVertically = box ? (box.y + box.height) <= vp.height + 1 : false;

  // ¿Se recortan los círculos de villano? Para cada círculo (el <button> con la
  // imagen) buscamos su ZONA contenedora (el ancestro overflow:hidden, saltando
  // el propio botón que también recorta a círculo) y comparamos sus bordes.
  const circulosRecortados = await page.evaluate(() => {
    const botones = [...document.querySelectorAll('img[src*="/villains/"]')]
      .map(i => i.closest('button'))
      .filter(b => b && b.offsetParent !== null);
    let clipped = 0;
    for (const btn of botones) {
      let anc = btn.parentElement;
      while (anc && getComputedStyle(anc).overflow !== 'hidden') anc = anc.parentElement;
      if (!anc) continue;
      const br = btn.getBoundingClientRect();
      const ar = anc.getBoundingClientRect();
      if (br.top < ar.top - 0.5 || br.bottom > ar.bottom + 0.5) clipped++;
    }
    return clipped;
  });

  overflowReport.push({
    viewport: vp.name,
    btnBottom: box ? Math.round(box.y + box.height) : null,
    viewportHeight: vp.height,
    botonVisibleSinScroll: fitsVertically,
    circulosRecortados,
  });

  await page.close();
}

await browser.close();
console.table(overflowReport);
