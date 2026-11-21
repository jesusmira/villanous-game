/**
 * Sonidos del juego. Una sola entrada — `playSound('coin')` — y dos fuentes posibles por sonido:
 *   1. Un archivo en SOUND_FILES (cuando los tengamos: p. ej. packs CC0 de Kenney.nl).
 *   2. Si no hay archivo, un sonido de relleno generado con Web Audio (sin assets).
 * Cambiar un sonido sintético por uno real = añadir su ruta a SOUND_FILES; nada más cambia.
 *
 * El silencio se guarda en localStorage y se expone con subscribe/get para useSyncExternalStore.
 * Los navegadores no dejan sonar nada hasta el primer gesto del usuario: el AudioContext se crea
 * (o se reanuda) en el primer `playSound` tras ese gesto; antes, simplemente no suena.
 */

export type SoundName = 'play' | 'coin' | 'pay' | 'vanquish' | 'fate' | 'fatePlace' | 'shuffle' | 'alert' | 'turn' | 'victory'
  | 'coinSpin' | 'coinLand' | 'click'
  | 'pawn' | 'move' | 'discard' | 'draw' | 'activate'
  | 'unlock' | 'wicket' | 'shrink' | 'condition' | 'bookOpen' | 'bookClose' | 'denied'
  | 'defeat';

// Archivos de src/assets/sounds (solo los que se usan; procedencia y licencias en CREDITOS.md).
// import.meta.glob los incluye en el build sin escribir un import por archivo.
const FILE_URLS = import.meta.glob('../assets/sounds/*.{ogg,mp3}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const file = (name: string): string | undefined =>
  FILE_URLS[`../assets/sounds/${name}.ogg`] ?? FILE_URLS[`../assets/sounds/${name}.mp3`];

/** Archivo de cada sonido. Si falta (o el navegador no lo decodifica), suena el sintético. */
const SOUND_FILES: Partial<Record<SoundName, string | undefined>> = {
  play:      file('jugar-carta'),
  coin:      file('ganar-poder'),
  pay:       file('pagar-poder'),
  vanquish:  file('vencer'),
  fate:      file('destino'),
  fatePlace: file('colocar-destino'),  // colocar una carta de Destino, la juegue quien la juegue
  shuffle:   file('barajar-destino'),
  alert:     file('aviso'),
  turn:      file('tu-turno'),
  coinSpin:  file('moneda-gira'),      // moneda del sorteo girando…
  coinLand:  file('moneda-cae'),       // …y cayendo con el resultado
  click:     file('clic'),             // botones de fin de fase
  pawn:      file('mover-peon'),
  move:      file('mover-carta'),      // mover una carta de una ubicación a otra
  discard:   file('descartar'),
  draw:      file('robar'),
  activate:  file('activar'),
  unlock:    file('desbloquear'),      // Mapa de Nunca Jamás
  wicket:    file('postigo'),          // Soldado Naipe ↔ Postigo
  shrink:    file('menguar'),          // Menguar / Agrandar
  condition: file('condicion'),        // jugar una Condición en el turno del rival
  bookOpen:  file('abrir-libro'),      // abrir la Guía o las Reglas
  bookClose: file('cerrar-libro'),
  denied:    file('no-permitido'),     // soltar una carta donde no se puede
  victory:   file('victoria'),         // ganas tú (o, entre 2 personas, cualquiera)
  defeat:    file('derrota'),          // gana la IA
};

const MASTER_VOLUME = 0.28;
const MUTE_KEY = 'villainous:muted';

// ── Silencio (persistente) ───────────────────────────────────────────────────
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } })();
const listeners = new Set<() => void>();
export function isMuted(): boolean { return muted; }
export function setMuted(value: boolean): void {
  muted = value;
  try { localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch { /* modo privado: solo en memoria */ }
  listeners.forEach(l => l());
}
export function subscribeMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// ── Motor ────────────────────────────────────────────────────────────────────
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out: master! };
}

const fileCache = new Map<string, Promise<AudioBuffer | null>>();
function loadFile(url: string, ac: AudioContext): Promise<AudioBuffer | null> {
  let p = fileCache.get(url);
  if (!p) {
    p = fetch(url).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).catch(() => null);
    fileCache.set(url, p);
  }
  return p;
}

