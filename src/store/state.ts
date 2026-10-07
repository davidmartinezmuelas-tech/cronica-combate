import type { Combatant, ConcPrompt, DieView, DmgPart, Encounter, LogEntry, Monster, RollResult, RosterEntry, Spell, TurnEvent } from '../data/types';
import type { AdvMode, RollKind, RollPart } from '../engine/dice';
import type { SaveEffect } from '../engine/saveEffect';
import type { LogDraft } from '../engine/combat';
import type { ForgeFeat, ForgeState } from '../engine/forge';
import type { RuleEntry } from '../engine/rules';

export type Tab = 'combat' | 'bestiary' | 'group' | 'forge' | 'rules';

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
  critOn?: number; // en ataques: crítico con este número o más (Campeón: 19 o 18)
  effect?: SaveEffect; // daño de un efecto con salvación (objetivos, salvaciones, mitad y estados)
  heal?: boolean; // es una curación
  critBonus?: RollPart[]; // daño que solo se suma si este daño es de un crítico (Perforador, Don del ataque imparable)
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
  readFailed: boolean; // no se pudo leer lo guardado al abrir: no se guarda nada para no borrarlo
  persistent: boolean;
  log: LogEntry[];
  toast: string;
  spellOpen: string | null;
  spellCtx: { dc?: number; atk?: number; who: string; cid?: string } | null; // quién lanza el conjuro abierto (su CD y ataque)
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
  /** Resultado de las salvaciones de un efecto: daño completo, mitad o nada, y los estados a quien falla. */
  applyEffect: (outcomes: { id: string; total: number | null; fail: boolean }[], effect: SaveEffect, conds: string[], parts: DmgPart[], crit?: boolean) => void;
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
  effectSel: string[] | null; // objetivos ya elegidos para el efecto (un lanzamiento de un jugador)
  dieSize: number; // px, según cuántos dados haya que mostrar
  moreDice: number;
  expr: string;
  exprError: boolean;
  diceTheme: string;
  dice3d: boolean | null; // dados 3D o 2D elegidos por el usuario; null = automático
  roll: (spec: RollSpec) => void;
  applyRolled: () => void;
  /** Efecto con salvación sin tirada de daño (solo estados): abre la elección de objetivos. */
  startEffect: (label: string, effect: SaveEffect) => void;
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
  updatePc: (id: string, patch: Partial<RosterEntry>, label?: string) => void;
  attachPdf: (id: string, file: File) => Promise<string>; // devuelve el error, o '' si ha ido bien
  removePdf: (id: string) => void;
  exportData: () => Promise<string>;
  importText: (text: string) => Promise<void>;
}

/** Encuentros preparados. */
export interface EncounterSlice {
  encounters: Encounter[];
  saveEncounter: (name: string) => boolean;
  loadEncounter: (id: string) => void;
  deleteEncounter: (id: string) => void;
}

/** Reglas: glosario, capítulos y conjuros (se cargan al abrir la pestaña). */
export interface RulesSlice {
  rules: RuleEntry[] | null;
  rulesError: string;
  rq: string; // búsqueda
  rcat: string; // categoría
  ruleId: string | null; // entrada abierta
  ruleBack: string[]; // historial para «Atrás»
  loadRules: () => Promise<void>;
  openRule: (id: string) => void;
  openRuleByName: (name: string, cat?: string) => Promise<void>;
  ruleGoBack: () => void;
}

export type State = CoreSlice & CombatSlice & DiceSlice & BestiarySlice & GroupSlice & EncounterSlice & RulesSlice;

export type SetState = (patch: Partial<State>) => void;
export type GetState = () => State;
