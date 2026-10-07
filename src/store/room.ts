import { create } from 'zustand';
import { cloud, useAccount } from './account';
import { cloudError, type RoomCast, type RoomInfo, type RoomMember, type SaveReply, type SharedRoll, type SheetSummary, type TableEntry } from './cloudAdapter';
import { usePlayer } from './player';
import { useStore } from './useStore';

/**
 * Sala de juego: el máster la crea con un código de 6 caracteres y los jugadores entran con él (con su cuenta o como
 * invitados). Todos ven quién está y las tiradas que se comparten; los jugadores comparten un resumen de su hoja.
 */
const SAVED = 'cronica-sala';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0 ni 1 (se confunden al dictarlo)

export const newCode = (rnd: () => number = Math.random) => Array.from({ length: 6 }, () => ALPHABET[Math.floor(rnd() * ALPHABET.length)]).join('');
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

interface Saved { code: string; role: 'dm' | 'player'; name: string; share: boolean }
const save = (v: Saved | null) => { try { if (v) localStorage.setItem(SAVED, JSON.stringify(v)); else localStorage.removeItem(SAVED); } catch { /* nada */ } };
const saved = (): Saved | null => { try { return JSON.parse(localStorage.getItem(SAVED) || 'null'); } catch { return null; } };

export interface RoomState {
  code: string | null;
  role: 'dm' | 'player' | null;
  name: string;
  room: RoomInfo | null;
  members: RoomMember[];
  rolls: SharedRoll[];
  share: boolean; // publicar mis tiradas en la sala
  busy: boolean;
  error: string;
  notice: string; // aviso al jugador (el máster le ha cambiado los PG)
  table: TableEntry[]; // lista de iniciativa que comparte el máster
  casts: RoomCast[]; // el máster: lanzamientos de los jugadores pendientes de revisar
  replies: SaveReply[]; // el máster: respuestas a sus peticiones de salvación
  saveRequests: { reqId: string; dc: number; abil: number; label: string }[]; // el jugador: salvaciones que le pide el máster
  lastAttack: { label: string; total: number; at: number } | null; // el jugador: su última tirada de ataque
  publishTable: (list: TableEntry[]) => void;
  sendCast: (cast: Omit<RoomCast, 'id' | 'uid' | 'who' | 'at'>) => Promise<boolean>;
  dismissCast: (id: string) => void;
  requestSave: (to: string, reqId: string, dc: number, abil: number, label: string) => void;
  answerSave: (reqId: string, total: number) => void;
  dismissReply: (id: string) => void;
  create: (name: string) => Promise<boolean>;
  join: (code: string, name: string) => Promise<boolean>;
  leave: () => Promise<void>;
  close: () => Promise<void>;
  setShare: (v: boolean) => void;
  publishSheet: (sheet: SheetSummary | null) => void;
  resume: () => Promise<void>;
  sendHp: (to: string, charId: string, hp: number, temp: number) => void;
}

let stop: (() => void) | null = null;
let sheetTimer: ReturnType<typeof setTimeout> | null = null;
let lastSheet = '';

