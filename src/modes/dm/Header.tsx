import AccountMenu from '../../shared/AccountMenu';
import HelpMenu from '../../shared/HelpMenu';
import { useStore, type Tab } from '../../store/useStore';
import Brand from '../../shared/Brand';
import DataMenu from './DataMenu';
import { UndoIcon } from '../../shared/Icons';

const TABS: [Tab, string][] = [['combat', 'Combate'], ['bestiary', 'Bestiario'], ['group', 'Grupo'], ['forge', 'Forja'], ['rules', 'Reglas']];

export default function Header() {
  const tab = useStore((s) => s.tab);
  const toast = useStore((s) => s.toast);
  const undoTop = useStore((s) => s.undoStack[s.undoStack.length - 1]);
  const storageOk = useStore((s) => s.storageOk);
  const readFailed = useStore((s) => s.readFailed);
  const { set, undo } = useStore.getState();
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
        {/* deshacer: lo único global (también deshace cambios del Bestiario, el Grupo o la Forja) */}
        {undoTop && (
          <button className="btn icon undo" onClick={undo} aria-label={'Deshacer: ' + undoTop.label} title={'Deshacer: ' + undoTop.label + ' (Ctrl+Z)'}>
            <UndoIcon />
          </button>
        )}
        {/* copia de seguridad, ayuda (visita guiada y atajos) y la cuenta, en la esquina (como en el modo jugador) */}
        <DataMenu />
        <HelpMenu onTour={() => set({ tourOpen: true })} onKeys={() => set({ helpOpen: true })} />
        <AccountMenu />
      </div>
    </header>
  );
}
