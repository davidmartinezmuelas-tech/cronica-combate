import type { Line } from './bookImport';
import { BLOCK_FORMAT } from './scriptBlocks';
import { norm } from './util';

/**
 * Convierte el PDF de una aventura (con texto, en inglés o en español) en un guion en Markdown: títulos según el tamaño
 * de la letra, párrafos, listas, texto para leer en voz alta como cita y un bloque «encuentro» en cada sala o escena en la
 * que se nombran criaturas del bestiario con su cantidad («Eight Goblin Minions (G on the map)»). Las tiradas que lleva el
 * texto («3d6») se vuelven botones al leer el guion.
 */

export interface AdvMonster { id: string; n: string; en?: string }
export interface AdventureResult {
  title: string;
  text: string;
  encounters: { name: string; items: { n: string; qty: number }[] }[];
  /** Criaturas que el texto nombra pero no están en el bestiario. */
  unresolved: string[];
}

const NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const SMALL = new Set(['of', 'the', 'and', 'in', 'to', 'a', 'an', 'for', 'on', 'at', 'by', 'or', 'with', 'from', 'de', 'del', 'la', 'el', 'y']);

/** Arregla los espacios que deja la lectura del PDF alrededor de la puntuación. */
export function tidy(t: string): string {
  return t.replace(/[↑→↗]/g, ' ').replace(/\s+/g, ' ').replace(/ ([,.;:!?)\]”’])/g, '$1').replace(/([(\[“]) /g, '$1').replace(/(\p{L})- (\p{L})/gu, '$1-$2').trim();
}

/** Quita el asterisco que marca las criaturas con ficha en el apéndice («Lord Marrowgar ,* el primer…»). */
export const unstar = (t: string) => t.replace(/\s*([,.;]?)\*(?=[\s,.;)]|$)/g, '$1');

/** Títulos de apartado que no son una sala o escena (no dan nombre a un encuentro). */
const GENERIC = /^(Development|Treasure|Tactics|Talking|Fighting|Rewards?|Conclusion|Concluding the Encounter|Time to Rest|Preparation|Ceilings|Doors|Lighting|Continuing the Adventure|Adventure Background|Beginning the Adventure|Introduction|Credits|Key Plot Points|Enemies)$|Overview$|\bFeatures$|\bover Time$/i;

const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0);

type Item =
  | { k: 'h'; level: 1 | 2 | 3; text: string }
  | { k: 'p'; text: string; boxed: boolean; short: boolean };

