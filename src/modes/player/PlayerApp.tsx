import { useState } from 'react';
import Attribution from '../../shared/Attribution';
import Brand from '../../shared/Brand';
import DiceTable from '../../shared/DiceTable';
import CharacterArea from './CharacterArea';
import RulesPanel, { RuleQuick, RuleView } from '../../shared/RulesPanel';
import { useStore } from '../../store/useStore';

type PlayerTab = 'sheet' | 'rules';
const TABS: [PlayerTab, string][] = [['sheet', 'Mi personaje'], ['rules', 'Reglas']];

/**
 * Modo jugador: sus personajes (hoja con tiradas), los dados y las reglas.
 */
export default function PlayerApp() {
  const [tab, setTab] = useState<PlayerTab>('sheet');
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
      </header>
      <main className="app-main">
        {tab === 'sheet' ? (
          <>
            <section className="col-center" aria-label="Mi personaje">
              <div className="center-main">
                <CharacterArea />
              </div>
              <Attribution />
            </section>
            <section className="col-right" aria-label="Mesa de dados">
              <DiceTable targets={false} />
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
    </div>
  );
}
