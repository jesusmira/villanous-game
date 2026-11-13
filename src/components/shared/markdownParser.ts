/**
 * Parser mínimo de Markdown para los textos de ayuda (src/content) — ver Markdown.tsx. Cubre solo
 * lo que usan esos textos: `##`/`###`, párrafos (cada línea es un salto de línea), listas (`-` y
 * `1.`), notas (`>`), separadores (`---`) y las directivas propias:
 *   `@cartas: A | B`                      → fila de miniaturas de esas cartas.
 *   `@giro: Carta | 90 | Antes | Después` → la carta normal, una flecha y la carta girada N grados
 *                                            (los dos rótulos son opcionales).
 */

export type MdBlock =
  | { kind: 'h2' | 'h3'; text: string; id: string }
  | { kind: 'p'; lines: string[] }
  | { kind: 'note'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'hr' }
  | { kind: 'cards'; names: string[] }
  | { kind: 'rotate'; name: string; degrees: number; before?: string; after?: string };

export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function parseMarkdown(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  // Un bloque (párrafo, nota, lista) solo continúa en la línea siguiente si no hay línea en
  // blanco entre medias.
  let open: MdBlock | null = null;

  for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    const push = (b: MdBlock) => { blocks.push(b); open = b; };

    if (!line) { open = null; continue; }
    const cur = open as MdBlock | null;

    if ((m = line.match(/^(#{2,3})\s+(.*)$/))) {
      push({ kind: m[1].length === 2 ? 'h2' : 'h3', text: m[2], id: slugify(m[2]) });
      open = null;
    } else if (/^-{3,}$/.test(line)) {
      push({ kind: 'hr' }); open = null;
    } else if ((m = line.match(/^@cartas:\s*(.*)$/))) {
      push({ kind: 'cards', names: m[1].split('|').map(s => s.trim()).filter(Boolean) }); open = null;
    } else if ((m = line.match(/^@giro:\s*(.*)$/))) {
      const [name, deg, before, after] = m[1].split('|').map(s => s.trim());
      push({ kind: 'rotate', name, degrees: Number(deg) || 90, before: before || undefined, after: after || undefined });
      open = null;
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      if (cur?.kind === 'note') cur.text += ' ' + m[1];
      else push({ kind: 'note', text: m[1] });
    } else if ((m = line.match(/^(-|\d+\.)\s+(.*)$/))) {
      const kind = m[1] === '-' ? 'ul' : 'ol';
      if (cur?.kind === kind) cur.items.push(m[2]);
      else push({ kind, items: [m[2]] });
    } else if (cur?.kind === 'p') {
      cur.lines.push(line);
    } else {
      push({ kind: 'p', lines: [line] });
    }
  }
  return blocks;
}
