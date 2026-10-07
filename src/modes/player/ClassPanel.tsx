import { useState, type JSX } from 'react';
import type { PlayerData } from '../../data/player';
import { usesMax, type Character, type Derived } from '../../engine/character';
import { sgn } from '../../engine/dice';
import Pips from '../../shared/Pips';
import { usePlayer } from '../../store/player';
import { useStore } from '../../store/useStore';

const LAY = 'Imposición de manos';
const WIND = 'Segundo aliento';
const FOCUS = 'Concentración del monje';

/** Rasgos de clase que se usan en la mesa con su tirada: Segundo aliento, Imposición de manos, Concentración del monje. */
export default function ClassPanel({ c, d, data, set }: { c: Character; d: Derived; data: PlayerData | null; set: (patch: Partial<Character>) => void }) {
  const { roll } = useStore.getState();
  const [amount, setAmount] = useState('');
  const cls = data?.classes.find((x) => x.id === c.classId);
  const who = c.name || 'Personaje';
  const feat = (n: string) => cls?.f.find((f) => f.n === n && f.lv <= c.level);
  const maxOf = (n: string) => usesMax(feat(n)?.u, c, cls) || 0;
  const used = (k: string) => c.uses[k] || 0;
  const spend = (k: string, n = 1) => set({ uses: { ...c.uses, [k]: used(k) + n } });
  const pips = (k: string, max: number) => <span onClick={(e) => e.preventDefault()}><Pips max={max} used={Math.min(max, used(k))} label={k} onSet={(v) => set({ uses: { ...c.uses, [k]: Math.max(0, Math.min(max, v)) } })} /></span>;
  // curación que se suma sola a tu hoja al acabar la tirada
  const healAfter = (total: number) => {
    const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
    usePlayer.getState().update(c.id, { hp: Math.min(d.hpMax, cur.hp + Math.max(0, total)), death: { s: 0, f: 0 } });
    return { resultNote: 'Recuperas ' + Math.max(0, total) + ' PG.' };
  };

  const rows: JSX.Element[] = [];
  if (c.classId === 'fighter' && feat(WIND)) {
    const max = maxOf(WIND);
    rows.push(
      <li key="wind"><details><summary>
        <b>{WIND}</b><span className="muted small">uno vuelve en descanso corto, todos en largo</span>{pips(WIND, max)}
        <span className="rollrow" onClick={(e) => e.preventDefault()}>
          <button className="rollbtn" disabled={used(WIND) >= max} onClick={() => { spend(WIND); roll({ label: who + ' · segundo aliento', kind: 'free', parts: [{ expr: '1d10' + sgn(c.level) }], after: healAfter }); }}>Curarte 1d10{sgn(c.level)}</button>
        </span>
      </summary><p className="pc-text">Acción adicional: recuperas 1d10 + tu nivel de guerrero.</p></details></li>,
    );
  }
  if (c.classId === 'paladin' && feat(LAY)) {
    const pool = 5 * c.level;
    const left = Math.max(0, pool - used(LAY));
    const n = Math.max(0, Math.min(left, parseInt(amount, 10) || 0));
    const self = Math.min(n, d.hpMax - c.hp);
    rows.push(
      <li key="lay"><details open><summary>
        <b>{LAY}</b><span className="chip-tag">{left} de {pool} PG</span><span className="muted small">vuelve en descanso largo</span>
      </summary>
        <div className="rollrow">
          <input className="input" style={{ width: 90 }} type="number" min={0} max={left} inputMode="numeric" aria-label="PG de Imposición de manos" placeholder="PG" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn small" disabled={!self} onClick={() => { set({ hp: c.hp + self, death: { s: 0, f: 0 }, uses: { ...c.uses, [LAY]: used(LAY) + self } }); setAmount(''); }}>Curarme {self || ''}</button>
          <button className="btn small" disabled={!n} onClick={() => { spend(LAY, n); setAmount(''); }}>Curar a otro {n || ''}</button>
          <button className="btn small" disabled={left < 5} onClick={() => spend(LAY, 5)}>Quitar Envenenado (5)</button>
        </div>
      </details></li>,
    );
  }
  if (c.classId === 'monk' && feat(FOCUS)) {
    const max = maxOf(FOCUS);
    const left = max - Math.min(max, used(FOCUS));
    const flurry = c.level >= 10 ? 3 : 2;
    rows.push(
      <li key="focus"><details><summary>
        <b>Puntos de concentración</b><span className="muted small">{left} de {max} · vuelven en descanso corto o largo</span>{pips(FOCUS, max)}
        <span className="rollrow" onClick={(e) => e.preventDefault()}>
          <button className="rollbtn dmg" disabled={left < 1 || !d.unarmed} onClick={() => { spend(FOCUS); roll({ label: who + ' · ráfaga de golpes (' + flurry + ' golpes)', kind: 'damage', who, by: null, parts: Array.from({ length: flurry }, () => d.unarmed!.parts).flat() }); }}>Ráfaga de golpes: {flurry} golpes</button>
          <button className="btn small" disabled={left < 1} onClick={() => spend(FOCUS)}>Defensa paciente</button>
          <button className="btn small" disabled={left < 1} onClick={() => spend(FOCUS)}>Paso del viento</button>
          {c.level >= 3 && <button className="rollbtn" onClick={() => roll({ label: who + ' · desviar ataques', kind: 'free', parts: [{ expr: '1d10' + sgn(d.mods.dex + c.level) }] })}>Desviar ataques 1d10{sgn(d.mods.dex + c.level)}</button>}
        </span>
      </summary><p className="pc-text">La ráfaga tira el daño de todos sus golpes sin armas de una vez (cada uno necesita su ataque). Desviar ataques reduce el daño recibido en el resultado.</p></details></li>,
    );
  }
  if (!rows.length) return null;
  return (
    <section className="panel" aria-label="Rasgos de clase">
      <h3 className="eyebrow">Rasgos de clase</h3>
      <ul className="pc-features grid acts">{rows}</ul>
    </section>
  );
}
