/**
 * Tema de color del dispositivo: el clásico (marrón, el de siempre) o una de las paletas alternativas (tres oscuras y cuatro claras). No es un dato
 * de partida: se queda en este navegador. El atributo `data-theme` de <html> es lo que lee el CSS.
 */
export type ThemePref = 'dark' | 'slate' | 'midnight' | 'forest' | 'sage' | 'linen' | 'mist' | 'lavender';
const THEME_KEY = 'cronica-tema';

/** Nombre y color de fondo (para la barra del navegador en el móvil) de cada tema. */
export const THEMES: { k: ThemePref; label: string; bg: string }[] = [
  { k: 'dark', label: 'Clásico', bg: '#26211d' },
  { k: 'slate', label: 'Pizarra', bg: '#1f2124' },
  { k: 'midnight', label: 'Medianoche', bg: '#1a1f2b' },
  { k: 'forest', label: 'Bosque', bg: '#1b231f' },
  { k: 'sage', label: 'Salvia', bg: '#d0d7ce' },
  { k: 'linen', label: 'Lino', bg: '#d6d3cf' },
  { k: 'mist', label: 'Niebla', bg: '#c9d2dc' },
  { k: 'lavender', label: 'Lavanda', bg: '#d1ced7' },
];

export function themePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEMES.some((t) => t.k === v) ? (v as ThemePref) : 'dark';
  } catch { return 'dark'; }
}

function apply(pref: ThemePref) {
  document.documentElement.dataset.theme = pref;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES.find((t) => t.k === pref)?.bg || '#26211d');
}

export function setThemePref(pref: ThemePref) {
  try { if (pref === 'dark') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, pref); } catch { /* solo esta visita */ }
  apply(pref);
}

/** Al arrancar: aplica el tema elegido. */
export function initTheme() {
  if (typeof window === 'undefined') return;
  apply(themePref());
}
