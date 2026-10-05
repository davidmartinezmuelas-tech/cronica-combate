import { norm } from './util';

/**
 * Lo bien que un nombre (o su nombre en inglés) encaja con la búsqueda, ya normalizada:
 * 4 idéntico, 3 empieza igual, 2 alguna palabra empieza igual, 1 lo contiene, 0 no encaja.
 */
export function matchScore(q: string, ...names: (string | undefined)[]): number {
  if (!q) return 1;
  let best = 0;
  names.forEach((raw, i) => {
    const n = norm(raw);
    if (!n) return;
    let s = n === q ? 4 : n.startsWith(q) ? 3 : n.split(/[\s,()-]+/).some((w) => w.startsWith(q)) ? 2 : n.includes(q) ? 1 : 0;
    // el primer nombre (el español) manda: los demás solo empatan con él si coinciden del todo
    if (i > 0 && s < 4) s = Math.min(s, 2);
    best = Math.max(best, s);
  });
  return best;
}

/** Filtra y ordena por relevancia, sin cambiar el orden original entre los que encajan igual. */
export function rankBy<T>(items: T[], q: string, names: (it: T) => (string | undefined)[]): T[] {
  const nq = norm(q);
  if (!nq) return items;
  return items
    .map((it, i) => ({ it, i, s: matchScore(nq, ...names(it)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.it);
}
