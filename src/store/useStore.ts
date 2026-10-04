import { create } from 'zustand';
import { SCHEMA_VERSION } from '../data/constants';
import type { Combatant, ConcPrompt, DieView, DmgPart, LogEntry, Monster, RollResult, RosterEntry, SavedState, Spell, SrdData, TurnEvent } from '../data/types';
import { combineAdv, rollParts, shapeClass, rollDie, sgn, type AdvMode, type PhysicalDie, type RollKind, type RollPart } from '../engine/dice';
import {
  addCondition, applyDamage, applyHeal, makeLair, makeMonsterCombatant, makePcCombatant, resolveDeathSave, rollModifiers, setExhaustion, sortCombatants,
  stepTurn, turnStart, uniqueName, type LogDraft, type RechargeCheck,
} from '../engine/combat';
import { blankForge, forgeToMonster, monsterToForge, type ForgeFeat, type ForgeState } from '../engine/forge';
import { uid } from '../engine/util';
import { blankRoster, buildExport, loadSaved, mergeImport, requestPersistence, saveState } from './persist';

export type Tab = 'combat' | 'bestiary' | 'group' | 'forge';

export interface RollSpec {
  label: string;
  kind: RollKind;
  parts: RollPart[];
  who?: string; // nombre del atacante (para ligar el crítico)
  cid?: string; // combatiente que tira (estados y agotamiento)
  ability?: number; // característica en salvaciones/pruebas
  half?: boolean;
  by?: string | null;
  noAdv?: boolean;
  after?: (total: number, nat: number | null) => Partial<State> & { resultNote?: string; extraLog?: LogDraft[] };
}

interface Snapshot {
  label: string;
  at: number;
  data: Pick<State, 'combatants' | 'round' | 'activeId' | 'started' | 'turnEvents' | 'concPrompts' | 'critFor' | 'selId' | 'roster' | 'custom'>;
}

export interface State {
  tab: Tab;
  loaded: boolean;
  loadError: string;
  srd: Monster[];
  spells: Record<string, Spell>;
  types: string[];
  storageOk: boolean;
  persistent: boolean;
  // datos persistentes
  custom: Monster[];
  roster: RosterEntry[];
  combatants: Combatant[];
  round: number;
  activeId: string | null;
  started: boolean;
  log: LogEntry[];
  diceTheme: string;
  turnEvents: TurnEvent[];
  // combate
  selId: string | null;
  concPrompts: ConcPrompt[];
  surprised: boolean;
  amount: string;
  dmgType: string;
  condRounds: string;
  // bestiario
  search: string;
  fType: string;
  fCr: string;
  fLeg: boolean;
  fMine: boolean;
  viewId: string | null;
  qty: Record<string, number>;
  hpMode: 'avg' | 'roll';
  shareInit: boolean;
  addLair: boolean;
  bLimit: number;
  // dados
  dice: DieView[];
  rolling: boolean;
  result: RollResult | null;
  adv: AdvMode;
  critFor: { who: string } | null;
  dmgTargets: Record<string, 'full' | 'half'>;
  manyDice: boolean;
  moreDice: number;
  expr: string;
  exprError: boolean;
  // grupo
  pcForm: RosterEntry;
  editingPcId: string | null;
  pcMsg: string;
  ioMsg: string;
  // forja
  forge: ForgeState;
  editingId: string | null;
  forgeMsg: string;
  // ui
  toast: string;
  spellOpen: string | null;
  confirmKey: string | null;
  undoStack: Snapshot[];
  helpOpen: boolean;
  initDraft: { id: string; text: string } | null;

