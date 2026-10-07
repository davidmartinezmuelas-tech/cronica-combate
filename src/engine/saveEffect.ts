import { CONDITIONS } from '../data/constants';
import { norm } from './util';

/**
 * Efecto con salvación (acción de monstruo o conjuro): CD, característica, si se recibe la mitad al superarla y los
 * estados que pone a quien falla, con su duración. Se lee del texto, no se escribe a mano.
 */
export interface SaveEffect {
  dc: number;
  abil: number; // 0-5: FUE, DES, CON, INT, SAB, CAR
  half: boolean;
  conds: string[];
  rounds: number | null; // duración en rondas (null: hasta que se quite)
  until: 'caster' | 'target' | null; // «hasta el final de tu/su siguiente turno»: de quién es ese turno
  repeat: boolean; // repite la salvación al final de cada turno (recordatorio)
  by?: string; // id de quien lo lanza (para la duración)
}

const ABBR = ['fue', 'des', 'con', 'int', 'sab', 'car'];
const LONG = ['fuerza', 'destreza', 'constitucion', 'inteligencia', 'sabiduria', 'carisma'];

/** Índice de característica de «DES», «Destreza», «dex»… */
export function abilIndex(a: string): number {
  const n = norm(a).slice(0, 3);
  const en = ['str', 'dex', 'con', 'int', 'wis', 'cha'].indexOf(n);
  if (en >= 0) return en;
  const i = ABBR.indexOf(n);
  return i >= 0 ? i : LONG.findIndex((l) => l.startsWith(n));
}

const stem = (w: string) => norm(w).replace(/(os|as|o|a)$/, '');

/** Estados que pone el texto («tendrá el estado de asustado», «tiene la condición Agarrado», «las condiciones Cegado y Ensordecido»). */
export function conditionsIn(text: string): string[] {
  const t = norm(text);
  const out: string[] = [];
  for (const m of t.matchAll(/(?:estados?|condicion(?:es)?) (?:de )?([a-z]+)(?:(?:,| y| o) (?:de |el estado de |la condicion )?([a-z]+))?(?:(?:,| y| o) (?:de )?([a-z]+))?/g)) {
    for (const w of m.slice(1).filter(Boolean)) {
      const k = CONDITIONS.map((c) => c[0]).find((c) => stem(c) === stem(w));
      if (k && !out.includes(k)) out.push(k);
    }
  }
  return out;
}

/** Duración de los estados del texto. */
export function durationIn(text: string): Pick<SaveEffect, 'rounds' | 'until' | 'repeat'> {
  const t = norm(text);
  const repeat = /repite la (tirada de )?salvacion/.test(t);
  if (/hasta el final de tu siguiente turno/.test(t)) return { rounds: 1, until: 'caster', repeat };
  if (/hasta el final de su siguiente turno/.test(t)) return { rounds: 1, until: 'target', repeat };
  const min = /durante (\d+) minutos?/.exec(t) || (/durante 1 minuto|durante un minuto/.test(t) ? ['', '1'] : null);
  if (min) return { rounds: parseInt(min[1], 10) * 10, until: 'target', repeat };
  const rd = /durante (\d+) rondas/.exec(t);
  if (rd) return { rounds: parseInt(rd[1], 10), until: 'target', repeat };
  return { rounds: null, until: null, repeat };
}

/** El efecto de un texto con su CD y característica ya sabidas (acción de monstruo o conjuro). */
export function saveEffectOf(dc: number, abil: string | number, half: boolean, text: string, by?: string): SaveEffect | null {
  const a = typeof abil === 'number' ? abil : abilIndex(abil);
  // solo con salvación (la CD de escape de un agarre en un ataque no lo es)
  if (!(dc > 0) || a < 0 || !/salvaci/i.test(text)) return null;
  return { dc, abil: a, half, conds: conditionsIn(text), ...durationIn(text), by };
}
