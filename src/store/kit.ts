import type { DieView, LogEntry } from '../data/types';
import type { LogDraft } from '../engine/combat';
import { rollDie, type PhysicalDie } from '../engine/dice';
import { throwOrigin } from '../engine/throw';
import { uid } from '../engine/util';
import type { GetState, SetState, State } from './state';

export type Finish = () => Partial<State> & { logEntry?: LogDraft; extraLog?: LogDraft[] };

/** Utilidades compartidas por las partes del store: historial y animación de los dados. */
export interface Kit {
  pushLog: (entries: LogDraft[], log?: LogEntry[]) => LogEntry[];
  /** Si hay una tirada rodando, la resuelve ya y repite la acción en el siguiente ciclo. */
  guard: (fn: () => void) => boolean;
  animate: (dice: PhysicalDie[], finish: Finish) => void;
}

const faceView = (d: DieView, done: boolean): DieView => ({
  ...d,
  done,
  face: done ? d.final : rollDie(d.sides),
  extra: done && d.sides === 20 && !d.dim ? (d.final === 20 ? 'nat20' : d.final === 1 ? 'nat1' : '') : '',
});

/** Si hay más dados que huecos, reparte los huecos entre los tipos de daño para que se vean todos. */
/** Tamaño de dado y cuadrícula: el mayor dado con el que caben todos sin solaparse (si no caben, el más pequeño). */
export function layoutFor(n: number, w: number, h: number): { size: number; cols: number; rows: number } {
  const fit = (size: number) => {
    const cols = Math.max(1, Math.floor((w - 8 - size) / (size + 6)) + 1);
    const rows = Math.max(1, Math.floor((h - 8 - size) / (size + 6)) + 1);
    return { size, cols, rows };
  };
  for (const size of [64, 50]) { const l = fit(size); if (n <= l.cols * l.rows) return l; }
  return fit(40);
}

export function pickShown(dice: PhysicalDie[], cap: number): PhysicalDie[] {
  if (dice.length <= cap) return dice;
  const groups = new Map<string, PhysicalDie[]>();
  dice.forEach((d) => { const k = d.type || ''; groups.set(k, [...(groups.get(k) || []), d]); });
  const keys = Array.from(groups.keys());
  const quota = new Map(keys.map((k) => [k, Math.max(1, Math.floor((groups.get(k)!.length / dice.length) * cap))]));
  let used = Array.from(quota.values()).reduce((a, b) => a + b, 0);
  for (let i = 0; used > cap; i = (i + 1) % keys.length) { const k = keys[i]; if (quota.get(k)! > 1) { quota.set(k, quota.get(k)! - 1); used--; } }
  for (let i = 0; used < cap; i = (i + 1) % keys.length) { const k = keys[i]; if (quota.get(k)! < groups.get(k)!.length) { quota.set(k, quota.get(k)! + 1); used++; } }
  return keys.flatMap((k) => groups.get(k)!.slice(0, quota.get(k)));
}

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export function createKit(set: SetState, get: GetState): Kit {
  // temporizadores de la animación (fuera del estado)
  let t1: ReturnType<typeof setTimeout> | undefined;
  let iv: ReturnType<typeof setInterval> | undefined;
  let pending: { finish: Finish; shown: DieView[] } | null = null;

  const pushLog = (entries: LogDraft[], log?: LogEntry[]) => {
    let l = log ?? get().log;
    entries.forEach((e) => { l = [{ id: 'l' + uid(), ...e }, ...l]; });
    return l.slice(0, 40);
  };

  const completeRoll = (finish: Finish, next: DieView[]) => {
    const out = finish() || {};
    const entries: LogDraft[] = [];
    if (out.logEntry) entries.push(out.logEntry);
    (out.extraLog || []).forEach((e) => entries.push(e));
    delete out.logEntry;
    delete out.extraLog;
    set({ ...out, dice: next, rolling: false, log: pushLog(entries) });
  };

  const flush = () => {
    const p = pending;
    if (!p) return;
    pending = null;
    clearTimeout(t1);
    if (iv) { clearInterval(iv); iv = undefined; }
    completeRoll(p.finish, p.shown.map((d) => faceView(d, true)));
  };

  const guard = (fn: () => void) => {
    if (!pending) return false;
    flush();
    setTimeout(fn, 0);
    return true;
  };

  const animate = (dice: PhysicalDie[], finish: Finish) => {
    flush();
    const felt = typeof document !== 'undefined' ? document.querySelector('.felt') as HTMLElement | null : null;
    const { size, cols, rows } = layoutFor(dice.length, felt?.clientWidth || 260, felt?.clientHeight || 280);
    const many = size < 64;
    const slots: [number, number][] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push([c, r]);
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const hand = throwOrigin();
    const anyDim = dice.some((d) => d.dim);
    const shown: DieView[] = pickShown(dice, cols * rows).map((d, i) => ({
      id: 'd' + uid(), sides: d.sides, final: d.final, face: d.final, dim: !!d.dim, kept: anyDim && !d.dim && d.sides === 20, dtype: d.type || '', done: false, extra: '',
      // % del área útil del tapete (el dado entero siempre queda dentro)
      x: Math.max(0, Math.min(100, Math.round((cols > 1 ? (slots[i][0] / (cols - 1)) * 100 : 50) + (Math.random() * 4 - 2)))),
      y: Math.max(0, Math.min(100, Math.round((rows > 1 ? (slots[i][1] / (rows - 1)) * 100 : 50) + (Math.random() * 4 - 2)))),
      ox: hand.ox + (Math.random() - 0.5) * 0.16, oy: hand.oy + (Math.random() - 0.5) * 0.16,
      spin: (Math.random() < 0.5 ? -1 : 1) * (540 + Math.random() * 540), tilt: 25 + Math.random() * 30,
      delay: Math.round(i * (many ? 28 : 50) + Math.random() * 40), dur: Math.round((many ? 720 : 820) + Math.random() * 220),
    }));
    set({ dieSize: size, moreDice: Math.max(0, dice.length - shown.length) });
    if (reducedMotion()) {
      completeRoll(finish, shown.map((d) => faceView(d, true)));
      return;
    }
    pending = { finish, shown };
    set({ dice: [], rolling: true, result: null });
    t1 = setTimeout(() => {
      const start = Date.now();
      set({ dice: shown.map((d) => faceView(d, false)) });
      iv = setInterval(() => {
        const el = Date.now() - start;
        let all = true;
        // el número se fija cuando el dado deja de botar
        const next = shown.map((d) => { const dn = el > d.delay + d.dur * 0.82; if (!dn) all = false; return faceView(d, dn); });
        if (!all) { set({ dice: next }); return; }
        if (iv) { clearInterval(iv); iv = undefined; }
        if (!pending) return;
        const p = pending;
        pending = null;
        completeRoll(p.finish, next);
      }, 60);
    }, 40);
  };

  return { pushLog, guard, animate };
}