export const useRoom = create<RoomState>()((set, get) => {
  const me = () => useAccount.getState().user;

  /** Ya dentro: escuchar participantes y tiradas, y publicar las mías. */
  function enter(info: RoomInfo, role: 'dm' | 'player', name: string, share: boolean) {
    const a = cloud()!;
    stop?.();
    set({ code: info.code, role, name, room: info, share, error: '', busy: false });
    save({ code: info.code, role, name, share });
    let present = false;
    const unMembers = a.watchMembers(info.code, (members) => {
      const uid = me()?.uid;
      const mine = members.some((m) => m.uid === uid);
      // si me han quitado (o el máster cerró la sala) después de haber entrado, salgo
      if (present && !mine) { stop?.(); set({ code: null, role: null, room: null, members: [], rolls: [], error: 'La sala se ha cerrado o ya no estás en ella.' }); save(null); return; }
      if (mine) present = true;
      set({ members: members.sort((x, y) => (x.role === y.role ? x.name.localeCompare(y.name, 'es') : x.role === 'dm' ? -1 : 1)) });
    }, (e) => set({ error: cloudError(e) }));
    const unRolls = a.watchRolls(info.code, (rolls) => set({ rolls }), (e) => set({ error: cloudError(e) }));
    const fail = (e: Error) => set({ error: cloudError(e) });
    // los jugadores ven la lista de iniciativa; el máster recibe los lanzamientos y las respuestas de salvación
    const unTable = role === 'player' ? a.watchTable(info.code, (table) => set({ table }), fail) : () => {};
    const unCasts = role === 'dm' ? a.watchCasts(info.code, (casts) => set({ casts }), fail) : () => {};
    const unReplies = role === 'dm' ? a.watchReplies(info.code, (replies) => set({ replies }), fail) : () => {};
    // cada tirada nueva de la mesa de dados se publica (si se comparte)
    let prev = useStore.getState().result;
    const unResult = useStore.subscribe((s) => {
      const r = s.result;
      if (!r || r === prev) return;
      prev = r;
      // el jugador recuerda su último ataque (para mandarlo con el daño a la mesa)
      if (/: ataque$/.test(r.label) && /^-?\d+$/.test(r.total)) set({ lastAttack: { label: r.label.replace(/: ataque$/, ''), total: parseInt(r.total, 10), at: Date.now() } });
      const uid = me()?.uid;
      if (!get().share || !uid || !get().code) return;
      a.addRoll(info.code, { uid, who: get().name, label: r.label, total: r.total, detail: r.detail, cls: r.cls, at: Date.now() }).catch((e) => set({ error: cloudError(e) }));
    });
    // el jugador: los avisos del máster (sus PG tras el daño en la mesa) se aplican a su personaje
    const myUid = me()?.uid;
    const unEvents = role === 'player' && myUid ? a.watchEvents(info.code, myUid, (events) => {
      for (const ev of events) {
        if (ev.kind === 'save' && ev.reqId) {
          const req = { reqId: ev.reqId, dc: ev.dc || 10, abil: ev.abil ?? 0, label: ev.label || '' };
          if (!get().saveRequests.some((x) => x.reqId === req.reqId)) set({ saveRequests: [...get().saveRequests, req] });
          a.deleteEvent(info.code, ev.id).catch(() => { /* ya borrado */ });
          continue;
        }
        const p = usePlayer.getState();
        const c = p.characters.find((x) => x.id === ev.charId) || p.characters.find((x) => x.id === p.activeId);
        if (c) {
          p.update(c.id, { hp: Math.max(0, ev.hp), temp: Math.max(0, ev.temp), ...(ev.hp > 0 ? { death: { s: 0, f: 0 } } : {}) });
          set({ notice: 'El máster ha cambiado los PG de ' + (c.name || 'tu personaje') + ': ' + ev.hp + (ev.temp ? ' (+' + ev.temp + ' temporales)' : '') + '.' });
        }
        a.deleteEvent(info.code, ev.id).catch(() => { /* ya borrado */ });
      }
    }, (e) => set({ error: cloudError(e) })) : () => {};
    stop = () => { unMembers(); unRolls(); unResult(); unEvents(); unTable(); unCasts(); unReplies(); stop = null; };
  }

  async function member(code: string, role: 'dm' | 'player', name: string, sheet: SheetSummary | null) {
    const u = me()!;
    await cloud()!.setMember(code, { uid: u.uid, name, role, sheet, at: Date.now() });
  }

  return {
    code: null, role: null, name: '', room: null, members: [], rolls: [], share: true, busy: false, error: '', notice: '',
    table: [], casts: [], replies: [], saveRequests: [], lastAttack: null,

    publishTable(list) {
      const { code, role } = get();
      if (code && role === 'dm') cloud()?.publishTable(code, list).catch((e) => set({ error: cloudError(e) }));
    },

    async sendCast(c) {
      const { code, role, name } = get();
      const uid = me()?.uid;
      if (!code || role !== 'player' || !uid) return false;
      try { await cloud()!.sendCast(code, { ...c, uid, who: name, at: Date.now() }); return true; } catch (e) { set({ error: cloudError(e) }); return false; }
    },

    dismissCast(id) {
      const { code } = get();
      set({ casts: get().casts.filter((c) => c.id !== id) });
      if (code) cloud()?.deleteCast(code, id).catch(() => { /* ya borrado */ });
    },

    requestSave(to, reqId, dc, abil, label) {
      const { code, role } = get();
      const from = me()?.uid;
      if (!code || role !== 'dm' || !from) return;
      cloud()?.sendEvent(code, { to, from, charId: '', hp: 0, temp: 0, note: '', at: Date.now(), kind: 'save', dc, abil, label, reqId }).catch((e) => set({ error: cloudError(e) }));
    },

    answerSave(reqId, total) {
      const { code } = get();
      const uid = me()?.uid;
      set({ saveRequests: get().saveRequests.filter((r) => r.reqId !== reqId) });
      if (code && uid) cloud()?.sendReply(code, { uid, reqId, total, at: Date.now() }).catch((e) => set({ error: cloudError(e) }));
    },

    dismissReply(id) {
      const { code } = get();
      set({ replies: get().replies.filter((r) => r.id !== id) });
      if (code) cloud()?.deleteReply(code, id).catch(() => { /* ya borrado */ });
    },

    sendHp(to, charId, hp, temp) {
      const { code, role } = get();
      const from = me()?.uid;
      if (!code || role !== 'dm' || !from) return;
      cloud()?.sendEvent(code, { to, from, charId, hp, temp, note: '', at: Date.now() }).catch((e) => set({ error: cloudError(e) }));
    },

    async create(name) {
      set({ busy: true, error: '' });
      const u = await useAccount.getState().ensureUser();
      if (!u) { set({ busy: false, error: useAccount.getState().error || 'No se pudo iniciar sesión.' }); return false; }
      try {
        const a = cloud()!;
        let code = newCode();
        for (let i = 0; i < 5 && (await a.getRoom(code)); i++) code = newCode();
        const info: RoomInfo = { code, name: 'Mesa de ' + (name || 'Máster'), dmUid: u.uid, dmName: name || 'Máster', createdAt: Date.now() };
        await a.createRoom(info);
        await member(code, 'dm', name || 'Máster', null);
        // el máster no comparte sus tiradas por defecto (las de los monstruos pueden ser secretas)
        enter(info, 'dm', name || 'Máster', false);
        return true;
      } catch (e) { set({ busy: false, error: cloudError(e) }); return false; }
    },

    async join(raw, name) {
      const code = cleanCode(raw);
      if (code.length !== 6) { set({ error: 'El código de la sala tiene 6 caracteres.' }); return false; }
      set({ busy: true, error: '' });
      const u = await useAccount.getState().ensureUser();
      if (!u) { set({ busy: false, error: useAccount.getState().error || 'No se pudo entrar como invitado.' }); return false; }
      try {
        const info = await cloud()!.getRoom(code);
        if (!info) { set({ busy: false, error: 'No hay ninguna sala con ese código.' }); return false; }
        const role = info.dmUid === u.uid ? 'dm' : 'player';
        await member(code, role, name || 'Jugador', null);
        lastSheet = '';
        enter(info, role, name || 'Jugador', role === 'player');
        return true;
      } catch (e) { set({ busy: false, error: cloudError(e) }); return false; }
    },

    async leave() {
      const { code } = get();
      const uid = me()?.uid;
      stop?.();
      save(null);
      set({ code: null, role: null, room: null, members: [], rolls: [], error: '', table: [], casts: [], replies: [], saveRequests: [] });
      if (code && uid) await cloud()?.removeMember(code, uid).catch(() => { /* ya no estaba */ });
    },

    async close() {
      const { code, role } = get();
      if (!code || role !== 'dm') return;
      stop?.();
      save(null);
      set({ code: null, role: null, room: null, members: [], rolls: [], error: '' });
      await cloud()?.closeRoom(code).catch((e) => set({ error: cloudError(e) }));
    },

    setShare(v) {
      set({ share: v });
      const { code, role, name } = get();
      if (code && role) save({ code, role, name, share: v });
    },

    publishSheet(sheet) {
      const { code, role, name } = get();
      if (!code || role !== 'player' || !me()) return;
      const key = JSON.stringify(sheet);
      if (key === lastSheet) return;
      lastSheet = key;
      if (sheetTimer) clearTimeout(sheetTimer);
      sheetTimer = setTimeout(() => { member(code, 'player', name, sheet).catch((e) => set({ error: cloudError(e) })); }, 800);
    },

    async resume() {
      const s = saved();
      if (!s || get().code) return;
      const u = await useAccount.getState().ensureUser();
      if (!u) return;
      try {
        const info = await cloud()!.getRoom(s.code);
        if (!info) { save(null); return; }
        await member(s.code, s.role === 'dm' && info.dmUid === u.uid ? 'dm' : 'player', s.name, null);
        lastSheet = '';
        enter(info, info.dmUid === u.uid ? 'dm' : 'player', s.name, s.share);
      } catch { /* sin conexión: se quedará fuera hasta volver a entrar */ }
    },
  };
});

/** Había una sala abierta en esta pestaña o dispositivo (para volver a entrar al abrir la app). */
export const hadRoom = () => saved() !== null;
