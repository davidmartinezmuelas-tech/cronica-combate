import { textUses } from './featureUses';
import { norm } from './util';

export interface SheetFeature {
  n: string;
  d: string;
  lv?: number;
  max: number | null;
  per: '' | 'sr' | 'lr';
}

const prettyName = (s: string) => {
  const t = s.trim().replace(/\s+/g, ' ');
  // «ORDEN DIVINA» -> «Orden divina»; lo que ya trae minúsculas se respeta
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
};

/** Usos que dice el texto de un rasgo escrito a mano: «3 usos», «1/desc. largo», «4 times… long rest», o los de `textUses`. */
function usesOf(text: string): { max: number | null; per: '' | 'sr' | 'lr' } {
  const t = norm(text);
  const rest = /desc(?:anso)?\.?\s*(?:largo|corto)|long rest|short rest/.exec(t);
  const per = (s: string): 'sr' | 'lr' => (/corto|short/.test(s) ? 'sr' : 'lr');
  const a = /\b(\d{1,2})\s*(?:usos?|uses|veces|times)\b[^.]{0,120}?(?:desc(?:anso)?\.?\s*(corto|largo)|(long|short) rest)/.exec(t);
  if (a) return { max: parseInt(a[1], 10), per: per(a[2] || a[3] || '') };
  const b = /\b(\d{1,2})\s*\/\s*(?:desc(?:anso)?\.?\s*(corto|largo)|(long|short) rest)/.exec(t);
  if (b) return { max: parseInt(b[1], 10), per: per(b[2] || b[3] || '') };
  const u = textUses(text);
  if (u && /^\d+$/.test(u.max)) return { max: parseInt(u.max, 10), per: u.per as 'sr' | 'lr' };
  // «una vez por descanso largo» u «once per long rest»
  if (rest && /\buna vez\b|\bonce\b|\b1 vez\b/.test(t.slice(Math.max(0, rest.index - 60), rest.index))) return { max: 1, per: per(rest[0]) };
  return { max: null, per: '' };
}

// «Level 3: Sacred Weapon», «Nivel 3: Arma sagrada»
const LEVEL_HEAD = /^(?:level|nivel|nv|lv)\s*(\d{1,2})\s*[:.-]\s*(.+)$/i;
// «ORDEN DIVINA: texto», «GOLPES BENDITOS (nv 7): texto»: el nombre empieza en mayúscula y el texto sigue tras los dos puntos
const COLON_HEAD = /^([A-ZÁÉÍÓÚÑ][^:.\n]{2,60}?)\s*(?:\((?:nv|lv|nivel|level)\s*(\d{1,2})\))?\s*:\s+(\S.*)$/;
// «Damage Resistance. You have…»: nombre corto con las palabras en mayúscula seguido de punto y una frase
const DOT_HEAD = /^([A-ZÁÉÍÓÚÑ][\p{L}’'-]*(?: (?:of|the|and|to|for|de|del|la|el|y|[A-ZÁÉÍÓÚÑ][\p{L}’'-]*|\p{Ll}[\p{L}’'-]*)){0,4})\.\s+(\S.*)$/u;

/**
 * Los rasgos de un bloque de texto de la hoja (clase, subclase o especie): cada uno empieza en una línea con su nombre
 * («Level 3: Nombre», «NOMBRE: texto», «Nombre. Texto») y sigue hasta el siguiente. La primera línea suelta (el título
 * del bloque) y las líneas anteriores al primer nombre se descartan.
 */
export function parseFeatureBlock(text: string): SheetFeature[] {
  const out: { n: string; lv?: number; body: string[] }[] = [];
  let cur: (typeof out)[number] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { cur?.body.push(''); continue; }
    const bullet = /^[-•·*]\s/.test(line);
    let m: RegExpExecArray | null;
    if (!bullet && (m = LEVEL_HEAD.exec(line))) {
      cur = { n: m[2].trim(), lv: parseInt(m[1], 10), body: [] };
      // «Nivel 3: Nombre. Texto…» en la misma línea
      const dot = DOT_HEAD.exec(cur.n);
      if (dot) { cur.n = dot[1]; cur.body.push(dot[2]); }
      out.push(cur);
    } else if (!bullet && (m = COLON_HEAD.exec(line))) {
      cur = { n: m[1].trim(), ...(m[2] ? { lv: parseInt(m[2], 10) } : {}), body: [m[3]] };
      out.push(cur);
    } else if (!bullet && (!cur || cur.body[cur.body.length - 1] === '') && (m = DOT_HEAD.exec(line))) {
      cur = { n: m[1], body: [m[2]] };
      out.push(cur);
    } else cur?.body.push(line);
  }
  return out
    .map((f) => ({ n: prettyName(f.n), d: f.body.join('\n').replace(/\n{3,}/g, '\n\n').trim(), ...(f.lv ? { lv: f.lv } : {}) }))
    .filter((f) => f.n.length > 1 && f.d.length > 0)
    .map((f) => ({ ...f, ...usesOf(f.d) }));
}
