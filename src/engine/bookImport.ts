import type { Abil, ClassData, Uses } from '../data/player';
import type { CastingRule, HbFx } from './homebrew';
import type { SpellRoll } from './spellRoll';
import type { OwnSelfFx } from './spellEffects';
import { norm } from './util';

/**
 * Importa dotes, trasfondos y conjuros desde el PDF del Manual del Jugador 2024 en español que tenga el usuario.
 * Se ejecuta en su navegador y el resultado se guarda solo en su dispositivo (biblioteca propia): la app no
 * incluye ni publica ese contenido. Funciona con texto reconocido por OCR: reconstruye las líneas por columna y
 * se guía por los títulos en mayúsculas y por las líneas que los siguen («Dote general (requisitos: …)»,
 * «Evocación de nivel 3 (hechicero, mago)», «Puntuaciones de característica: …»).
 */

export interface TextItem { str: string; x: number; y: number; w?: number }
/** `p`: página del libro (1, 2…), cuando se sabe. */
export interface Line { t: string; col: number; y: number; p?: number }

export interface LibFeat { id: string; n: string; cat: 'origin' | 'general' | 'fighting-style' | 'epic-boon'; req: string; d: string; guest?: boolean }
export interface LibBackground { id: string; n: string; abil: Abil[]; skills: string[]; tool: string; feat: string; equip: string; d: string; guest?: boolean }
/** Conjuro de la biblioteca: del libro del usuario o propio (own: escrito en «Mis creaciones», con sus tiradas en `sr` y un estado si falla la salvación). */
export interface LibSpell { id: string; n: string; l: number; esc: string; classes: string[]; ct: string; r: string; cmp: string; du: string; c: number; rit: number; t: string; own?: boolean; sr?: SpellRoll; cond?: string; self?: OwnSelfFx; at?: number; guest?: boolean }
/** `x`: apartados de opciones que van tras los rasgos («Opciones de maniobras»). */
/** Rasgo de una clase de la biblioteca: como los del SRD, con efecto con tirada, conjuros siempre preparados y (en el editor) el texto de su tabla de usos. */
export type LibClassFeature = ClassData['f'][number] & { t?: string };

/**
 * Clase de la biblioteca: con la forma de las del SRD (dado, competencias, tablas por nivel, rasgos y conjuros); propia o
 * importada. `listFrom`: clase de cuya lista de conjuros toma la suya; `subLv`: nivel en que se elige la subclase.
 */
export interface LibClass extends Omit<ClassData, 'f'> { f: LibClassFeature[]; own?: boolean; at?: number; guest?: boolean }

/** Subclase de la biblioteca: importada del libro del usuario o propia (own: escrita a mano en «Mis creaciones», con sus usos). */
export interface LibSubclass { id: string; n: string; cls: string; d: string; f: { lv: number; n: string; d: string; u?: Uses; fx?: HbFx; sp?: string[] }[]; x?: { n: string; d: string }[]; own?: boolean; at?: number; guest?: boolean; casting?: CastingRule }

/** Líneas de una página en orden de lectura: primero la columna izquierda de arriba abajo, luego la derecha. */
export function pageLines(items: TextItem[], width: number): Line[] {
  const rows: { col: number; y: number; parts: { x: number; s: string }[] }[] = [];
  // dónde empieza la columna derecha en esta página: la posición en la que arrancan más líneas pasada la mitad
  // (varía entre páginas pares e impares, y las líneas largas de la izquierda pueden cruzar la mitad)
  const starts = new Map<number, number>();
  for (const it of items) if (it.str.trim() && it.x > width * 0.45) { const b = Math.round(it.x / 6) * 6; starts.set(b, (starts.get(b) || 0) + 1); }
  // la más a la izquierda de las posiciones frecuentes (las sangrías de párrafo quedan algo más a la derecha)
  const best = [...starts].filter(([, n]) => n >= 3).sort((a, b) => a[0] - b[0])[0];
  const rightStart = best ? best[0] - 8 : width * 0.47;
  for (const it of items) {
    const s = it.str.replace(/\s+/g, ' ');
    // restos del escaneo en el margen («|», «•»): no son texto
    if (!s.trim() || /^[|•·¦]+$/.test(s.trim())) continue;
    // una palabra que pasa del corte pero va pegada a texto de la izquierda en la misma línea es de la izquierda
    const glued = it.x >= rightStart && items.some((o) => o !== it && o.x < rightStart && Math.abs(o.y - it.y) <= 5 && o.w != null && o.str.trim() !== '' && o.x + o.w >= it.x - 10);
    const col = it.x < rightStart || glued ? 0 : 1;
    let row = rows.find((r) => r.col === col && Math.abs(r.y - it.y) <= 5);
    if (!row) { row = { col, y: it.y, parts: [] }; rows.push(row); }
    row.parts.push({ x: it.x, s });
  }
  return rows
    .map((r) => ({ col: r.col, y: r.y, t: r.parts.sort((a, b) => a.x - b.x).map((p) => p.s.trim()).join(' ').replace(/\s+/g, ' ').trim() }))
    // fuera números de página, cabeceras de capítulo y letras sueltas del OCR
    .filter((l) => l.t.replace(/[^\p{L}\d]/gu, '').length > 2 && !/^\d{1,3}$/.test(l.t) && !/CAP[IÍ]TULO\s*\d+\s*\|/i.test(l.t) && !/^CAP[IÍ]TULO\b/.test(l.t))
    .sort((a, b) => a.col - b.col || b.y - a.y);
}

/** ¿Es un título en mayúsculas (nombre de dote, trasfondo o conjuro)? */
export function isCaps(t: string): boolean {
  const letters = t.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  if (letters.length < 3) return false;
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '').length;
  return upper / letters.length > 0.85;
}

/**
 * Título de una entrada: en mayúsculas o, si el OCR ha estropeado las mayúsculas («HEroÍSMO», «Deseo»), una línea
 * corta sin puntuación final. Solo se usa cuando la línea siguiente confirma que es una dote o un conjuro.
 */
export function isTitle(t: string): boolean {
  if (isCaps(t)) return true;
  return t.length <= 40 && /^[A-ZÁÉÍÓÚÑ]/.test(t) && !/[.,:;)]$/.test(t) && t.split(' ').length <= 6;
}

/** Nombres propios que aparecen en los nombres de conjuros y dotes (se escriben con mayúscula). */
const PROPER = ['Agathys', 'Nystul', 'Otto', 'Hadar', 'Tasha', 'Bigby', 'Mordenkainen', 'Leomund', 'Melf', 'Evard', 'Drawmij', 'Rary', 'Tenser', 'Otiluke', 'Snilloc', 'Abi-Dalzim', 'Maximilian', 'Aganazzar', 'Tzimisce', 'Jim', 'Zhudun'];

/** «BOLA DE FUEGO» -> «Bola de fuego»; «ARMADURA DE AGATHYS» -> «Armadura de Agathys». */
export function titleCase(t: string): string {
  return sentenceCase(t).replace(/\p{L}[\p{L}-]*/gu, (w) => PROPER.find((p) => p.toLowerCase() === w.toLowerCase()) || w);
}

