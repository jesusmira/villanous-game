import { getPlugin } from '../core/villains/registry';
import type { VillainId } from '../core/types';
import { assetUrl } from './assets';

// URLs ya precargadas en esta sesión (evita recrear <img> repetidos).
const warmed = new Set<string>();

function warm(url: string): void {
  if (warmed.has(url)) return;
  warmed.add(url);
  const img = new Image();
  img.src = url;
  // decode() fuerza la decodificación en segundo plano para que el primer render sea instantáneo.
  // Ignoramos el rechazo (p. ej. imagen aún no subida) — solo es un calentamiento de caché.
  img.decode?.().catch(() => {});
}

// Iconos compartidos por cualquier partida (acciones + UI).
const ACTION_FILES = [
  'gain_power', 'gain_power2', 'vanquish', 'move_hero', 'move_item_ally',
  'activate_card', 'discard', 'play_card', 'fate',
];
function sharedUrls(): string[] {
  return [
    ...ACTION_FILES.map(f => assetUrl(`actions/${f}.webp`)),
    assetUrl('ui/lock.webp'),
    assetUrl('ui/fondo.webp'),
  ];
}

// URLs de un villano: sus cartas (villano + destino), su tablero y su retrato.
function villainUrls(id: VillainId): string[] {
  const plugin = getPlugin(id);
  const cards = [...plugin.villainCardDefs, ...plugin.fateCardDefs]
    .filter(c => c.imageFile)
    .map(c => assetUrl(`cards/${id}/${c.imageFile}.webp`));
  return [...cards, assetUrl(`boards/${id}.webp`), assetUrl(`villains/${id}.webp`)];
}

/**
 * Precarga en la caché del navegador las imágenes que necesita esta partida (solo los villanos
 * en juego + iconos compartidos), para que no haya "pop-in" la primera vez que aparece una carta.
 */
export function preloadGameImages(villainIds: VillainId[]): void {
  const urls = [...sharedUrls(), ...villainIds.flatMap(villainUrls)];
  for (const url of urls) warm(url);
}
