import type { Abil } from '../data/player';
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

export interface LibFeat { id: string; n: string; cat: 'origin' | 'general' | 'fighting-style' | 'epic-boon'; req: string; d: string }
export interface LibBackground { id: string; n: string; abil: Abil[]; skills: string[]; tool: string; feat: string; equip: string; d: string }
export interface LibSpell { id: string; n: string; l: number; esc: string; classes: string[]; ct: string; r: string; cmp: string; du: string; c: number; rit: number; t: string }
/** `x`: apartados de opciones que van tras los rasgos («Opciones de maniobras»). */
export interface LibSubclass { id: string; n: string; cls: string; d: string; f: { lv: number; n: string; d: string }[]; x?: { n: string; d: string }[] }

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
  return out.join('\n\n');
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
  for (let i = 0; i < lines.length; i++) {
    if (!/^Puntuaciones de caracter[ií]stica\s*:/i.test(lines[i].t)) continue;
    // el nombre: el título en mayúsculas justo encima (a veces el OCR no lo lee: se deduce después por el orden)
    let h = i - 1;
    while (h >= 0 && !isCaps(lines[h].t) && i - h < 3) h--;
    const titled = h >= 0 && isCaps(lines[h].t);
    const fields: Record<string, string> = {};
    let key = '';
    const desc: string[] = [];
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
      else { key = 'x'; desc.push(t); }
    }
    const abilTxt = norm(fields.puntuaciones || '');
    const abil = Object.entries(ABIL_ES).filter(([es]) => abilTxt.includes(es)).map(([, k]) => k);
    const skillTxt = norm(fields.competencias || '');
    const skills = Object.entries(SKILL_ES).filter(([es]) => skillTxt.includes(es)).map(([, k]) => k).filter((k, n, a) => a.indexOf(k) === n);
    const feat = (fields.dote || '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
    const name = titled ? titleCase(lines[h].t) : '';
    out.push({ id: '', n: name, abil, skills, tool: (fields.competencia || fields.herramientas || '').trim(), feat, equip: (fields.equipo || '').trim(), d: paragraphs(desc) });
    i = j - 1;
  }
  nameBackgrounds(out);
  return dedupe(out.map((b) => ({ ...b, id: id('lib-trasfondo', b.n) })));
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
const CLASS_ES: Record<string, string> = { bardo: 'bard', clerigo: 'cleric', druida: 'druid', explorador: 'ranger', hechicero: 'sorcerer', brujo: 'warlock', mago: 'wizard', paladin: 'paladin' };
const SPELL_HEAD = /^(?:(Truco) de ([A-Za-zÁÉÍÓÚáéíóúñ]+)|([A-Za-zÁÉÍÓÚáéíóúñ]+) de nivel (\d))\s*(?:\((.*)\)?)?/;

/** Conjuros: título en mayúsculas y debajo «Escuela de nivel N (clases)» o «Truco de escuela (clases)»; luego tiempo, alcance, componentes y duración. */
export function parseSpells(lines: Line[]): LibSpell[] {
  const out: LibSpell[] = [];
  let cur: { s: LibSpell; meta: string; body: string[] } | null = null;
  const flush = () => {
    if (cur) {
      const m = cur.meta;
      const get = (k: RegExp) => (k.exec(m)?.[1] || '').trim();
      cur.s.ct = get(/Tiempo de lanzamiento:\s*(.*?)(?=Alcance:|$)/i);
      cur.s.r = get(/Alcance:\s*(.*?)(?=Componentes:|$)/i);
      cur.s.cmp = get(/Componentes:\s*(.*?)(?=Duraci[oó]n:|$)/i);
      cur.s.du = get(/Duraci[oó]n:\s*(.*)$/i);
      cur.s.c = /concentraci[oó]n/i.test(cur.s.du) ? 1 : 0;
      cur.s.rit = /ritual/i.test(cur.s.ct) ? 1 : 0;
      cur.s.t = paragraphs(cur.body);
      out.push(cur.s);
    }
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].t;
    const head = SPELL_HEAD.exec(lines[i + 1]?.t || '');
    const school = head && (head[2] || head[3]);
    if (isTitle(t) && head && SCHOOLS.some((s) => norm(s) === norm(school || ''))) {
      flush();
      let clsTxt = head[5] || '';
      let j = i + 1;
      while (clsTxt && !lines[j].t.includes(')') && j + 1 < lines.length && !/^Tiempo de lanzamiento/i.test(lines[j + 1].t)) { j++; clsTxt += ' ' + lines[j].t; }
      const classes = Object.entries(CLASS_ES).filter(([es]) => norm(clsTxt).includes(es)).map(([, k]) => k);
      const name = titleCase(t);
      cur = { s: { id: id('lib-conjuro', name), n: name, l: head[1] ? 0 : parseInt(head[4], 10), esc: SCHOOLS.find((s) => norm(s) === norm(school || '')) || '', classes, ct: '', r: '', cmp: '', du: '', c: 0, rit: 0, t: '' }, meta: '', body: [] };
      i = j;
      continue;
    }
    if (!cur) continue;
    // metadatos hasta la duración; luego la descripción (los pies de ilustración en mayúsculas se descartan)
    if (!/Duraci[oó]n:/i.test(cur.meta)) cur.meta += ' ' + t;
    else if (!isCaps(t)) cur.body.push(t);
  }
  flush();
  return dedupe(out);
}

function dedupe<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

/** Páginas que interesan, según lo que contiene cada una (así no hace falta saber la paginación del libro). */
export function classifyPage(text: string): ('feats' | 'backgrounds' | 'spells' | 'classes')[] {
  const out: ('feats' | 'backgrounds' | 'spells' | 'classes')[] = [];
  if (FEATURE_HEAD.test(text) || /SUBCLASES DE/.test(text)) out.push('classes');
  if (/Dote (de origen|general|de estilo de combate|de don [ée]pico)/.test(text)) out.push('feats');
  if (/Puntuaciones de caracter[ií]stica\s*:/.test(text)) out.push('backgrounds');
  if (/Tiempo de lanzamiento\s*:/.test(text)) out.push('spells');
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
const isSubclassName = (cls: string, t: string) => {
  const n = norm(t).replace(/^[^a-z]+/, '');
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

export function parseSubclasses(lines: Line[]): LibSubclass[] {
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

  for (const { t } of lines) {
    const section = /^SUBCLASES DE (\p{L}+)/u.exec(t);
    if (section) { flush(); st.pending = null; st.cls = CLASS_IDS[norm(section[1])] || ''; continue; }
    // los rasgos de la clase base (siguiente capítulo de clase) cierran la sección de subclases
    const core = /^RASGOS DE (\p{L}+)/u.exec(t);
    if (core) { flush(); st.pending = null; st.cls = ''; coreCls = CLASS_IDS[norm(core[1])] || ''; continue; }
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
        open(p?.name || '', p?.intro || []);
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
    if (isTitle(t) && isSubclassName(st.cls, t)) {
      const name = titleCase(t);
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
