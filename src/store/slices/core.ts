import type { Monster, SrdData } from '../../data/types';
import { loadBookMonsters } from '../bookMonsters';
import type { Kit } from '../kit';
import { loadSaved, requestPersistence } from '../persist';
import { prunePdfs } from '../pdfs';
import type { CoreSlice, GetState, SetState } from '../state';

/** Tipos de criatura para el filtro del bestiario («dragón (cromático)» cuenta como «dragón»). */
export const typesOf = (list: Monster[]) => Array.from(new Set(list.map((m) => m.t.split(' (')[0]))).sort((a, b) => a.localeCompare(b, 'es'));

export function createCoreSlice(set: SetState, get: GetState, { pushLog, guard }: Kit): CoreSlice {
  let toastT: ReturnType<typeof setTimeout> | undefined;
  let confirmT: ReturnType<typeof setTimeout> | undefined;
  return {
    tab: 'combat', loaded: false, hydrated: false, loadError: '', srd: [], spells: {}, types: [], storageOk: true, readFailed: false, persistent: false,
    log: [], toast: '', spellOpen: null, spellCtx: null, confirmKey: null, undoStack: [], helpOpen: false,

    async init() {
      // los datos guardados primero: pedir al navegador que no los borre puede tardar (o, en Firefox, esperar a que el
      // usuario responda a un aviso), así que va aparte y no retrasa la carga
      const { data, ok } = await loadSaved();
      set({ ...data, selId: data.started ? data.activeId : null, storageOk: ok, readFailed: !ok, hydrated: true });
      void requestPersistence().then((persistent) => set({ persistent }));
      // hojas de personaje que ya no usa ningún jugador (quitadas o sustituidas en sesiones anteriores)
      if (ok) void prunePdfs(new Set(data.roster.map((r) => r.pdf?.id).filter((x): x is string => !!x)));
      // criaturas del Manual de Monstruos del usuario, si lo importó en este dispositivo
      void loadBookMonsters().then((book) => { if (book.length) set({ book, types: typesOf([...get().srd, ...book]) }); });
      try {
        const res = await fetch(import.meta.env.BASE_URL + 'data/srd52_es.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const d = (await res.json()) as SrdData;
        const srd = d.m.slice().sort((a, b) => a.n.localeCompare(b.n, 'es'));
        set({ srd, spells: d.sp, types: typesOf([...srd, ...get().book]), loaded: true, viewId: get().viewId || srd[0]?.id || null });
      } catch (e) {
        set({ loaded: true, loadError: 'No se pudo cargar el bestiario SRD (' + (e as Error).message + '). Tus criaturas propias siguen disponibles.' });
      }
    },

    set: (patch) => set(patch),
    // el SRD manda: una criatura propia importada con un id del SRD no puede suplantarla
    monById: (id) => (id ? get().srd.find((m) => m.id === id) || get().custom.find((m) => m.id === id) || get().book.find((m) => m.id === id) : undefined),

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
      stack.push({ label, at: now, data: { combatants: s.combatants, round: s.round, activeId: s.activeId, started: s.started, turnEvents: s.turnEvents, concPrompts: s.concPrompts, critFor: s.critFor, selId: s.selId, roster: s.roster, custom: s.custom, encounters: s.encounters } });
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
  };
}
