import { useEffect, useState } from 'react';
import AccountMenu from '../../shared/AccountMenu';
import HelpMenu from '../../shared/HelpMenu';
import Tour, { tourPending } from '../../shared/Tour';
import { playerTour } from '../../shared/tours';
import Attribution from '../../shared/Attribution';
import Brand from '../../shared/Brand';
import DiceTable from '../../shared/DiceTable';
import DiceDock from '../../shared/DiceDock';
import RoomPanel from '../../shared/RoomPanel';
import CharacterArea from './CharacterArea';
import LibraryPanel from './LibraryPanel';
import RulesPanel, { RuleQuick, RuleView } from '../../shared/RulesPanel';
import { useStore } from '../../store/useStore';
import { useMobileTabs, type MTab } from './mobileTabs';

type PlayerTab = 'sheet' | 'library' | 'rules';
const TABS: [PlayerTab, string][] = [['sheet', 'Mi personaje'], ['library', 'Biblioteca'], ['rules', 'Reglas']];

/**
 * Modo jugador: sus personajes (hoja con tiradas), los dados y las reglas.
 */
export default function PlayerApp() {
  const [tab, setTab] = useState<PlayerTab>('sheet');
  // visita guiada: sola la primera vez; luego, desde el «?» del encabezado
  const [tour, setTour] = useState(false);
  useEffect(() => { if (tourPending('jugador')) { const t = setTimeout(() => setTour(true), 900); return () => clearTimeout(t); } }, []);
  // móvil: la hoja se reparte en pestañas con una barra abajo (combate, tiradas, conjuros, rasgos y la sala)
  const mt = useMobileTabs();
  const mobileTabs = mt.phone && mt.sheet && tab === 'sheet';
  const MTABS: [MTab, string][] = [['combate', 'Combate'], ['tiradas', 'Tiradas'], ...(mt.spells ? [['conjuros', 'Conjuros'] as [MTab, string]] : []), ['rasgos', 'Rasgos'], ['sala', 'Sala']];
  useEffect(() => { if (mt.tab === 'conjuros' && !mt.spells) mt.setTab('combate'); }, [mt]);
  const hasRule = useStore((s) => !!s.rules && !!s.ruleId && s.rules.some((x) => x.id === s.ruleId));
  return (
    <div className="app">
      <header className="app-header">
        <Brand subtitle="Hoja del jugador · 5.ª edición (2024)" />
        <nav aria-label="Secciones" className="app-nav">
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? 'tab on' : 'tab'} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
        {/* la cuenta, en la esquina */}
        <div className="app-header-end" data-tour="header-end"><HelpMenu onTour={() => setTour(true)} /><AccountMenu /></div>
      </header>
      <main className={mobileTabs ? 'app-main mtabs' : 'app-main'} data-mtab={mobileTabs ? mt.tab : undefined}>
        {tab === 'sheet' || tab === 'library' ? (
          <>
            <section className="col-center" aria-label={tab === 'sheet' ? 'Mi personaje' : 'Biblioteca'}>
              <div className="center-main">
                {tab === 'sheet' ? <CharacterArea /> : <LibraryPanel />}
              </div>
              <div data-sec="rasgos"><Attribution /></div>
            </section>
            <section className="col-right" aria-label="Mesa de dados" data-tour="table">
              <div data-sec="sala"><RoomPanel mode="player" /></div>
              <DiceDock><DiceTable targets={false} /></DiceDock>
            </section>
          </>
        ) : (
          <>
            <section className="col-left" aria-label="Buscador de reglas"><RulesPanel /></section>
            <section className="col-center" aria-label="Regla">
              <div className="center-main">
                {hasRule ? (
                  <div className="center-grid"><div className="sheet-col"><span className="eyebrow">Reglas · SRD 5.2.1</span><RuleView /></div></div>
                ) : (
                  <div className="panel" style={{ alignItems: 'center', textAlign: 'center', padding: '40px 24px' }}>
                    <h2>Busca una regla</h2>
                    <p className="muted" style={{ margin: 0 }}>Escribe un término en español o en inglés o elige una de las más consultadas.</p>
                    <RuleQuick />
                  </div>
                )}
              </div>
              <Attribution />
            </section>
          </>
        )}
      </main>
      {mobileTabs && (
        <nav className="pc-tabbar" aria-label="Partes de la hoja">
          {MTABS.map(([k, label]) => <button key={k} className={mt.tab === k ? 'on' : ''} aria-current={mt.tab === k ? 'page' : undefined} onClick={() => mt.setTab(k)}>{label}</button>)}
        </nav>
      )}
      {tour && <Tour steps={playerTour(() => setTab('sheet'), () => setTab('library'))} storeKey="jugador" onClose={() => setTour(false)} />}
    </div>
  );
}