/** Líneas -> títulos y párrafos (por tamaño de letra y separación entre líneas). */
function structure(input: Line[]): Item[] {
  // lo que se repite en muchas páginas (cabeceras y pies) y los pies de mapa no son texto
  const count = new Map<string, number>();
  for (const l of input) count.set(norm(l.t), (count.get(norm(l.t)) || 0) + 1);
  // una página de líneas cortas sin puntuación es un índice o unos créditos
  const perPage = new Map<number, Line[]>();
  for (const l of input) perPage.set(l.p || 0, [...(perPage.get(l.p || 0) || []), l]);
  const isToc = (p: number) => { const ls = perPage.get(p) || []; return ls.length >= 8 && ls.filter((l) => l.t.length < 42 && !/[.!?,;]$/.test(l.t)).length / ls.length > 0.85; };
  const lines = input.filter((l) => l.t.trim().length > 2 && !((count.get(norm(l.t)) || 0) >= 4 && l.t.length < 60) && !/^MAP \d+\s*:/i.test(l.t.trim()) && !/^\d{1,3}$/.test(l.t.trim()) && !isToc(l.p || 0));
  // tamaño del texto corrido: el más frecuente (por letras)
  const bySize = new Map<number, number>();
  for (const l of lines) if (l.sz) { const k = Math.round(l.sz * 2) / 2; bySize.set(k, (bySize.get(k) || 0) + l.t.length); }
  const body = [...bySize].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
  const ratio = (l: Line) => (body && l.sz ? l.sz / body : 1);

  const items: Item[] = [];
  let para: { lines: Line[]; boxed: boolean } | null = null;
  const maxLen = new Map<number, number>();
  for (const l of lines) if (ratio(l) < 1.25) maxLen.set(l.p || 0, Math.max(maxLen.get(l.p || 0) || 0, l.t.length));
  const gaps = lines.slice(1).map((l, i) => (l.p === lines[i].p ? lines[i].y - l.y : 0)).filter((g) => g > 0 && g < 40);
  const gap = median(gaps) || 12;

  const endPara = () => {
    if (para) {
      const text = tidy(para.lines.map((x) => x.t).join(' '));
      if (text) items.push({ k: 'p', text, boxed: para.boxed, short: para.lines.length === 1 && text.length <= 90 });
    }
    para = null;
  };
  let prev: Line | null = null;
  for (const l of lines) {
    const r = ratio(l);
    if (body && r >= 1.25 && l.t.length <= 90) {
      endPara();
      const level: 1 | 2 | 3 = r >= 2.6 ? 1 : r >= 1.6 ? 2 : 3;
      const last = items[items.length - 1];
      // un título largo en dos líneas
      if (last?.k === 'h' && last.level === level && prev && prev.p === l.p && prev.sz === l.sz && prev.y - l.y < (l.sz || 10) * 1.8) last.text = tidy(last.text + ' ' + l.t);
      else items.push({ k: 'h', level, text: tidy(l.t) });
      prev = l;
      continue;
    }
    const boxed = r > 1.04 && r < 1.25;
    if (para) {
      const p0: Line = para.lines[para.lines.length - 1];
      const ends = /[.!?:”"]$/.test(p0.t.trim());
      const cap = maxLen.get(p0.p || 0) || 80;
      const sameBox = para.boxed === boxed;
      const bigGap = p0.p === l.p && p0.y - l.y > gap * 1.5;
      const shortEnd = p0.t.length < cap * 0.5 || (ends && p0.t.length < cap * 0.72) || p0.t.trim().endsWith(":");
      if (!sameBox || bigGap || shortEnd) endPara();
    }
    if (!para) para = { lines: [], boxed };
    para.lines.push(l);
    prev = l;
  }
  endPara();
  return items;
}

const TITLE_WORD = /^[A-ZÁÉÍÓÚÑ0-9][\p{L}\d’'()-]*$/u;
const LEAD = /^((?:[\p{Lu}\d][\p{L}\d’'()-]*)(?:\s+(?:[\p{Lu}\d][\p{L}\d’'()-]*|of|the|and|in|to|a|an|for|on|or|de|del|la|el|y))*)(:\s+[\p{Lu}][\p{L}’' -]{1,40})?\.\s+(?=\S)/u;

/** «Throw Bomb. Choose a point…» -> «**Throw Bomb.** Choose a point…». */
function boldLead(text: string): string {
  const m = LEAD.exec(text);
  if (!m) return text;
  const name = m[1] + (m[2] || '');
  const ok = (part: string) => part.split(/\s+/).filter(Boolean).every((w, i) => TITLE_WORD.test(w) || (i > 0 && SMALL.has(w.toLowerCase())));
  if (name.split(/\s+/).length > 7 || name.length > 48 || !ok(m[1]) || (m[2] && !ok(m[2].slice(1)))) return text;
  // «Hit: 15 (…)» o una frase corriente («Sneed remains in his machine.») no son nombres de apartado
  if (/^(Hit|Failure|Success)\b/.test(name)) return text;
  return '**' + name + '.** ' + text.slice(m[0].length);
}

const SINGULAR = (w: string) => w.replace(/ies$/i, 'y').replace(/(ches|shes|sses|xes)$/i, (x) => x.slice(0, -2)).replace(/ves$/i, 'f').replace(/men$/i, 'man').replace(/s$/i, '');

/**
 * Criaturas con cantidad que nombra un párrafo: marcadas en el mapa («Eight Goblin Minions (G on the map)») o con un
 * asterisco de ficha del apéndice («two Val’kyr Heralds *», «Lord Marrowgar,*»).
 */
export function creaturesIn(text: string): { name: string; qty: number }[] {
  const out: { name: string; qty: number }[] = [];
  const NAME = /(\p{Lu}[\p{L}’'-]*(?:\s+(?:(?:of|the|and|de|del|la|el|y)\s+)*\p{Lu}[\p{L}’'-]*){0,5})/u.source;
  const res = [
    new RegExp(NAME + /\s*\(\s*[A-Z0-9]{1,2}(?:\s+on the map|\s+en el mapa)?\s*\)/.source, 'gu'),
    new RegExp(NAME + /\s*[,.;:]?\s*\*/.source, 'gu'),
  ];
  for (const re of res) {
    for (const m of text.matchAll(re)) {
      let words = m[1].split(/\s+/);
      let qty = 1;
      // cantidad en letras o cifras: pegada al nombre («Eight Goblin Minions») o delante («four Bandits», «Two of The Damned»)
      if (NUMBERS[words[0].toLowerCase()] && words.length > 1) { qty = NUMBERS[words[0].toLowerCase()]; words = words.slice(1); }
      else {
        const before = /(\p{L}+|\d+)\s+(?:of\s+)?$/u.exec(text.slice(0, m.index!));
        const q = before ? (/^\d+$/.test(before[1]) ? parseInt(before[1], 10) : NUMBERS[before[1].toLowerCase()]) : 0;
        if (q && !/^(a|an)$/i.test(before![1])) qty = q;
      }
      if (words[0].toLowerCase() === 'of') words = words.slice(1);
      if (words.length && !out.some((o) => norm(o.name) === norm(words.join(' ')))) out.push({ name: words.join(' '), qty });
    }
  }
  return out;
}

/** Texto del bloque «encuentro» (el mismo formato que escribe el formulario de «Añadir encuentro»). */
export const encounterBlockText = (name: string, items: { n: string; qty: number }[]) =>
  ['```encuentro', 'formato: ' + BLOCK_FORMAT, 'nombre: ' + name.trim(), 'guarida: no', ...items.map((r) => '- ' + r.qty + ' x ' + r.n), '```'].join('\n');

/** Guion en Markdown de las líneas de una aventura (una columna, con el tamaño de letra de cada línea). */
export function adventureToMarkdown(lines: Line[], monsters: AdvMonster[], fallbackTitle = 'Aventura'): AdventureResult {
  const items = structure(lines);
  const byName = new Map<string, AdvMonster>();
  for (const m of monsters) { byName.set(norm(m.n), m); if (m.en) byName.set(norm(m.en), m); }
  const find = (name: string): AdvMonster | undefined => {
    const words = name.split(/\s+/);
    // el nombre entero, en singular, y quitando palabras de delante («Defias Bandits» -> «Bandit»)
    for (let i = 0; i < words.length; i++) {
      const cand = words.slice(i).join(' ');
      const hit = byName.get(norm(cand)) || byName.get(norm(SINGULAR(cand)));
      if (hit) return hit;
    }
    return undefined;
  };

  // la sala o escena a la que pertenece cada párrafo: el último título de nivel 1 o 2
  let room2 = '', room3 = '';
  const encs = new Map<string, Map<string, { m: AdvMonster; qty: number }>>();
  const firstAt = new Map<string, number>();
  const unresolved: string[] = [];
  items.forEach((it, i) => {
    if (it.k === 'h') {
      if (GENERIC.test(it.text)) return;
      // una sala con clave («L3: The Spire», «Area 2: …») gana a un apartado menor; un título mayor reinicia
      if (it.level <= 2) { room2 = it.text; room3 = ''; } else if (it.level === 3 && /^(?:[A-Z]{1,3}\d{0,2}|Area \d+)\s*:/.test(it.text)) room3 = it.text;
      return;
    }
    const room = room3 || room2;
    if (it.boxed || !room) return;
    for (const c of creaturesIn(it.text)) {
      const m = find(c.name);
      if (!m) { if (!unresolved.some((u) => norm(u) === norm(c.name))) unresolved.push(c.name); continue; }
      const map = encs.get(room) || new Map();
      map.set(m.id, { m, qty: (map.get(m.id)?.qty || 0) + c.qty });
      encs.set(room, map);
      if (!firstAt.has(room)) firstAt.set(room, i);
    }
  });

  const used = new Set<string>();
  const encounters: AdventureResult['encounters'] = [];
  const blockAfter = new Map<number, string>();
  for (const [name, map] of encs) {
    let nm = name, k = 2;
    while (used.has(norm(nm))) nm = name + ' (' + k++ + ')';
    used.add(norm(nm));
    const rows = [...map.values()].map((v) => ({ n: v.m.n, qty: v.qty }));
    encounters.push({ name: nm, items: rows });
    blockAfter.set(firstAt.get(name)!, encounterBlockText(nm, rows));
  }

  const out: string[] = [];
  const first = items.find((x) => x.k === 'h');
  const title = first && first.k === 'h' ? first.text : fallbackTitle;
  let afterColon = false;
  let inList = false;
  items.forEach((it, i) => {
    if (it.k === 'h') {
      inList = false; afterColon = false;
      out.push('#'.repeat(it.level) + ' ' + it.text);
      return;
    }
    const T = unstar(it.text);
    const startsList = it.short && !/[.!?]$/.test(T) && (afterColon || inList);
    if (it.boxed) { inList = false; out.push(T.split('\n').map((l) => '> ' + l).join('\n')); }
    else if (startsList) { inList = true; out.push('- ' + T); }
    else {
      inList = false;
      // una línea sola, corta y sin punto es un subtítulo (Talking, Tactics…)
      const sub = it.short && T.length <= 45 && !/[.!?,;:)]$/.test(T) && /^\p{Lu}/u.test(T) && T.split(' ').length <= 6 && items[i + 1]?.k === 'p';
      out.push(sub ? '**' + T + '**' : boldLead(T));
    }
    afterColon = /:$/.test(T) || /\bfollowing\b[^.]*$/.test(T) && !/[.]$/.test(T);
    const block = blockAfter.get(i);
    if (block) out.push(block);
  });
  // listas: sus viñetas van pegadas
  const text = out.join('\n\n').replace(/(?<=\n- [^\n]*)\n\n(?=- )/g, '\n') + '\n';
  return { title, text, encounters, unresolved };
}