  // acciones
  init: () => Promise<void>;
  set: (patch: Partial<State>) => void;
  monById: (id: string | undefined) => Monster | undefined;
  showToast: (msg: string) => void;
  snap: (label: string) => void;
  undo: () => void;
  confirm: (key: string, fn: () => void) => void;
  patchC: (id: string, patch: Partial<Combatant> | ((c: Combatant) => Partial<Combatant>), label?: string) => void;
  roll: (spec: RollSpec) => void;
  rollInit: () => void;
  addMonster: (m: Monster, qty: number) => void;
  addPc: (r: RosterEntry) => void;
  addAllPcs: () => void;
  addLairCombatant: () => void;
  removeCombatant: (id: string) => void;
  startCombat: () => void;
  step: (dir: 1 | -1) => void;
  endCombat: () => void;
  clearAll: () => void;
  applyParts: (map: Record<string, 'full' | 'half'>, parts: DmgPart[], crit?: boolean) => void;
  heal: (id: string, amt: number, src?: string) => void;
  giveTemp: (id: string, amt: number) => void;
  toggleCond: (id: string, k: string) => void;
  setExh: (id: string, n: number) => void;
  setUsed: (id: string, key: string, v: number, max: number) => void;
  setSpUsed: (id: string, key: string, v: number, max: number) => void;
  setSpent: (id: string, key: string, v: boolean) => void;
  useLeg: (id: string, cost: number, name: string) => void;
  useLR: (id: string) => void;
  deathMark: (id: string, k: 's' | 'f') => void;
  rollDeath: (id: string) => void;
  rollConc: (p: ConcPrompt) => void;
  resolveConc: (p: ConcPrompt, keep: boolean) => void;
  applyRolled: () => void;
  setForge: (patch: Partial<ForgeState>) => void;
  setFeat: (i: number, key: keyof ForgeFeat, val: string | boolean) => void;
  saveForge: (addToo: boolean) => void;
  editMonster: (m: Monster, keepId: boolean) => void;
  newForge: () => void;
  deleteCustom: (id: string) => void;
  savePc: () => void;
  deletePc: (id: string) => void;
  exportData: () => string;
  importText: (text: string) => void;
}

// --- temporizadores de la animación (fuera del estado) ---
let t1: ReturnType<typeof setTimeout> | undefined;
let iv: ReturnType<typeof setInterval> | undefined;
let toastT: ReturnType<typeof setTimeout> | undefined;
let confirmT: ReturnType<typeof setTimeout> | undefined;
let pending: { finish: () => Partial<State> & { logEntry?: LogDraft; extraLog?: LogDraft[] }; shown: DieView[] } | null = null;

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

