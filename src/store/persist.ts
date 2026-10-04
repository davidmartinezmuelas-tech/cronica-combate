import { createStore, get, set } from 'idb-keyval';
import { SCHEMA_VERSION, SECTIONS, STORAGE_KEY, XP_BY_CR } from '../data/constants';
import type { Combatant, Condition, Encounter, LogEntry, Monster, RosterEntry, SavedState, TurnEvent } from '../data/types';
import { avgOf, modOf } from '../engine/dice';
import { norm, num, pbOf, uid } from '../engine/util';

export const blankRoster = (): RosterEntry => ({ id: '', name: '', player: '', cls: '', level: '1', ac: '', hp: '', initb: '0', pp: '10', res: [] });

const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

export function normCombatant(c: unknown): Combatant | null {
  if (!c || typeof c !== 'object') return null;
  const x = c as Record<string, unknown>;
  if (!x.id || !['pc', 'monster', 'lair'].includes(String(x.kind))) return null;
  const o = {
    name: 'Sin nombre', init: null, initBonus: 0, hp: 0, maxHp: 0, temp: 0, ac: 10, conds: [], conc: false, exh: 0, react: false,
    used: {}, spent: {}, spUsed: {}, lrMax: 0, lrUsed: 0, laMax: 0, laUsed: 0, ...x,
  } as unknown as Combatant;
  o.id = String(o.id);
  o.name = String(o.name);
  o.hp = num(o.hp, 0);
  o.maxHp = num(o.maxHp, 0);
  o.temp = num(o.temp, 0);
  o.exh = Math.max(0, Math.min(6, num(o.exh, 0)));
  o.init = o.init == null || (o.init as unknown) === '' ? null : num(o.init, 0);
  o.conds = (Array.isArray(o.conds) ? o.conds : []).map(normCondition).filter((k): k is Condition => !!k);
  if (o.kind === 'pc') o.death = { s: 0, f: 0, ...(o.death || {}) };
  return o;
}

function normCondition(v: unknown): Condition | null {
  if (typeof v === 'string') return { k: v, r: null };
  if (!v || typeof v !== 'object') return null;
  const x = v as Record<string, unknown>;
  if (typeof x.k !== 'string') return null;
  const cd: Condition = { k: x.k, r: x.r == null ? null : Math.max(1, num(x.r, 1)) };
  if (cd.r != null) {
    if (x.at === 'end') cd.at = 'end';
    if (typeof x.by === 'string' && x.by) cd.by = x.by;
    if (x.sk === 1) cd.sk = 1;
  }
  return cd;
}

export function normEncounter(e: unknown): Encounter | null {
  if (!e || typeof e !== 'object') return null;
  const x = e as Record<string, unknown>;
  if (typeof x.name !== 'string' || !x.name.trim()) return null;
  const items = (Array.isArray(x.items) ? x.items : [])
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && typeof (i as Record<string, unknown>).monsterId === 'string')
    .map((i) => ({ monsterId: String(i.monsterId), qty: Math.max(1, Math.min(20, num(i.qty, 1))), inLair: !!i.inLair }));
  if (!items.length) return null;
  return { id: String(x.id || 'e-' + uid()), name: x.name.trim(), items, lair: !!x.lair };
}

export function normMonster(m: unknown): Monster | null {
  if (!m || typeof m !== 'object') return null;
  const x = m as Record<string, unknown>;
  if (typeof x.n !== 'string' || !x.n.trim()) return null;
  if (!Array.isArray(x.ab) || x.ab.length !== 6) return null;
  const ab = (x.ab as unknown[]).map((v) => Math.max(1, Math.min(30, num(v, 10))));
  const o = { sz: 'Mediano', t: 'monstruosidad', al: 'sin alineamiento', hd: '1d8', spd: '30 pies', sk: '', sen: '', lang: '—', cr: '1', ...x } as Monster;
  o.id = String(x.id || 'c-' + uid());
  o.custom = 1;
  o.ab = ab;
  o.ac = num(x.ac, 10);
  o.hp = Math.max(1, num(x.hp, avgOf(o.hd) || 1));
  o.ini = num(x.ini, modOf(ab[1]));
  o.sv = Array.isArray(x.sv) && x.sv.length === 6 ? (x.sv as unknown[]).map((v, i) => num(v, modOf(ab[i]))) : ab.map(modOf);
  o.pp = num(x.pp, 10 + modOf(ab[4]));
  o.cr = String(o.cr);
  o.xp = num(x.xp, XP_BY_CR[o.cr] || 0);
  o.pb = num(x.pb, pbOf(o.cr));
  o.vul = strArr(x.vul);
  o.res = strArr(x.res);
  o.imm = strArr(x.imm);
  o.ci = strArr(x.ci);
  SECTIONS.forEach(([sec]) => {
    const list = x[sec];
    if (!Array.isArray(list)) { delete o[sec]; return; }
    o[sec] = list.filter((f) => f && typeof f.n === 'string').map((f) => ({ ...f, d: String(f.d ?? '') }));
  });
  return o;
}

