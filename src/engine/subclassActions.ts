import type { Abil } from '../data/player';
import { norm } from './util';

/**
 * Opciones de subclase que se usan en la mesa (maniobras…): un recurso de dados (cuántos, de qué tamaño, cuándo se
 * recuperan) y, para cada opción, qué tirada hace. Lo que hace cada opción se deduce de su texto (el del libro del
 * usuario), no se escribe aquí: «suma el dado … a la tirada de daño», «prueba de Destreza (Sigilo)», «tirada de
 * salvación de Fuerza», «más tu modificador por Fuerza o Destreza»…
 */
export interface DiceResource {
  key: string; // clave de usos gastados (c.uses)
  n: string;
  per: 'sr' | 'lr';
  count: Record<number, number>; // nivel -> dados
  die: Record<number, number>; // nivel -> caras
  dc: Abil[]; // la CD es 8 + competencia + la mejor de estas características
}

/** Valor de una tabla por nivel («a partir del nivel N»). */
export function atLevel(table: Record<number, number>, level: number): number {
  let v = 0;
  for (const [lv, n] of Object.entries(table)) if (parseInt(lv, 10) <= level) v = n;
  return v;
}

export interface OptionAction {
  damage: boolean; // suma el dado al daño de tu ataque
  checks: string[]; // habilidades a cuya prueba se suma (claves)
  init: boolean; // se suma a la iniciativa
  save: Abil | null; // el objetivo hace una salvación (se muestra la CD)
  plus: 'str-dex' | 'half-level' | null; // se suma algo más al dado
}

const ABIL_ES: Record<string, Abil> = { fuerza: 'str', destreza: 'dex', constitucion: 'con', inteligencia: 'int', sabiduria: 'wis', carisma: 'cha' };

/** Qué tirada hace una opción, según su texto. `skills`: clave -> nombre de cada habilidad. */
export function optionAction(text: string, skills: Record<string, string>): OptionAction {
  const t = norm(text).replace(/\s+/g, ' ');
  const sentences = t.split(/\.\s/);
  // a tu daño (no al de otra criatura a la que das la orden: «esa criatura podrá … sumar el dado …»)
  const damage = sentences.some((s) => /\bsuma\w*\b.{0,50}\b(a la|ala|al) (tirada de )?dano/.test(s) && !/esa criatura/.test(s));
  const byName = new Map(Object.entries(skills).map(([k, n]) => [norm(n), k]));
  const checks: string[] = [];
  for (const s of sentences.filter((x) => /prueba de /.test(x))) {
    for (const m of s.matchAll(/\(([^)]+)\)/g)) {
      for (const name of m[1].split(/,| o | y /)) {
        const k = byName.get(name.trim());
        if (k && !checks.includes(k)) checks.push(k);
      }
    }
  }
  const save = /tirada de salvacion de (fuerza|destreza|constitucion|inteligencia|sabiduria|carisma)/.exec(t);
  return {
    damage, checks,
    init: /tirada de iniciativa/.test(t),
    save: save ? ABIL_ES[save[1]] : null,
    plus: /mas tu modificador por fuerza o destreza/.test(t) ? 'str-dex' : /mitad de tu nivel/.test(t) ? 'half-level' : null,
  };
}
