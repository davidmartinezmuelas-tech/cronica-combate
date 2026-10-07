import { create } from 'zustand';
import { cloud, useAccount } from './account';
import { cloudError, type RoomInfo, type RoomMember, type SharedRoll, type SheetSummary } from './cloudAdapter';
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
  create: (name: string) => Promise<boolean>;
  join: (code: string, name: string) => Promise<boolean>;
  leave: () => Promise<void>;
  close: () => Promise<void>;
  setShare: (v: boolean) => void;
  publishSheet: (sheet: SheetSummary | null) => void;
  resume: () => Promise<void>;
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
    // cada tirada nueva de la mesa de dados se publica (si se comparte)
    let prev = useStore.getState().result;
    const unResult = useStore.subscribe((s) => {
      const r = s.result;
      if (!r || r === prev) return;
      prev = r;
      const uid = me()?.uid;
      if (!get().share || !uid || !get().code) return;
      a.addRoll(info.code, { uid, who: get().name, label: r.label, total: r.total, detail: r.detail, cls: r.cls, at: Date.now() }).catch((e) => set({ error: cloudError(e) }));
    });
    stop = () => { unMembers(); unRolls(); unResult(); stop = null; };
  }

  async function member(code: string, role: 'dm' | 'player', name: string, sheet: SheetSummary | null) {
    const u = me()!;
    await cloud()!.setMember(code, { uid: u.uid, name, role, sheet, at: Date.now() });
  }

  return {
    code: null, role: null, name: '', room: null, members: [], rolls: [], share: true, busy: false, error: '',

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
      set({ code: null, role: null, room: null, members: [], rolls: [], error: '' });
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
