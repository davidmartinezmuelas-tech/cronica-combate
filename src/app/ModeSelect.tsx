import AccountBox from '../shared/AccountBox';
import Attribution from '../shared/Attribution';
import { Logo } from '../shared/Icons';
import { chooseMode } from './mode';

/** Primera pantalla: elegir si se dirige la partida o se juega con un personaje. */
export default function ModeSelect() {
  return (
    <div className="mode-select">
      <main className="mode-main">
        <div className="mode-brand">
          <Logo />
          <h1 className="display">Crónica de Combate</h1>
          <p className="muted">D&amp;D 5.ª edición (2024) · ¿cómo vas a jugar hoy?</p>
        </div>
        <div className="mode-cards">
          <button className="mode-card" onClick={() => chooseMode('dm')}>
            <span className="mode-card-title">Soy el máster</span>
            <span className="muted">Iniciativa y combate, bestiario del SRD, tu grupo, la forja de monstruos y las reglas.</span>
          </button>
          <button className="mode-card" onClick={() => chooseMode('player')}>
            <span className="mode-card-title">Soy jugador</span>
            <span className="muted">Tu hoja de personaje con tiradas de ataques, salvaciones y habilidades, los dados y las reglas.</span>
          </button>
        </div>
        <section className="panel mode-account" aria-label="Cuenta">
          <h2>Cuenta</h2>
          <AccountBox start />
        </section>
        <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>Puedes cambiar de modo cuando quieras pulsando el título de la app. La cuenta es opcional: sin ella todo se guarda en este dispositivo.</p>
      </main>
      <Attribution />
    </div>
  );
}
