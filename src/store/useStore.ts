import { create } from 'zustand';
import type { SavedState } from '../data/types';
import { createKit } from './kit';
import { saveState } from './persist';
import { savedSlice } from './saved';
import { createBestiarySlice } from './slices/bestiary';
import { createCombatSlice } from './slices/combat';
import { createCoreSlice } from './slices/core';
import { createDiceSlice } from './slices/dice';
import { createEncounterSlice } from './slices/encounters';
import { createGroupSlice } from './slices/group';
import { createRulesSlice } from './slices/rules';
import type { State } from './state';

export type { RollSpec, State, Tab } from './state';
export { savedSlice } from './saved';

export const useStore = create<State>()((rawSet, get) => {
  const set = (patch: Partial<State>) => rawSet(patch);
  const kit = createKit(set, get);
  return {
    ...createCoreSlice(set, get, kit),
    ...createCombatSlice(set, get, kit),
    ...createDiceSlice(set, get, kit),
    ...createBestiarySlice(set, get),
    ...createGroupSlice(set, get),
    ...createEncounterSlice(set, get),
    ...createRulesSlice(set, get),
  };
});

// --- guardado automático ---
let saveT: ReturnType<typeof setTimeout> | undefined;
let lastSaved: SavedState | null = null;
const changed = (a: SavedState, b: SavedState | null) => !b || (Object.keys(a) as (keyof SavedState)[]).some((k) => a[k] !== b[k]);

export async function saveNow() {
  clearTimeout(saveT);
  const s = useStore.getState();
  if (!s.hydrated) return;
  const slice = savedSlice(s);
  if (!changed(slice, lastSaved)) return;
  lastSaved = slice;
  const ok = await saveState(slice);
  if (ok !== useStore.getState().storageOk) useStore.setState({ storageOk: ok });
}

export function startAutosave() {
  const unsub = useStore.subscribe((s, prev) => {
    // antes de leer lo guardado no se escribe nada (se pisaría); el SRD no hace falta: lo que se cambie mientras
    // se descarga también se guarda
    if (!s.hydrated) return;
    if (!prev.hydrated) { lastSaved = savedSlice(s); return; }
    if (s.custom !== prev.custom || s.roster !== prev.roster || s.combatants !== prev.combatants || s.round !== prev.round || s.activeId !== prev.activeId ||
      s.started !== prev.started || s.log !== prev.log || s.diceTheme !== prev.diceTheme || s.turnEvents !== prev.turnEvents || s.encounters !== prev.encounters || s.dice3d !== prev.dice3d) {
      clearTimeout(saveT);
      saveT = setTimeout(() => { void saveNow(); }, 250);
    }
  });
  const onHide = () => { void saveNow(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
  return () => { unsub(); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide); };
}
