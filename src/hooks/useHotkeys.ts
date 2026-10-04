import { useEffect } from 'react';
import { useStore } from '../store/useStore';

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

export const HOTKEYS: [string, string][] = [
  ['N', 'Siguiente turno (o empezar el combate)'],
  ['B', 'Volver al turno anterior'],
  ['Ctrl/⌘ + Z', 'Deshacer'],
  ['D', 'Ir al campo de cantidad (daño / curación)'],
  ['V / X', 'Ventaja / desventaja en la próxima tirada'],
  ['1 – 7', 'Tirar d4, d6, d8, d10, d12, d20, d100'],
  ['I', 'Tirar la iniciativa de los monstruos'],
  ['/', 'Buscar en el bestiario'],
  ['?', 'Mostrar u ocultar esta ayuda'],
  ['Esc', 'Cerrar la ayuda o el conjuro abierto'],
];

export function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (isTyping(e.target)) return;
        e.preventDefault();
        s.undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = e.key;
      const sides = [4, 6, 8, 10, 12, 20, 100];
      if (k === 'Escape') { if (s.helpOpen) s.set({ helpOpen: false }); else if (s.spellOpen) s.set({ spellOpen: null }); return; }
      if (k === '?') { e.preventDefault(); s.set({ helpOpen: !s.helpOpen }); return; }
      if (k === 'n' || k === 'N') { e.preventDefault(); s.step(1); return; }
      if (k === 'b' || k === 'B') { e.preventDefault(); if (s.started) s.step(-1); return; }
      if (k === 'i' || k === 'I') { e.preventDefault(); s.rollInit(); return; }
      if (k === 'v' || k === 'V') { s.set({ adv: s.adv === 'adv' ? 'normal' : 'adv' }); return; }
      if (k === 'x' || k === 'X') { s.set({ adv: s.adv === 'dis' ? 'normal' : 'dis' }); return; }
      if (k === 'd' || k === 'D') { e.preventDefault(); s.set({ tab: 'combat' }); setTimeout(() => document.getElementById('amt')?.focus(), 0); return; }
      if (k === '/') { e.preventDefault(); s.set({ tab: 'bestiary' }); setTimeout(() => document.getElementById('search')?.focus(), 0); return; }
      const n = parseInt(k, 10);
      if (n >= 1 && n <= 7) { e.preventDefault(); const sd = sides[n - 1]; s.roll({ label: 'd' + sd, kind: 'free', parts: [{ expr: '1d' + sd }] }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
