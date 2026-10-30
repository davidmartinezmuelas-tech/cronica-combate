/**
 * Tema de color del dispositivo: oscuro (el de siempre, si no se elige otro), claro o automático (el del sistema).
 * No es un dato de partida: se queda en este navegador. El atributo `data-theme` de <html> es lo que lee el CSS.
 */
export type ThemePref = 'auto' | 'dark' | 'light';
const THEME_KEY = 'cronica-tema';

export function themePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'auto' ? v : 'dark';
  } catch { return 'dark'; }
}

function systemLight(): boolean {
  try { return window.matchMedia('(prefers-color-scheme: light)').matches; } catch { return false; }
}

/** El tema que se ve ahora: lo elegido, o el del sistema si es automático. */
export function resolvedTheme(pref: ThemePref = themePref()): 'dark' | 'light' {
  return pref === 'auto' ? (systemLight() ? 'light' : 'dark') : pref;
}

function apply(pref: ThemePref) {
  const t = resolvedTheme(pref);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f3ecdc' : '#26211d');
}

export function setThemePref(pref: ThemePref) {
  try { if (pref === 'dark') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, pref); } catch { /* solo esta visita */ }
  apply(pref);
}

/** Al arrancar: aplica el tema y, en automático, sigue los cambios del sistema. */
export function initTheme() {
  if (typeof window === 'undefined') return;
  apply(themePref());
  try { window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (themePref() === 'auto') apply('auto'); }); } catch { /* navegador antiguo */ }
}
