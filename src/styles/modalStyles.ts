// Responsive modal and button styles for touch devices

export const modalStyles = {
  // Modal overlay
  overlay: 'fixed inset-0 bg-black/75 flex items-center justify-center z-100 backdrop-blur-sm',

  // Modal container
  container: 'bg-surface-container border border-primary/50 rounded-xl p-4 sm:p-5 w-11/12 sm:w-120 max-w-[95vw] sm:max-w-[94vw] max-h-[90vh] overflow-y-auto flex flex-col gap-4 shadow-[0_0_40px_rgba(211,188,249,0.3)]',

  // Button styles - responsive sizing
  buttonSmall: 'px-3 sm:px-2.5 py-2 sm:py-1.5 min-h-10 sm:min-h-auto rounded border transition-all active:scale-95',
  buttonSelect: 'px-3 sm:px-2.5 py-2 sm:py-1.5 min-h-10 sm:min-h-auto rounded border border-outline-variant/40 text-xs font-stats text-on-surface-variant bg-surface-container hover:border-primary hover:text-primary transition-all active:scale-95',
  buttonActive: 'px-3 sm:px-2.5 py-2 sm:py-1.5 min-h-10 sm:min-h-auto rounded border border-tertiary bg-tertiary/10 text-tertiary text-xs font-stats font-bold active:scale-95',
  buttonPrimary: 'px-3 sm:px-3 py-2 sm:py-1.5 min-h-10 sm:min-h-auto rounded border border-primary/50 bg-primary-container text-primary text-xs font-stats font-bold uppercase tracking-wide hover:bg-primary/20 transition-all disabled:opacity-40 active:scale-95',

  // Panel/section styles
  panel: 'bg-surface-container-high border border-outline-variant/30 rounded-lg p-3 sm:p-3 flex flex-col gap-2.5',

  // Text styles - responsive sizing
  title: 'font-serif text-lg sm:text-lg font-bold',
  description: 'text-sm sm:text-xs',
};
