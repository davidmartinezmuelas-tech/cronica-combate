import { useStore, type Tab } from '../store/useStore';
import { ChevronLeft, ChevronRight, Logo, UndoIcon } from './Icons';

const TABS: [Tab, string][] = [['combat', 'Combate'], ['bestiary', 'Bestiario'], ['group', 'Grupo'], ['forge', 'Forja']];

export default function Header() {
  const tab = useStore((s) => s.tab);
  const started = useStore((s) => s.started);
  const round = useStore((s) => s.round);
  const activeName = useStore((s) => s.combatants.find((c) => c.id === s.activeId)?.name ?? '—');
  const toast = useStore((s) => s.toast);
  const undoTop = useStore((s) => s.undoStack[s.undoStack.length - 1]);
  const storageOk = useStore((s) => s.storageOk);
  const { set, step, startCombat, undo } = useStore.getState();
  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logo />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h1 className="display" style={{ fontSize: 28, lineHeight: 1, color: '#f3e6c8', margin: 0 }}>Crónica de Combate</h1>
          <div style={{ fontSize: 12, color: '#b9a88a', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>Mesa del máster · 5.ª edición (2024)</div>
        </div>
      </div>
      <nav aria-label="Secciones" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'tab on' : 'tab'} aria-current={tab === k ? 'page' : undefined} onClick={() => set({ tab: k })}>{label}</button>
        ))}
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {!storageOk && <span className="small" style={{ color: '#f0a090', fontWeight: 700 }} role="alert"><span className="status-dot bad" /> No se puede guardar en este navegador: exporta una copia</span>}
        {undoTop && (
          <button className="btn small ghost undo" onClick={undo} title={'Deshacer: ' + undoTop.label + ' (Ctrl+Z)'}>
            <UndoIcon />Deshacer: {undoTop.label}
          </button>
        )}
        {started ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span className="eyebrow">Ronda {round}</span>
              <span style={{ fontSize: 15, color: '#cdbd9f' }}>Turno de <strong style={{ color: '#e8c062' }}>{activeName}</strong></span>
            </div>
            <button className="btn icon" onClick={() => step(-1)} aria-label="Volver al turno anterior" title="Volver al turno anterior (B)"><ChevronLeft /></button>
            <button className="btn primary" onClick={() => step(1)} title="Siguiente turno (N)">Siguiente turno<ChevronRight /></button>
          </>
        ) : (
          <>
            <span className="muted small">Preparando el encuentro</span>
            <button className="btn primary" onClick={startCombat} title="Empezar combate (N)">Empezar combate</button>
          </>
        )}
      </div>
    </header>
  );
}
