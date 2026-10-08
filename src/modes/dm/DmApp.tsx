import { useStore } from '../../store/useStore';
import { useHotkeys, HOTKEYS } from '../../hooks/useHotkeys';
import Header from './Header';
import InitiativePanel from './InitiativePanel';
import BestiaryPanel from './BestiaryPanel';
import GroupPanel from './GroupPanel';
import ForgePanel from './ForgePanel';
import RulesPanel from '../../shared/RulesPanel';
import CenterPanel from './CenterPanel';
import DiceTable from '../../shared/DiceTable';
import RoomPanel from '../../shared/RoomPanel';
import Attribution from '../../shared/Attribution';
import { InfoDialog } from '../../shared/Card';
import { useEffect, useState } from 'react';
import Tour, { tourPending } from '../../shared/Tour';
import { dmTour } from '../../shared/tours';

/** Modo máster: todo lo de la mesa del DM (combate, bestiario, grupo, forja y reglas). */
export default function DmApp() {
  const tab = useStore((s) => s.tab);
  const helpOpen = useStore((s) => s.helpOpen);
  const initAsk = useStore((s) => s.initAsk);
  // visita guiada: sola la primera vez; luego, desde el «?» del encabezado
  const tour = useStore((s) => s.tourOpen);
  useEffect(() => { if (tourPending('master')) { const t = setTimeout(() => useStore.getState().set({ tourOpen: true }), 900); return () => clearTimeout(t); } }, []);
  useHotkeys();

  return (
    <div className="app">
      <Header />
      {/* el modo máster está pensado para tablet u ordenador; en el móvil se puede usar, con un aviso */}
      <PhoneNote />
      <main className="app-main">
        <section className="col-left" aria-label="Panel izquierdo">
          {tab === 'combat' && <InitiativePanel />}
          {tab === 'bestiary' && <BestiaryPanel />}
          {tab === 'group' && <GroupPanel />}
          {tab === 'forge' && <ForgePanel />}
          {tab === 'rules' && <RulesPanel />}
        </section>
        <section className="col-center" aria-label="Detalle">
          <div className="center-main"><CenterPanel /></div>
          {/* la atribución va al final del contenido central: baja con él y no resta alto a la pantalla */}
          <Attribution hotkeys />
        </section>
        {/* en Reglas no hace falta la mesa de dados: el texto aprovecha el espacio */}
        {tab !== 'rules' && (
          <section className="col-right" aria-label="Mesa de dados">
            <RoomPanel mode="dm" />
            <DiceTable />
          </section>
        )}
      </main>
      {tour && <Tour steps={dmTour((t) => useStore.getState().set({ tab: t }))} storeKey="master" onClose={() => useStore.getState().set({ tourOpen: false })} />}
      {initAsk && (
        <InfoDialog title="Iniciativa de monstruos" onClose={() => useStore.getState().set({ initAsk: null })}>
          <p style={{ marginTop: 0 }}>Hay monstruos iguales: {initAsk}. ¿Cómo tiras su iniciativa?</p>
          <div className="rollrow">
            <button className="btn gold" autoFocus onClick={() => useStore.getState().rollInit('group')}>En grupo (una tirada por grupo)</button>
            <button className="btn" onClick={() => useStore.getState().rollInit('single')}>Individual (una cada uno)</button>
          </div>
        </InfoDialog>
      )}
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

const NOTE = 'cronica-aviso-movil-master';
function PhoneNote() {
  const [hidden, setHidden] = useState(() => { try { return !!localStorage.getItem(NOTE); } catch { return false; } });
  if (hidden) return null;
  return (
    <div className="phone-note" role="note">
      <span>El modo máster está pensado para tablet u ordenador. En el móvil funciona, pero se ve mejor en una pantalla grande.</span>
      <button className="btn small" onClick={() => { try { localStorage.setItem(NOTE, '1'); } catch { /* nada */ } setHidden(true); }}>Entendido</button>
    </div>
  );
}
