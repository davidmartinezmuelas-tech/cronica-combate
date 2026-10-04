import { useEffect, useState } from 'react';
import { useStore, startAutosave } from './store/useStore';
import { useHotkeys, HOTKEYS } from './hooks/useHotkeys';
import Header from './components/Header';
import InitiativePanel from './components/InitiativePanel';
import BestiaryPanel from './components/BestiaryPanel';
import GroupPanel from './components/GroupPanel';
import ForgePanel from './components/ForgePanel';
import CenterPanel from './components/CenterPanel';
import DiceTable from './components/DiceTable';

export default function App() {
  const tab = useStore((s) => s.tab);
  const helpOpen = useStore((s) => s.helpOpen);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useHotkeys();
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
    <div className="app">
      {!online && <div className="offline" role="status">Sin conexión: la app sigue funcionando con los datos guardados en este dispositivo.</div>}
      <Header />
      <main className="app-main">
        <section className="col-left" aria-label="Panel izquierdo">
          {tab === 'combat' && <InitiativePanel />}
          {tab === 'bestiary' && <BestiaryPanel />}
          {tab === 'group' && <GroupPanel />}
          {tab === 'forge' && <ForgePanel />}
        </section>
        <section className="col-center" aria-label="Detalle">
          <CenterPanel />
        </section>
        <section className="col-right" aria-label="Mesa de dados">
          <DiceTable />
        </section>
      </main>
      <footer className="app-footer">
        <span lang="en">This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noopener noreferrer">https://www.dndbeyond.com/srd</a>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener noreferrer">https://creativecommons.org/licenses/by/4.0/legalcode</a>.</span>
        <span>Traducción al español basada en <a href="https://github.com/foundryvtt-sinregistrar/translate-dnd5e-sdr2-es" target="_blank" rel="noopener noreferrer">translate-dnd5e-sdr2-es</a> de foundryvtt-sinregistrar (CC-BY-4.0), adaptada, corregida y completada para esta app. Aplicación no oficial, sin afiliación ni respaldo de Wizards of the Coast.</span>
        <span>Pulsa <span className="kbd">?</span> para ver los atajos de teclado.</span>
      </footer>
      {helpOpen && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={() => useStore.getState().set({ helpOpen: false })}>
          {/* único control enfocable: Tab no debe sacar el foco del diálogo */}
          <div className="panel dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Tab') e.preventDefault(); }}>
            <div className="panel-head"><h2 id="help-title">Atajos de teclado</h2><button className="btn small ghost" onClick={() => useStore.getState().set({ helpOpen: false })} autoFocus>Cerrar</button></div>
            <ul className="rem">
              {HOTKEYS.map(([k, d]) => (<li key={k}><span className="kbd">{k}</span><span style={{ flex: 1 }}>{d}</span></li>))}
            </ul>
            <p className="muted small" style={{ margin: 0 }}>Los atajos no funcionan mientras escribes en un campo.</p>
          </div>
        </div>
      )}
    </div>
  );
}
