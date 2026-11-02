import { useState, type JSX } from 'react';
import type { PlayerData } from '../../data/player';
import { usesMax, type Character, type Derived } from '../../engine/character';
import { sgn } from '../../engine/dice';
import Card from '../../shared/Card';
import Pips from '../../shared/Pips';
import { usePlayer } from '../../store/player';
import { useStore } from '../../store/useStore';

export const LAY = 'Imposición de manos';
const WIND = 'Segundo aliento';
const FOCUS = 'Concentración del monje';

/** Usos que este panel ya cuenta con sus círculos (para no repetirlos en «Rasgos y dotes»). */
export function classPanelKeys(c: Character, data: PlayerData | null): string[] {
  const cls = data?.classes.find((x) => x.id === c.classId);
  const has = (n: string) => !!cls?.f.some((f) => f.n === n && f.lv <= c.level);
  return [...(c.classId === 'fighter' && has(WIND) ? [WIND] : []), ...(c.classId === 'monk' && has(FOCUS) ? [FOCUS] : [])];
}

/** Imposición de manos: la reserva de PG, curarte, curar a otro y quitar Envenenado. Va en la tarjeta del rasgo (acción adicional). */
export function LayOnHands({ c, d, set, text, level = c.level }: { c: Character; d: Derived; set: (patch: Partial<Character>) => void; text?: string; level?: number }) {
  const [amount, setAmount] = useState('');
  const used = c.uses[LAY] || 0;
  const spend = (n: number) => set({ uses: { ...c.uses, [LAY]: used + n } });
  const pool = 5 * Math.max(level, 0);
  const left = Math.max(0, pool - used);
  const n = Math.max(0, Math.min(left, parseInt(amount, 10) || 0));
  const self = Math.max(0, Math.min(n, d.hpMax - c.hp));
  return (
    <Card name={LAY} head={<>
      <span className="chip-tag">{left} de {pool} PG</span><span className="muted small">vuelve en descanso largo</span>
      <div className="rollrow">
        <input className="input" style={{ width: 90 }} type="number" min={0} max={left} inputMode="numeric" aria-label="PG de Imposición de manos" placeholder="PG" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn small" disabled={!self} onClick={() => { set({ hp: c.hp + self, death: { s: 0, f: 0 }, uses: { ...c.uses, [LAY]: used + self } }); setAmount(''); }}>Curarme {self || ''}</button>
        <button className="btn small" disabled={!n} onClick={() => { spend(n); setAmount(''); }}>Curar a otro {n || ''}</button>
        <button className="btn small" disabled={left < 5} onClick={() => spend(5)}>Quitar Envenenado (5)</button>
      </div>
    </>}>{text && <p className="pc-text">{text}</p>}</Card>
  );
}

/** Rasgos de clase que se usan en la mesa con su tirada: Segundo aliento, Imposición de manos, Concentración del monje. */
export default function ClassPanel({ c, d, data, set, lay = true }: { c: Character; d: Derived; data: PlayerData | null; set: (patch: Partial<Character>) => void; lay?: boolean }) {
  const { roll } = useStore.getState();
  const cls = data?.classes.find((x) => x.id === c.classId);
  const who = c.name || 'Personaje';
  const feat = (n: string) => cls?.f.find((f) => f.n === n && f.lv <= c.level);
  const maxOf = (n: string) => usesMax(feat(n)?.u, c, cls) || 0;
  const used = (k: string) => c.uses[k] || 0;
  const spend = (k: string, n = 1) => set({ uses: { ...c.uses, [k]: used(k) + n } });
  const pips = (k: string, max: number) => <Pips max={max} used={Math.min(max, used(k))} label={k} onSet={(v) => set({ uses: { ...c.uses, [k]: Math.max(0, Math.min(max, v)) } })} />;
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
      <li key="wind"><Card name={WIND} head={<>
        <span className="muted small">uno vuelve en descanso corto, todos en largo</span>{pips(WIND, max)}
        <span className="rollrow">
          <button className="rollbtn" disabled={used(WIND) >= max} onClick={() => { spend(WIND); roll({ label: who + ' · segundo aliento', kind: 'free', parts: [{ expr: '1d10' + sgn(c.level) }], after: healAfter }); }}>Curarte 1d10{sgn(c.level)}</button>
        </span>
      </>}><p className="pc-text">Acción adicional: recuperas 1d10 + tu nivel de guerrero.</p></Card></li>,
    );
  }
  if (lay && c.classId === 'paladin' && feat(LAY)) rows.push(<li key="lay"><LayOnHands c={c} d={d} set={set} text={feat(LAY)?.d} /></li>);
  if (c.classId === 'monk' && feat(FOCUS)) {
    const max = maxOf(FOCUS);
    const left = max - Math.min(max, used(FOCUS));
    const flurry = c.level >= 10 ? 3 : 2;
    rows.push(
      <li key="focus"><Card name="Puntos de concentración" head={<>
        <span className="muted small">{left} de {max} · vuelven en descanso corto o largo</span>{pips(FOCUS, max)}
        <span className="rollrow">
          <button className="rollbtn dmg" disabled={left < 1 || !d.unarmed} onClick={() => { spend(FOCUS); roll({ label: who + ' · ráfaga de golpes (' + flurry + ' golpes)', kind: 'damage', who, by: null, parts: Array.from({ length: flurry }, () => d.unarmed!.parts).flat() }); }}>Ráfaga de golpes: {flurry} golpes</button>
          <button className="btn small" disabled={left < 1} onClick={() => spend(FOCUS)}>Defensa paciente</button>
          <button className="btn small" disabled={left < 1} onClick={() => spend(FOCUS)}>Paso del viento</button>
          {c.level >= 3 && <button className="rollbtn" onClick={() => roll({ label: who + ' · desviar ataques', kind: 'free', parts: [{ expr: '1d10' + sgn(d.mods.dex + c.level) }] })}>Desviar ataques 1d10{sgn(d.mods.dex + c.level)}</button>}
        </span>
      </>}><p className="pc-text">La ráfaga tira el daño de todos sus golpes sin armas de una vez (cada uno necesita su ataque). Desviar ataques reduce el daño recibido en el resultado.</p></Card></li>,
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