export function normRoster(r: unknown): RosterEntry | null {
  if (!r || typeof r !== 'object') return null;
  const x = r as Record<string, unknown>;
  if (typeof x.name !== 'string' || !x.name.trim()) return null;
  const o = { ...blankRoster(), ...x } as RosterEntry;
  o.id = String(x.id || 'r-' + uid());
  o.res = strArr(x.res);
  (['player', 'cls', 'level', 'ac', 'hp', 'initb', 'pp'] as const).forEach((k) => { o[k] = String(o[k] ?? ''); });
  return o;
}

export function emptySaved(): SavedState {
  return { v: SCHEMA_VERSION, custom: [], roster: [], combatants: [], round: 1, activeId: null, started: false, log: [], diceTheme: 'ruby', turnEvents: [], encounters: [], dice3d: null };
}

/** Repara y migra cualquier dato guardado o importado. Nunca lanza. */
export function normalizeSaved(raw: unknown): SavedState {
  const out = emptySaved();
  if (!raw || typeof raw !== 'object') return out;
  const x = raw as Record<string, unknown>;
  out.custom = (Array.isArray(x.custom) ? x.custom : []).map(normMonster).filter((m): m is Monster => !!m);
  out.roster = (Array.isArray(x.roster) ? x.roster : []).map(normRoster).filter((r): r is RosterEntry => !!r);
  out.combatants = (Array.isArray(x.combatants) ? x.combatants : []).map(normCombatant).filter((c): c is Combatant => !!c);
  out.round = Math.max(1, num(x.round, 1));
  out.activeId = typeof x.activeId === 'string' && out.combatants.some((c) => c.id === x.activeId) ? x.activeId : null;
  out.started = !!x.started && out.combatants.length > 0;
  out.log = (Array.isArray(x.log) ? x.log : []).filter((l): l is LogEntry => !!l && typeof (l as LogEntry).label === 'string').slice(0, 30);
  out.turnEvents = (Array.isArray(x.turnEvents) ? x.turnEvents : []).filter((e): e is TurnEvent => !!e && typeof (e as TurnEvent).text === 'string');
  out.diceTheme = ['ruby', 'bone', 'obsidian', 'gem', 'metal', 'wood'].includes(String(x.diceTheme)) ? String(x.diceTheme) : 'ruby';
  out.dice3d = typeof x.dice3d === 'boolean' ? x.dice3d : null;
  // v4: encuentros guardados (las versiones anteriores no los tienen)
  out.encounters = (Array.isArray(x.encounters) ? x.encounters : []).map(normEncounter).filter((e): e is Encounter => !!e);
  return out;
}

// ---------- IndexedDB ----------
let idbStore: ReturnType<typeof createStore> | null = null;
const store = () => (idbStore ??= createStore('cronica-combate', 'estado'));

export async function loadSaved(): Promise<{ data: SavedState; ok: boolean }> {
  try {
    const raw = await get(STORAGE_KEY, store());
    if (raw) return { data: normalizeSaved(raw), ok: true };
    // migración desde la versión prototipo (localStorage)
    try {
      const old = window.localStorage.getItem('cronica-combate-v2');
      if (old) return { data: normalizeSaved(JSON.parse(old)), ok: true };
    } catch { /* sin localStorage */ }
    return { data: emptySaved(), ok: true };
  } catch {
    return { data: emptySaved(), ok: false };
  }
}