function sentenceCase(t: string): string {
  const low = t.toLowerCase().replace(/["“”«»]/g, '').replace(/\s+/g, ' ').trim();
  return low.charAt(0).toUpperCase() + low.slice(1);
}

/** Junta líneas en párrafos: las que empiezan con «Algo.» en negrita o tras una línea corta abren párrafo nuevo. */
function paragraphs(lines: string[]): string {
  const out: string[] = [];
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    const newPara = !out.length || /^[A-ZÁÉÍÓÚÑ][^.]{2,40}\.\s/.test(t) && /[.:]$/.test(out[out.length - 1]);
    if (newPara) out.push(t);
    else out[out.length - 1] = (out[out.length - 1] + ' ' + t).replace(/(\p{L})- (\p{L})/gu, '$1$2');
  }
  return fixOcr(fixDice(out.join('\n\n')));
}

/**
 * Otros fallos frecuentes del OCR en el texto corrido: un cero leído como «O» («velocidad de O»), la «o» de una frase
 * escrita «O», «9 mo menos» por «9 m o menos», una letra suelta que es el icono de la lista y algún despiste suelto.
 */
export function fixOcr(text: string): string {
  return text
    // «O» mayúscula como cero tras «a», «de» o «ser/será/sea» cuando acaba la frase o sigue «hasta», «para», «o»…
    .replace(/(?<=\b(?:a|de|ser|será|sea) )O(?= (?:hasta|para|o|antes|si|y|al|en|durante|cuando)\b|[.,;])/g, '0')
    // «O» entre palabras en minúscula: la conjunción
    .replace(/(?<=[a-záéíóúñ] )O(?= [a-záéíóúñ])/g, 'o')
    // «9 mo menos» por «9 m o menos» y «3'm» por «3 m»
    .replace(/(\d) mo\b/g, '$1 m o')
    .replace(/(\d)'m\b/g, '$1 m')
    // una «l» o una «I» sueltas entre palabras: el icono de la lista que el OCR deja en medio del texto
    .replace(/(?<=[a-záéíóúñ:] )[lI] (?=[a-záéíóúñ])/g, '')
    .replace(/\bel 4(20|10|12)\b/g, 'el d$1')
    .replace(/\bAdgquieres\b/g, 'Adquieres')
    .replace(/\bde la (\d) puntos\b/g, 'de 1 a $1 puntos');
}

/**
 * Dados mal leídos por el OCR: «dl0» por «d10» (el 1 como una l) y «1420» por «1d20» (la d como un 4: «1410», «1412»,
 * «2420»). Solo con dados de dos cifras o más, para no tocar números sueltos de tres cifras («146»), ni precios.
 */
export function fixDice(text: string): string {
  return text
    .replace(/(?<![a-z])d[lI]([0-9O])\b/g, (_, x: string) => 'd1' + (x === 'O' ? '0' : x))
    .replace(/(?<![\d.,])([1-9])4(10|12|20|100)(?!\d|\s*(?:po|pp|pe|pc|pt)\b)/g, '$1d$2');
}

const id = (prefix: string, n: string) => prefix + '-' + norm(n).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const FEAT_CAT: [RegExp, LibFeat['cat']][] = [
  [/^Dote de origen/i, 'origin'], [/^Dote general/i, 'general'], [/^Dote de estilo de combate/i, 'fighting-style'], [/^Dote de don [ée]pico/i, 'epic-boon'],
];

/** Dotes: título en mayúsculas seguido de «Dote … (requisitos: …)». */
export function parseFeats(lines: Line[]): LibFeat[] {
  const out: LibFeat[] = [];
  let cur: { f: LibFeat; body: string[] } | null = null;
  const flush = () => { if (cur) { cur.f.d = paragraphs(cur.body); out.push(cur.f); } cur = null; };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].t;
    const next = lines[i + 1]?.t || '';
    const cat = FEAT_CAT.find(([re]) => re.test(next));
    if (isTitle(t) && cat) {
      flush();
      // los requisitos pueden seguir en las líneas siguientes hasta cerrar el paréntesis
      let reqText = next;
      let j = i + 1;
      while (reqText.includes('(') && !reqText.includes(')') && j + 1 < lines.length) { j++; reqText += ' ' + lines[j].t; }
      const req = /\((?:requisitos?|prerrequisitos?):?\s*([^)]*)\)/i.exec(reqText)?.[1].replace(/\s+/g, ' ').replace(/omás/g, 'o más').trim() || '';
      cur = { f: { id: id('lib-dote', t), n: titleCase(t), cat: cat[1], req, d: '' }, body: [] };
      i = j;
      continue;
    }
    if (cur && !isCaps(t)) cur.body.push(t);
  }
  flush();
  return dedupe(out);
}

const ABIL_ES: Record<string, Abil> = { fuerza: 'str', destreza: 'dex', constitucion: 'con', inteligencia: 'int', sabiduria: 'wis', carisma: 'cha' };
const SKILL_ES: Record<string, string> = {
  acrobacias: 'acr', 'trato con animales': 'ani', 'conocimiento arcano': 'arc', 'c. arcano': 'arc', arcanos: 'arc', atletismo: 'ath', engano: 'dec', historia: 'his',
  perspicacia: 'ins', intimidacion: 'itm', investigacion: 'inv', medicina: 'med', naturaleza: 'nat', percepcion: 'prc', interpretacion: 'prf',
  persuasion: 'per', religion: 'rel', 'juego de manos': 'slt', sigilo: 'ste', supervivencia: 'sur',
};
const FIELD = /^(Puntuaciones de caracter[ií]stica|Dote|Competencias? en habilidades|Competencias? con herramientas|Equipo)\s*:\s*(.*)$/i;

/** Trasfondos: título en mayúsculas y los campos «Puntuaciones de característica:», «Dote:», «Competencias…», «Equipo:». */
export function parseBackgrounds(lines: Line[]): LibBackground[] {
  const out: LibBackground[] = [];
  const raws: Line[][] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^Puntuaciones de caracter[ií]stica\s*:/i.test(lines[i].t)) continue;
    // el nombre: el título en mayúsculas justo encima (a veces el OCR no lo lee: se deduce después por el orden)
    let h = i - 1;
    while (h >= 0 && !isCaps(lines[h].t) && i - h < 3) h--;
    const titled = h >= 0 && isCaps(lines[h].t);
    const fields: Record<string, string> = {};
    let key = '';
    const desc: string[] = [];
    const descL: Line[] = [];
    let j = i;
    for (; j < lines.length; j++) {
      const t = lines[j].t;
      if (j > i && /^Puntuaciones de caracter[ií]stica\s*:/i.test(t)) break;
      if (j > i && isCaps(t) && /^Puntuaciones de caracter/i.test(lines[j + 1]?.t || '')) break;
      const m = FIELD.exec(t);
      if (m) { key = norm(m[1]).split(' ')[0]; fields[key] = m[2]; continue; }
      if (isCaps(t)) { key = 'x'; continue; }
      if (key && key !== 'x' && key !== 'equipo' && fields[key] != null) fields[key] += ' ' + t;
      // el equipo termina en «… o (B) 50 po»: lo que sigue ya es la descripción
      else if (key === 'equipo' && !/\b\d+\s*po\.?\s*$/i.test(fields.equipo) && fields.equipo.length < 400) fields.equipo += ' ' + t;
      // restos de la ilustración del encabezado leídos como letras sueltas («/ RAR «Ss»): sin ninguna palabra
      else if (!/\p{Ll}{3,}/u.test(t)) key = 'x';
      else { key = 'x'; desc.push(t); descL.push(lines[j]); }
    }
    const abilTxt = norm(fields.puntuaciones || '');
    const abil = Object.entries(ABIL_ES).filter(([es]) => abilTxt.includes(es)).map(([, k]) => k);
    const skillTxt = norm(fields.competencias || '');
    const skills = Object.entries(SKILL_ES).filter(([es]) => skillTxt.includes(es)).map(([, k]) => k).filter((k, n, a) => a.indexOf(k) === n);
    const feat = (fields.dote || '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
    const name = titled ? titleCase(lines[h].t) : '';
    out.push({ id: '', n: name, abil, skills, tool: (fields.competencia || fields.herramientas || '').trim(), feat, equip: (fields.equipo || '').trim().replace(/\(([ab])\)/g, (_, x: string) => '(' + x.toUpperCase() + ')'), d: paragraphs(desc) });
    raws.push(descL);
    i = j - 1;
  }
  splitBackgroundTexts(out, raws);
  nameBackgrounds(out);
  return dedupe(out.map((b) => ({ ...b, id: id('lib-trasfondo', b.n) })));
}

/**
 * El libro pone las fichas de dos trasfondos seguidas y después sus dos descripciones: todo el texto cae en el último.
 * Se reparte cortando por los finales de párrafo (línea que acaba en punto y es de las más cortas, seguida de mayúscula).
 */
