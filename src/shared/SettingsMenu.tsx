import { useEffect, useState, type ReactNode } from 'react';
import { chooseMode, HOME_HASH } from '../app/mode';
import { useAccount } from '../store/account';
import { useStore } from '../store/useStore';
import AccountBox from './AccountBox';
import { InfoDialog } from './Card';
import { hasWebGL } from './Dice3D';
import Legal, { feedbackHref } from './Legal';
import { setThemePref, themePref, type ThemePref } from './theme';
import { canInstall, installApp, motionPref, onInstallChange, reducedMotion, setMotionPref, setWizardPref, wizardPref } from './prefs';

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

/** Rueda de ajustes del encabezado (con el estado de la sincronización) y su ventana: cuenta, copia, modo, preferencias, ayuda… */
export default function SettingsMenu({ mode, backup, onTour, onKeys }: { mode: 'dm' | 'player'; backup: ReactNode; onTour: () => void; onKeys?: () => void }) {
  const [open, setOpen] = useState(false);
  const [legal, setLegal] = useState(false);
  const { status, user, sync } = useAccount();
  const signed = status === 'in' && !!user && !user.anon;
  const dot = !signed ? '' : sync === 'error' ? 'bad' : sync === 'syncing' ? 'busy' : 'ok';
  const dice3d = useStore((s) => s.dice3d);
  const can3d = hasWebGL();
  const [motion, setMotion] = useState(motionPref);
  const [theme, setTheme] = useState<ThemePref>(themePref);
  const [wizard, setWizard] = useState(wizardPref);
  const [install, setInstall] = useState(canInstall);
  useEffect(() => onInstallChange(() => setInstall(canInstall())), []);
  const use3d = can3d && (dice3d ?? !reducedMotion());
  const close = () => setOpen(false);
  return (
    <>
      <button className="btn small settings-btn" aria-haspopup="dialog" aria-label="Ajustes" title={signed ? 'Ajustes · cuenta: ' + (user!.email || user!.name || '') : 'Ajustes'} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.4 4.6.1-1.1-.1-1.1 2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.9-1.1L15.7 3h-3.9l-.4 2.7a7.6 7.6 0 0 0-1.9 1.1l-2.4-1-2 3.4 2 1.6-.1 1.1.1 1.1-2 1.6 2 3.4 2.4-1c.6.5 1.2.8 1.9 1.1l.4 2.7h3.9l.4-2.7a7.6 7.6 0 0 0 1.9-1.1l2.4 1 2-3.4Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
        <span className="settings-txt">Ajustes</span>
        {dot && <span className={'acct-dot ' + dot} aria-hidden="true" />}
      </button>
      {open && (
        <InfoDialog title="Ajustes" onClose={close}>
          <div className="settings">
            <section aria-label="Cuenta"><h3>Cuenta</h3><AccountBox /></section>
            <section aria-label="Copia de seguridad"><h3>Copia de seguridad</h3>{backup}</section>
            <section aria-label="Modo">
              <h3>Modo</h3>
              <div className="rollrow">
                <button className={mode === 'dm' ? 'btn small primary' : 'btn small'} aria-pressed={mode === 'dm'} onClick={() => { close(); chooseMode('dm'); }}>Mesa del máster</button>
                <button className={mode === 'player' ? 'btn small primary' : 'btn small'} aria-pressed={mode === 'player'} onClick={() => { close(); chooseMode('player'); }}>Hoja del jugador</button>
                <a className="btn small ghost" href={HOME_HASH} onClick={close}>Pantalla de inicio</a>
              </div>
            </section>
            <section aria-label="Preferencias">
              <h3>Preferencias</h3>
              <label className="check"><input type="checkbox" checked={use3d} disabled={!can3d} onChange={(e) => useStore.getState().set({ dice3d: e.target.checked })} />Dados 3D{!can3d && ' (este navegador no tiene gráficos 3D)'}</label>
              <div className="field" role="radiogroup" aria-label="Tema de color">
                <span className="small muted">Tema de color</span>
                <div className="rollrow">
                  {([['dark', 'Oscuro'], ['light', 'Claro'], ['auto', 'Automático']] as [ThemePref, string][]).map(([k, label]) => (
                    <button key={k} role="radio" aria-checked={theme === k} className={theme === k ? 'btn small primary' : 'btn small'} onClick={() => { setThemePref(k); setTheme(k); }}>{label}</button>
                  ))}
                </div>
              </div>
              <label className="check"><input type="checkbox" checked={motion} onChange={(e) => { setMotionPref(e.target.checked); setMotion(e.target.checked); }} />Animaciones reducidas (para móviles lentos o si te marean)</label>
              {mode === 'player' && <label className="check"><input type="checkbox" checked={wizard} onChange={(e) => { setWizardPref(e.target.checked); setWizard(e.target.checked); }} />Crear personajes paso a paso (si no, todo en una página)</label>}
            </section>
            <section aria-label="Ayuda">
              <h3>Ayuda</h3>
              <div className="rollrow">
                <button className="btn small" onClick={() => { close(); onTour(); }}>Repetir la visita guiada</button>
                {onKeys && <button className="btn small" onClick={() => { close(); onKeys(); }}>Atajos de teclado</button>}
                <a className="btn small" href={feedbackHref()} onClick={(e) => { e.currentTarget.href = feedbackHref(); }}>Enviar sugerencia o fallo</a>
              </div>
            </section>
            {install && (
              <section aria-label="Instalar la app">
                <h3>Instalar la app</h3>
                <p className="muted small" style={{ margin: 0 }}>Tenla como una app más en tu móvil u ordenador, también sin conexión.</p>
                <button className="btn small primary" style={{ alignSelf: 'flex-start' }} onClick={() => void installApp()}>Instalar</button>
              </section>
            )}
            <section aria-label="Acerca de">
              <h3>Acerca de</h3>
              <p className="muted small" style={{ margin: 0 }}>Crónica de Combate {__APP_VERSION__} · {__BUILD_DATE__}. Reglas del SRD 5.2.1 (CC-BY-4.0); créditos y licencias al pie de la página.</p>
              <button className="linkbtn small" style={{ alignSelf: 'flex-start' }} onClick={() => setLegal(true)}>Privacidad y aviso legal</button>
            </section>
          </div>
          {legal && <Legal onClose={() => setLegal(false)} />}
        </InfoDialog>
      )}
    </>
  );
}

/** Botón de apoyo (Ko-fi) junto a Ajustes: donación voluntaria que no desbloquea nada. */
export function SupportButton() {
  return (
    <a className="btn small support-btn" href="https://ko-fi.com/zmuelas" target="_blank" rel="noopener noreferrer" title="¿Quieres echar una mano? Tira iniciativa en Ko-fi" aria-label="Apoyar el proyecto en Ko-fi">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm12 1h1.5a2.5 2.5 0 0 1 0 5H16M8 4c0 1 1 1 1 2M12 4c0 1 1 1 1 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span className="settings-txt">Apoyar</span>
    </a>
  );
}
