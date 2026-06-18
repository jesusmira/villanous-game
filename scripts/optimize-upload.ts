/**
 * Optimiza los PNG crudos de assets-src/** a WebP y los sube al bucket `game-images` de Supabase.
 *
 * Uso:
 *   npm run images:upload          → procesa y sube TODO assets-src/**
 *   npm run images:upload jhon     → solo el villano "jhon" (cards/jhon/**, boards/jhon.*, villains/jhon.*)
 *
 * Para añadir un villano nuevo: deja sus PNG en assets-src/cards/<id>/, assets-src/boards/<id>.png
 * y assets-src/villains/<id>.png, y ejecuta `npm run images:upload <id>`.
 *
 * Requiere en .env.local:
 *   VITE_SUPABASE_URL          (URL del proyecto)
 *   SUPABASE_SERVICE_ROLE_KEY  (Secret key sb_secret_… — acceso privilegiado, NO se commitea)
 *
 * Reglas de optimización por categoría:
 *   - boards/   → redimensiona a ≤1600px ancho, WebP q82 (originales a ~3751px, muy sobredimensionados)
 *   - villains/ → redimensiona a ≤256px ancho,  WebP q85 (se muestran en círculos pequeños)
 *   - cards/    → sin redimensionar,            WebP q90 (calidad indistinguible del original)
 *   - resto     → sin redimensionar,            WebP q85 (actions, ui)
 *
 * La ruta en el bucket es la misma relativa a assets-src pero con extensión .webp,
 * p.ej. assets-src/cards/jhon/villano/sherif.png → game-images/cards/jhon/villano/sherif.webp
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'game-images';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const SOURCE_DIR = join(process.cwd(), 'assets-src');
const IMG_EXT = /\.(png|jpe?g|webp)$/i;

// Argumento opcional: id de villano para subir solo sus imágenes (cards/<id>/, boards/<id>.*, villains/<id>.*).
const villainFilter = process.argv[2]?.trim();

function matchesVillain(relPosix: string, id: string): boolean {
  return relPosix.startsWith(`cards/${id}/`)
    || relPosix.startsWith(`boards/${id}.`)
    || relPosix.startsWith(`villains/${id}.`);
}

interface Rule { match: string; maxWidth?: number; quality: number; }
const RULES: Rule[] = [
  { match: '/boards/',   maxWidth: 1600, quality: 82 },
  { match: '/villains/', maxWidth: 256,  quality: 85 },
  { match: '/cards/',    quality: 90 },
];
const DEFAULT_RULE: Rule = { match: '', quality: 85 };

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (IMG_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

function pickRule(relPosix: string): Rule {
  return RULES.find(r => ('/' + relPosix).includes(r.match)) ?? DEFAULT_RULE;
}

async function main(): Promise<void> {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`No existe la carpeta de origen: ${SOURCE_DIR}`);
    process.exit(1);
  }

  let files = walk(SOURCE_DIR);
  if (villainFilter) {
    files = files.filter(abs =>
      matchesVillain(relative(SOURCE_DIR, abs).split(sep).join('/'), villainFilter),
    );
    if (files.length === 0) {
      console.error(`No se encontraron imágenes para el villano "${villainFilter}" en ${SOURCE_DIR}`);
      process.exit(1);
    }
  }

  let totalIn = 0;
  let totalOut = 0;
  let ok = 0;
  let fail = 0;
  const scope = villainFilter ? `del villano "${villainFilter}"` : 'totales';
  console.log(`Procesando ${files.length} imágenes ${scope} hacia el bucket "${BUCKET}"…\n`);

  for (const abs of files) {
    const relPosix = relative(SOURCE_DIR, abs).split(sep).join('/');
    const key = relPosix.replace(IMG_EXT, '.webp');
    const rule = pickRule(relPosix);
    const inSize = statSync(abs).size;

    try {
      let pipeline = sharp(abs);
      if (rule.maxWidth) {
        const meta = await pipeline.metadata();
        if (meta.width && meta.width > rule.maxWidth) {
          pipeline = pipeline.resize({ width: rule.maxWidth });
        }
      }
      const buf = await pipeline.webp({ quality: rule.quality }).toBuffer();

      const { error } = await supabase.storage.from(BUCKET).upload(key, buf, {
        contentType: 'image/webp',
        upsert: true,
        // Imágenes inmutables (el nombre es la versión): el navegador las cachea 1 año
        // y no las vuelve a pedir. También reduce el egress de Supabase.
        cacheControl: '31536000, immutable',
      });
      if (error) throw error;

      totalIn += inSize;
      totalOut += buf.length;
      ok++;
      const pct = ((1 - buf.length / inSize) * 100).toFixed(0);
      const inKB = (inSize / 1024).toFixed(0).padStart(5);
      const outKB = (buf.length / 1024).toFixed(0).padStart(5);
      console.log(`✓ ${key.padEnd(45)} ${inKB}KB → ${outKB}KB (-${pct}%)`);
    } catch (e) {
      fail++;
      console.error(`✗ ${key} — ${(e as Error).message}`);
    }
  }

  console.log(`\nHecho: ${ok} subidas, ${fail} fallos.`);
  console.log(
    `Peso total: ${(totalIn / 1024 / 1024).toFixed(1)} MB → ${(totalOut / 1024 / 1024).toFixed(1)} MB`,
  );
}

main();
