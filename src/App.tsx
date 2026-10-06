import { lazy, Suspense, useEffect, useState } from 'react';
import ModeSelect from './app/ModeSelect';
import { useMode } from './app/mode';
import DmApp from './modes/dm/DmApp';
import { startAutosave, useStore } from './store/useStore';

// el modo jugador se descarga solo si se elige
const PlayerApp = lazy(() => import('./modes/player/PlayerApp'));

/** Raíz: carga los datos guardados una vez y muestra el modo elegido (máster, jugador o la pantalla de elegir). */
export default function App() {
  const mode = useMode();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    void useStore.getState().init();
    const stop = startAutosave();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { stop(); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  return (
    <>
      {!online && <div className="offline" role="status">Sin conexión: la app sigue funcionando con los datos guardados en este dispositivo.</div>}
      {mode === 'dm' ? <DmApp /> : mode === 'player' ? (
        <Suspense fallback={<p className="muted" style={{ padding: 24 }}>Cargando…</p>}><PlayerApp /></Suspense>
      ) : <ModeSelect />}
    </>
  );
}
