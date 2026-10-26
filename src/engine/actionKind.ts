import { norm } from './util';

/** Cómo se usa un rasgo en el turno: acción adicional, reacción o ambas. */
export type ActionKind = 'bonus' | 'reaction' | 'both';

const BONUS = /(?:como|con|usando|usar|gastando|gasta|realizar|hacer|entrar[^.]{0,30}) (?:una |tu |la )?accion adicional|accion adicional,? (?:puedes|para|tu|el|la|y)/;
const REAC = /(?:usando|como|con|puedes usar|puedes gastar|gastar|usar|utilizar|realizar|llevar a cabo|hacer) (?:una |tu |la |esa )?reaccion|reaccion,? (?:puedes|para)/;

/**
 * Si el rasgo, la dote o la opción se usa con una acción adicional o una reacción, según su texto (las primeras frases:
 * más adelante solo se menciona de pasada). Sirve igual para el SRD, el libro del usuario y lo que escriba el jugador.
 */
export function actionKindOf(text: string): ActionKind | null {
  const t = norm(text).replace(/\s+/g, ' ').slice(0, 420);
  const b = BONUS.test(t);
  const r = REAC.test(t);
  return b && r ? 'both' : b ? 'bonus' : r ? 'reaction' : null;
}

/** Primera frase de un texto, recortada, para la línea de la tarjeta. */
export function firstSentence(text: string, max = 150): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = /^.{20,}?[.:](?=\s|$)/.exec(t);
  const s = m ? m[0] : t;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}
