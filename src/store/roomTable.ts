import type { Combatant, RosterEntry } from '../data/types';
import { makePcCombatant } from '../engine/combat';
import { norm, uid } from '../engine/util';
import type { RoomMember, SharedRoll } from './cloudAdapter';
import { useStore } from './useStore';

/**
 * Mesa del máster con sala: los jugadores de la sala pasan a su Grupo y al combate, y sus PG y CA llegan en directo.
 * Solo se aplica lo que el jugador cambia (el daño que pone el máster no se pisa con cualquier otra actualización).
 */
interface Seen { hp: number; temp: number; hpMax: number; ac: number }
const seen = new Map<string, Seen>(); // última hoja recibida de cada participante
const rollsDone = new Set<string>(); // tiradas de iniciativa ya aplicadas

/** Para las pruebas. */
export function resetRoomTable() { seen.clear(); rollsDone.clear(); }

export function syncMembersToTable(members: RoomMember[]) {
  const s = useStore.getState();
  let roster = s.roster.slice();
  let combatants = s.combatants.slice();
  let rosterChanged = false;
  let combatChanged = false;
  for (const m of members) {
    if (m.role !== 'player' || !m.sheet) continue;
    const sh = m.sheet;
    // su entrada del Grupo: la enlazada o una con el mismo nombre (para no duplicar a quien ya estaba)
    let entry = roster.find((r) => r.roomUid === m.uid) || roster.find((r) => !r.roomUid && norm(r.name) === norm(sh.name));
    const fields = { name: sh.name, player: m.name, cls: sh.cls, level: String(sh.level), ac: String(sh.ac), hp: String(sh.hpMax), pp: String(sh.pp), initb: String(sh.init ?? 0), roomUid: m.uid };
    if (!entry) {
      entry = { id: 'pc' + uid(), res: [], notes: '', ...fields } as RosterEntry;
      roster = roster.concat([entry]);
      rosterChanged = true;
    } else if ((Object.keys(fields) as (keyof typeof fields)[]).some((k) => entry![k] !== fields[k])) {
      const next: RosterEntry = { ...entry, ...fields };
      roster = roster.map((r) => (r.id === entry!.id ? next : r));
      entry = next;
      rosterChanged = true;
    }
    const prev = seen.get(m.uid);
    const now: Seen = { hp: sh.hp, temp: sh.temp, hpMax: sh.hpMax, ac: sh.ac };
    const inCombat = combatants.find((c) => c.rosterId === entry!.id);
    if (!prev && !inCombat) {
      // la primera vez que aparece en la sala entra al combate (si luego el máster lo quita, no vuelve solo)
      const taken = new Set(combatants.map((c) => c.name));
      const c = makePcCombatant(entry, taken.has(entry.name) ? entry.name + ' (' + m.name + ')' : entry.name);
      combatants = combatants.concat([{ ...c, hp: sh.hp, temp: sh.temp }]);
      combatChanged = true;
    } else if (inCombat && prev) {
      const patch: Partial<Combatant> = {};
      if (prev.hp !== now.hp) patch.hp = now.hp;
      if (prev.temp !== now.temp) patch.temp = now.temp;
      if (prev.hpMax !== now.hpMax) patch.maxHp = now.hpMax;
      if (prev.ac !== now.ac) patch.ac = now.ac;
      if (Object.keys(patch).length) { combatants = combatants.map((c) => (c.id === inCombat.id ? { ...c, ...patch } : c)); combatChanged = true; }
    }
    seen.set(m.uid, now);
  }
  if (rosterChanged || combatChanged) useStore.setState({ ...(rosterChanged ? { roster } : {}), ...(combatChanged ? { combatants } : {}) });
}

/** Las tiradas de iniciativa de los jugadores rellenan la suya si aún no la tienen. */
export function applyInitiativeRolls(rolls: SharedRoll[], members: RoomMember[]) {
  const s = useStore.getState();
  let combatants = s.combatants;
  let changed = false;
  for (const r of rolls) {
    if (rollsDone.has(r.id) || !/·\s*iniciativa$/i.test(r.label)) continue;
    rollsDone.add(r.id);
    const total = parseInt(r.total, 10);
    if (Number.isNaN(total)) continue;
    const entry = s.roster.find((e) => e.roomUid === r.uid && members.some((m) => m.uid === r.uid));
    const c = entry && combatants.find((x) => x.rosterId === entry.id);
    if (!c || c.init != null) continue;
    combatants = combatants.map((x) => (x.id === c.id ? { ...x, init: total } : x));
    changed = true;
  }
  if (changed) useStore.setState({ combatants });
}
