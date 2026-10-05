import { norm } from './util';

/** Una entrada de Reglas: glosario, estado, sección de un capítulo o conjuro. */
export interface RuleEntry {
  id: string;
  n: string; // nombre en español
  en: string; // nombre en inglés (también se puede buscar)
  cat: string;
  al?: string[]; // otros nombres (de la app, de 2014, abreviaturas)
  t: string; // texto en marcado ligero
  // conjuros
  l?: number;
  esc?: string;
  ct?: string;
  r?: string;
  du?: string;
  c?: number;
  rit?: number;
  cmp?: string;
}

export interface RulesData {
  v: number;
  src: string;
  e: RuleEntry[];
}

export type Inline = { k: 't'; s: string } | { k: 'b'; c: Inline[] } | { k: 'i'; c: Inline[] } | { k: 'a'; id: string; s: string };
export type Block =
  | { k: 'p'; c: Inline[] }
  | { k: 'h'; s: string }
  | { k: 'ul'; items: Inline[][] }
  | { k: 'table'; head: Inline[][] | null; rows: Inline[][][] };

/** Texto con **negrita**, *cursiva* y enlaces [[id|texto]] (sin HTML: se pinta con React). */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\[\[([^\]|]+)\|([^\]]+)\]\]|\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ k: 't', s: s.slice(last, m.index) });
    if (m[1]) out.push({ k: 'a', id: m[1], s: m[2] });
    else if (m[3] != null) out.push({ k: 'b', c: parseInline(m[3]) });
    else out.push({ k: 'i', c: parseInline(m[4]) });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ k: 't', s: s.slice(last) });
  return out;
}

// la barra de los enlaces [[id|texto]] no separa celdas: se protege antes de partir la fila
const LINK_BAR = '\u0000';
const cells = (line: string) => line
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '[[$1' + LINK_BAR + '$2]]')
  .replace(/^\|#?\s*/, '').replace(/\s*\|\s*$/, '')
  .split(/\s*\|\s*/)
  .map((c) => parseInline(c.split(LINK_BAR).join('|')));

/** Párrafos separados por línea en blanco; "### " título; "- " lista; "| a | b |" tabla ("|#" = cabecera). */
export function parseMarkup(t: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of t.split(/\n{2,}/)) {
    const lines = chunk.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.every((l) => l.startsWith('- '))) { blocks.push({ k: 'ul', items: lines.map((l) => parseInline(l.slice(2))) }); continue; }
    if (lines.some((l) => l.startsWith('|'))) {
      let i = 0;
      while (i < lines.length && lines[i].startsWith('### ')) blocks.push({ k: 'h', s: lines[i++].slice(4) });
      const rest = lines.slice(i);
      const head = rest[0]?.startsWith('|#') ? cells(rest[0]) : null;
      blocks.push({ k: 'table', head, rows: rest.slice(head ? 1 : 0).map(cells) });
      continue;
    }
    for (const l of lines) {
      if (l.startsWith('### ')) blocks.push({ k: 'h', s: l.slice(4) });
      else blocks.push({ k: 'p', c: parseInline(l) });
    }
  }
  return blocks;
}

/** Texto plano (para buscar dentro de la descripción). */
export const plain = (t: string) => t.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1').replace(/[*|#]/g, ' ');

const indexCache = new WeakMap<RuleEntry[], { e: RuleEntry; names: string[]; body: string }[]>();
function indexOf(entries: RuleEntry[]) {
  let idx = indexCache.get(entries);
  if (!idx) { idx = entries.map((e) => ({ e, names: [e.n, e.en, ...(e.al || [])].filter(Boolean).map(norm), body: norm(plain(e.t)) })); indexCache.set(entries, idx); }
  return idx;
}

/**
 * Busca por nombre en español o en inglés y, si hace falta, dentro del texto.
 * Orden: nombre exacto, empieza por, alguna palabra empieza por, contiene, y por último el texto.
 */
export function searchRules(entries: RuleEntry[], q: string, cat = ''): RuleEntry[] {
  const query = norm(q);
  const pool = indexOf(entries).filter((x) => !cat || x.e.cat === cat);
  if (!query) return pool.map((x) => x.e).sort((a, b) => a.n.localeCompare(b.n, 'es'));
  const words = (s: string) => s.split(/[\s\-/(),.]+/);
  const score = (x: (typeof pool)[number]) => {
    let best = 0;
    for (const s of x.names) {
      if (s === query) best = Math.max(best, 100);
      else if (s.startsWith(query)) best = Math.max(best, 80);
      else if (words(s).some((w) => w.startsWith(query))) best = Math.max(best, 60);
      else if (s.includes(query)) best = Math.max(best, 40);
    }
    if (!best && query.length >= 3 && x.body.includes(query)) best = 10;
    // a igualdad, primero estados y glosario, que son las definiciones
    return best ? best + (x.e.cat === 'Estados' ? 3 : x.e.cat === 'Glosario' ? 2 : x.e.cat === 'Conjuros' ? 0 : 1) : 0;
  };
  return pool
    .map((x) => ({ e: x.e, s: score(x) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.n.localeCompare(b.e.n, 'es'))
    .map((x) => x.e);
}

/** Busca una entrada por su nombre (español o inglés), p. ej. para abrir la regla de un estado. */
export function findRule(entries: RuleEntry[], name: string, cat?: string): RuleEntry | undefined {
  const q = norm(name);
  return entries.find((e) => (!cat || e.cat === cat) && [e.n, e.en, ...(e.al || [])].some((s) => norm(s) === q));
}
