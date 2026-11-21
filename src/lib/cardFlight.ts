/**
 * Vuelo de una carta hasta su sitio en el tablero, pasando por el centro de la pantalla:
 *   origen → centro (en grande, con brillo) → pausa breve → su ubicación.
 * El origen puede ser un rectángulo (la carta en la mano, la miniatura de la pastilla de Destino)
 * o `null`: entonces la carta APARECE en el centro (jugadas del rival, que no se ven salir).
 *
 * Se anima una COPIA fija sobre todo: la carta real vive dentro del carrusel de ubicaciones
 * (overflow), que la recortaría. La carta real queda oculta hasta que la copia aterriza.
 * Devuelve false si no se animó (movimiento reducido, elemento no visible…).
 */
export function flyCardToBoard(el: HTMLElement, from: DOMRect | null, onDone?: () => void): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  // Que el destino esté a la vista (en móvil puede ser otra ubicación del carrusel).
  el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' as ScrollBehavior });
  const to = el.getBoundingClientRect();
  if (to.width <= 0) return false;

  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('data-inspect-id');
  Object.assign(ghost.style, {
    position: 'fixed', left: `${to.left}px`, top: `${to.top}px`,
    width: `${to.width}px`, height: `${to.height}px`, margin: '0',
    zIndex: '300', pointerEvents: 'none', transformOrigin: 'top left',
    animation: 'none',
  });
  document.body.appendChild(ghost);
  el.style.visibility = 'hidden';

  // En el centro, grande: hasta la mitad de la altura de la pantalla (máx. ×2,2).
  const sc = Math.min(2.2, (window.innerHeight * 0.5) / to.height);
  const cx = window.innerWidth / 2 - (to.width * sc) / 2 - to.left;
  const cy = window.innerHeight / 2 - (to.height * sc) / 2 - to.top;
  const ease = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
  const atCenter = `translate(${cx}px, ${cy}px) scale(${sc})`;
  const glow = '0 30px 60px rgba(0,0,0,0.8), 0 0 40px rgba(230,196,106,0.45)';
  const rest = '0 10px 25px rgba(0,0,0,0.6)';

  const start: Keyframe = from
    ? { offset: 0, easing: ease, opacity: 1, transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`, boxShadow: rest }
    // Sin origen: aparece en el centro, desde algo más pequeño y transparente.
    : { offset: 0, easing: ease, opacity: 0, transform: `translate(${cx + (to.width * sc) * 0.1}px, ${cy + (to.height * sc) * 0.1}px) scale(${sc * 0.8})`, boxShadow: rest };

  const anim = ghost.animate([
    start,
    { offset: from ? 0.38 : 0.22, easing: 'linear', opacity: 1, transform: atCenter, boxShadow: glow },
    { offset: 0.62, easing: ease, opacity: 1, transform: atCenter, boxShadow: glow },
    { offset: 1, opacity: 1, transform: 'translate(0, 0) scale(1)', boxShadow: rest },
  ], { duration: from ? 1300 : 1500 });

  const done = () => { ghost.remove(); el.style.visibility = ''; onDone?.(); };
  anim.onfinish = done;
  anim.oncancel = done;
  return true;
}

/**
 * Desliza una carta desde donde estaba (`from`, su rectángulo antes del cambio) hasta donde está
 * ahora: para que se VEA a la IA mover un Aliado, un Objeto o un Héroe de una ubicación a otra.
 * Como el vuelo, anima una copia fija (el carrusel de ubicaciones recortaría la real).
 */
export function slideCardOnBoard(el: HTMLElement, from: DOMRect, onDone?: () => void): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  // Desplazamiento relativo ANTES de llevar el destino a la vista: origen y destino están en el
  // mismo tablero, así que al desplazar la pantalla se mueven juntos y la diferencia se mantiene.
  const before = el.getBoundingClientRect();
  const dx = from.left - before.left, dy = from.top - before.top;
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return false;
  el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' as ScrollBehavior });
  const to = el.getBoundingClientRect();
  if (to.width <= 0) return false;

  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('data-inspect-id');
  Object.assign(ghost.style, {
    position: 'fixed', left: `${to.left}px`, top: `${to.top}px`,
    width: `${to.width}px`, height: `${to.height}px`, margin: '0',
    zIndex: '300', pointerEvents: 'none', animation: 'none',
  });
  document.body.appendChild(ghost);
  el.style.visibility = 'hidden';
  const anim = ghost.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(1)`, boxShadow: '0 10px 25px rgba(0,0,0,0.6)' },
    { offset: 0.5, transform: `translate(${dx / 2}px, ${dy / 2 - 24}px) scale(1.12)`, boxShadow: '0 24px 45px rgba(0,0,0,0.8), 0 0 30px rgba(230,196,106,0.35)' },
    { transform: 'translate(0, 0) scale(1)', boxShadow: '0 10px 25px rgba(0,0,0,0.6)' },
  ], { duration: 700, easing: 'cubic-bezier(0.45, 0.05, 0.3, 1)' });
  const done = () => { ghost.remove(); el.style.visibility = ''; onDone?.(); };
  anim.onfinish = done;
  anim.oncancel = done;
  return true;
}
