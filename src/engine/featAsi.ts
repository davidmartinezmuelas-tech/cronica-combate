import { ABILS, type Abil, type PlayerData } from '../data/player';
import { classEntries, type Character } from './character';
import { norm } from './util';

/** Clave de lo que han dado las dotes a las características: «dote|característica|1 si dio competencia en su salvación». */
export const FEAT_ASI_KEY = 'feat.asi';

/** La mejora de característica de una dote, sacada de su texto: qué características puede subir, hasta dónde y si da competencia en su salvación. */
export interface FeatAsi {
  from: Abil[]; // las que puede subir (todas si es «de tu elección»)
  max: number; // tope de la puntuación (20, o 30 en un don épico)
  save: boolean; // da competencia en las tiradas de salvación de la característica elegida (Resiliente)
  noSave: boolean; // solo puede ser una en la que no tienes competencia en la salvación
}

const ES: Record<string, Abil> = { fuerza: 'str', destreza: 'dex', constitucion: 'con', inteligencia: 'int', sabiduria: 'wis', carisma: 'cha' };

/**
 * «Mejora de característica. Aumenta tu puntuación de Fuerza o Destreza en 1, hasta un máximo de 20.» (Atleta, Centinela…),
 * «…una puntuación de característica de tu elección…» (Experto en habilidades) o «Elige una característica en la que no
 * tengas competencia en tiradas de salvación…» (Resiliente). Se lee del texto de la dote: sirve para la del SRD y la del libro.
 * Las que suben 2 (la dote «Mejora de característica») se eligen en el paso de mejora al subir de nivel.
 */
export function featAsi(text: string): FeatAsi | null {
  const t = norm(text).replace(/\s+/g, ' ');
  const i = t.search(/mejora de (puntuacion de )?caracteristica/);
  if (i < 0) return null;
  const seg = t.slice(i, i + 300);
  // el aumento: «en 1» (no «en 2», que es la dote de mejora general)
  if (!/(aumenta|aumentas|sube)\b/.test(seg) && !/elige una caracteristica/.test(seg)) return null;
  if (/aumenta en 2\b|\ben 2 una puntuacion/.test(seg)) return null;
  // la frase hasta el tope («…, hasta un máximo de 20.»)
  const end = seg.search(/hasta un maximo de \d+/);
  const phrase = end >= 0 ? seg.slice(0, end) : seg.slice(0, 200);
  const max = /maximo de 30/.test(seg) ? 30 : 20;
  const names = [...phrase.matchAll(/\b(fuerza|destreza|constitucion|inteligencia|sabiduria|carisma)\b/g)].map((m) => ES[m[1]]);
  const from = names.length ? [...new Set(names)] : [...ABILS];
  return { from, max, save: /competencia en las tiradas de salvacion de la caracteristica elegida/.test(t), noSave: /(no tengas|no tienes) competencia en (las )?tiradas de salvacion/.test(seg) };
}

/** Tiradas de salvación con competencia: las de sus clases y las que haya añadido. */
export function saveProfs(c: Pick<Character, 'classId' | 'multi' | 'level' | 'className' | 'subclass' | 'saveExtra'>, data: PlayerData | null): Abil[] {
  return [...new Set([...classEntries(c).flatMap((e) => data?.classes.find((k) => k.id === e.classId)?.saves || []), ...c.saveExtra])];
}

/** Las características que la dote puede subir ahora: por debajo del tope y, en Resiliente, sin competencia en su salvación. */
export function featAsiOptions(fa: FeatAsi, c: Pick<Character, 'abil' | 'saveExtra' | 'classId' | 'multi' | 'level' | 'className' | 'subclass'>, data: PlayerData | null): Abil[] {
  const saves = fa.noSave ? saveProfs(c, data) : [];
  return fa.from.filter((a) => c.abil[a] < fa.max && !saves.includes(a));
}

/** Aplica la mejora de la dote a la hoja: +1 a la característica y, si la dote lo da, la competencia en su salvación. */
export function applyFeatAsi(c: Pick<Character, 'abil' | 'saveExtra' | 'choices' | 'classId' | 'multi' | 'level' | 'className' | 'subclass'>, feat: string, fa: FeatAsi, pick: Abil, data: PlayerData | null): Partial<Character> {
  const gains = fa.save && !saveProfs(c, data).includes(pick);
  return {
    abil: { ...c.abil, [pick]: Math.min(fa.max, c.abil[pick] + 1) },
    ...(gains ? { saveExtra: [...c.saveExtra, pick] } : {}),
    choices: { ...(c.choices || {}), [FEAT_ASI_KEY]: [...(c.choices?.[FEAT_ASI_KEY] || []), [feat, pick, gains ? '1' : '0'].join('|')] },
  };
}

/** Deshace lo que dio la dote al quitarla (la característica y la competencia que añadió), si se aplicó desde la hoja. */
export function removeFeatAsi(c: Pick<Character, 'abil' | 'saveExtra' | 'choices'>, feat: string): Partial<Character> {
  const all = c.choices?.[FEAT_ASI_KEY] || [];
  const mine = all.filter((x) => x.split('|')[0] === feat);
  if (!mine.length) return {};
  let abil = c.abil;
  let save = c.saveExtra;
  for (const x of mine) {
    const [, a, s] = x.split('|');
    abil = { ...abil, [a as Abil]: Math.max(1, abil[a as Abil] - 1) };
    if (s === '1') save = save.filter((k) => k !== a);
  }
  return { abil, saveExtra: save, choices: { ...(c.choices || {}), [FEAT_ASI_KEY]: all.filter((x) => x.split('|')[0] !== feat) } };
}
