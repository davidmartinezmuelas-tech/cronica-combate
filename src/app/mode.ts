import { useEffect, useState } from 'react';

/** Modo de uso de la app: mesa del máster o hoja del jugador. */
export type Mode = 'dm' | 'player';

const KEY = 'cronica-modo';
const HASH: Record<Mode, string> = { dm: '#/dm', player: '#/jugador' };
export const HOME_HASH = '#/inicio';

function stored(): Mode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dm' || v === 'player' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Modo según la dirección: #/dm, #/jugador o #/inicio (elegir). Sin nada en la dirección se usa el último
 * modo elegido en este dispositivo; la primera vez, la pantalla de elegir.
 */
export function modeFromLocation(hash: string): Mode | null {
  if (hash.startsWith(HASH.dm)) return 'dm';
  if (hash.startsWith(HASH.player)) return 'player';
  if (hash.startsWith(HOME_HASH)) return null;
  return stored();
}

export function chooseMode(m: Mode) {
  try { localStorage.setItem(KEY, m); } catch { /* sin almacenamiento: solo dura esta visita */ }
  window.location.hash = HASH[m];
}

export function useMode(): Mode | null {
  const [mode, setMode] = useState<Mode | null>(() => modeFromLocation(window.location.hash));
  useEffect(() => {
    // deja la dirección coherente con el modo (al volver atrás o recargar se mantiene)
    const m = modeFromLocation(window.location.hash);
    if (m && !window.location.hash) window.history.replaceState(null, '', HASH[m]);
    const on = () => setMode(modeFromLocation(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return mode;
}
