import type { Combatant, RosterEntry } from '../data/types';
import { makePcCombatant } from '../engine/combat';
import { norm, uid } from '../engine/util';
import type { RoomCast, RoomMember, SharedRoll } from './cloudAdapter';
import { useStore } from './useStore';

/**
 * Mesa del máster con sala: los jugadores de la sala pasan a su Grupo y al combate, y sus PG y CA llegan en directo.
 * Solo se aplica lo que el jugador cambia (el daño que pone el máster no se pisa con cualquier otra actualización).
 */
interface Seen { hp: number; temp: number; hpMax: number; ac: number; charId: string }
const seen = new Map<string, Seen>(); // última hoja recibida de cada participante
const rollsDone = new Set<string>(); // tiradas de iniciativa ya aplicadas

/** Para las pruebas. */
export function resetRoomTable() { seen.clear(); rollsDone.clear(); pending.forEach((t) => clearTimeout(t)); pending.clear(); }

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
    const now: Seen = { hp: sh.hp, temp: sh.temp, hpMax: sh.hpMax, ac: sh.ac, charId: sh.charId || '' };
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

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Lo que el máster cambia en la mesa (daño, curación, PG temporales) de un jugador de la sala se le envía a su hoja.
 * Lo que llegó del propio jugador no se reenvía: su valor ya es el conocido. Varios cambios seguidos van en uno.
 */
export function watchTableForPlayers(send: (to: string, charId: string, hp: number, temp: number) => void): () => void {
  return useStore.subscribe((s, prev) => {
    if (s.combatants === prev.combatants) return;
    for (const c of s.combatants) {
      if (c.kind !== 'pc' || !c.rosterId) continue;
      const uid = s.roster.find((r) => r.id === c.rosterId)?.roomUid;
      const known = uid ? seen.get(uid) : undefined;
      if (!uid || !known || (c.hp === known.hp && c.temp === known.temp)) continue;
      known.hp = c.hp;
      known.temp = c.temp;
      clearTimeout(pending.get(uid));
      pending.set(uid, setTimeout(() => { pending.delete(uid); const k = seen.get(uid)!; send(uid, k.charId, k.hp, k.temp); }, 500));
    }
  });
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

/** Lista de iniciativa para los jugadores: solo nombres y tipo (sin PG ni números de los monstruos). */
export function tableOf(combatants: Combatant[], roster: RosterEntry[]) {
  return combatants.filter((c) => c.kind !== 'lair').map((c) => {
    const roomUid = c.kind === 'pc' ? roster.find((r) => r.id === c.rosterId)?.roomUid : undefined;
    return { id: c.id, name: c.name, kind: c.kind === 'pc' ? 'pc' as const : 'monster' as const, ...(roomUid ? { roomUid } : {}) };
  });
}

/** El máster publica la lista cada vez que cambia (agrupando los cambios seguidos). */
export function watchTableToPublish(publish: (list: ReturnType<typeof tableOf>) => void): () => void {
  let last = '';
  let t: ReturnType<typeof setTimeout> | null = null;
  const send = () => {
    const s = useStore.getState();
    const list = tableOf(s.combatants, s.roster);
    const key = JSON.stringify(list);
    if (key === last) return;
    last = key;
    publish(list);
  };
  send();
  const un = useStore.subscribe((s, prev) => {
    if (s.combatants === prev.combatants && s.roster === prev.roster) return;
    if (t) clearTimeout(t);
    t = setTimeout(send, 400);
  });
  return () => { un(); if (t) clearTimeout(t); };
}

/**
 * Revisar el lanzamiento de un jugador en la mesa de dados: con salvación, en el paso de objetivos ya elegidos; con
 * ataque, marcando a quién acierta según su CA; sin ataque ni salvación, a todos los objetivos.
 */
export function reviewCast(cast: RoomCast): string {
  const s = useStore.getState();
  const targets = cast.targets.filter((id) => s.combatants.some((c) => c.id === id));
  const label = cast.who + ' · ' + cast.label;
  const total = cast.parts.reduce((t, p) => t + p.amt, 0);
  if (cast.effect) {
    useStore.setState({
      result: { label, total: cast.parts.length ? String(total) : 'CD ' + cast.effect.dc, detail: cast.parts.map((p) => p.amt + ' ' + p.type).join(' + '), cls: '', note: 'Lanzado por ' + cast.who + '.', isDmg: cast.parts.length > 0, parts: cast.parts, half: cast.effect.half, by: null, crit: cast.crit, effect: cast.effect },
      effectSel: targets, dmgTargets: {},
    });
    return '';
  }
  const map: Record<string, 'full' | 'half'> = {};
  const notes: string[] = [];
  for (const id of targets) {
    const c = s.combatants.find((x) => x.id === id)!;
    const ac = typeof c.ac === 'number' ? c.ac : parseInt(String(c.ac), 10);
    if (cast.attack == null || Number.isNaN(ac)) { map[id] = 'full'; continue; }
    const hit = cast.attack >= ac;
    notes.push(c.name + (hit ? ' acierta' : ' falla') + ' (CA ' + ac + ')');
    if (hit) map[id] = 'full';
  }
  useStore.setState({
    result: { label, total: String(total), detail: cast.parts.map((p) => p.amt + ' ' + p.type).join(' + '), cls: '', note: (cast.attack != null ? 'Ataque ' + cast.attack + ': ' + notes.join(', ') + '. ' : '') + 'Revisa y pulsa «Aplicar daño».', isDmg: true, parts: cast.parts, half: false, by: null, crit: cast.crit },
    dmgTargets: map,
  });
  return notes.join(', ');
}
