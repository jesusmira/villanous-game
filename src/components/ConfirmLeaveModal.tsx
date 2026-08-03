import { modalStyles } from '../styles/modalStyles';

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmLeaveModal({ onConfirm, onCancel }: Props) {
  return (
    <div className={modalStyles.overlay} onClick={onCancel}>
      <div
        className="bg-surface-container border border-error/40 rounded-xl p-5 w-11/12 sm:w-96 max-w-[95vw] flex flex-col gap-4 shadow-[0_0_40px_rgba(0,0,0,0.5)] text-center items-center"
        onClick={e => e.stopPropagation()}
      >
        <h2 className={`${modalStyles.title} text-error`}>¿Abandonar la partida?</h2>
        <p className={`${modalStyles.description} text-on-surface-variant`}>
          Se perderá el progreso de la partida en curso y quedará registrada como abandonada en el historial.
        </p>
        <div className="flex gap-3 w-full pt-1">
          <button onClick={onCancel} className={`${modalStyles.buttonSelect} flex-1`}>
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 min-h-10 sm:min-h-auto rounded border border-error bg-error/15 text-error text-xs font-stats font-bold uppercase tracking-wide hover:bg-error/25 transition-all active:scale-95"
          >
            Abandonar
          </button>
        </div>
      </div>
    </div>
  );
}
