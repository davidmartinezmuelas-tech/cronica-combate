import type { Combatant, ConcPrompt, DieView, DmgPart, Encounter, LogEntry, Monster, RollResult, RosterEntry, Spell, TurnEvent } from '../data/types';
import type { AdvMode, RollKind, RollPart } from '../engine/dice';
import type { LogDraft } from '../engine/combat';
import type { ForgeFeat, ForgeState } from '../engine/forge';

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

export interface Snapshot {
  label: string;
  at: number;
  data: Pick<State, 'combatants' | 'round' | 'activeId' | 'started' | 'turnEvents' | 'concPrompts' | 'critFor' | 'selId' | 'roster' | 'custom' | 'encounters'>;
}

/** Carga, interfaz general, historial y deshacer. */
export interface CoreSlice {
  tab: Tab;
  loaded: boolean;
  loadError: string;
  srd: Monster[];
  spells: Record<string, Spell>;
  types: string[];
  storageOk: boolean;
  persistent: boolean;
  log: LogEntry[];
  toast: string;
  spellOpen: string | null;
  confirmKey: string | null;
  undoStack: Snapshot[];
  helpOpen: boolean;
  init: () => Promise<void>;
  set: (patch: Partial<State>) => void;
  monById: (id: string | undefined) => Monster | undefined;
  showToast: (msg: string) => void;
  snap: (label: string) => void;
  undo: () => void;
  confirm: (key: string, fn: () => void) => void;
}

/** Encuentro en curso: combatientes, turnos, PG, estados y recursos. */
export interface CombatSlice {
  combatants: Combatant[];
  round: number;
  activeId: string | null;
  started: boolean;
  turnEvents: TurnEvent[];
  selId: string | null;
  concPrompts: ConcPrompt[];
  surprised: boolean;
  amount: string;
  dmgType: string;
  condRounds: string;
  condAt: 'start' | 'end';
  condBy: string; // '' = la propia criatura
  saveDc: string; // CD del conjuro de un jugador para las salvaciones de los monstruos
  initDraft: { id: string; text: string } | null;
  patchC: (id: string, patch: Partial<Combatant> | ((c: Combatant) => Partial<Combatant>), label?: string) => void;
  rollInit: () => void;
  addMonster: (m: Monster, qty: number, opts?: { inLair?: boolean; silent?: boolean }) => void;
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
}

/** Mesa de dados: tiradas, animación, críticos y aplicar daño. */
export interface DiceSlice {
  dice: DieView[];
  rolling: boolean;
  result: RollResult | null;
  adv: AdvMode;
  critFor: { who: string } | null;
  dmgTargets: Record<string, 'full' | 'half'>;
  dieSize: number; // px, según cuántos dados haya que mostrar
  moreDice: number;
  expr: string;
  exprError: boolean;
  diceTheme: string;
  dice3d: boolean | null; // dados 3D o 2D elegidos por el usuario; null = automático
  roll: (spec: RollSpec) => void;
  applyRolled: () => void;
}

/** Bestiario, criaturas propias y Forja. */
export interface BestiarySlice {
  custom: Monster[];
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
  forge: ForgeState;
  editingId: string | null;
  forgeMsg: string;
  setForge: (patch: Partial<ForgeState>) => void;
  setFeat: (i: number, key: keyof ForgeFeat, val: string | boolean) => void;
  saveForge: (addToo: boolean) => void;
  editMonster: (m: Monster, keepId: boolean) => void;
  newForge: () => void;
  deleteCustom: (id: string) => void;
}

/** Grupo de jugadores y copias de seguridad. */
export interface GroupSlice {
  roster: RosterEntry[];
  pcForm: RosterEntry;
  editingPcId: string | null;
  pcMsg: string;
  ioMsg: string;
  savePc: () => void;
  deletePc: (id: string) => void;
  exportData: () => string;
  importText: (text: string) => void;
}

/** Encuentros preparados. */
export interface EncounterSlice {
  encounters: Encounter[];
  saveEncounter: (name: string) => boolean;
  loadEncounter: (id: string) => void;
  deleteEncounter: (id: string) => void;
}

export type State = CoreSlice & CombatSlice & DiceSlice & BestiarySlice & GroupSlice & EncounterSlice;

export type SetState = (patch: Partial<State>) => void;
export type GetState = () => State;
