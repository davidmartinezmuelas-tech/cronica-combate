/**
 * Preferencias del dispositivo que no son datos de partida: animaciones reducidas (también la del sistema) y la
 * instalación de la app (el aviso del navegador se guarda para ofrecerlo en Ajustes).
 */
const MOTION_KEY = 'cronica-animaciones';

/** ¿Animaciones reducidas? Lo elegido en Ajustes manda; si no se eligió, lo que pida el sistema. */
export function reducedMotion(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion')) return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function motionPref(): boolean {
  try { return localStorage.getItem(MOTION_KEY) === 'reducidas'; } catch { return false; }
}

export function setMotionPref(reduce: boolean) {
  try { if (reduce) localStorage.setItem(MOTION_KEY, 'reducidas'); else localStorage.removeItem(MOTION_KEY); } catch { /* solo esta visita */ }
  document.documentElement.classList.toggle('reduce-motion', reduce);
}

// instalar la app: el navegador avisa una vez (beforeinstallprompt); se guarda para usarlo desde Ajustes
interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let installEvent: InstallPrompt | null = null;
const installListeners = new Set<() => void>();
export const canInstall = () => !!installEvent;
export const onInstallChange = (cb: () => void) => { installListeners.add(cb); return () => { installListeners.delete(cb); }; };
export async function installApp() {
  if (!installEvent) return;
  await installEvent.prompt();
  await installEvent.userChoice.catch(() => null);
  installEvent = null;
  installListeners.forEach((f) => f());
}

// crear personajes con el asistente paso a paso (si no, el editor entero en una página)
const WIZ_KEY = 'cronica-asistente';
export function wizardPref(): boolean {
  try { return localStorage.getItem(WIZ_KEY) !== 'no'; } catch { return true; }
}
export function setWizardPref(on: boolean) {
  try { if (on) localStorage.removeItem(WIZ_KEY); else localStorage.setItem(WIZ_KEY, 'no'); } catch { /* solo esta visita */ }
}

/** Al arrancar: aplica la preferencia de animaciones y escucha el aviso de instalación. */
export function initPrefs() {
  if (typeof window === 'undefined') return;
  document.documentElement.classList.toggle('reduce-motion', motionPref());
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e as InstallPrompt; installListeners.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { installEvent = null; installListeners.forEach((f) => f()); });
}
