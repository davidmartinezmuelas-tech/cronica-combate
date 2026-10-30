import type { HistEntry, HistKind } from '../data/types';

/** Historial del combate: anotaciones breves (quién hizo qué y cuándo) para repasar la sesión o copiarla a las notas. */
export const HIST_MAX = 500;

export const HIST_LABELS: Record<HistKind, string> = { dano: 'Daño', cura: 'Curación', estado: 'Estados', turno: 'Turnos', muerte: 'Caídas', otro: 'Otros' };
export const HIST_KINDS = Object.keys(HIST_LABELS) as HistKind[];

/** El texto de un aviso del registro de dados («X recibe 7 de daño · 7 cortante (3/10)»). */
export const draftText = (d: { label: string; detail?: string; total?: string }) => d.label + (d.detail ? ' · ' + d.detail : '') + (d.total ? ' (' + d.total + ')' : '');

/** El tipo de una anotación a partir de lo que dice su título. */
export function kindOf(label: string): HistKind {
  const l = label.toLowerCase();
  if (/muere|inconsciente|salvaci[oó]n de muerte|cae a 0|estable/.test(l)) return 'muerte';
  if (/recibe .* de da[nñ]o/.test(l)) return 'dano';
  if (/se cura|temporales|regenera/.test(l)) return 'cura';
  if (/concentraci|estado|agotamiento|salvaci[oó]n de|legendaria/.test(l)) return 'estado';
  return 'otro';
}

export const makeHist = (k: HistKind, text: string, r: number, t = Date.now()): HistEntry => ({ t, r, k, text });

/** Añade anotaciones sin pasar del tope: se descartan las más antiguas. */
export const pushHist = (h: HistEntry[], add: HistEntry[]): HistEntry[] => (add.length ? h.concat(add).slice(-HIST_MAX) : h);

/** Repara lo que venga guardado o importado: solo anotaciones con la forma esperada. */
export function normHist(raw: unknown): HistEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HistEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const x = e as Record<string, unknown>;
    if (typeof x.text !== 'string' || !x.text) continue;
    const k = HIST_KINDS.includes(x.k as HistKind) ? (x.k as HistKind) : 'otro';
    out.push({ t: typeof x.t === 'number' && isFinite(x.t) ? x.t : 0, r: typeof x.r === 'number' && x.r >= 1 ? Math.floor(x.r) : 1, k, text: x.text.slice(0, 300) });
  }
  return out.slice(-HIST_MAX);
}

/** El historial como texto para pegar en las notas: agrupado por rondas, de la primera a la última anotación. */
export function historyText(h: HistEntry[], kinds?: HistKind[]): string {
  const list = kinds && kinds.length ? h.filter((e) => kinds.includes(e.k)) : h;
  const lines: string[] = [];
  let round = 0;
  for (const e of list) {
    if (e.r !== round) { if (lines.length) lines.push(''); lines.push('Ronda ' + e.r); round = e.r; }
    lines.push('- ' + e.text);
  }
  return lines.join('\n');
}
