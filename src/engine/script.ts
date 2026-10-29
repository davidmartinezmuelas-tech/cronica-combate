import type { Encounter } from '../data/types';
import { DMG_TYPES } from '../data/constants';

export type ScriptPart = { t: 'text'; text: string } | { t: 'enc'; text: string; id: string };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MIN_NAME = 3;

/**
 * Parte el texto del guion en trozos: los que nombran un encuentro guardado (sin importar mayúsculas) salen aparte
 * para poder ser un enlace al combate. Gana el nombre más largo si uno contiene a otro.
 */
export function linkEncounters(text: string, encounters: Pick<Encounter, 'id' | 'name'>[]): ScriptPart[] {
  const names = encounters.filter((e) => e.name.trim().length >= MIN_NAME).sort((a, b) => b.name.length - a.name.length);
  if (!names.length || !text) return [{ t: 'text', text }];
  const re = new RegExp('(?<![\\p{L}\\p{N}])(' + names.map((e) => esc(e.name.trim())).join('|') + ')(?![\\p{L}\\p{N}])', 'giu');
  const out: ScriptPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const enc = names.find((e) => e.name.trim().toLowerCase() === m[0].toLowerCase());
    if (!enc) continue;
    if (m.index! > last) out.push({ t: 'text', text: text.slice(last, m.index) });
    out.push({ t: 'enc', text: m[0], id: enc.id });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) });
  return out;
}

export const MAX_SCRIPT_BYTES = 1_000_000;

/** Lee un archivo de texto (.txt o .md) y devuelve su título y contenido. */
export async function readScriptFile(file: File): Promise<{ ok: true; title: string; text: string } | { ok: false; message: string }> {
  if (!/\.(txt|md|markdown|text)$/i.test(file.name) && !file.type.startsWith('text/')) return { ok: false, message: 'Solo se pueden subir archivos de texto (.txt o .md). Si es un Word, copia el texto y pégalo en un guion nuevo.' };
  if (file.size > MAX_SCRIPT_BYTES) return { ok: false, message: 'El archivo pesa demasiado para un guion (máximo 1 MB).' };
  const text = (await file.text()).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return { ok: true, title: file.name.replace(/\.[^.]+$/, ''), text };
}

// ---- Markdown de la lectura (sin librerías: lo que se usa en un guion) ----

export interface Inline { text: string; b?: boolean; i?: boolean; code?: boolean }
export type Block =
  | { t: 'h'; level: 1 | 2 | 3; inl: Inline[] }
  | { t: 'p'; inl: Inline[] }
  | { t: 'quote'; inl: Inline[] }
  | { t: 'list'; ordered: boolean; items: { depth: number; inl: Inline[] }[] }
  | { t: 'code'; text: string; lang?: string }
  | { t: 'hr' };

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\s][^*\n]*?\*|(?<![\p{L}\p{N}_])_[^_\s][^_\n]*?_(?![\p{L}\p{N}_]))/gu;

/** Negritas, cursivas y código en línea. Lo que no cierra se deja tal cual. */
export function parseInline(src: string, base: Pick<Inline, 'b' | 'i'> = {}): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE)) {
    if (m.index! > last) out.push({ text: src.slice(last, m.index), ...base });
    const tok = m[0];
    if (tok.startsWith('`')) out.push({ text: tok.slice(1, -1), code: true });
    else if (tok.startsWith('**') || tok.startsWith('__')) out.push(...parseInline(tok.slice(2, -2), { ...base, b: true }));
    else out.push(...parseInline(tok.slice(1, -1), { ...base, i: true }));
    last = m.index! + tok.length;
  }
  if (last < src.length) out.push({ text: src.slice(last), ...base });
  return out;
}

/** Bloques de un texto Markdown: títulos (#), listas (-, *, 1.), citas (>), líneas (---), código (```) y párrafos. */
export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ t: 'p', inl: parseInline(para.join('\n')) }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```(\w*)\s*$/.exec(line);
    if (fence) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      out.push({ t: 'code', text: code.join('\n'), ...(fence[1] ? { lang: fence[1].toLowerCase() } : {}) });
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (!line.trim()) flush();
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push({ t: 'hr' }); }
    else if (h) { flush(); out.push({ t: 'h', level: Math.min(3, h[1].length) as 1 | 2 | 3, inl: parseInline(h[2]) }); }
    else if (li) {
      flush();
      const ordered = /\d/.test(li[2]);
      const item = { depth: Math.min(4, Math.floor(li[1].replace(/\t/g, '  ').length / 2)), inl: parseInline(li[3]) };
      const prev = out[out.length - 1];
      if (prev?.t === 'list' && prev.ordered === ordered) prev.items.push(item);
      else out.push({ t: 'list', ordered, items: [item] });
    } else if (q) {
      flush();
      const prev = out[out.length - 1];
      if (prev?.t === 'quote') prev.inl.push({ text: '\n' }, ...parseInline(q[1]));
      else out.push({ t: 'quote', inl: parseInline(q[1]) });
    } else para.push(line);
  }
  flush();
  return out;
}

// ---- Tiradas en el texto: «2d10 fuego», «1d20+5»… son botones para tirar en la mesa ----

export type DiceKind = 'check' | 'damage' | 'free';
export type DicePart = { t: 'text'; text: string } | { t: 'dice'; text: string; expr: string; kind: DiceKind; type?: string };

const TERM = '(?:\\d*d(?:100|20|12|10|8|6|4)|\\d+)';
const DICE = new RegExp('(?<![\\p{L}\\p{N}])((?:\\d*d(?:100|20|12|10|8|6|4))(?:\\s?[+\\-−]\\s?' + TERM + ')*)(?![\\p{L}\\p{N}])', 'giu');
const TYPES = [...DMG_TYPES].sort((a, b) => b.length - a.length);
// «2d10 de fuego», «2d10 fuego», «2d10 de daño de fuego», «2d10 de daño»
const AFTER = new RegExp('^(\\s+(?:de\\s+)?(?:daño(?:\\s+de)?\\s+)?(' + TYPES.join('|') + ')(?![\\p{L}]))|^(\\s+(?:de\\s+)?daño(?![\\p{L}]))', 'iu');

/**
 * Busca tiradas en un texto. Con un tipo de daño detrás («2d10 fuego») o «daño», se tira como daño (para aplicarlo a los
 * combatientes); un solo d20 es una prueba; el resto, una tirada libre («1d6 goblins»).
 */
export function findDice(text: string): DicePart[] {
  const out: DicePart[] = [];
  let last = 0;
  for (const m of text.matchAll(DICE)) {
    const expr = m[1].replace(/\s+/g, '').replace(/−/g, '-').toLowerCase();
    const end = m.index! + m[0].length;
    const after = AFTER.exec(text.slice(end));
    const type = after?.[2]?.toLowerCase();
    const isDmg = !!after;
    const kind: DiceKind = isDmg ? 'damage' : /^1?d20(?![0-9])/.test(expr) ? 'check' : 'free';
    if (m.index! > last) out.push({ t: 'text', text: text.slice(last, m.index) });
    const len = end + (after ? after[0].length : 0);
    out.push({ t: 'dice', text: text.slice(m.index!, len), expr, kind, ...(type ? { type } : {}) });
    last = len;
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) });
  return out;
}
