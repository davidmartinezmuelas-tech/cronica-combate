import AccountBox from '../shared/AccountBox';
import Attribution from '../shared/Attribution';
import { Logo } from '../shared/Icons';
import { chooseMode } from './mode';

const FEATURES: { t: string; s?: string; l: string[] }[] = [
  { t: 'Para el máster', s: 'En ordenador o tablet', l: [
    'Iniciativa que se ordena sola, rondas y turnos, y deshacer cualquier cambio',
    'Daño con resistencias, curación, estados, concentración y salvaciones contra la muerte',
    'Fichas de monstruo en las que se tira todo con un toque: ataques, alientos, recargas y legendarias',
    'Bestiario del SRD 2024 con 341 criaturas, en español o en inglés',
    'Forja para crear tus monstruos y generador de encuentros por dificultad',
    'Tu grupo guardado, con su hoja en PDF, y 583 reglas a mano',
  ] },
  { t: 'Para el jugador', s: 'En el móvil, la tablet o el ordenador', l: [
    'Crea tu personaje paso a paso con las reglas de 2024, con su equipo inicial',
    'Todo se calcula solo: CA, salvaciones, habilidades, ataques y CD de conjuros',
    'Conjuros con sus espacios y concentración; los que te protegen se aplican a tu hoja',
    'Subida de nivel guiada, descansos y salvaciones contra la muerte',
    'Importa tu hoja en PDF rellenable',
    'Crea tus propias subclases y conjuros, y funcionan como los oficiales',
  ] },
  { t: 'Juntos en una sala', s: 'Con un código de 6 letras, sin registrarse', l: [
    'El máster ve en directo las tiradas y la vida de cada jugador',
    'El daño que pone el máster llega solo a la hoja del jugador',
    'El máster pide salvaciones y los conjuros sobre aliados llegan a sus hojas',
    'Si quieres, avisos de turno en el móvil: «es tu turno» y «terminar mi turno»',
  ] },
  { t: 'Para todos', l: [
    'Dados 3D con física, ventaja y desventaja, y tiradas libres',
    'Funciona sin conexión y se instala como una app',
    'Cuenta opcional para tener tus datos en todos tus dispositivos',
    '«Probar con un ejemplo» para verlo funcionar en un minuto',
  ] },
];

/** Primera pantalla: elegir si se dirige la partida o se juega con un personaje. */
export default function ModeSelect() {
  return (
    <div className="mode-select">
      <main className="mode-main">
        <div className="mode-brand">
          <Logo />
          <h1 className="display">Crónica de Combate</h1>
          <p className="muted">Compatible con la 5.ª edición (reglas de 2024) · ¿cómo vas a jugar hoy?</p>
        </div>
        <div className="mode-cards">
          <button className="mode-card" onClick={() => chooseMode('dm')}>
            <span className="mode-card-title">Soy el máster</span>
            <span className="muted">Iniciativa y combate, bestiario del SRD, tu grupo, la forja de monstruos y las reglas.</span>
            <span className="mode-card-dev">En ordenador o tablet (no en el móvil)</span>
          </button>
          <button className="mode-card" onClick={() => chooseMode('player')}>
            <span className="mode-card-title">Soy jugador</span>
            <span className="muted">Tu hoja de personaje con tiradas de ataques, salvaciones y habilidades, los dados y las reglas.</span>
            <span className="mode-card-dev">En el móvil, la tablet o el ordenador</span>
          </button>
        </div>
        {/* qué se puede hacer, para quien llega nuevo: plegado para no tapar la elección */}
        <details className="mode-feats">
          <summary><span className="mode-feats-t">Qué puedes hacer con Crónica de Combate</span><span className="muted small">Gratis, en español y sin anuncios</span></summary>
          <div className="mode-feats-grid">
            {FEATURES.map((g) => (
              <section key={g.t} className="mode-feat" aria-label={g.t}>
                <h3>{g.t}</h3>
                {g.s && <p className="mode-feat-s">{g.s}</p>}
                <ul>{g.l.map((x) => <li key={x}>{x}</li>)}</ul>
              </section>
            ))}
          </div>
        </details>
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