// El mismo sonido disparado dos veces casi a la vez (React en modo estricto monta los efectos
// dos veces en desarrollo; dos cambios de estado seguidos) suena una sola vez.
const lastPlayedAt = new Map<SoundName, number>();

// ── Precarga ─────────────────────────────────────────────────────────────────
// Con el PRIMER toque o tecla en la página (p. ej. al elegir modo de juego) se crea el contexto de
// audio y se descargan y decodifican todos los sonidos en segundo plano. Si no, cada uno se
// cargaba la primera vez que sonaba y llegaba tarde (la moneda del sorteo, ~0,2 s después de su
// animación).
function warmUpSounds(): void {
  for (const ev of ['pointerdown', 'keydown']) window.removeEventListener(ev, warmUpSounds, true);
  const a = audio();
  if (!a) return;
  for (const url of Object.values(SOUND_FILES)) if (url) void loadFile(url, a.ctx);
}
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, warmUpSounds, true);
}

// Sonidos de archivo que están sonando ahora (para poder cortarlos, p. ej. el giro de la moneda).
const playing = new Map<SoundName, { src: AudioBufferSourceNode; gain: GainNode }>();

/** Apaga con un fundido corto un sonido que esté sonando (si no suena, no hace nada). */
export function stopSound(name: SoundName, fadeMs = 180): void {
  const p = playing.get(name);
  if (!p || !ctx) return;
  const t = ctx.currentTime;
  p.gain.gain.setValueAtTime(p.gain.gain.value, t);
  p.gain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
  p.src.stop(t + fadeMs / 1000 + 0.02);
  playing.delete(name);
}

export function playSound(name: SoundName): void {
  if (muted) return;
  const now = performance.now();
  if (now - (lastPlayedAt.get(name) ?? -Infinity) < 120) return;
  lastPlayedAt.set(name, now);
  const a = audio();
  if (!a) return;
  // Contexto aún suspendido (creado justo tras el gesto): se reanuda y suena en cuanto se pueda.
  if (a.ctx.state !== 'running') {
    void a.ctx.resume().then(() => {
      if (a.ctx.state !== 'running') return;
      lastPlayedAt.delete(name);
      playSound(name);
    }).catch(() => {});
    return;
  }
  const file = SOUND_FILES[name];
  if (file) {
    void loadFile(file, a.ctx).then(buf => {
      if (!buf) { SYNTH[name](a.ctx, a.out); return; }
      const src = a.ctx.createBufferSource();
      src.buffer = buf;
      // Cada sonido de archivo pasa por su propio volumen, para poder apagarlo con stopSound().
      const gain = a.ctx.createGain();
      src.connect(gain).connect(a.out);
      src.start();
      playing.set(name, { src, gain });
      src.onended = () => { if (playing.get(name)?.src === src) playing.delete(name); };
    });
    return;
  }
  SYNTH[name](a.ctx, a.out);
}

// ── Sonidos de relleno (sintéticos) ──────────────────────────────────────────
type Synth = (ctx: AudioContext, out: AudioNode) => void;

/** Nota simple con envolvente rápida (ataque corto, caída exponencial). */
function tone(ctx: AudioContext, out: AudioNode, freq: number, start: number, dur: number,
  type: OscillatorType = 'sine', vol = 1, glideTo?: number): void {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Ráfaga de ruido filtrado (roce de carta, golpe). */
function noise(ctx: AudioContext, out: AudioNode, start: number, dur: number, freqFrom: number, freqTo: number, vol = 1): void {
  const t0 = ctx.currentTime + start;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(freqFrom, t0);
  f.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0);
}

