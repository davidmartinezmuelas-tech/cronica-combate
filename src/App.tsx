import { lazy, Suspense, useEffect, useState } from 'react';
import ModeSelect from './app/ModeSelect';
import RollPeek from './shared/RollPeek';
import { useMode } from './app/mode';
import DmApp from './modes/dm/DmApp';
import { hadSession, useAccount } from './store/account';
import { startAutosave, useStore } from './store/useStore';

// el modo jugador se descarga solo si se elige
// la app se muda a su dominio: en la dirección vieja se avisa para que nadie pierda lo guardado solo en el dispositivo
const OLD_HOST = typeof location !== 'undefined' && location.hostname.endsWith('github.io');
const PlayerApp = lazy(() => import('./modes/player/PlayerApp'));

/** Raíz: carga los datos guardados una vez y muestra el modo elegido (máster, jugador o la pantalla de elegir). */
export default function App() {
  const mode = useMode();
  const [moveSeen, setMoveSeen] = useState(() => { try { return sessionStorage.getItem('move-notice') === '1'; } catch { return false; } });
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    void useStore.getState().init();
    // si ya había sesión, se recupera al abrir la app (en cualquier modo: los datos del máster también se sincronizan)
    if (hadSession()) void useAccount.getState().start();
    const stop = startAutosave();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { stop(); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => { useStore.setState({ result: null, dmgTargets: {}, effectSel: null }); }, [mode]);

  return (
    <>
      {OLD_HOST && !moveSeen && (
        <div className="move-notice" role="status">
          <span><b>Crónica de Combate se muda a cronicadecombate.com.</b> Lo guardado solo en este dispositivo no se pasa solo: descarga tu copia (máster: botón «Copia» de arriba, marcando las criaturas de tu Manual; jugador: «Guardar copia» al final de la hoja) y cárgala en la nueva dirección. Con la sesión iniciada, tus personajes ya van en la nube.</span>
          <button className="btn small ghost" onClick={() => { setMoveSeen(true); try { sessionStorage.setItem('move-notice', '1'); } catch { /* sin almacenamiento: solo se oculta ahora */ } }}>Entendido</button>
        </div>
      )}
      {!online && <div className="offline" role="status">Sin conexión: la app sigue funcionando con los datos guardados en este dispositivo.</div>}
      {mode === 'dm' ? <DmApp /> : mode === 'player' ? (
        <Suspense fallback={<p className="muted" style={{ padding: 24 }}>Cargando…</p>}><PlayerApp /></Suspense>
      ) : <ModeSelect />}
      {mode && <RollPeek />}
    </>
  );
}
