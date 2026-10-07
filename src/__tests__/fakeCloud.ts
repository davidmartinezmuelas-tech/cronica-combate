import type { Character } from '../engine/character';
import type { CloudAdapter, CloudUser, RoomCast, RoomEvent, RoomInfo, RoomMember, SaveReply, SharedRoll, TableEntry } from '../store/cloudAdapter';

/** Nube falsa en memoria con la misma forma que Firebase (personajes, salas, participantes y tiradas). */
export function fakeCloud(initialUser: CloudUser | null) {
  let user = initialUser;
  const auth = new Set<(u: CloudUser | null) => void>();
  const remote = new Map<string, Character>();
  const rooms = new Map<string, { info: RoomInfo; members: Map<string, RoomMember>; rolls: SharedRoll[]; events: RoomEvent[]; table: TableEntry[]; casts: RoomCast[]; replies: SaveReply[] }>();
  const watch = { table: new Map<string, Set<(l: TableEntry[]) => void>>(), casts: new Map<string, Set<(l: RoomCast[]) => void>>(), replies: new Map<string, Set<(l: SaveReply[]) => void>>() };
  const sub = <T,>(m: Map<string, Set<T>>, code: string, cb: T) => { const set = m.get(code) || new Set<T>(); set.add(cb); m.set(code, set); setTimeout(() => notify(code), 0); return () => { set.delete(cb); }; };
  const eventWatch = new Map<string, Set<{ uid: string; cb: (e: RoomEvent[]) => void }>>();
  let charWatcher: ((changed: Character[], removed: string[], first: boolean) => void) | null = null;
  const memberWatch = new Map<string, Set<(m: RoomMember[]) => void>>();
  const rollWatch = new Map<string, Set<(r: SharedRoll[]) => void>>();
  const calls = { put: [] as string[], del: [] as string[], anon: 0 };
  let n = 0;
  const notify = (code: string) => {
    const r = rooms.get(code);
    memberWatch.get(code)?.forEach((cb) => cb(r ? [...r.members.values()] : []));
    rollWatch.get(code)?.forEach((cb) => cb(r ? [...r.rolls].sort((a, b) => b.at - a.at).slice(0, 40) : []));
    eventWatch.get(code)?.forEach((w) => w.cb(r ? r.events.filter((e) => e.to === w.uid) : []));
    watch.table.get(code)?.forEach((cb) => cb(r ? r.table : []));
    watch.casts.get(code)?.forEach((cb) => cb(r ? [...r.casts] : []));
    watch.replies.get(code)?.forEach((cb) => cb(r ? [...r.replies] : []));
  };
  const setUser = (u: CloudUser | null) => { user = u; auth.forEach((cb) => cb(u)); };
  const adapter: CloudAdapter = {
    onAuth: (cb) => { auth.add(cb); setTimeout(() => cb(user), 0); return () => auth.delete(cb); },
    google: async () => {}, emailIn: async () => {}, emailUp: async () => {}, reset: async () => {},
    out: async () => setUser(null),
    anon: async () => { calls.anon++; setTimeout(() => setUser({ uid: 'anon-' + calls.anon, email: null, name: null, anon: true }), 0); },
    watchCharacters: (_uid, cb) => { charWatcher = cb; setTimeout(() => cb([...remote.values()], [], true), 0); return () => { charWatcher = null; }; },
    putCharacter: async (_uid, c) => { calls.put.push(c.id); remote.set(c.id, c); },
    deleteCharacter: async (_uid, id) => { calls.del.push(id); remote.delete(id); },
    getRoom: async (code) => rooms.get(code)?.info || null,
    createRoom: async (info) => { rooms.set(info.code, { info, members: new Map(), rolls: [], events: [], table: [], casts: [], replies: [] }); },
    closeRoom: async (code) => { rooms.delete(code); notify(code); },
    setMember: async (code, m) => { rooms.get(code)?.members.set(m.uid, m); notify(code); },
    removeMember: async (code, uid) => { rooms.get(code)?.members.delete(uid); notify(code); },
    watchMembers: (code, cb) => {
      const set = memberWatch.get(code) || new Set(); set.add(cb); memberWatch.set(code, set);
      setTimeout(() => notify(code), 0);
      return () => set.delete(cb);
    },
    addRoll: async (code, r) => { rooms.get(code)?.rolls.push({ ...r, id: 'r' + ++n }); notify(code); },
    sendEvent: async (code, ev) => { rooms.get(code)?.events.push({ ...ev, id: 'e' + ++n }); notify(code); },
    watchEvents: (code, uid, cb) => {
      const set = eventWatch.get(code) || new Set(); const w = { uid, cb }; set.add(w); eventWatch.set(code, set);
      setTimeout(() => notify(code), 0);
      return () => set.delete(w);
    },
    deleteEvent: async (code, id) => { const r = rooms.get(code); if (r) r.events = r.events.filter((e) => e.id !== id); notify(code); },
    publishTable: async (code, list) => { const r = rooms.get(code); if (r) r.table = list; notify(code); },
    watchTable: (code, cb) => sub(watch.table, code, cb),
    sendCast: async (code, c) => { rooms.get(code)?.casts.push({ ...c, id: 'c' + ++n }); notify(code); },
    watchCasts: (code, cb) => sub(watch.casts, code, cb),
    deleteCast: async (code, id) => { const r = rooms.get(code); if (r) r.casts = r.casts.filter((c) => c.id !== id); notify(code); },
    sendReply: async (code, x) => { rooms.get(code)?.replies.push({ ...x, id: 'q' + ++n }); notify(code); },
    watchReplies: (code, cb) => sub(watch.replies, code, cb),
    deleteReply: async (code, id) => { const r = rooms.get(code); if (r) r.replies = r.replies.filter((c) => c.id !== id); notify(code); },
    watchRolls: (code, cb) => {
      const set = rollWatch.get(code) || new Set(); set.add(cb); rollWatch.set(code, set);
      setTimeout(() => notify(code), 0);
      return () => set.delete(cb);
    },
  };
  return { adapter, remote, rooms, calls, setUser, emit: (changed: Character[], removed: string[]) => charWatcher?.(changed, removed, false) };
}
