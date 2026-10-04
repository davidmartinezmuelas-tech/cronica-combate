import type { DieView, LogEntry } from '../data/types';
import type { LogDraft } from '../engine/combat';
import { rollDie, shapeClass, type PhysicalDie } from '../engine/dice';
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

const ROLL_MS = 640;
const faceView = (d: DieView, done: boolean): DieView => ({
  ...d,
  done,
  face: done ? d.final : rollDie(d.sides),
  extra: done && d.sides === 20 && !d.dim ? (d.final === 20 ? 'nat20' : d.final === 1 ? 'nat1' : '') : '',
});

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
    const many = dice.length > 12;
    const cols = many ? 6 : 5;
    const rows = many ? 4 : 3;
    const slots: [number, number][] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push([c, r]);
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const shown: DieView[] = dice.slice(0, cols * rows).map((d, i) => ({
      id: 'd' + uid(), sides: d.sides, final: d.final, face: d.final, dim: !!d.dim, done: false, extra: '',
      x: Math.round((slots[i][0] + 0.5) * (100 / cols) + (Math.random() * 6 - 3)),
      y: Math.round((slots[i][1] + 0.5) * (92 / rows) + 4 + (Math.random() * 4 - 2)),
      delay: i * (many ? 40 : 70), tumble: 't' + (1 + Math.floor(Math.random() * 3)), cls: shapeClass(d.sides),
    }));
    set({ manyDice: many, moreDice: Math.max(0, dice.length - shown.length) });
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
        const next = shown.map((d) => { const dn = el > d.delay + ROLL_MS; if (!dn) all = false; return faceView(d, dn); });
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
