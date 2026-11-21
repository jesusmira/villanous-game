/**
 * Sube la música de assets-src/audio/ al bucket `game-audio` de Supabase.
 *
 * Uso:
 *   npm run audio:upload             → sube todos los archivos de assets-src/audio/
 *   npm run audio:upload ambiente-1  → solo los que empiecen por "ambiente-1"
 *
 * La carpeta assets-src/ está en .gitignore: la música nunca entra en el repositorio ni en el
 * build. Después de subir un tema nuevo, añádelo a TRACKS en src/lib/music.ts.
 *
 * Formato recomendado: MP3 a 128 kbps (funciona en todos los navegadores, también Safari/iOS).
 *
 * Requiere en .env.local (lo mismo que images:upload):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (clave secreta, NO se commitea)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'game-audio';
const SOURCE_DIR = join(process.cwd(), 'assets-src', 'audio');

const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
};

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}
if (!existsSync(SOURCE_DIR)) {
  console.error(`No existe ${SOURCE_DIR}. Crea la carpeta y deja ahí los temas.`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const filter = process.argv[2]?.trim();

const files = readdirSync(SOURCE_DIR)
  .filter(f => statSync(join(SOURCE_DIR, f)).isFile())
  .filter(f => CONTENT_TYPES[f.slice(f.lastIndexOf('.')).toLowerCase()])
  .filter(f => !filter || f.startsWith(filter));

if (files.length === 0) {
  console.log('No hay archivos de audio que subir.');
  process.exit(0);
}

let ok = 0;
for (const name of files) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  const body = readFileSync(join(SOURCE_DIR, name));
  const { error } = await supabase.storage.from(BUCKET).upload(name, body, {
    contentType: CONTENT_TYPES[ext],
    // Un año: los temas no cambian; para sustituir uno, súbelo con otro nombre.
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) {
    console.error(`✗ ${name}: ${error.message}`);
  } else {
    ok++;
    console.log(`✓ ${name} (${(body.length / 1024 / 1024).toFixed(2)} MB) → ${BUCKET}/${name}`);
  }
}
console.log(`\n${ok}/${files.length} subidos. Recuerda añadirlos a TRACKS en src/lib/music.ts.`);
