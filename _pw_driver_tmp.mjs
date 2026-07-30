import { chromium } from 'playwright';
import fs from 'node:fs';

const shotDir = 'C:/Users/jesmi/AppData/Local/Temp/claude/c--Users-jesmi-Desktop-Villanos/80b90ef6-f371-420f-bf0d-c819a2164435/scratchpad/shots';

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
page.on('dialog', async d => { await d.dismiss(); });
page.setDefaultTimeout(8000);

await page.goto('http://localhost:5173');
await page.getByText('JUGADOR VS IA').click();
await page.waitForTimeout(300);
await page.mouse.click(545, 360);
await page.waitForTimeout(400);
await page.getByText('COMENZAR PARTIDA').click();
await page.waitForTimeout(2500);
const comenzarBtn = page.getByText('Comenzar', { exact: true });
if (await comenzarBtn.count() > 0) { await comenzarBtn.click(); await page.waitForTimeout(500); }
await page.mouse.click(530, 350); // mover a La Cabaña
await page.waitForTimeout(500);
await page.mouse.click(1381, 430); // abrir mano
await page.waitForTimeout(500);

// Seleccionar el primer Aliado en mano (fila superior) haciendo click
await page.mouse.click(1260, 137);
await page.waitForTimeout(400);
await page.screenshot({ path: `${shotDir}/10_card_selected.png` });

// Click en la casilla de Jugar Carta resaltada en La Cabaña
await page.mouse.click(565, 247);
await page.waitForTimeout(600);
await page.screenshot({ path: `${shotDir}/11_after_play.png` });
console.log('11 done');
await browser.close();
