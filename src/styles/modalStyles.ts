// Estilos compartidos de modales y subpaneles: mismo lenguaje que ModalStage (ver
// components/shared/ModalStage.tsx e index.css → .modal-stage*, .stage-*).

export const modalStyles = {
  // Modal overlay — sin fondo oscuro: el tablero debe quedar visible (y, donde el modal lo
  // permita, clicable) detrás. Cada modal decide si el fondo cierra al pulsar (onClick+
  // stopPropagation en el contenido) o si deja pasar el clic al tablero (pointer-events-none
  // en este wrapper + pointer-events-auto en el contenido).
  overlay: 'fixed inset-0 flex items-center justify-center z-100 p-4',

  // Modal container
  container: 'bg-surface-container border border-primary/50 rounded-xl p-4 sm:p-5 w-11/12 sm:w-120 max-w-[95vw] sm:max-w-[94vw] max-h-[90vh] overflow-y-auto flex flex-col gap-4 shadow-[0_0_40px_rgba(211,188,249,0.3)] pointer-events-auto',

  // Button styles - responsive sizing
  buttonSmall: 'px-3 sm:px-2.5 py-2 sm:py-1.5 min-h-10 sm:min-h-auto rounded border transition-all active:scale-95',
  buttonSelect: 'stage-chip',
  buttonActive: 'stage-chip is-chosen',
  buttonPrimary: 'stage-btn stage-btn--primary',

  // Panel/section styles
  panel: 'modal-stage-section',

  // Text styles - responsive sizing
  title: 'modal-stage-title',
  description: 'modal-stage-note',
};