function splitBackgroundTexts(list: LibBackground[], raws: Line[][]) {
  for (let m = 0; m < list.length; m++) {
    let k = m;
    while (k > 0 && !raws[k - 1].length) k--;
    const parts = m - k + 1;
    if (parts < 2 || !raws[m].length) continue;
    const L = raws[m].filter((x) => x.t.trim());
    const w = Math.max(...L.map((x) => x.t.length));
    // candidatos: la línea anterior acaba en punto y esta empieza en mayúscula
    const cands = L.map((x, n) => ({ n, gap: n ? (L[n - 1].col === x.col ? L[n - 1].y - x.y : 0) : 0, r: n ? L[n - 1].t.length / w : 1 }))
      .filter(({ n }) => n > 0 && /^[A-ZÁÉÍÓÚÑ¿¡]/.test(L[n].t.trim()));
    // la separación vertical entre párrafos manda; si no se distingue, la línea anterior más corta
    const typical = [...L.slice(1).map((x, n) => (L[n].col === x.col ? L[n].y - x.y : 0)).filter((g) => g > 0)].sort((a, b) => a - b)[Math.floor(L.length / 2)] || 0;
    const byGap = cands.filter((c) => typical && c.gap > typical * 1.25).sort((a, b) => b.gap - a.gap);
    const chosen = (byGap.length >= parts - 1 ? byGap : cands.filter(({ n }) => /[.!?»"]$/.test(L[n - 1].t.trim())).sort((a, b) => a.r - b.r)).slice(0, parts - 1).sort((a, b) => a.n - b.n);
    if (chosen.length < parts - 1) continue;
    const bounds = [0, ...chosen.map((c) => c.n), L.length];
    for (let q = 0; q < parts; q++) list[k + q].d = paragraphs(L.slice(bounds[q], bounds[q + 1]).map((x) => x.t));
  }
}

/** Los 16 trasfondos del Manual del Jugador 2024 en español, en el orden alfabético del libro (solo los nombres). */
const BACKGROUNDS_ES = ['Acólito', 'Animador', 'Artesano', 'Campesino', 'Charlatán', 'Comerciante', 'Criminal', 'Ermitaño', 'Erudito', 'Escriba', 'Guardia', 'Guía', 'Marinero', 'Noble', 'Soldado', 'Vagabundo'];

/**
 * Completa nombres cortados por el OCR («Comercian» -> «Comerciante») y deduce los que no se pudieron leer por su
 * posición: el libro los ordena alfabéticamente, así que un hueco entre «Animador» y «Campesino» es «Artesano».
 */
export function nameBackgrounds(list: { n: string }[]) {
  const idx = (n: string) => BACKGROUNDS_ES.findIndex((k) => norm(k) === norm(n) || (norm(n).length >= 5 && norm(k).startsWith(norm(n))));
  list.forEach((b) => { const k = idx(b.n); if (k >= 0) b.n = BACKGROUNDS_ES[k]; });
  list.forEach((b, i) => {
    if (b.n) return;
    const prev = [...list.slice(0, i)].reverse().find((x) => idx(x.n) >= 0);
    const next = list.slice(i + 1).find((x) => idx(x.n) >= 0);
    const from = prev ? idx(prev.n) + 1 : 0;
    const to = next ? idx(next.n) : BACKGROUNDS_ES.length;
    const used = new Set(list.map((x) => x.n));
    const gap = BACKGROUNDS_ES.slice(from, to).filter((n) => !used.has(n));
    // si entre los dos vecinos hay varios huecos, va en orden
    const unnamedBefore = list.slice(prev ? list.indexOf(prev) + 1 : 0, i).filter((x) => !x.n).length;
    b.n = gap[unnamedBefore] || 'Trasfondo sin nombre ' + (i + 1);
  });
}

// la traducción española dice «Ilusionismo» (no «Ilusión»)
const SCHOOLS = ['Abjuración', 'Adivinación', 'Conjuración', 'Encantamiento', 'Evocación', 'Ilusionismo', 'Ilusión', 'Nigromancia', 'Transmutación'];
/** Escuelas en inglés, con su nombre en español (la biblioteca guarda siempre el español). */
const SCHOOLS_EN: Record<string, string> = { abjuration: 'Abjuración', divination: 'Adivinación', conjuration: 'Conjuración', enchantment: 'Encantamiento', evocation: 'Evocación', illusion: 'Ilusionismo', necromancy: 'Nigromancia', transmutation: 'Transmutación' };
const CLASS_ES: Record<string, string> = { bardo: 'bard', clerigo: 'cleric', druida: 'druid', explorador: 'ranger', hechicero: 'sorcerer', brujo: 'warlock', mago: 'wizard', paladin: 'paladin', bard: 'bard', cleric: 'cleric', druid: 'druid', ranger: 'ranger', sorcerer: 'sorcerer', warlock: 'warlock', wizard: 'wizard' };
const W = '[A-Za-zÁÉÍÓÚáéíóúñÜü]+';
/**
 * Cabecera de un conjuro, en español («Evocación de nivel 3 (mago)», «Truco de evocación (mago)») o en inglés
 * («Level 3 Evocation (Wizard)», «Evocation Cantrip (Wizard)»). El OCR puede comerse espacios o cambiar letras.
 */
const SPELL_HEAD_ES = new RegExp('^(?:(Truco) de (' + W + ')|(' + W + ') de n[ií]vel\\s*(\\d))\\s*(?:\\((.*)\\)?)?');
const SPELL_HEAD_EN = new RegExp('^(?:Level\\s*(\\d)\\s+(' + W + ')|(' + W + ')\\s+(Cantrip))\\s*(?:\\((.*)\\)?)?', 'i');
/** Distancia de edición (para reconocer una palabra con una letra mal leída). */
export function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const schoolOf = (raw: string): string => {
  const n = norm(raw);
  if (SCHOOLS_EN[n]) return SCHOOLS_EN[n];
  if (SCHOOLS.some((s) => norm(s) === n)) return SCHOOLS.find((s) => norm(s) === n)!;
  const all = [...SCHOOLS, ...Object.keys(SCHOOLS_EN)];
  const best = all.map((s) => ({ s, d: lev(norm(s), n) })).sort((a, b) => a.d - b.d)[0];
  return best && best.d <= 2 ? SCHOOLS_EN[norm(best.s)] || best.s : '';
};
function spellHead(t: string): { school: string; level: number; classes: string; en?: boolean } | null {
  const es = SPELL_HEAD_ES.exec(t);
  if (es) { const school = schoolOf(es[2] || es[3]); return school ? { school, level: es[1] ? 0 : parseInt(es[4], 10), classes: es[5] || '' } : null; }
  const en = SPELL_HEAD_EN.exec(t);
  if (en) { const school = schoolOf(en[2] || en[3]); return school ? { school, level: en[1] ? parseInt(en[1], 10) : 0, classes: en[5] || '', en: true } : null; }
  return null;
}
/** Nombres de conjuro de las listas por clase del libro («Bola de fuego  Evocación  C, M»): sirven para corregir un título mal leído. */
function listedSpellNames(lines: Line[]): string[] {
  const sch = [...SCHOOLS, ...Object.values(SCHOOLS_EN), ...Object.keys(SCHOOLS_EN)].join('|');
  const re = new RegExp('^(.{3,48}?)\\s+(?:' + sch + ')(?:\\s+\\S{1,4})?$', 'i');
  // el OCR deja a veces el icono de la lista delante como una letra suelta («E Caldero burbujeante…»)
  const clean = (n: string) => n.replace(/^(?:\p{L}|[^\p{L}\d\s])\s+(?=\p{L}{2})/u, '').trim();
  return [...new Set(lines.map((l) => clean(re.exec(l.t)?.[1] || '')).filter((n) => n.length > 2 && !/\d|\bnivel\b|\blevel\b/i.test(n)))];
}
/** Corrige un título con una letra mal leída («Escupo» por «Escudo») con el nombre que da la lista del propio libro. */
function fixName(name: string, listed: string[]): string {
  if (listed.length < 30) return name;
  const n = norm(name);
  const same = listed.find((x) => norm(x) === n);
  if (same) return same;
  const best = listed.map((x) => ({ x, d: lev(norm(x), n) })).sort((a, b) => a.d - b.d)[0];
  return best && best.d <= (n.length > 9 ? 2 : 1) ? best.x : name;
}
const LBL = {
  ct: /(?:Tiempo de lanza\S*|Casting Time)\s*:\s*(.*?)(?=(?:Alcance|Range)\s*:|$)/i,
  r: /(?:Alcance|Range)\s*:\s*(.*?)(?=(?:Componentes|Components)\s*:|$)/i,
  cmp: /(?:Componentes|Components)\s*:\s*(.*?)(?=(?:Duraci[oó]n|Duration)\s*:|$)/i,
  du: /(?:Duraci[oó]n|Duration)\s*:\s*(.*)$/i,
};
const HAS_DURATION = /(?:Duraci[oó]n|Duration)\s*:/i;
const STARTS_WRAP = /^(de|del|de la|de las|de los|y|o|con|contra|para|por|en)\s/i;

/** Conjuros: título en mayúsculas y debajo «Escuela de nivel N (clases)» o «Truco de escuela (clases)»; luego tiempo, alcance, componentes y duración. */
/** `book`: todas las líneas del libro (las listas de conjuros por clase están en otras páginas que las fichas). */
export function parseSpells(lines: Line[], book: Line[] = lines): LibSpell[] {
  const out: LibSpell[] = [];
  const listed = listedSpellNames(book);
  let cur: { s: LibSpell; meta: string; body: string[]; en?: boolean } | null = null;
  const flush = () => {
    if (cur) {
      const m = cur.meta;
      const get = (k: RegExp) => (k.exec(m)?.[1] || '').trim();
      // libro en inglés: los campos se guardan en español, como los del resto de la biblioteca
      const tr = (f: (x: string) => string, x: string) => (cur!.en ? f(x) : x);
      cur.s.ct = tr(timeEs, get(LBL.ct));
      cur.s.r = tr(rangeEs, get(LBL.r));
      cur.s.cmp = get(LBL.cmp);
      cur.s.du = tr(durationEs, get(LBL.du));
      cur.s.c = /concentraci[oó]n/i.test(cur.s.du) ? 1 : 0;
      cur.s.rit = /ritual/i.test(cur.s.ct) ? 1 : 0;
      // un pie de ilustración mal leído («Esuocano conil») antes de la descripción: una línea corta sin punto y otra que empieza una frase
      const [first, next] = cur.body;
      if (cur.body.length > 1 && first.length < 20 && !/[.,:;)]$/.test(first) && /^[A-ZÁÉÍÓÚÑ]/.test(next)) cur.body.shift();
      cur.s.t = paragraphs(cur.body);
      out.push(cur.s);
    }
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].t;
    const head = spellHead(lines[i + 1]?.t || '');
    if (isTitle(t) && head) {
      flush();
      let clsTxt = head.classes;
      let j = i + 1;
      while (clsTxt && !lines[j].t.includes(')') && j + 1 < lines.length && !/^(Tiempo de lanza|Casting Time)/i.test(lines[j + 1].t)) { j++; clsTxt += ' ' + lines[j].t; }
      const classes = [...new Set(Object.entries(CLASS_ES).filter(([c]) => norm(clsTxt).includes(c)).map(([, k]) => k))];
      // un título largo se parte en dos líneas («SANTUARIO PRIVADO» + «DE MORDENKAINEN»): la segunda empieza por un conector
      const prev = lines[i - 1]?.t || '';
      const title = STARTS_WRAP.test(t) && isCaps(prev) && prev.length <= 36 && !/[.,:;]$/.test(prev) ? prev + ' ' + t : t;
      const name = head.en ? titleCaseEn(title) : fixName(titleCase(title), listed);
      cur = { s: { id: id('lib-conjuro', name), n: name, l: head.level, esc: head.school, classes, ct: '', r: '', cmp: '', du: '', c: 0, rit: 0, t: '' }, meta: '', body: [], en: head.en };
      i = j;
      continue;
    }
    if (!cur) continue;
    // metadatos hasta la duración; luego la descripción (los pies de ilustración en mayúsculas se descartan)
    if (!HAS_DURATION.test(cur.meta)) cur.meta += ' ' + t;
    else if (!isCaps(t)) cur.body.push(t);
  }
  flush();
  return dedupe(out);
}

function dedupe<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

// ---- libros en inglés (la biblioteca guarda los campos en español; los nombres y el texto se quedan como vienen) ----

const SMALL_EN = new Set(['of', 'the', 'and', 'in', 'to', 'a', 'an', 'for', 'on', 'at', 'by', 'or', 'with', 'from']);
/** «CHAINS OF ICE» -> «Chains of Ice». */
export function titleCaseEn(t: string): string {
  const words = t.toLowerCase().replace(/["“”]/g, '').replace(/\s+/g, ' ').trim().split(' ');
  return words.map((w, i) => (i > 0 && SMALL_EN.has(w) ? w : w.replace(/(^|[-’'(])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()))).join(' ');
}
const feetToM = (n: number) => String(Math.round(n * 3) / 10).replace('.', ',');
const UNIT_ES: Record<string, string> = { round: 'asalto', minute: 'minuto', hour: 'hora', day: 'día' };
const unitEs = (n: string, u: string) => (UNIT_ES[u] || u) + (n === '1' ? '' : 's');
/** «Bonus Action» -> «Acción adicional»; «1 minute» -> «1 minuto». */
export function timeEs(t: string): string {
  return t
    .replace(/\bBonus Action\b/gi, 'Acción adicional').replace(/\bReaction\b/gi, 'Reacción').replace(/\bAction\b/gi, 'Acción')
    .replace(/\b(\d+) (round|minute|hour|day)s?\b/gi, (_, n: string, u: string) => n + ' ' + unitEs(n, u.toLowerCase()));
}
/** «30 feet» -> «9 m»; «Self (10-foot Emanation)» -> «Personal (Emanación de 3 m)». */
export function rangeEs(t: string): string {
  return t
    .replace(/\bSelf\b/g, 'Personal').replace(/\bTouch\b/g, 'Toque').replace(/\bSight\b/g, 'Visión').replace(/\bUnlimited\b/g, 'Ilimitado')
    .replace(/(\d+)-foot (Emanation|Cone|Line|Cube|Sphere|Cylinder|Radius)/gi, (_, n: string, k: string) => ({ emanation: 'Emanación', cone: 'Cono', line: 'Línea', cube: 'Cubo', sphere: 'Esfera', cylinder: 'Cilindro', radius: 'Radio' })[k.toLowerCase()] + ' de ' + feetToM(+n) + ' m')
    .replace(/(\d+) feet\b/gi, (_, n: string) => feetToM(+n) + ' m')
    .replace(/(\d+) miles?\b/gi, (_, n: string) => String(Math.round(+n * 15) / 10).replace('.', ',') + ' km');
}
/** «Concentration, up to 1 minute» -> «Concentración, hasta 1 minuto». */
export function durationEs(t: string): string {
  return t
    .replace(/\bInstantaneous\b/gi, 'Instantánea').replace(/\bUntil dispelled\b/gi, 'Hasta ser disipado').replace(/\bSpecial\b/g, 'Especial')
    .replace(/\bConcentration\b/gi, 'Concentración').replace(/\bup to\b/gi, 'hasta')
    .replace(/\b(\d+) (round|minute|hour|day)s?\b/gi, (_, n: string, u: string) => n + ' ' + unitEs(n, u.toLowerCase()));
}

const FEAT_CAT_EN: [RegExp, LibFeat['cat']][] = [
  [/^Origin Feat\b/i, 'origin'], [/^General Feat\b/i, 'general'], [/^Fighting Style Feat\b/i, 'fighting-style'], [/^Epic Boon Feat\b/i, 'epic-boon'],
];
const ABIL_EN_TO_ES: Record<string, string> = { Strength: 'Fuerza', Dexterity: 'Destreza', Constitution: 'Constitución', Intelligence: 'Inteligencia', Wisdom: 'Sabiduría', Charisma: 'Carisma' };
/** «Level 4+, Dexterity and Wisdom 13+» -> «Nivel 4 o más, Destreza y Sabiduría 13 o más». */
function reqEs(t: string): string {
  return t.replace(/^Prerequisites?:?\s*/i, '').replace(/\bLevel (\d+)\+/gi, 'Nivel $1 o más').replace(/\b(\d+)\+/g, '$1 o más')
    .replace(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\b/g, (a) => ABIL_EN_TO_ES[a]).replace(/\b(Fuerza|Destreza|Constitución|Inteligencia|Sabiduría) (and|or) (?=Fuerza|Destreza|Constitución|Inteligencia|Sabiduría|Carisma)/g, (_, a: string, c: string) => a + (c === 'and' ? ' y ' : ' o '))
    .replace(/\bProficiency with\b/gi, 'Competencia con').replace(/(\p{L}+) Species\b/gu, 'especie: $1').replace(/\bCampaign\b/g, 'campaña').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
}
/** Una línea corta, con mayúscula y sin puntuación final: título de apartado o de entrada (el texto corrido ocupa todo el ancho). */
const headingLike = (t: string) => t.length <= 44 && /^[A-ZÁÉÍÓÚÑ]/.test(t) && !/[.,:;)]$/.test(t) && t.split(' ').length <= 7;
/** Recuadros de la mitad de la página (restos de pies de ilustración y columnas laterales) que no son texto de la entrada. */
const sideNoise = (l: Line) => l.col === 1 && /^[^A-Z0-9]/.test(l.t);

/** Dotes del libro en inglés: «Nombre» + «General Feat (Prerequisite: Level 4+)» y el texto, hasta el siguiente título. */
export function parseFeatsEn(lines: Line[]): LibFeat[] {
  const out: LibFeat[] = [];
  let cur: { f: LibFeat; body: string[] } | null = null;
  const flush = () => { if (cur) { cur.f.d = paragraphs(cur.body); out.push(cur.f); } cur = null; };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].t;
    const next = lines[i + 1]?.t || '';
    const cat = FEAT_CAT_EN.find(([re]) => re.test(next));
    if (cat && headingLike(t)) {
      flush();
      let reqText = next;
      let j = i + 1;
      // los requisitos largos siguen en la línea siguiente solo si esta cierra el paréntesis enseguida
      if (!reqText.includes(')') && /^[^.]{0,60}\)/.test(lines[i + 2]?.t || '')) { j++; reqText += ' ' + lines[j].t; }
      const req = reqEs((/\(([^)]*)\)?/.exec(reqText)?.[1] || '').replace(/[\s,]*\b(or|and)\s*$/i, ''));
      const name = titleCaseEn(t);
      cur = { f: { id: id('lib-dote', name), n: name, cat: cat[1], req, d: '' }, body: [] };
      i = j;
      continue;
    }
    if (!cur || sideNoise(lines[i])) continue;
    // un título de apartado («Mage Feats») o de otra entrada cierra la dote
    if (headingLike(t) && cur.body.length) { flush(); continue; }
    cur.body.push(t);
  }
  flush();
  return dedupe(out);
}

const CLASS_EN: Record<string, string> = { barbarian: 'barbarian', bard: 'bard', cleric: 'cleric', druid: 'druid', fighter: 'fighter', monk: 'monk', paladin: 'paladin', ranger: 'ranger', rogue: 'rogue', sorcerer: 'sorcerer', warlock: 'warlock', wizard: 'wizard' };
const SUB_HEAD_EN = /^(.{3,60}?)\s*\((\p{L}+) Subclass\)\s*$/u;
const FEATURE_EN = /^Level (\d{1,2}):\s*(.+)$/;
/** Subclases del libro en inglés: «Nombre (Paladin Subclass)», una introducción y rasgos «Level 3: Nombre». */
export function parseSubclassesEn(lines: Line[]): LibSubclass[] {
  const out: LibSubclass[] = [];
  let cur: { s: LibSubclass; intro: string[]; feat: { lv: number; n: string; body: string[]; rows: string[]; multi: boolean } | null } | null = null;
  const closeFeat = () => {
    if (cur?.feat) {
      const ft = cur.feat;
      // tabla «Conjuros del …»: cada fila «nivel + conjuros» se guarda en bruto (con «~») hasta saber qué conjuros existen
      const sp = ft.rows.map((r) => '~' + (ft.multi ? 1 : 0) + '|' + r);
      cur.s.f.push({ lv: ft.lv, n: ft.n, d: paragraphs(ft.body), ...(sp.length ? { sp } : {}) });
      cur.feat = null;
    }
  };
  const flush = () => { if (cur) { closeFeat(); cur.s.d = paragraphs(cur.intro); if (cur.s.f.length) out.push(cur.s); } cur = null; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], t = l.t;
    const sh = SUB_HEAD_EN.exec(t);
    const cls = sh ? CLASS_EN[norm(sh[2])] : '';
    if (sh && cls) { flush(); const name = sh[1].trim(); cur = { s: { id: id('lib-subclase-' + cls, name), n: name, cls, d: '', f: [] }, intro: [], feat: null }; continue; }
    if (!cur || sideNoise(l)) continue;
    // lo que sigue a las subclases: apartados de dotes, de conjuros o de elección de nivel («Feats. Consider…»)
    const after = lines[i + 1]?.t || '';
    if (/ (Feats|Specialization)$/.test(t) || /^(Level \d+|Spells|Feats)\.\s/.test(t) || (headingLike(t) && (spellHead(after) || FEAT_CAT_EN.some(([re]) => re.test(after))))) { flush(); continue; }
    const fm = FEATURE_EN.exec(t);
    if (fm) {
      // un nivel menor que el del último rasgo: lo que sigue ya no es de esta subclase
      if (parseInt(fm[1], 10) < Math.max(0, ...cur.s.f.map((f) => f.lv), cur.feat?.lv || 0)) { flush(); continue; }
      closeFeat(); cur.feat = { lv: parseInt(fm[1], 10), n: fm[2].trim(), body: [], rows: [], multi: false }; continue;
    }
    if (cur.feat) {
      cur.feat.body.push(t);
      if (/Spells$/.test(cur.feat.n)) {
        if (/Level.*\bSpells\b/.test(t) && (t.match(/Spells/g) || []).length > 1) cur.feat.multi = true;
        else if (/^\d{1,2}\s+\p{L}/u.test(t)) cur.feat.rows.push(t);
      }
    } else cur.intro.push(t);
  }
  flush();
  return dedupe(out);
}

/**
 * Pasa las filas en bruto de las tablas de conjuros de subclase a «id|nivel» de conjuros que existen (los del libro y los
 * del SRD, por su nombre en inglés). En una tabla de varias columnas solo vale la primera («Spells (All)»: las demás
 * dependen de una elección, como la runa). Lo que no se reconoce se descarta.
 */
export function resolveSubSpells<T extends { f: { sp?: string[] }[] }>(subs: T[], known: { id: string; n: string }[]): T[] {
  const names = [...known].filter((k) => norm(k.n).length > 3).sort((a, b) => b.n.length - a.n.length);
  const resolve = (raw: string): string[] => {
    const m = /^~([01])\|(\d{1,2})\s+(.*)$/.exec(raw);
    if (!m) return [];
    let text = ' ' + norm(m[3]).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    const hits: { at: number; id: string }[] = [];
    for (const k of names) {
      const key = ' ' + norm(k.n).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
      const at = text.indexOf(key);
      if (at < 0) continue;
      hits.push({ at, id: k.id });
      text = text.slice(0, at) + ' '.repeat(key.length) + text.slice(at + key.length);
    }
    hits.sort((a, b) => a.at - b.at);
    // varias columnas: solo la primera, y solo si la fila empieza por un conjuro conocido (si no, el primero es uno que no tenemos)
    const use = m[1] === '1' ? hits.filter((h, i) => i === 0 && h.at === 0) : hits;
    return use.map((h) => h.id + '|' + m[2]);
  };
  return subs.map((s) => ({
    ...s,
    f: s.f.map((f) => {
      if (!f.sp) return f;
      const sp = [...new Set(f.sp.flatMap((r) => (r.startsWith('~') ? resolve(r) : [r])))];
      const { sp: _drop, ...rest } = f;
      void _drop;
      return sp.length ? { ...rest, sp } : rest;
    }),
  }));
}

/** Páginas que interesan, según lo que contiene cada una (así no hace falta saber la paginación del libro). */
export function classifyPage(text: string): ('feats' | 'backgrounds' | 'spells' | 'classes')[] {
  const out: ('feats' | 'backgrounds' | 'spells' | 'classes')[] = [];
  if (FEATURE_HEAD.test(text) || /SUBCLASES DE/.test(text)) out.push('classes');
  if (/Dote (de origen|general|de estilo de combate|de don [ée]pico)/.test(text)) out.push('feats');
  if (/Puntuaciones de caracter[ií]stica\s*:/.test(text)) out.push('backgrounds');
  if (/(Tiempo de lanza\S*|Casting Time)\s*:/.test(text)) out.push('spells');
  return out;
}

/**
 * Una página sin nada reconocible entre dos páginas de clases (la continuación de una lista de opciones, una
 * subclase que sigue sin título de rasgo) también es del capítulo de clases.
 */
export function fillClassGaps(kinds: ReturnType<typeof classifyPage>[]): ReturnType<typeof classifyPage>[] {
  const idx = kinds.map((k, i) => (k.includes('classes') ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return kinds;
  const first = idx[0], last = idx[idx.length - 1];
  return kinds.map((k, i) => (!k.length && i > first && i < last ? ['classes'] : k));
}

/** «NIVEL 3: FRENESÍ» (el OCR a veces escribe «NIvEL», «NiveEL»…). */
const FEATURE_HEAD = /N\s*[rRiI1]{0,3}\s*[vV]\s*[eE]+\s*[lL]\s*(\d{1,2})\s*:\s*/;
const FEATURE_LINE = new RegExp('^' + FEATURE_HEAD.source + '(.+)$');
/**
 * Cómo empiezan los nombres de subclase de cada clase en la edición española; para las clases sin prefijo fijo,
 * sus cuatro nombres (solo los nombres). Así no se toman por subclases las tablas y recuadros en mayúsculas.
 */
const SUB_PREFIX: Record<string, string[]> = {
  barbarian: ['senda'], bard: ['colegio'], warlock: ['patron'], cleric: ['dominio'], druid: ['circulo'], sorcerer: ['hechiceria'],
  monk: ['guerrero de'], paladin: ['juramento'],
  ranger: ['acechador en la penumbra', 'cazador', 'errante feerico', 'senor de las bestias'],
  fighter: ['caballero arcano', 'campeon', 'guerrero psionico', 'maestro del combate'],
  wizard: ['abjurador', 'adivino', 'evocador', 'ilusionista'],
  rogue: ['asesino', 'embaucador arcano', 'ladron', 'rebanaalmas'],
};
/** Nombre bien escrito de las subclases de nombre fijo (el OCR puede cambiar una letra: «ÁDIVINO»). */
const SUB_NAMES = ['Acechador en la penumbra', 'Cazador', 'Errante feérico', 'Señor de las bestias', 'Caballero arcano', 'Campeón', 'Guerrero psiónico', 'Maestro del combate', 'Abjurador', 'Adivino', 'Evocador', 'Ilusionista', 'Asesino', 'Embaucador arcano', 'Ladrón', 'Rebanaalmas'];
const canonSub = (name: string) => SUB_NAMES.find((x) => norm(x) === norm(name)) || SUB_NAMES.find((x) => norm(x).length > 5 && lev(norm(x), norm(name)) <= 1) || name;
const isSubclassName = (cls: string, t: string, names?: string[]) => {
  const n = norm(t).replace(/^[^a-z]+/, '');
  // clase nueva del libro: los nombres que enumera su rasgo «Subclase de …»
  if (names) return names.some((x) => norm(x) === n);
  const pre = SUB_PREFIX[cls] || [];
  // con prefijo: «senda del …»; sin prefijo: el nombre exacto
  if (['ranger', 'fighter', 'wizard', 'rogue'].includes(cls)) return pre.includes(n);
  // con prefijo, y no cortado al final de línea («Dominio de», «Senda del»)
  return pre.some((p) => n.startsWith(p + ' ')) && !/ (de|del|de la|de las|de los)$/.test(n);
};
/** Nombres de subclase que enumera el texto de los rasgos de la clase («… Hechicería aberrante, … y …»), en orden. */
export function introNames(cls: string, text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.replace(/-\s+/g, '').split(/[.:;]/)) {
    const found: string[] = [];
    for (const frag of sentence.split(/,|\(|\)| y | e | o | se /)) {
      const words = frag.trim().split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        const cand = words.slice(i).join(' ');
        // un nombre es corto y solo letras (las tablas dan «Hechicería trucos 1 +2 …»)
        if (words.length - i <= 5 && /^[\p{L} ]+$/u.test(cand) && isSubclassName(cls, cand)) { found.push(titleCase(cand)); break; }
      }
    }
    // solo la frase que enumera varias (así no se toma un rasgo suelto como «Hechicería innata»)
    if (found.length >= 2) for (const f of found) if (!out.some((o) => norm(o) === norm(f))) out.push(f);
  }
  return out;
}
/** Nivel del último rasgo de subclase de cada clase (2024). */
const LAST_LEVEL: Record<string, number> = { barbarian: 14, bard: 14, warlock: 14, cleric: 17, druid: 14, ranger: 15, fighter: 18, sorcerer: 18, wizard: 14, monk: 17, paladin: 20, rogue: 17 };
const CLASS_IDS: Record<string, string> = {
  barbaro: 'barbarian', bardo: 'bard', brujo: 'warlock', clerigo: 'cleric', druida: 'druid', explorador: 'ranger',
  guerrero: 'fighter', hechicero: 'sorcerer', mago: 'wizard', monje: 'monk', paladin: 'paladin', picaro: 'rogue',
};

/**
 * Subclases: en el capítulo de cada clase, tras «SUBCLASES DE <CLASE>», cada subclase tiene su nombre en mayúsculas,
 * una introducción y sus rasgos («NIVEL 3: …»). Se saltan los pies de ilustración («SUBCLASE DE LA SENDA…») y
 * solo se guardan las que tienen algún rasgo. Los rasgos de clase (antes de «SUBCLASES DE») no se tocan.
 */
interface SubDraft { s: LibSubclass; intro: string[]; feat: { lv: number; n: string; body: string[] } | null; sec: { n: string; body: string[] } | null }

export function parseSubclasses(lines: Line[], extraClasses: Record<string, string> = {}, subNames: Record<string, string[]> = {}): LibSubclass[] {
  const classIds = { ...CLASS_IDS, ...extraClasses }; // (nombre sin acentos -> id) de las clases nuevas del libro
  // en 2024 todas las subclases empiezan en el nivel 3
  const START = 3;
  const out: LibSubclass[] = [];
  const used = new Set<string>();
  const st: { cls: string; cur: SubDraft | null; pending: { name: string; intro: string[] } | null } = { cls: '', cur: null, pending: null };
  const closeFeat = () => {
    const c = st.cur;
    if (c?.feat) { c.s.f.push({ lv: c.feat.lv, n: c.feat.n, d: paragraphs(c.feat.body) }); c.feat = null; }
    if (c?.sec) { (c.s.x ||= []).push({ n: c.sec.n, d: paragraphs(c.sec.body) }); c.sec = null; }
  };
  const flush = () => {
    const c = st.cur;
    if (c) { closeFeat(); c.s.d = paragraphs(c.intro); if (c.s.f.length) out.push(c.s); }
    st.cur = null;
  };
  const open = (name: string, intro: string[]) => {
    flush();
    if (name) used.add(norm(name));
    st.cur = { s: { id: '', n: name, cls: st.cls, d: '', f: [] }, intro, feat: null, sec: null };
  };
  // nivel más alto alcanzado por la subclase abierta
  const top = () => (st.cur ? Math.max(0, ...st.cur.s.f.map((f) => f.lv), st.cur.feat?.lv || 0) : 0);
  // texto de los rasgos de cada clase: su rasgo «Subclase de …» enumera los nombres de las subclases
  const coreText: Record<string, string> = {};
  let coreCls = '';
  const caps: string[] = [];

  let noise = false;
  for (const { t } of lines) {
    // restos de pie de página o de ilustración leídos como texto («CAPÍTUL: | CLASES DE PERSON», «Y YN = = =» y su pie)
    if (/^CAP[IÍ]TUL\S*\s*\S{0,2}\s*[|¦]/i.test(t) || /(?:\s?=){3}/.test(t)) { noise = true; continue; }
    if (noise && t.length < 40 && !/[.:]$/.test(t)) { noise = false; continue; }
    noise = false;
    const section = /^SUBCLASES DE (\p{L}+)/u.exec(t);
    if (section) { flush(); st.pending = null; st.cls = classIds[norm(section[1])] || ''; continue; }
    // los rasgos de la clase base (siguiente capítulo de clase) cierran la sección de subclases
    const core = /^RASGOS DE (\p{L}+)/u.exec(t);
    if (core) { flush(); st.pending = null; st.cls = ''; coreCls = classIds[norm(core[1])] || ''; continue; }
    // la tabla de atributos de la clase siguiente también cierra la sección
    if (/^ATRIBUTOS B[ÁA]SICOS DE/i.test(t)) { flush(); st.pending = null; st.cls = ''; coreCls = ''; continue; }
    if (!st.cls) { if (coreCls) coreText[coreCls] = (coreText[coreCls] || '') + ' ' + t; continue; }
    if (/^SUBCLASE DE/i.test(t)) continue; // pie de ilustración («SUBCLASE DE LA SENDA…»)

    const fm = FEATURE_LINE.exec(t);
    if (fm) {
      const lv = parseInt(fm[1], 10);
      // una subclase nueva empieza con un rasgo de nivel 3 cuando la anterior ya había pasado del nivel 3
      // (un pie de ilustración entre dos rasgos de nivel 3 de la misma subclase no abre otra)
      if (lv === START && (!st.cur || top() > START)) {
        const p = st.pending;
        st.pending = null;
        open(p?.name || [...caps].reverse().find((c) => !used.has(norm(c))) || '', p?.intro || []);
      } else if (st.pending && st.cur?.feat) {
        // lo leído tras un título no confirmado pertenecía al rasgo que seguía abierto
        st.cur.feat.body.push(...st.pending.intro);
        st.pending.intro = [];
      }
      if (!st.cur) continue;
      closeFeat();
      st.cur.feat = { lv, n: titleCase(fm[2]), body: [] };
      continue;
    }
    // «NIVEL 3: CONJUROS DEL» + «JURAMENTO DE ENTREGA»: un nombre que acaba en preposición sigue en la línea siguiente
    if (st.cur?.feat && !st.cur.feat.body.length && / (de|del|de la|de las|de los)$/i.test(st.cur.feat.n) && isCaps(t)) { st.cur.feat.n += ' ' + t.toLowerCase(); continue; }
    if (isTitle(t) && isSubclassName(st.cls, t, subNames[st.cls]?.length ? subNames[st.cls] : undefined)) {
      const name = canonSub(titleCase(t));
      // con la subclase abierta sin llegar a su último rasgo, un nombre es el pie de una ilustración (el texto que sigue es
      // del rasgo abierto): solo sirve de nombre a una subclase cuyo título no se leyó
      if (st.cur && top() < (LAST_LEVEL[st.cls] || 0)) { caps.push(name); continue; }
      // el mismo nombre otra vez o uno ya usado no cuenta; uno más completo sustituye a uno cortado
      if (norm(name) === norm(st.cur?.s.n || '') || used.has(norm(name))) continue;
      if (!st.pending || norm(name).startsWith(norm(st.pending.name)) || !norm(st.pending.name).startsWith(norm(name))) st.pending = { name, intro: st.pending?.intro || [] };
      continue;
    }
    // «OPCIONES DE MANIOBRAS»: apartado con las opciones entre las que se elige
    if (st.cur && /^OPCIONES DE \p{L}/u.test(t)) { closeFeat(); st.cur.sec = { n: titleCase(t), body: [] }; continue; }
    // «NIVEL 10: SUPREMACÍA EN COMBATE» + «MEJORADA» en la línea siguiente: es parte del nombre
    // (o «NIVEL 3: CONJUROS DEL CÍRCULO» + «DE LA LUNA»)
    if (st.cur?.feat && !st.cur.feat.body.length && /^(MEJORAD[AO]|DEFINITIV[AO]|SUPERIOR|AVANZAD[AO]|DEL? (LA |LAS |LOS )?[A-ZÁÉÍÓÚÑ]+)$/.test(t)) { st.cur.feat.n += ' ' + t.toLowerCase(); continue; }
    if (isCaps(t)) { const tgt = st.cur?.sec || st.cur?.feat; if (tgt) tgt.body.push(t); continue; } // tablas y recuadros: van con el rasgo
    if (st.pending) { st.pending.intro.push(t); continue; }
    if (!st.cur) continue;
    if (st.cur.sec) st.cur.sec.body.push(t); else if (st.cur.feat) st.cur.feat.body.push(t); else st.cur.intro.push(t);
  }
  flush();
  // a las que quedaron sin título se les pone un nombre provisional (se corrige en la revisión)
  const CLASS_ES = Object.fromEntries(Object.entries(CLASS_IDS).map(([es, k]) => [k, es]));
  const taken = new Set(out.map((s) => norm(s.n)));
  let n = 0;
  return dedupe(out.map((s) => {
    const listed = s.n ? '' : introNames(s.cls, coreText[s.cls] || '').find((c) => !taken.has(norm(c))) || '';
    if (listed) taken.add(norm(listed));
    const name = s.n || listed || 'Subclase de ' + (CLASS_ES[s.cls] || s.cls) + ' sin título ' + ++n;
    return { ...s, n: name, id: id('lib-subclase-' + s.cls, name) };
  }));
}

const NUMBER_ES: Record<string, number> = { una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };
const CLASS_FEATURE = /^N\s*[rRiI1]{0,3}\s*[vV]\s*[eE]+\s*[lL]\s*(\d{1,2}|[lI])\s*:\s*(.+)$/;
/** Características que cita el texto, en el orden en que las cita. */
const abilsIn = (t: string): Abil[] => Object.entries(ABIL_ES).map(([k, v]) => ({ v, at: norm(t).indexOf(k) })).filter((x) => x.at >= 0).sort((x, y) => x.at - y.at).map((x) => x.v);

/** Rasgos básicos de una clase a partir del recuadro «ATRIBUTOS BÁSICOS DE …» (texto de varias líneas unido). */
export function parseClassAttrs(raw: string): Pick<LibClass, 'primary' | 'hd' | 'saves' | 'skills' | 'weapons' | 'armor'> & { problems: string[] } {
  const t = fixOcr(fixDice(raw.replace(/-\s+/g, '').replace(/\s+/g, ' ')));
  const problems: string[] = [];
  const grab = (re: RegExp) => re.exec(t)?.[1]?.trim() || '';
  const primary = abilsIn(grab(/Caracter[ií]sticas? principal(?:es)?\s+(.+?)\s+Dado de puntos/i));
  // el OCR lee a veces el 8 como 3 (un dado de golpe nunca es d3)
  const hdn = parseInt(/Dado de puntos de golpe\s+\S*?[1lI]\s*d\s*(\d{1,2})/i.exec(t)?.[1] || '0', 10);
  const hd = hdn === 3 ? 8 : [6, 8, 10, 12].includes(hdn) ? hdn : 0;
  // las etiquetas y sus valores van entremezclados y no siempre en el mismo orden: se trocea por los valores que siempre aparecen
  const afterHd = t.slice(Math.max(0, t.search(/Dado de puntos de golpe/i)));
  const iSk = afterHd.search(/(?<!\p{L})Elige(?!\p{L})/u);
  const iWp = afterHd.search(/(?<!\p{L})(?:Armas|Amas) sencillas|(?<!\p{L})armas marciales/iu);
  const iAr = afterHd.search(/Entrenamiento/i);
  const iTool = afterHd.search(/Competencias (?:con herramientas|Elige)|Equipo inicial/i);
  const saves = abilsIn(afterHd.slice(0, iSk > 0 ? iSk : iWp > 0 ? iWp : 120).replace(/^.*?por nivel de \p{L}+/iu, ''));
  // quitar las etiquetas que se cuelan entre los nombres («Conocimiento habilidades arcano»)
  const sk = (iSk >= 0 ? afterHd.slice(iSk, iWp > iSk ? iWp : iAr > iSk ? iAr : undefined) : '').replace(/(?<!\p{L})(?:Competencias|en|habilidades)(?!\p{L})/giu, ' ').replace(/\s+/g, ' ');
  const count = NUMBER_ES[norm(/^Elige\s+(\p{L}+)/iu.exec(sk)?.[1] || '')] || 2;
  const any = /cualesquiera/i.test(sk);
  const pool = any ? ['*'] : Object.entries(SKILL_ES).filter(([n]) => norm(sk).includes(n)).map(([, v]) => v);
  const wp = iWp >= 0 ? afterHd.slice(iWp, iAr > iWp ? iAr : iTool > iWp ? iTool : undefined) : '';
  const ar = iAr >= 0 ? afterHd.slice(iAr, /Equipo inicial/i.test(afterHd) ? afterHd.search(/Equipo inicial/i) : undefined) : '';
  const weapons = [...(/sencillas/i.test(wp) ? ['sim'] : []), ...(/marciales/i.test(wp) && !/propiedad|tengan/i.test(wp) ? ['mar'] : [])];
  const armor = [...(/ligeras/i.test(ar) ? ['lgt'] : []), ...(/medias/i.test(ar) ? ['med'] : []), ...(/pesadas/i.test(ar) ? ['hvy'] : []), ...(/escudos?/i.test(ar) ? ['shl'] : [])];
  if (!hd) problems.push('No se leyó el dado de golpe.');
  if (!primary.length) problems.push('No se leyó la característica principal.');
  if (saves.length !== 2) problems.push('Revisa las salvaciones con competencia.');
  if (!pool.length) problems.push('Revisa las habilidades de la clase.');
  if (/propiedad|tengan/i.test(wp)) problems.push('Revisa las armas: la clase usa solo algunas armas marciales.');
  return { primary, hd: hd || 8, saves, skills: { count, pool: pool.length ? pool : ['*'] }, weapons: weapons.length ? weapons : ['sim'], armor, problems };
}

/** Niveles de mejora de característica: el del rasgo y los que cita su texto («Vuelves a obtener este rasgo en los niveles 8, 12 y 16»), más el don épico. */
function asiLevels(f: { lv: number; n: string; d: string }[]): number[] {
  const m = f.find((x) => /^mejora de caracteristica/.test(norm(x.n)));
  if (!m) return [];
  const cited = /niveles?[^.]*/i.exec(m.d.replace(/(\d),(\d)/g, '$1, $2'))?.[0].match(/\d{1,2}/g) || [];
  return [...new Set([m.lv, ...cited.map(Number), ...(f.some((x) => /^don epico/.test(norm(x.n))) ? [19] : [])])].filter((n) => n >= 1 && n <= 20).sort((a, b) => a - b);
}

/**
 * Clases: tras «ATRIBUTOS BÁSICOS DE <CLASE>» vienen el recuadro de atributos, la tabla de rasgos (sus columnas salen
 * desordenadas del PDF y no se leen) y los rasgos nivel a nivel («NIVEL 3: …») hasta «SUBCLASES DE <CLASE>». Las tablas de
 * usos y de conjuros no se leen: la clase sale para revisar y completar en «Mis creaciones».
 */
/** Una clase leída del libro, con lo que quedó por revisar y los nombres de sus subclases (para reconocerlas). */
export type ParsedClass = LibClass & { problems: string[]; subNames: string[] };

/** «Las subclases de la senda del berserker, la senda del fanático y … se detallan…» -> sus nombres. */
export function subclassNamesIn(text: string): string[] {
  const m = /.*subclases? (?:de |del )?(.+?)\s+se (?:detallan|describen|presentan|encuentran)/i.exec(text.replace(/\s+/g, ' '));
  if (!m) return [];
  return m[1].split(/,| y | e /).map((x) => x.trim().replace(/^(?:la|el|las|los)\s+/i, '')).filter((x) => x.split(' ').length >= 2 || x.length > 5);
}

export function parseClasses(lines: Line[]): ParsedClass[] {
  const out: ParsedClass[] = [];
  let cur: { n: string; attrs: string[]; f: { lv: number; n: string; body: string[] }[] } | null = null;
  let mode: 'none' | 'attrs' | 'feat' | 'table' = 'none';
  let noise = false;
  const flush = () => {
    if (!cur) return;
    const a = parseClassAttrs(cur.attrs.join(' '));
    const f = cur.f.map((x) => ({ lv: x.lv, n: x.n, d: paragraphs(x.body) })).filter((x) => x.d || x.n);
    const problems = [...a.problems];
    if (!f.length) problems.push('No se leyó ningún rasgo.');
    const caster = f.some((x) => /^magia (de|del) pacto/.test(norm(x.n))) ? 'pact' : f.some((x) => /^lanzamiento de conjuros/.test(norm(x.n))) ? (a.hd <= 8 ? 'full' : 'half') : 'none';
    const text = f.map((x) => x.d).join(' ');
    const spellAb = caster === 'none' ? '' : abilsIn(/(\p{L}+) es tu caracter[ií]stica de lanzamiento/iu.exec(text)?.[1] || '')[0] || a.primary[0] || 'int';
    if (caster !== 'none') problems.push('Revisa el tipo de lanzador y completa las tablas de trucos y de conjuros preparados.');
    const sub = f.find((x) => /^subclase de/.test(norm(x.n)));
    const name = titleCase(cur.n);
    out.push({
      id: id('lib-clase', name), n: name, en: name, hd: a.hd, saves: a.saves, skills: a.skills, armor: a.armor, weapons: a.weapons,
      caster, spellAb, primary: a.primary, asi: asiLevels(f), f: f.filter((x) => x.lv > 0 && !/^(subclase de|mejora de caracteristica|don epico)/.test(norm(x.n))),
      sc: {}, sub: null, d: '', spells: [], subLv: sub?.lv || 3, own: false, problems, subNames: subclassNamesIn(sub?.d || ''),
    });
    cur = null;
  };
  for (const { t } of lines) {
    if (/^CAP[IÍ]TUL\S*\s*\S{0,2}\s*[|¦]/i.test(t) || /(?:\s?=){3}/.test(t)) { noise = true; continue; }
    if (noise && t.length < 40 && !/[.:]$/.test(t)) { noise = false; continue; }
    noise = false;
    const head = /ATRIBUTOS B[ÁA]SICOS DE ([A-ZÁÉÍÓÚÑ ]+)$/.exec(t);
    if (head) { flush(); cur = { n: head[1].trim(), attrs: [], f: [] }; mode = 'attrs'; continue; }
    if (!cur) continue;
    if (/^SUBCLASES DE/.test(t)) { flush(); mode = 'none'; continue; }
    if (/^RASGOS DE CLASE DE/i.test(t)) { mode = 'feat'; continue; }
    if (/^RASGOS DE \p{L}/u.test(t)) { mode = 'table'; continue; }
    const fm = CLASS_FEATURE.exec(t);
    if (fm) { cur.f.push({ lv: /^\d+$/.test(fm[1]) ? parseInt(fm[1], 10) : 1, n: titleCase(fm[2]), body: [] }); mode = 'feat'; continue; }
    const last = cur.f[cur.f.length - 1];
    if (mode === 'attrs') { if (/^CONVERTIRSE EN|^COMO PERSONAJE/i.test(t)) mode = 'none'; else cur.attrs.push(t); continue; }
    if (mode === 'table' || !last) continue;
    // nombre de rasgo partido en dos líneas: «NIVEL 3: CONJUROS DEL» + «CÍRCULO»
    if (!last.body.length && isCaps(t) && / (DE|DEL|DE LA|DE LAS|DE LOS)$/.test(last.n.toUpperCase())) { last.n += ' ' + t.toLowerCase(); continue; }
    last.body.push(t);
  }
  flush();
  return dedupe(out);
}

/** Una columna de la tabla «Rasgos de <clase>»: su cabecera y su valor en cada nivel (del 1 al 20; null si no se leyó). */
export interface ClassTableColumn { head: string; values: (number | string | null)[] }
export interface ClassTable { name: string; columns: ClassTableColumn[]; rows: number }

/**
 * La tabla «Rasgos de <clase>» de una página, leída por posición: en el texto corrido sus columnas salen mezcladas, pero cada
 * celda tiene su x e y. Las filas se sacan de la columna de niveles y cada trozo de texto cae en la columna de cabecera más cercana.
 */
export function parseClassTable(items: TextItem[]): ClassTable | null {
  const it = items.filter((x) => x.str.trim()).map((x) => ({ s: x.str.trim(), x: x.x, y: x.y, c: x.x + (x.w || 0) / 2 }));
  const title = it.find((x) => /^RASGOS DE (?!CLASE|PERSONALIDAD)/i.test(x.s));
  if (!title) return null;
  const nivel = it.filter((x) => /^Nivel$/i.test(x.s) && x.y < title.y).sort((a, b) => b.y - a.y)[0];
  if (!nivel) return null;
  const lowest = it.filter((x) => Math.abs(x.y - nivel.y) <= 6 && x.s !== nivel.s);
  const upper = it.filter((x) => x.y > nivel.y + 6 && x.y < title.y - 8);
  // columnas: los textos de la última línea de la cabecera; los de las líneas de encima se suman a la columna más cercana
  const cols = lowest.map((l) => ({ c: l.c, x: l.x, head: l.s, above: [] as string[] })).sort((a, b) => a.x - b.x);
  for (const u of upper) {
    const near = cols.reduce<(typeof cols)[number] | null>((b, k) => (Math.abs(k.x - u.x) < Math.abs((b?.x ?? 1e9) - u.x) ? k : b), null);
    if (near && Math.abs(near.x - u.x) < 60) near.above.push(u.s);
  }
  // las filas: los números de la columna de niveles (textos cortos pegados a «Nivel»)
  const left = it.filter((x) => x.s.length <= 3 && x.x >= nivel.x - 25 && x.x <= nivel.x + 60 && x.y < nivel.y - 12).sort((a, b) => b.y - a.y);
  const rowsY: number[] = [];
  for (const l of left) { if (!rowsY.length || rowsY[rowsY.length - 1] - l.y > 10) rowsY.push(l.y); }
  if (rowsY.length < 15 || rowsY.length > 22) return null;
  const rows = rowsY.slice(0, 20);
  const bottom = rows[rows.length - 1] - 14;
  const cell = rows.map(() => cols.map(() => [] as { s: string; x: number }[]));
  for (const d of it) {
    if (d.y >= nivel.y - 12 || d.y < bottom) continue;
    const r = rows.reduce((b, y, i) => (Math.abs(y - d.y) < Math.abs(rows[b] - d.y) ? i : b), 0);
    if (Math.abs(rows[r] - d.y) > 15) continue;
    const k = cols.reduce((b, c, i) => (Math.abs(c.c - d.c) < Math.abs(cols[b].c - d.c) ? i : b), 0);
    cell[r][k].push({ s: d.s, x: d.x });
  }
  const columns: ClassTableColumn[] = cols.map((c, k) => {
    const raw = rows.map((_, r) => cell[r][k].sort((a, b) => a.x - b.x).map((p) => p.s).join(' '));
    return { head: [...c.above, c.head].join(' ').replace(/\s+/g, ' ').trim(), values: raw.map(cellValue) };
  });
  return { name: title.s.replace(/^RASGOS DE /i, '').trim(), columns, rows: rows.length };
}

/** El valor de una celda: número («+2», «3»), dados («2d6») o texto corto («+10 pies»); lo ilegible, null. */
function cellValue(raw: string): number | string | null {
  const t = raw.replace(/[—–-]+/g, '').trim();
  if (!t) return null;
  const dice = /^\+?(\d*d\d+)$/i.exec(t.replace(/\s+/g, ''));
  if (dice) return dice[1].toLowerCase().replace(/^d/, '1d');
  const num = /^[+]?(\d{1,3})\b\)?\.?$/.exec(t);
  if (num) return parseInt(num[1], 10);
  const feet = /^\+?(\d+)\s*(pies|m)$/i.exec(t);
  if (feet) return t;
  return null;
}

/** Valores de una columna de cantidades que solo crecen: un valor suelto fuera de orden es un error del OCR y se iguala al anterior. */
export function repairCounts(v: (number | string | null)[]): (number | string | null)[] {
  const out = v.slice();
  const num = (x: number | string | null): x is number => typeof x === 'number';
  for (let i = 1; i < out.length - 1; i++) {
    const p = out[i - 1], c = out[i], n = out[i + 1];
    if (num(p) && num(c) && num(n) && c > n && p <= n) out[i] = p;
    if (num(p) && num(c) && num(n) && c < p && n >= p) out[i] = p;
  }
  return out;
}

/** Tabla por niveles al estilo del SRD: solo los niveles donde cambia el valor. */
export function levelTable(v: (number | string | null)[]): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  let last: number | string | null = null;
  v.forEach((x, i) => { if (x !== null && x !== last) { out[String(i + 1)] = x; last = x; } });
  return out;
}

