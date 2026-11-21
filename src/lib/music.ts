/**
 * Música de ambiente. Los temas NO van en el repositorio ni en el build: están en el bucket
 * `game-audio` del Storage de Supabase (se suben con `npm run audio:upload` desde
 * assets-src/audio/, carpeta fuera de git) y se descargan SOLO si el jugador activa la música.
 *
 * Caché: el Service Worker guarda las respuestas del bucket (CacheFirst, ver vite.config.ts), así
 * que cada dispositivo descarga cada tema una sola vez. Por eso el tema se pide ENTERO con fetch
 * (respuesta 200, cacheable) y se reproduce desde un blob, en vez de dejar que <audio> lo pida a
 * trozos (respuestas 206 parciales, que la caché no guarda y volverían a gastar tráfico).
 *
 * Para añadir un tema: dejarlo en assets-src/audio/, `npm run audio:upload` y añadir una línea a
 * TRACKS. Sin temas en la lista, el botón de música no se muestra.
 */

export interface MusicTrack {
  id: string;
  title: string;
  /** Ruta del archivo dentro del bucket `game-audio`. */
  file: string;
}

export const TRACKS: MusicTrack[] = [
  // { id: 'ambiente-1', title: 'Ambiente', file: 'ambiente-1.mp3' },
];

const BUCKET_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/game-audio`;
const VOLUME = 0.22;
const FADE_MS = 1200;
const ENABLED_KEY = 'villainous:music';

// ── Estado (persistente) para useSyncExternalStore ───────────────────────────
let enabled = (() => { try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; } })();
let trackIndex = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());
export const isMusicOn = (): boolean => enabled;
export const subscribeMusic = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

// ── Reproductor ──────────────────────────────────────────────────────────────
let audio: HTMLAudioElement | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
const blobUrls = new Map<string, Promise<string>>();

function loadTrack(track: MusicTrack): Promise<string> {
  let p = blobUrls.get(track.id);
  if (!p) {
    p = fetch(`${BUCKET_URL}/${track.file}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then(b => URL.createObjectURL(b));
    p.catch(() => blobUrls.delete(track.id));   // si falla, que se pueda reintentar
    blobUrls.set(track.id, p);
  }
  return p;
}

function fadeTo(target: number, then?: () => void): void {
  if (!audio) return;
  if (fadeTimer) clearInterval(fadeTimer);
  const a = audio;
  const step = (target - a.volume) / (FADE_MS / 50);
  fadeTimer = setInterval(() => {
    const next = a.volume + step;
    if ((step >= 0 && next >= target) || (step < 0 && next <= target)) {
      a.volume = Math.max(0, Math.min(1, target));
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = null;
      then?.();
    } else {
      a.volume = Math.max(0, Math.min(1, next));
    }
  }, 50);
}

async function start(): Promise<void> {
  const track = TRACKS[trackIndex % Math.max(1, TRACKS.length)];
  if (!track) return;
  try {
    const url = await loadTrack(track);
    if (!enabled) return;                       // se desactivó mientras descargaba
    if (!audio) { audio = new Audio(); audio.loop = true; }
    if (audio.src !== url) audio.src = url;
    audio.volume = 0;
    await audio.play();
    fadeTo(VOLUME);
  } catch {
    // Sin conexión, archivo inexistente o el navegador bloqueó el audio: simplemente no suena.
  }
}

function stop(): void {
  if (!audio) return;
  const a = audio;
  fadeTo(0, () => a.pause());
}

export function setMusicOn(value: boolean): void {
  if (value === enabled || TRACKS.length === 0) return;
  enabled = value;
  try { localStorage.setItem(ENABLED_KEY, value ? '1' : '0'); } catch { /* modo privado */ }
  notify();
  if (enabled) void start(); else stop();
}

/** Pasa al siguiente tema (si hay más de uno). */
export function nextTrack(): void {
  if (TRACKS.length < 2) return;
  trackIndex = (trackIndex + 1) % TRACKS.length;
  if (!enabled) return;
  if (audio) { const a = audio; fadeTo(0, () => { a.pause(); void start(); }); } else void start();
}

/**
 * Arranca la música si el jugador la dejó activada la última vez. Hay que llamarlo desde un gesto
 * del usuario (p. ej. al empezar la partida): los navegadores no dejan sonar audio antes.
 */
export function resumeMusicIfEnabled(): void {
  if (enabled && TRACKS.length > 0 && (!audio || audio.paused)) void start();
}

// Pestaña oculta o móvil bloqueado: se pausa; al volver, se reanuda si seguía activada.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!audio) return;
    if (document.hidden) audio.pause();
    else if (enabled) void audio.play().catch(() => {});
  });
}
