import { ModalStage } from './shared/ModalStage';

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmLeaveModal({ onConfirm, onCancel }: Props) {
  return (
    <ModalStage
      zClass="z-110"
      onDismiss={onCancel}
      tone="fate"
      eyebrow="Salir de la partida"
      title="¿Abandonar la partida?"
      subtitle="Se perderá el progreso de la partida en curso y quedará registrada como abandonada en el historial."
      widthClass="max-w-md"
      actions={<>
        <button onClick={onCancel} className="stage-btn stage-btn--secondary">Cancelar</button>
        <button onClick={onConfirm} className="stage-btn stage-btn--danger">Abandonar</button>
      </>}
    />
  );
}