export const useStore = create<State>()((set, get) => {
  const pushLog = (entries: LogDraft[], log?: LogEntry[]) => {
    let l = log ?? get().log;
    entries.forEach((e) => { l = [{ id: 'l' + uid(), ...e }, ...l]; });
    return l.slice(0, 40);
  };

  const completeRoll = (finish: NonNullable<typeof pending>['finish'], next: DieView[]) => {
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

  /** Si hay una tirada rodando, la resuelve ya y repite la acción en el siguiente ciclo. */
  const guard = (fn: () => void) => {
    if (!pending) return false;
    flush();
    setTimeout(fn, 0);
    return true;
  };

  const animate = (dice: PhysicalDie[], finish: NonNullable<typeof pending>['finish']) => {
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

  const rollRecharge = (id: string, list: RechargeCheck[]) => {
    if (guard(() => rollRecharge(id, list))) return;
    const rolls = list.map((x) => ({ ...x, v: rollDie(6) }));
    const c = get().combatants.find((x) => x.id === id);
    const detail = rolls.map((x) => x.name + ': ' + x.v + (x.v >= x.min ? ' (recargada)' : ' (sigue gastada)')).join(' · ');
    animate(rolls.map((x) => ({ sides: 6, final: x.v })), () => {
      const s = get();
      const combatants = s.combatants.map((cc) => {
        if (cc.id !== id) return cc;
        const sp = { ...cc.spent };
        rolls.forEach((x) => { if (x.v >= x.min) sp[x.key] = false; });
        return { ...cc, spent: sp };
      });
      const turnEvents = s.turnEvents.concat(rolls.map((x) => ({ text: 'Recarga de ' + x.name + ': ' + x.v + (x.v >= x.min ? ' → disponible.' : ' → sigue gastada.') })));
      const label = 'Recarga · ' + (c ? c.name : '');
      return {
        combatants, turnEvents,
        result: { label, total: rolls.map((x) => x.v).join(' · '), detail, cls: '', note: '', isDmg: false, parts: [], half: false, by: null },
        logEntry: { label, total: rolls.map((x) => x.v).join('/'), detail },
      };
    });
  };

  /** Empieza el turno de `nx.id`: efectos de inicio de turno, nueva ronda y recargas. */
  const beginTurn = (nx: { id: string; round: number }) => {
    const s = get();
    const next = s.combatants.find((c) => c.id === nx.id);
    if (!next) return;
    const r = turnStart(next, get().monById(next.monsterId) || null);
    const waiting = s.combatants.filter((c) => c.init == null);
    const events = r.events.concat(waiting.length ? [{ text: 'Sin iniciativa (no actúan hasta que la pongas): ' + waiting.map((c) => c.name).join(', ') + '.' }] : []);
    set({
      activeId: next.id, selId: next.id, round: nx.round, tab: 'combat', spellOpen: null, turnEvents: events,
      combatants: s.combatants.map((c) => (c.id === next.id ? r.c : c)),
      log: nx.round !== s.round ? pushLog([{ label: 'Ronda ' + nx.round, detail: 'Empieza una nueva ronda', total: 'R' + nx.round }]) : s.log,
    });
    if (r.recharge.length) rollRecharge(next.id, r.recharge);
  };

  return {
    tab: 'combat', loaded: false, loadError: '', srd: [], spells: {}, types: [], storageOk: true, persistent: false,
    custom: [], roster: [], combatants: [], round: 1, activeId: null, started: false, log: [], diceTheme: 'ruby', turnEvents: [],
    selId: null, concPrompts: [], surprised: false, amount: '', dmgType: 'cortante', condRounds: '',
    search: '', fType: '', fCr: 'all', fLeg: false, fMine: false, viewId: null, qty: {}, hpMode: 'avg', shareInit: true, addLair: true, bLimit: 50,
    dice: [], rolling: false, result: null, adv: 'normal', critFor: null, dmgTargets: {}, manyDice: false, moreDice: 0, expr: '', exprError: false,
    pcForm: blankRoster(), editingPcId: null, pcMsg: '', ioMsg: '',
    forge: blankForge(), editingId: null, forgeMsg: '', toast: '', spellOpen: null, confirmKey: null, undoStack: [], helpOpen: false, initDraft: null,

    async init() {
      const [{ data, ok }, persistent] = await Promise.all([loadSaved(), requestPersistence()]);
      set({ ...data, selId: data.started ? data.activeId : null, storageOk: ok, persistent });
      try {
        const res = await fetch(import.meta.env.BASE_URL + 'data/srd52_es.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const d = (await res.json()) as SrdData;
        const srd = d.m.slice().sort((a, b) => a.n.localeCompare(b.n, 'es'));
        const types = Array.from(new Set(srd.map((m) => m.t.split(' (')[0]))).sort((a, b) => a.localeCompare(b, 'es'));
        set({ srd, spells: d.sp, types, loaded: true, viewId: get().viewId || srd[0]?.id || null });
      } catch (e) {
        set({ loaded: true, loadError: 'No se pudo cargar el bestiario SRD (' + (e as Error).message + '). Tus criaturas propias siguen disponibles.' });
      }
    },

    set: (patch) => set(patch),
    // el SRD manda: una criatura propia importada con un id del SRD no puede suplantarla
    monById: (id) => (id ? get().srd.find((m) => m.id === id) || get().custom.find((m) => m.id === id) : undefined),

    showToast(msg) {
      set({ toast: msg });
      clearTimeout(toastT);
      toastT = setTimeout(() => set({ toast: '' }), 3200);
    },

    snap(label) {
      const s = get();
      const now = Date.now();
      const stack = s.undoStack.slice();
      const top = stack[stack.length - 1];
      if (top && top.label === label && now - top.at < 1500) { top.at = now; return; }
      stack.push({ label, at: now, data: { combatants: s.combatants, round: s.round, activeId: s.activeId, started: s.started, turnEvents: s.turnEvents, concPrompts: s.concPrompts, critFor: s.critFor, selId: s.selId, roster: s.roster, custom: s.custom } });
      set({ undoStack: stack.slice(-50) });
    },

    undo() {
      if (guard(() => get().undo())) return;
      const stack = get().undoStack.slice();
      const u = stack.pop();
      if (!u) return;
      set({ ...u.data, undoStack: stack, log: pushLog([{ label: 'Deshecho', detail: u.label, total: '↶' }]) });
    },

    confirm(key, fn) {
      if (get().confirmKey === key) { set({ confirmKey: null }); fn(); return; }
      set({ confirmKey: key });
      clearTimeout(confirmT);
      confirmT = setTimeout(() => { if (get().confirmKey === key) set({ confirmKey: null }); }, 4000);
    },

    patchC(id, patch, label) {
      get().snap(label || 'cambio en combatiente');
      set({ combatants: get().combatants.map((c) => (c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)) });
    },

    roll(spec) {
      if (guard(() => get().roll(spec))) return;
      const s = get();
      const c = spec.cid ? s.combatants.find((x) => x.id === spec.cid) || null : null;
      const mods = rollModifiers(c, spec.kind, spec.ability);
      const manual: AdvMode = spec.noAdv ? 'normal' : s.adv;
      const adv = combineAdv(manual, mods.adv, mods.dis);
      const crit = spec.kind === 'damage' && !!spec.who && s.critFor?.who === spec.who;
      const out = rollParts(spec.parts, { kind: spec.kind, adv, doubleDice: crit, flat: mods.flat || undefined });
      if (!out) { set({ exprError: true }); return; }
      let cls: RollResult['cls'] = '';
      let note = '';
      const d20kind = spec.kind !== 'damage' && spec.kind !== 'death' && spec.kind !== 'free';
      if (out.nat === 20 && d20kind) { cls = 'crit'; note = spec.kind === 'attack' ? (spec.who ? '¡Crítico! El próximo daño de ' + spec.who + ' dobla los dados.' : '¡Crítico!') : '¡20 natural!'; }
      else if (out.nat === 1 && d20kind) { cls = 'fumble'; note = '1 natural.'; }
      if (mods.autoFail) note = (note ? note + ' ' : '') + 'Falla automáticamente.';
      if (mods.reasons.length) note = (note ? note + ' · ' : '') + mods.reasons.join(' · ');
      const after: Partial<State> = {};
      if (spec.kind === 'attack' && spec.who) after.critFor = out.nat === 20 ? { who: spec.who } : s.critFor?.who === spec.who ? null : s.critFor;
      if (spec.kind === 'damage' && crit) after.critFor = null;
      if (out.usedAdv && manual !== 'normal') after.adv = 'normal';
      set({ exprError: false });
      const totalStr = mods.autoFail ? 'Falla' : String(out.total);
      animate(out.dice, () => {
        const patch: Partial<State> & { logEntry?: LogDraft; extraLog?: LogDraft[] } = {
          result: { label: spec.label, total: totalStr, detail: out.detail, cls, note, isDmg: spec.kind === 'damage', parts: out.byType, half: !!spec.half, by: spec.by || null, crit },
          logEntry: { label: spec.label, total: totalStr, detail: out.detail },
          ...after,
        };
        if (spec.kind === 'damage') patch.dmgTargets = {};
        if (spec.after) {
          const extra = spec.after(mods.autoFail ? -99 : out.total, out.nat) || {};
          if (extra.resultNote && patch.result) { patch.result = { ...patch.result, note: extra.resultNote + (note ? ' · ' + note : '') }; }
          delete extra.resultNote;
          Object.assign(patch, extra);
        }
        return patch;
      });
    },

    rollInit() {
      if (guard(() => get().rollInit())) return;
      const s = get();
      let targets = s.combatants.filter((c) => c.kind === 'monster' && c.init == null);
      if (!targets.length) targets = s.combatants.filter((c) => c.kind === 'monster');
      if (!targets.length) { get().showToast('No hay monstruos en el encuentro'); return; }
      const groups = new Map<string, Combatant[]>();
      targets.forEach((c) => { const g = s.shareInit && c.grp ? c.grp : c.id; groups.set(g, [...(groups.get(g) || []), c]); });
      const dice: PhysicalDie[] = [];
      const res: Record<string, number> = {};
      const det: string[] = [];
      groups.forEach((list) => {
        const c0 = list[0];
        const mods = rollModifiers(c0, 'init');
        const mode = combineAdv(s.surprised ? 'dis' : 'normal', mods.adv, mods.dis);
        let v: number;
        if (mode !== 'normal') {
          const a = rollDie(20); const b = rollDie(20);
          const keepA = mode === 'adv' ? a >= b : a <= b;
          v = keepA ? a : b;
          dice.push({ sides: 20, final: a, dim: !keepA }, { sides: 20, final: b, dim: keepA });
        } else { v = rollDie(20); dice.push({ sides: 20, final: v }); }
        const init = v + (c0.initBonus || 0) + mods.flat;
        list.forEach((c) => { res[c.id] = init; });
        det.push((list.length > 1 ? c0.name.replace(/ \d+$/, '') + ' ×' + list.length : c0.name) + ' ' + init);
      });
      const detail = det.join(' · ') + (s.surprised ? ' · sorprendidos (desventaja)' : '');
      get().snap('tirada de iniciativa');
      animate(dice, () => {
        const combatants = get().combatants.map((c) => (res[c.id] != null ? { ...c, init: res[c.id] } : c));
        const best = Math.max(...Object.values(res));
        return {
          combatants,
          result: { label: 'Iniciativa de monstruos', total: String(best), detail, cls: '', note: 'Ya está ordenada. Ahora añade a los jugadores con su tirada.', isDmg: false, parts: [], half: false, by: null },
          logEntry: { label: 'Iniciativa', total: String(best), detail },
        };
      });
    },

    addMonster(m, qty) {
      get().snap('añadir ' + m.n);
      const s = get();
      const n = Math.max(1, Math.min(20, qty || 1));
      let cs = s.combatants;
      const taken = new Set(cs.map((c) => c.name));
      const plain = cs.find((c) => c.name === m.n);
      if (plain) {
        taken.delete(m.n);
        const nn = uniqueName(m.n, taken);
        taken.add(nn);
        cs = cs.map((c) => (c.id === plain.id ? { ...c, name: nn } : c));
      }
      const numbered = n > 1 || !!plain || Array.from(taken).some((t) => t.startsWith(m.n + ' '));
      const grp = 'g' + uid();
      const add: Combatant[] = [];
      for (let i = 0; i < n; i++) {
        const name = numbered ? uniqueName(m.n, taken) : m.n;
        taken.add(name);
        add.push(makeMonsterCombatant(m, { name, inLair: s.addLair, rollHp: s.hpMode === 'roll', grp }));
      }
      set({ combatants: cs.concat(add) });
      get().showToast(n + ' × ' + m.n + (s.addLair && m.lair ? ' (en su guarida)' : '') + ' al combate' + (s.started ? '. Tira o escribe su iniciativa: hasta entonces no actúa.' : ''));
    },

    addPc(r) {
      const s = get();
      if (s.combatants.some((c) => c.rosterId === r.id)) return;
      get().snap('añadir ' + r.name);
      const taken = new Set(s.combatants.map((x) => x.name));
      const c = makePcCombatant(r, taken.has(r.name) ? uniqueName(r.name, taken) : r.name);
      set({ combatants: get().combatants.concat([c]) });
      if (s.started) get().showToast(c.name + ' entra en el combate: escribe su iniciativa.');
    },

    addAllPcs() {
      const s = get();
      const inC = new Set(s.combatants.map((c) => c.rosterId).filter(Boolean));
      const rs = s.roster.filter((r) => !inC.has(r.id));
      if (!rs.length) { get().showToast(s.roster.length ? 'Todo el grupo ya está en el combate' : 'Primero guarda a tus jugadores en Grupo'); return; }
      get().snap('añadir el grupo');
      const taken = new Set(s.combatants.map((x) => x.name));
      const add = rs.map((r) => { const name = taken.has(r.name) ? uniqueName(r.name, taken) : r.name; taken.add(name); return makePcCombatant(r, name); });
      set({ combatants: get().combatants.concat(add), tab: 'combat' });
      get().showToast(add.length + ' jugadores añadidos. Escribe su iniciativa.');
    },

    addLairCombatant() {
      get().snap('añadir guarida');
      set({ combatants: get().combatants.concat([makeLair()]) });
    },

    removeCombatant(id) {
      const c = get().combatants.find((x) => x.id === id);
      if (!c) return;
      get().snap('quitar a ' + c.name);
      const s = get();
      // si se quita a quien está en turno, el turno pasa al siguiente en la iniciativa (no vuelve al primero)
      const nx = s.started && s.activeId === id ? stepTurn(s.combatants, id, s.round, 1) : null;
      set({ combatants: s.combatants.filter((x) => x.id !== id), selId: null, activeId: s.activeId === id ? null : s.activeId, concPrompts: s.concPrompts.filter((p) => p.id !== id) });
      if (nx && nx.id !== id) beginTurn(nx);
    },

    startCombat() {
      if (guard(() => get().startCombat())) return;
      const s = get();
      if (!s.combatants.length) { get().showToast('Añade combatientes primero'); return; }
      const missing = s.combatants.filter((c) => c.init == null).map((c) => c.name);
      if (missing.length) { get().showToast('Falta la iniciativa de: ' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? '…' : '')); return; }
      const order = sortCombatants(s.combatants);
      const first = order[0];
      const r = turnStart(first, get().monById(first.monsterId) || null);
      get().snap('empezar combate');
      set({
        started: true, round: 1, activeId: first.id, selId: first.id, tab: 'combat', turnEvents: r.events,
        combatants: s.combatants.map((c) => (c.id === first.id ? r.c : c)),
        log: pushLog([{ label: '¡Comienza el combate!', detail: 'Orden: ' + order.map((c) => c.name + ' ' + c.init).join(' · '), total: 'R1' }]),
      });
    },

    step(dir) {
      if (guard(() => get().step(dir))) return;
      const s = get();
      if (!s.started) { get().startCombat(); return; }
      if (dir < 0) {
        const top = s.undoStack[s.undoStack.length - 1];
        if (top && top.label.startsWith('turno de')) {
          set({ ...top.data, undoStack: s.undoStack.slice(0, -1), log: pushLog([{ label: 'Vuelta al turno anterior', detail: 'Se deshacen los efectos del inicio de turno', total: '↶' }]) });
          return;
        }
      }
      const nx = stepTurn(s.combatants, s.activeId, s.round, dir);
      if (!nx) { get().showToast('Nadie puede actuar: revisa iniciativas y PG'); return; }
      const next = s.combatants.find((c) => c.id === nx.id)!;
      if (dir > 0) {
        get().snap('turno de ' + next.name);
        beginTurn(nx);
      } else {
        get().snap('volver a ' + next.name);
        set({ activeId: next.id, selId: next.id, round: nx.round, turnEvents: [{ text: 'Has vuelto a este turno. Como ya hubo acciones después, los efectos de inicio de turno no se han deshecho: usa Deshacer si necesitas revertirlos.' }] });
      }
    },

    endCombat() {
      const s = get();
      get().snap('terminar combate');
      set({
        combatants: s.combatants.filter((c) => c.kind === 'pc').map((c) => ({ ...c, init: null, conds: [], conc: false, react: false })),
        round: 1, activeId: null, selId: null, started: false, turnEvents: [], concPrompts: [], critFor: null,
        log: pushLog([{ label: 'Fin del combate', detail: 'Ronda ' + s.round, total: '—' }]),
      });
    },

    clearAll() {
      get().snap('vaciar encuentro');
      set({ combatants: [], started: false, round: 1, activeId: null, selId: null, turnEvents: [], concPrompts: [], critFor: null });
    },

    applyParts(map, parts, crit = false) {
      get().snap('aplicar daño');
      const s = get();
      const logs: LogDraft[] = [];
      const prompts: ConcPrompt[] = [];
      const combatants = s.combatants.map((c) => {
        const f = map[c.id];
        if (!f) return c;
        const r = applyDamage(c, get().monById(c.monsterId) || null, parts, f === 'half' ? 0.5 : 1, crit);
        logs.push(...r.logs);
        if (r.conc) prompts.push(r.conc);
        return r.c;
      });
      set({ combatants, log: pushLog(logs), concPrompts: s.concPrompts.concat(prompts), amount: '' });
    },

    heal(id, amt, src) {
      const c = get().combatants.find((x) => x.id === id);
      if (!c || !(amt > 0)) return;
      const r = applyHeal(c, amt);
      if ('error' in r) { get().showToast(r.error); return; }
      get().snap('curar a ' + c.name);
      set({ combatants: get().combatants.map((x) => (x.id === id ? r.c : x)), amount: '', log: pushLog([{ ...r.log, label: r.log.label + (src ? ' (' + src + ')' : '') }]) });
    },

    giveTemp(id, amt) {
      const c = get().combatants.find((x) => x.id === id);
      if (!c || !(amt > 0)) return;
      get().patchC(id, (x) => ({ temp: Math.max(x.temp || 0, amt) }), 'PG temporales');
      set({ amount: '', log: pushLog([{ label: c.name + ' gana PG temporales', detail: 'No se acumulan: se queda con el mayor', total: '+' + Math.max(c.temp || 0, amt) }]) });
    },

    toggleCond(id, k) {
      const r = parseInt(get().condRounds, 10);
      get().patchC(id, (c) => {
        const has = c.conds.some((x) => x.k === k);
        return { conds: has ? c.conds.filter((x) => x.k !== k) : addCondition(c.conds, k, isNaN(r) || r <= 0 ? null : r) };
      }, 'estado ' + k);
    },
    setExh(id, n) {
      const c = get().combatants.find((x) => x.id === id);
      if (!c) return;
      const r = setExhaustion(c, n);
      get().patchC(id, r.patch, 'agotamiento');
      if (r.log) set({ log: pushLog([r.log]) });
    },
    setUsed: (id, key, v, max) => get().patchC(id, (c) => ({ used: { ...c.used, [key]: Math.max(0, Math.min(max, v)) } }), 'usos'),
    setSpUsed: (id, key, v, max) => get().patchC(id, (c) => ({ spUsed: { ...c.spUsed, [key]: Math.max(0, Math.min(max, v)) } }), 'usos de conjuro'),
    setSpent: (id, key, v) => get().patchC(id, (c) => ({ spent: { ...c.spent, [key]: v } }), 'recarga'),

    useLeg(id, cost, name) {
      const c = get().combatants.find((x) => x.id === id);
      if (!c) return;
      if (c.laMax - c.laUsed < cost) { get().showToast(c.name + ' no tiene usos legendarios suficientes'); return; }
      get().snap('acción legendaria');
      set({ combatants: get().combatants.map((x) => (x.id === id ? { ...x, laUsed: x.laUsed + cost } : x)), log: pushLog([{ label: c.name + ' · acción legendaria', detail: name + (cost > 1 ? ' (cuesta ' + cost + ')' : ''), total: c.laMax - c.laUsed - cost + '/' + c.laMax }]) });
    },

    useLR(id) {
      const c = get().combatants.find((x) => x.id === id);
      if (!c) return;
      if (c.lrUsed >= c.lrMax) { get().showToast(c.name + ' ha gastado todas sus resistencias legendarias'); return; }
      get().snap('resistencia legendaria');
      set({ combatants: get().combatants.map((x) => (x.id === id ? { ...x, lrUsed: x.lrUsed + 1 } : x)), log: pushLog([{ label: c.name + ' · resistencia legendaria', detail: 'Convierte un fallo en éxito', total: c.lrMax - c.lrUsed - 1 + '/' + c.lrMax }]) });
    },

    deathMark(id, k) {
      get().patchC(id, (c) => {
        const d = { s: 0, f: 0, ...(c.death || {}) };
        d[k] = Math.min(3, d[k] + 1);
        const p: Partial<Combatant> = { death: d };
        if (d.s >= 3) p.stable = true;
        if (d.f >= 3) p.dead = true;
        return p;
      }, 'salvación de muerte');
    },

    rollDeath(id) {
      if (guard(() => get().rollDeath(id))) return;
      const c = get().combatants.find((x) => x.id === id);
      if (!c) return;
      get().snap('salvación de muerte');
      get().roll({
        label: 'Salvación de muerte · ' + c.name, kind: 'death', cid: id, noAdv: true, parts: [{ expr: '1d20' }],
        after: (total, nat) => {
          const cc = get().combatants.find((x) => x.id === id);
          if (!cc) return {};
          const r = resolveDeathSave(cc, total, nat);
          return { combatants: get().combatants.map((x) => (x.id === id ? { ...x, ...r.patch } : x)), resultNote: r.msg };
        },
      });
    },

    rollConc(p) {
      if (guard(() => get().rollConc(p))) return;
      get().snap('concentración');
      get().roll({
        label: 'Concentración · ' + p.name + ' (CD ' + p.dc + ')', kind: 'save', ability: 2, cid: p.id, parts: [{ expr: '1d20' + sgn(p.save || 0) }],
        after: (total) => {
          const ok = total >= p.dc;
          return {
            concPrompts: get().concPrompts.filter((x) => x.pid !== p.pid),
            combatants: ok ? get().combatants : get().combatants.map((x) => (x.id === p.id ? { ...x, conc: false } : x)),
            resultNote: ok ? 'Mantiene la concentración.' : 'Pierde la concentración.',
          };
        },
      });
    },

    resolveConc(p, keep) {
      get().snap('concentración');
      const s = get();
      set({
        concPrompts: s.concPrompts.filter((x) => x.pid !== p.pid),
        combatants: keep ? s.combatants : s.combatants.map((x) => (x.id === p.id ? { ...x, conc: false } : x)),
        log: pushLog([{ label: p.name + (keep ? ' mantiene' : ' pierde') + ' la concentración', detail: 'CD ' + p.dc, total: keep ? '✓' : '✗' }]),
      });
    },

    applyRolled() {
      const s = get();
      const r = s.result;
      if (!r || !Object.keys(s.dmgTargets).length) { get().showToast('Elige al menos un objetivo'); return; }
      get().applyParts(s.dmgTargets, r.parts, !!r.crit);
      set({ dmgTargets: {}, result: { ...r, isDmg: false, applied: true, note: 'Daño aplicado.' } });
    },

    setForge: (patch) => set({ forge: { ...get().forge, ...patch }, forgeMsg: '' }),
    setFeat(i, key, val) {
      const feats = get().forge.feats.map((x, j) => (j === i ? { ...x, [key]: val } : x));
      get().setForge({ feats });
    },
    saveForge(addToo) {
      const s = get();
      if (!s.forge.name.trim()) { set({ forgeMsg: 'Dale un nombre a la criatura antes de guardarla.' }); return; }
      const id = s.editingId || 'c-' + uid();
      const m = forgeToMonster(s.forge, id, s.spells);
      get().snap('guardar ' + m.n);
      const exists = s.custom.some((x) => x.id === id);
      set({ custom: exists ? s.custom.map((x) => (x.id === id ? m : x)) : [m, ...s.custom], editingId: id, viewId: id, forgeMsg: '' });
      if (addToo) get().addMonster(m, 1);
      else get().showToast('«' + m.n + '» guardado en el bestiario');
    },
    editMonster(m, keepId) {
      const f = monsterToForge(m, get().spells);
      if (!keepId) f.name = m.n + ' (variante)';
      set({ tab: 'forge', forge: f, editingId: keepId ? m.id : null, forgeMsg: '' });
    },
    newForge: () => set({ tab: 'forge', forge: blankForge(), editingId: null, forgeMsg: '' }),
    deleteCustom(id) {
      const s = get();
      const m = s.custom.find((x) => x.id === id);
      if (!m) return;
      if (s.combatants.some((c) => c.monsterId === id)) { get().showToast('«' + m.n + '» está en el combate: quítalo antes de borrarlo'); return; }
      get().confirm('del-' + id, () => {
        get().snap('borrar ' + m.n);
        set({ custom: get().custom.filter((x) => x.id !== id), viewId: null });
      });
    },

    savePc() {
      const p = get().pcForm;
      if (!p.name.trim()) { set({ pcMsg: 'Ponle nombre al personaje.' }); return; }
      const rec: RosterEntry = { ...p, name: p.name.trim(), id: get().editingPcId || 'r-' + uid() };
      get().snap('guardar ' + rec.name);
      const s = get();
      set({ roster: s.editingPcId ? s.roster.map((x) => (x.id === rec.id ? rec : x)) : s.roster.concat([rec]), pcForm: blankRoster(), editingPcId: null, pcMsg: '' });
      get().showToast(rec.name + ' guardado en tu grupo');
    },
    deletePc(id) {
      const r = get().roster.find((x) => x.id === id);
      if (!r) return;
      get().confirm('pc-' + id, () => { get().snap('quitar ' + r.name); set({ roster: get().roster.filter((x) => x.id !== id) }); });
    },

    exportData() {
      return JSON.stringify(buildExport(savedSlice(get())), null, 1);
    },
    importText(text) {
      const r = mergeImport(text, savedSlice(get()));
      if (!r.ok) { set({ ioMsg: r.message }); return; }
      get().snap('importar');
      set({ roster: r.roster!, custom: r.custom!, ...(r.combat || {}), ioMsg: r.message });
    },
  };
});

export const savedSlice = (s: State): SavedState => ({
  v: SCHEMA_VERSION, custom: s.custom, roster: s.roster, combatants: s.combatants, round: s.round, activeId: s.activeId, started: s.started,
  log: s.log.slice(0, 30), diceTheme: s.diceTheme, turnEvents: s.turnEvents,
});

// --- guardado automático ---
let saveT: ReturnType<typeof setTimeout> | undefined;
let lastSaved: SavedState | null = null;
const changed = (a: SavedState, b: SavedState | null) => !b || (Object.keys(a) as (keyof SavedState)[]).some((k) => a[k] !== b[k]);

export async function saveNow() {
  clearTimeout(saveT);
  const s = useStore.getState();
  if (!s.loaded) return;
  const slice = savedSlice(s);
  if (!changed(slice, lastSaved)) return;
  lastSaved = slice;
  const ok = await saveState(slice);
  if (ok !== useStore.getState().storageOk) useStore.setState({ storageOk: ok });
}

export function startAutosave() {
  const unsub = useStore.subscribe((s, prev) => {
    if (!s.loaded) return;
    if (s.custom !== prev.custom || s.roster !== prev.roster || s.combatants !== prev.combatants || s.round !== prev.round || s.activeId !== prev.activeId ||
      s.started !== prev.started || s.log !== prev.log || s.diceTheme !== prev.diceTheme || s.turnEvents !== prev.turnEvents) {
      clearTimeout(saveT);
      saveT = setTimeout(() => { void saveNow(); }, 250);
    }
  });
  const onHide = () => { void saveNow(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
  return () => { unsub(); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide); };
}
