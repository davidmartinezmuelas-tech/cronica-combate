import type { Character, Derived } from '../../engine/character';
import { usePlayer } from '../../store/player';
import Pips from '../../shared/Pips';
import { useStore } from '../../store/useStore';

const LUCK = 'Puntos de suerte';
const POOL = 'Reserva de recuperación';
const LAST = 'Última defensa';

/** Dotes con recursos o efectos que se usan en la mesa (no se suman solos a un número de la hoja). */
export default function FeatPanel({ c, d, set }: { c: Character; d: Derived; set: (patch: Partial<Character>) => void }) {
  const { roll } = useStore.getState();
  const fx = d.fx;
  const who = c.name || 'Personaje';
  if (!fx.luck && !fx.recovery && !fx.hdHeal && !fx.parryProf && !fx.armorReduce && !fx.critScore) return null;
  // curación que se aplica sola a la hoja al acabar la tirada
  const healAfter = (total: number) => {
    const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
    usePlayer.getState().update(c.id, { hp: Math.min(d.hpMax, cur.hp + Math.max(0, total)), death: { s: 0, f: 0 } });
    return { resultNote: 'Recupera ' + Math.max(0, total) + ' PG.' };
  };
  const pips = (key: string, max: number) => (
    <span onClick={(e) => e.preventDefault()}><Pips max={max} used={Math.min(max, c.uses[key] || 0)} label={key} onSet={(v) => set({ uses: { ...c.uses, [key]: Math.max(0, Math.min(max, v)) } })} /></span>
  );
  const used = (key: string) => c.uses[key] || 0;
  const poolLeft = 10 - Math.min(10, used(POOL));

  return (
    <section className="panel" aria-label="Dotes">
      <h3 className="eyebrow">Dotes</h3>
      <ul className="pc-features">
        {fx.luck && (
          <li><details><summary>
            <b>Afortunado</b><span className="muted small">puntos de suerte · vuelven en descanso largo</span>{pips(LUCK, d.pb)}
          </summary><p className="pc-text">Gasta un punto para darte ventaja en una prueba con d20 o imponer desventaja a un ataque contra ti.</p></details></li>
        )}
        {fx.recovery && (
          <li><details><summary>
            <b>Don de la recuperación</b><span className="muted small">{poolLeft} de 10 d10</span>{pips(POOL, 10)}
            <span className="rollrow" onClick={(e) => e.preventDefault()}>
              {[1, 2, 3, 5, 10].filter((n) => n <= poolLeft).map((n) => (
                <button key={n} className="rollbtn" onClick={() => { set({ uses: { ...c.uses, [POOL]: used(POOL) + n } }); roll({ label: who + ' · recuperar vitalidad', kind: 'free', parts: [{ expr: n + 'd10' }], after: healAfter }); }}>Curarte {n}d10</button>
              ))}
            </span>
          </summary>
            <div className="rollrow" style={{ marginTop: 6 }}>
              <span className="muted small">Última defensa (una vez por descanso largo): al caer a 0 PG te quedas con 1 y recuperas la mitad de tus PG máximos.</span>
              {pips(LAST, 1)}
              <button className="btn small" disabled={used(LAST) >= 1} onClick={() => set({ hp: Math.min(d.hpMax, 1 + Math.floor(d.hpMax / 2)), death: { s: 0, f: 0 }, uses: { ...c.uses, [LAST]: 1 } })}>Usar: quedar a {Math.min(d.hpMax, 1 + Math.floor(d.hpMax / 2))} PG</button>
            </div>
          </details></li>
        )}
        {fx.hdHeal && (
          <li><details><summary>
            <b>Resistente</b><span className="muted small">dados de golpe: {c.level - c.hdSpent}/{c.level}</span>
            <span className="rollrow" onClick={(e) => e.preventDefault()}>
              <button className="rollbtn" disabled={c.hdSpent >= c.level} onClick={() => { set({ hdSpent: c.hdSpent + 1 }); roll({ label: who + ' · recuperación rápida', kind: 'free', parts: [{ expr: '1d' + d.hdDie }], after: healAfter }); }}>Recuperación rápida 1d{d.hdDie}</button>
            </span>
          </summary><p className="pc-text">Acción adicional: gasta un dado de golpe y recupera el resultado. Además, ventaja en las salvaciones contra la muerte.</p></details></li>
        )}
        {fx.parryProf && <li><details><summary><b>Duelista defensivo</b><span className="chip-tag">+{d.pb} CA</span><span className="muted small">reacción, con un arma sutil, contra un ataque cuerpo a cuerpo</span></summary><p className="pc-text">Te dura hasta el principio de tu siguiente turno contra los ataques cuerpo a cuerpo.</p></details></li>}
        {fx.armorReduce && <li><details><summary><b>Maestro en armaduras pesadas</b><span className="chip-tag">−{d.pb} daño</span><span className="muted small">contundente, cortante y perforante, con armadura pesada</span></summary><p className="pc-text">Resta {d.pb} a ese daño cada vez que te acierte un ataque.</p></details></li>}
        {fx.critScore && <li><details><summary><b>Don del ataque imparable</b><span className="muted small">con un 20 natural: + la puntuación aumentada con la dote al daño</span></summary><p className="pc-text">Tu daño contundente, cortante y perforante ignora la resistencia.</p></details></li>}
      </ul>
    </section>
  );
}
