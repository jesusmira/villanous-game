import type { ReactNode } from 'react';

/**
 * Renderizador mínimo de Markdown para los textos de ayuda (src/content). Cubre solo lo que usan
 * esos textos: `##`/`###`, párrafos (cada línea es un salto de línea), `**negrita**`, `*cursiva*`,
 * listas (`-` y `1.`), notas (`>`), separadores (`---`) y la directiva propia `@cartas: A | B`.
 * Iconos de acción: `[[GAIN_POWER]]` (cualquier ActionType) pinta el mismo icono que el tablero.
 * Si un elemento de lista EMPIEZA por un icono, se maqueta con el icono grande a la izquierda.
 * Construye elementos React (nunca innerHTML), así que no hay riesgo de inyección.
 */

import { parseMarkdown } from './markdownParser';
import type { MdBlock } from './markdownParser';
import { ACTION_IMG } from './actionImages';
import { ACTION_LABELS } from './actionLabels';
import type { ActionType } from '../../core/types';

const ICON_RE = /^\[\[([A-Z_]+)\]\]$/;
const LEADING_ICON_RE = /^\[\[([A-Z_]+)\]\]\s*/;

function ActionIcon({ type, className }: { type: string; className: string }) {
  const src = ACTION_IMG[type];
  if (!src) return null;
  const label = ACTION_LABELS[type as ActionType] ?? type;
  return <img src={src} alt={label} title={label} className={className} />;
}

/** `**negrita**`, `*cursiva*` e iconos `[[ACCION]]`. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[\[[A-Z_]+\]\])/g).filter(Boolean).map((part, i) => {
    const icon = part.match(ICON_RE);
    if (icon) return <ActionIcon key={i} type={icon[1]} className="guide-md-icon-inline" />;
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function ListItem({ text }: { text: string }) {
  const lead = text.match(LEADING_ICON_RE);
  if (!lead) return <li>{inline(text)}</li>;
  return (
    <li className="guide-md-icon-item">
      <ActionIcon type={lead[1]} className="guide-md-icon-lead" />
      <span>{inline(text.slice(lead[0].length))}</span>
    </li>
  );
}

interface Props {
  source: string;
  /** Pinta una fila de cartas para la directiva `@cartas:`. Sin ella, la directiva se omite. */
  renderCards?: (names: string[]) => ReactNode;
  /** Pinta la demostración de giro para la directiva `@giro:`. Sin ella, la directiva se omite. */
  renderRotation?: (b: Extract<MdBlock, { kind: 'rotate' }>) => ReactNode;
}

export function Markdown({ source, renderCards, renderRotation }: Props) {
  const blocks = parseMarkdown(source);
  return (
    <div className="guide-md">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h2':    return <h3 key={i} id={b.id} className="guide-md-h2">{b.text}</h3>;
          case 'h3':    return <h4 key={i} id={b.id} className="guide-md-h3">{b.text}</h4>;
          case 'p':     return <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>;
          case 'note':  return <aside key={i} className="guide-md-note">{inline(b.text)}</aside>;
          case 'ul':    return <ul key={i} className={b.items.every(it => LEADING_ICON_RE.test(it)) ? 'guide-md-icon-list' : undefined}>{b.items.map((it, j) => <ListItem key={j} text={it} />)}</ul>;
          case 'ol':    return <ol key={i}>{b.items.map((it, j) => <ListItem key={j} text={it} />)}</ol>;
          case 'hr':    return <hr key={i} />;
          case 'cards': return renderCards ? <div key={i}>{renderCards(b.names)}</div> : null;
          case 'rotate': return renderRotation ? <div key={i}>{renderRotation(b)}</div> : null;
        }
      })}
    </div>
  );
}