const SYNTH: Record<SoundName, Synth> = {
  // Carta posándose: roce corto que baja.
  play:     (c, o) => { noise(c, o, 0, 0.16, 2600, 700, 0.9); tone(c, o, 180, 0.1, 0.08, 'sine', 0.35); },
  // Monedas: dos tintineos agudos.
  coin:     (c, o) => { tone(c, o, 1568, 0, 0.12, 'triangle', 0.5); tone(c, o, 2093, 0.07, 0.22, 'triangle', 0.45); },
  // Pagar: tintineo más grave y apagado.
  pay:      (c, o) => { tone(c, o, 880, 0, 0.1, 'triangle', 0.35); tone(c, o, 660, 0.06, 0.16, 'triangle', 0.3); },
  // Vencer: golpe grave + chasquido.
  vanquish: (c, o) => { tone(c, o, 150, 0, 0.35, 'sine', 0.9, 45); noise(c, o, 0, 0.22, 1800, 300, 0.7); },
  // Colocar carta de Destino: roce y golpe suave.
  fatePlace: (c, o) => { noise(c, o, 0, 0.18, 2200, 600, 0.8); tone(c, o, 140, 0.12, 0.1, 'sine', 0.35); },
  // Moneda girando / cayendo.
  coinSpin: (c, o) => { [0, 0.18, 0.34, 0.48, 0.6].forEach((t, i) => tone(c, o, 1800 - i * 120, t, 0.06, 'triangle', 0.25)); },
  coinLand: (c, o) => { tone(c, o, 1318.5, 0, 0.25, 'triangle', 0.45); tone(c, o, 1760, 0.05, 0.3, 'triangle', 0.3); },
  // Paso del peón, roce de carta, descarte, robo y activación (de reserva si falla el archivo).
  pawn:     (c, o) => { noise(c, o, 0, 0.09, 600, 200, 0.7); },
  move:     (c, o) => { noise(c, o, 0, 0.2, 2400, 900, 0.6); },
  discard:  (c, o) => { noise(c, o, 0, 0.14, 1800, 500, 0.6); },
  draw:     (c, o) => { noise(c, o, 0, 0.12, 2800, 1400, 0.5); noise(c, o, 0.1, 0.12, 2800, 1400, 0.5); },
  activate: (c, o) => { tone(c, o, 1200, 0, 0.05, 'square', 0.15); tone(c, o, 900, 0.05, 0.08, 'square', 0.12); },
  // Especiales e interfaz (de reserva).
  unlock:    (c, o) => { tone(c, o, 330, 0, 0.4, 'triangle', 0.3, 495); },
  wicket:    (c, o) => { noise(c, o, 0, 0.12, 2000, 800, 0.6); },
  shrink:    (c, o) => { tone(c, o, 400, 0, 0.35, 'sawtooth', 0.08, 250); },
  condition: (c, o) => { noise(c, o, 0, 0.25, 5000, 2500, 0.5); },
  bookOpen:  (c, o) => { noise(c, o, 0, 0.18, 1500, 700, 0.5); },
  bookClose: (c, o) => { noise(c, o, 0, 0.1, 900, 300, 0.6); },
  denied:    (c, o) => { tone(c, o, 160, 0, 0.12, 'sine', 0.4, 110); },
  // Derrota (de reserva): arpegio menor descendente.
  defeat:   (c, o) => { [523.3, 392, 311.1, 261.6].forEach((f, i) => tone(c, o, f, i * 0.18, i === 3 ? 1 : 0.35, 'triangle', 0.4)); },
  // Clic de botón.
  click:    (c, o) => { tone(c, o, 2400, 0, 0.03, 'square', 0.15); },
  // Barajar: varios roces seguidos.
  shuffle:  (c, o) => { [0, 0.07, 0.14, 0.21].forEach(t => noise(c, o, t, 0.09, 3000, 1200, 0.6)); },
  // Destino: acorde menor que se eleva, algo inquietante.
  fate:     (c, o) => { tone(c, o, 220, 0, 0.7, 'triangle', 0.35, 330); tone(c, o, 261.6, 0.05, 0.7, 'triangle', 0.3, 392); tone(c, o, 329.6, 0.1, 0.75, 'sine', 0.25, 494); },
  // Algo contra ti: dos tonos graves descendentes.
  alert:    (c, o) => { tone(c, o, 311, 0, 0.18, 'square', 0.18); tone(c, o, 233, 0.16, 0.3, 'square', 0.18); },
  // Tu turno: campanita suave.
  turn:     (c, o) => { tone(c, o, 1046.5, 0, 0.7, 'sine', 0.4); tone(c, o, 2093, 0, 0.45, 'sine', 0.12); },
  // Victoria: arpegio mayor.
  victory:  (c, o) => { [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(c, o, f, i * 0.13, i === 3 ? 0.9 : 0.3, 'triangle', 0.45)); },
};