const SLOT_HEAD = /(?:^|\s)([1-9])\)?$/; // (columna de espacios de nivel N)
const slug2 = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Cantidades plausibles de una tabla de lanzador: lo demás es un error del OCR (un 22 en el nivel 1). */
const plausible = (kind: 'cantrips' | 'prepared', v: number | string | null, lv: number) => typeof v === 'number' && (kind === 'cantrips' ? v >= 1 && v <= 6 : v >= 1 && v <= lv + 5);

/**
 * Pasa a cada clase lo que se lee de su tabla de rasgos: trucos y conjuros preparados (con el hueco que deja el OCR a la vista),
 * las demás columnas con cantidades por nivel (furias, dados, puntos…) como tablas de la clase.
 */
export function attachTables<T extends LibClass & { problems: string[] }>(classes: T[], tables: ClassTable[]): T[] {
  return classes.map((k) => {
    const t = tables.find((x) => norm(x.name) === norm(k.n));
    if (!t) return k;
    const sc: LibClass['sc'] = { ...k.sc };
    const problems = k.problems.slice();
    let caster = k.caster;
    const got = (v: (number | string | null)[]) => v.filter((x) => x !== null).length;
    const set = (key: string, kind: 'cantrips' | 'prepared' | null, c: ClassTableColumn, label: string) => {
      const vals = repairCounts(kind ? c.values.map((v, i) => (plausible(kind, v, i + 1) ? v : null)) : c.values);
      const n = got(vals);
      if (n < (kind ? 3 : 6)) return false; // con muy pocas celdas leídas, la columna es ruido (o un título partido en dos)
      sc[key] = levelTable(vals);
      if (n < 20 && kind) problems.push(label + ': leídos ' + n + ' de 20 niveles; completa los que faltan.');
      return true;
    };
    // (los espacios de conjuro salen del PDF demasiado sucios para deducir de ellos el tipo de lanzador: solo la magia de pacto se reconoce)
    if (t.columns.some((c) => /nivel de los espacios|nivel de espacio/i.test(c.head))) caster = 'pact';
    for (const c of t.columns) {
      const h = norm(c.head);
      if (/^trucos/.test(h)) set(k.id + '.cantrips-known', 'cantrips', c, 'Trucos');
      else if (/preparados/.test(h)) set(k.id + '.max-prepared', 'prepared', c, 'Conjuros preparados');
      else if (/^(bonificador|rasgos|\|)|espacios|nivel de|^\d|competencia/.test(h) || SLOT_HEAD.test(c.head) || h.length < 4) continue;
      else if (c.values.some((v) => typeof v === 'number' || typeof v === 'string')) set(k.id + '.' + slug2(c.head), null, c, c.head);
    }
    const generic = Object.keys(sc).filter((key) => !k.sc[key] && !/\.(cantrips-known|max-prepared)$/.test(key));
    if (generic.length) problems.push('Tablas leídas del PDF (revisa que sean correctas): ' + t.columns.filter((c) => generic.includes(k.id + '.' + slug2(c.head))).map((c) => c.head).join(', ') + '.');
    const cleaned = caster === 'pact' ? problems.filter((p) => !/tipo de lanzador/.test(p)).concat(sc[k.id + '.cantrips-known'] && sc[k.id + '.max-prepared'] ? [] : ['Completa las tablas de trucos y de conjuros preparados.']) : problems;
    return { ...k, sc, caster, problems: cleaned };
  });
}