export async function saveState(data: SavedState): Promise<boolean> {
  try {
    await set(STORAGE_KEY, { ...data, v: SCHEMA_VERSION, savedAt: Date.now() }, store());
    return true;
  } catch {
    return false;
  }
}

/** Pide al navegador que no borre los datos por falta de espacio. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* no disponible */ }
  return false;
}

// ---------- Exportar / importar ----------
export interface ExportFile {
  app: 'cronica-combate';
  v: number;
  exportedAt: string;
  roster: RosterEntry[];
  custom: Monster[];
  encounters: Encounter[];
  combat: Pick<SavedState, 'combatants' | 'round' | 'activeId' | 'started' | 'turnEvents'>;
}

export function buildExport(s: SavedState): ExportFile {
  return {
    app: 'cronica-combate', v: SCHEMA_VERSION, exportedAt: new Date().toISOString(), roster: s.roster, custom: s.custom, encounters: s.encounters,
    combat: { combatants: s.combatants, round: s.round, activeId: s.activeId, started: s.started, turnEvents: s.turnEvents },
  };
}

export interface ImportResult {
  ok: boolean;
  message: string;
  roster?: RosterEntry[];
  custom?: Monster[];
  encounters?: Encounter[];
  combat?: Pick<SavedState, 'combatants' | 'round' | 'activeId' | 'started' | 'turnEvents'>;
}

/** Fusiona una copia con los datos actuales; descarta registros dañados. */
export function mergeImport(text: string, current: SavedState): ImportResult {
  let d: unknown;
  try { d = JSON.parse(text); } catch { return { ok: false, message: 'El archivo no es una copia válida.' }; }
  if (!d || typeof d !== 'object') return { ok: false, message: 'El archivo no es una copia válida.' };
  const x = d as Record<string, unknown>;
  if (!Array.isArray(x.roster) && !Array.isArray(x.custom) && !Array.isArray(x.encounters)) return { ok: false, message: 'No parece una copia de Crónica de Combate.' };
  const inR = (Array.isArray(x.roster) ? x.roster : []).map(normRoster);
  const goodR = inR.filter((r): r is RosterEntry => !!r);
  const inM = (Array.isArray(x.custom) ? x.custom : []).map(normMonster);
  const goodM = inM.filter((m): m is Monster => !!m);
  const rIds = new Set(goodR.map((r) => r.id));
  const rNames = new Set(goodR.map((r) => norm(r.name)));
  const roster = current.roster.filter((r) => !rIds.has(r.id) && !rNames.has(norm(r.name))).concat(goodR);
  const mIds = new Set(goodM.map((m) => m.id));
  const custom = goodM.concat(current.custom.filter((m) => !mIds.has(m.id)));
  const inE = (Array.isArray(x.encounters) ? x.encounters : []).map(normEncounter);
  const goodE = inE.filter((e): e is Encounter => !!e);
  const eIds = new Set(goodE.map((e) => e.id));
  const encounters = current.encounters.filter((e) => !eIds.has(e.id)).concat(goodE);
  const bad = inR.length - goodR.length + (inM.length - goodM.length) + (inE.length - goodE.length);
  let combat: ImportResult['combat'];
  let extra = '';
  const c = x.combat as Record<string, unknown> | undefined;
  if (c && Array.isArray(c.combatants) && c.combatants.length) {
    if (!current.combatants.length) {
      const n = normalizeSaved({ combatants: c.combatants, round: c.round, activeId: c.activeId, started: c.started, turnEvents: c.turnEvents });
      combat = { combatants: n.combatants, round: n.round, activeId: n.activeId, started: n.started, turnEvents: n.turnEvents };
      extra = ' y el combate guardado (' + n.combatants.length + ' combatientes)';
    } else extra = '. El combate de la copia no se ha cargado porque ya tienes uno abierto: vacíalo y vuelve a importar si lo quieres';
  }
  return {
    ok: true, roster, custom, encounters, combat,
    message: 'Importado: ' + goodR.length + ' jugadores, ' + goodM.length + ' criaturas y ' + goodE.length + ' encuentros, fusionados con los tuyos' + extra + '.' + (bad ? ' Se han descartado ' + bad + ' registros dañados.' : ''),
  };
}
