import AccountMenu from '../../shared/AccountMenu';
import { useStore, type Tab } from '../../store/useStore';
import Brand from '../../shared/Brand';
import { ChevronLeft, ChevronRight, UndoIcon } from '../../shared/Icons';

const TABS: [Tab, string][] = [['combat', 'Combate'], ['bestiary', 'Bestiario'], ['group', 'Grupo'], ['forge', 'Forja'], ['rules', 'Reglas']];

export default function Header() {
  const tab = useStore((s) => s.tab);
  const started = useStore((s) => s.started);
  const round = useStore((s) => s.round);
  const activeName = useStore((s) => s.combatants.find((c) => c.id === s.activeId)?.name ?? '—');
  const toast = useStore((s) => s.toast);
  const undoTop = useStore((s) => s.undoStack[s.undoStack.length - 1]);
  const storageOk = useStore((s) => s.storageOk);
  const readFailed = useStore((s) => s.readFailed);
  const { set, step, startCombat, undo } = useStore.getState();
  return (
    <header className="app-header">
      <Brand subtitle="Mesa del máster · 5.ª edición (2024)" />
      <nav aria-label="Secciones" className="app-nav">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'tab on' : 'tab'} aria-current={tab === k ? 'page' : undefined} onClick={() => set({ tab: k })}>{label}</button>
        ))}
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
      <div className="hdr-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {readFailed ? (
          <span className="small" style={{ color: '#f0a090', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} role="alert">
            <span><span className="status-dot bad" /> No se pudieron leer los datos guardados. Si tenías grupo o combate, siguen ahí: recarga la página. Hasta entonces no se guarda nada, para no borrarlos.</span>
            <button className="btn small" onClick={() => window.location.reload()}>Recargar</button>
          </span>
        ) : !storageOk && <span className="small" style={{ color: '#f0a090', fontWeight: 700 }} role="alert"><span className="status-dot bad" /> No se puede guardar en este navegador: exporta una copia</span>}
        {undoTop && (
          <button className="btn ghost undo" onClick={undo} aria-label={'Deshacer: ' + undoTop.label} title={'Deshacer: ' + undoTop.label + ' (Ctrl+Z)'}>
            <UndoIcon /><span>Deshacer<span className="hide-narrow">: {undoTop.label}</span></span>
          </button>
        )}
        {started ? (
          <>
            <div className="hdr-turn" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span className="eyebrow">Ronda {round}</span>
              <span style={{ fontSize: 15, color: '#c6bba6' }}><span className="hide-narrow">Turno de </span><strong style={{ color: '#e8c062' }}>{activeName}</strong></span>
            </div>
            <button className="btn icon" onClick={() => step(-1)} aria-label="Volver al turno anterior" title="Volver al turno anterior (B)"><ChevronLeft /></button>
            <button className="btn primary" onClick={() => step(1)} title="Siguiente turno (N)"><span>Siguiente<span className="hide-narrow"> turno</span></span><ChevronRight /></button>
          </>
        ) : (
          <>
            <span className="muted small">Preparando el encuentro</span>
            <button className="btn primary" onClick={startCombat} title="Empezar combate (N)">Empezar combate</button>
          </>
        )}
        {/* la cuenta, en la esquina (como en el modo jugador) */}
        <span className="hdr-sep" aria-hidden="true" />
        <AccountMenu />
      </div>
    </header>
  );
}
