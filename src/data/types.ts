import type { SaveEffect } from '../engine/saveEffect';
/** Sección de la hoja de un monstruo. */
export type SectionKey = 'tr' | 'ac_' | 'ba' | 're' | 'lg';

/** Un rasgo, acción, acción adicional, reacción o acción legendaria. */
export interface Feature {
  n: string; // nombre
  d: string; // descripción
  en?: 1; // texto original en inglés
  atk?: number; // bonificador de ataque
  dmg?: [string, string][]; // [fórmula, tipo de daño] que se aplica siempre
  alt?: { l: string; dmg: [string, string][] }[]; // daño completo en un caso concreto («con ventaja», «si está Ensangrentado»…)
  dc?: [number, string]; // [CD, característica abreviada]
  half?: 1; // mitad de daño si supera la salvación
  rc?: number; // recarga X–6
  day?: number; // usos por día
  dayl?: number; // usos por día en la guarida
  cost?: number; // coste legendario
  sp?: [string, string, string?][]; // [clave de conjuro, uso, nombre libre]
  sdc?: number;
  satk?: number;
  sot?: 1; // recordatorio al inicio de turno
  regen?: number; // PG que regenera al inicio de turno
  isLR?: 1; // es la resistencia legendaria
}

export interface Monster {
  id: string;
  n: string;
  en?: string;
  custom?: 1;
  at?: number; // último cambio de una criatura propia (para sincronizar con la cuenta)
  sz: string;
  t: string;
  al: string;
  ac: number;
  hp: number;
  hd: string;
  ini: number;
  spd: string;
  ab: number[];
  sv: number[];
  sk?: string;
  vul: string[];
  res: string[];
  imm: string[];
  ci: string[];
  sen?: string;
  pp: number;
  lang?: string;
  cr: string;
  xp: number;
  xpl?: number;
  pb: number;
  lair?: 1;
  hab?: string[];
  lr?: number;
  lrl?: number;
  la?: number;
  tr?: Feature[];
  ac_?: Feature[];
  ba?: Feature[];
  re?: Feature[];
  lg?: Feature[];
  /** Criaturas del Manual de Monstruos del usuario: dónde está en su PDF (página, altura del título, columna). */
  src?: { p: number; y: number; col: number };
  /** Datos que el OCR no pudo leer y faltan por revisar: 'ca', 'pg', 'ab:N', 'f:sección:N:dmg|dc'. */
  chk?: string[];
}

export interface Spell {
  en: string;
  n: string;
  l: number;
  d?: string;
  ct?: string;
  r?: string;
  du?: string;
  c?: number;
  rit?: number;
  cmp?: string;
}

export interface SrdData {
  v: number;
  m: Monster[];
  sp: Record<string, Spell>;
}

export interface Condition {
  k: string;
  r: number | null; // turnos restantes de `by` (null = indefinido)
  at?: 'start' | 'end'; // se descuenta al inicio (por defecto) o al final del turno de `by`
  by?: string; // id del combatiente cuyo turno cuenta (por defecto, quien tiene el estado)
  sk?: 1; // se puso durante el turno de `by` y acaba al final: ese final no cuenta
}

export type CombatantKind = 'pc' | 'monster' | 'lair';

export interface Combatant {
  id: string;
  kind: CombatantKind;
  name: string;
  init: number | null;
  initBonus: number;
  hp: number;
  maxHp: number;
  temp: number;
  ac: number | string;
  conds: Condition[];
  conc: boolean;
  exh: number;
  react: boolean;
  // monstruos
  monsterId?: string;
  inLair?: boolean;
  lrMax: number;
  lrUsed: number;
  laMax: number;
  laUsed: number;
  used: Record<string, number>;
  spent: Record<string, boolean>;
  spUsed: Record<string, number>;
  grp?: string;
  // jugadores
  rosterId?: string;
  level?: number;
  res?: string[];
  death?: { s: number; f: number };
  stable?: boolean;
  dead?: boolean;
  // guarida
  note?: string;
}

export interface RosterEntry {
  id: string;
  name: string;
  player: string;
  cls: string;
  level: string;
  ac: string;
  hp: string;
  initb: string;
  pp: string;
  res: string[];
  notes?: string; // notas libres del DM sobre el personaje
  pdf?: { id: string; name: string; size: number } | null; // hoja de personaje (el archivo va en IndexedDB aparte)
  roomUid?: string; // jugador de la sala que lleva este personaje (sus PG y CA llegan en directo)
  at?: number; // último cambio (para sincronizar con la cuenta)
}

export interface TurnEvent {
  text: string;
}

export interface ConcPrompt {
  pid: string;
  id: string;
  name: string;
  dc: number;
  save: number | null;
}

export interface LogEntry {
  id: string;
  label: string;
  detail: string;
  total: string;
}

export interface DmgPart {
  type: string;
  amt: number;
}

export interface RollResult {
  label: string;
  total: string;
  detail: string;
  cls: '' | 'crit' | 'fumble';
  note: string;
  isDmg: boolean;
  parts: DmgPart[];
  half: boolean;
  by: string | null;
  applied?: boolean;
  crit?: boolean;
  effect?: SaveEffect; // efecto con salvación: se eligen objetivos, tiran y se aplica daño y estados
  heal?: boolean; // es una curación (para mandarla a la mesa)
}

export interface DieView {
  id: string;
  sides: number;
  final: number;
  face: number;
  dim: boolean; // descartado por ventaja o desventaja
  kept: boolean; // el que cuenta cuando hay uno descartado
  dtype: string; // tipo de daño (colorea el dado)
  x: number; // sitio final, en % del tapete
  y: number;
  ox: number; // origen del lanzamiento, en fracción del tapete (fuera de él)
  oy: number;
  spin: number;
  tilt: number;
  delay: number;
  dur: number;
  extra: string; // 'nat20' | 'nat1' | ''
  done: boolean;
}

/** Encuentro preparado: qué monstruos y cuántos, sin PG ni iniciativa. */
export interface Encounter {
  id: string;
  name: string;
  items: { monsterId: string; qty: number; inLair: boolean }[];
  lair: boolean; // añade la tarjeta de acciones de guarida
  at?: number; // último cambio (para sincronizar con la cuenta)
}

/** Datos persistentes de la app. */
export interface SavedState {
  v: number;
  savedAt?: number;
  custom: Monster[];
  roster: RosterEntry[];
  combatants: Combatant[];
  round: number;
  activeId: string | null;
  started: boolean;
  log: LogEntry[];
  diceTheme: string;
  turnEvents: TurnEvent[];
  encounters: Encounter[];
  dice3d?: boolean | null; // dados 3D o 2D; null = automático (3D salvo que el sistema pida reducir movimiento)
}
