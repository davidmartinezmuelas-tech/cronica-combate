import type { Uses } from '../data/player';
import { norm } from './util';

const ABIL_ES: Record<string, string> = { fuerza: 'str', destreza: 'dex', constitucion: 'con', inteligencia: 'int', sabiduria: 'wis', carisma: 'cha' };
const NUM: Record<string, number> = { una: 1, un: 1, dos: 2, tres: 3, cuatro: 4 };

/** Descanso con el que se recupera, mirando el texto que sigue a la regla de usos (o, si no lo dice ahí, todo). */
function perOf(t: string, at: number): Uses['per'] {
  const near = t.slice(at, at + 260);
  const src = /descanso (corto|largo)/.test(near) ? near : t;
  const i = src.search(/descanso (corto|largo)/);
  const s = src.slice(i);
  return /^descanso corto o (un )?largo/.test(s) || /^descanso corto/.test(s) ? 'sr' : 'lr';
}

/**
 * Usos de un rasgo deducidos de su texto, para los que no traen el dato (los del libro del usuario y algunos del
 * SRD): «una cantidad de veces igual a tu modificador por Carisma», «…igual a tu bonificador por competencia»,
 * «Una vez que uses este rasgo, no podrás volver a hacerlo hasta que finalices un descanso largo», «dos veces…».
 * Se recuperan en el descanso que diga el texto. Solo el número de usos: lo que hace el rasgo se lee en su texto.
 */
export function textUses(text: string): Uses | null {
  const t = norm(text).replace(/\s+/g, ' ');
  if (!/descanso (corto|largo)/.test(t)) return null;
  const tests: [RegExp, (m: RegExpExecArray) => string][] = [
    [/(?:numero|cantidad) de veces igual a tu modificador (?:por|de) (fuerza|destreza|constitucion|inteligencia|sabiduria|carisma)/, (m) => 'max(1, @abilities.' + ABIL_ES[m[1]] + '.mod)'],
    [/(?:numero|cantidad) de veces igual a tu bonificador (?:por|de) competencia/, () => '@prof'],
    [/\b(una|dos|tres|cuatro) veces?\b[^.]{0,120}(?:recuperas|descanso)/, (m) => String(NUM[m[1]])],
    // «Una vez que lo uses, no podrás volver a hacerlo hasta que finalices un descanso…»
    [/no (?:puedes|podras) volver a (?:hacerlo|usarlo|usar(?:lo)? este|usar esta|lanzarlo|lanzar)[^.]{0,80}descanso/, () => '1'],
    // «…debes terminar un descanso largo antes de poder lanzarlo de este modo de nuevo»
    [/debes (?:terminar|finalizar) un descanso (?:corto|largo)[^.]{0,40}antes de poder/, () => '1'],
    [/\buna vez\b[^.]{0,80}(?:sin gastar|hasta que (?:finalices|termines) un descanso)/, () => '1'],
  ];
  for (const [re, max] of tests) {
    const m = re.exec(t);
    if (m) return { max: max(m), per: perOf(t, m.index) };
  }
  return null;
}

/**
 * Rasgos con varios conjuros que se lanzan gratis una vez cada uno: un círculo por conjuro. Arcano místico (brujo:
 * uno a los niveles 11, 13, 15 y 17) y Conjuros característicos (mago 20: dos).
 */
const PER_SPELL: Record<string, { at: Record<number, number>; per: Uses['per'] }> = {
  'arcano mistico': { at: { 11: 1, 13: 2, 15: 3, 17: 4 }, per: 'lr' },
  'conjuros caracteristicos': { at: { 20: 2 }, per: 'sr' },
};

/** Usos de un rasgo sin el dato: por su nombre (los de varios conjuros) o por su texto. `level`: nivel de su clase. */
export function featureUses(name: string, text: string, level: number): Uses | null {
  const fix = PER_SPELL[norm(name)];
  if (fix) {
    let n = 0;
    for (const [lv, v] of Object.entries(fix.at)) if (parseInt(lv, 10) <= level) n = v;
    return n ? { max: String(n), per: fix.per } : null;
  }
  return textUses(text);
}
