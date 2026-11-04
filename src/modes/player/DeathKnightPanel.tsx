import { useState } from 'react';
import type { Character, Derived } from '../../engine/character';
import { fmt } from '../../engine/dice';
import { norm } from '../../engine/util';
import Card from '../../shared/Card';
import Pips from '../../shared/Pips';
import { useStore } from '../../store/useStore';

/** Subclase de WoW «Oath of the Ebon Blade» (Caballero de la Muerte): sus rasgos se reconocen por el nombre de la subclase. */
export const isEbonBlade = (c: Character): boolean => c.classId === 'paladin' && /ebon blade|hoja de ebano/.test(norm(c.subclass || ''));

const COIL = 'Death Coil';
const MASTERY = 'Runic Mastery';
const CHANNEL = 'Canalización divina';
const RUNE_KEY = 'dk.rune';
const RUNES = ['Blood', 'Frost', 'Unholy'] as const;
const RUNE_ES: Record<string, string> = { Blood: 'Sangre', Frost: 'Escarcha', Unholy: 'Profana' };

/** Mecánicas del Caballero de la Muerte: reserva de Death Coil, runa del arma y sus efectos (Runic Power y Runic Mastery). */
export default function DeathKnightPanel({ c, d, set }: { c: Character; d: Derived; set: (patch: Partial<Character>) => void }) {
  const { roll } = useStore.getState();
  const [dice, setDice] = useState('');
  const [dealt, setDealt] = useState('');
  if (!isEbonBlade(c)) return null;
  const who = c.name || 'Personaje';
  const cha = d.mods.cha;
  const poolMax = Math.max(1, 1 + cha);
  const perCast = Math.max(1, cha);
  const used = Math.min(poolMax, c.uses[COIL] || 0);
  const left = poolMax - used;
  const n = Math.max(0, Math.min(left, perCast, parseInt(dice, 10) || 0));
  const dc = 8 + d.pb + cha;
  const rune = c.choices?.[RUNE_KEY]?.[0] || '';
  const spend = (k: string, by = 1) => set({ uses: { ...c.uses, [k]: (c.uses[k] || 0) + by } });
  const channelMax = c.level >= 11 ? 3 : 2;
  const channelLeft = channelMax - Math.min(channelMax, c.uses[CHANNEL] || 0);
  const masteryUsed = !!c.uses[MASTERY];
  const pal = c.level;
  const hit = parseInt(dealt, 10) || 0;
  const cold = (expr: string, label: string) => roll({ label: who + ' · ' + label, kind: 'damage', who, by: null, parts: [{ expr, type: 'frío' }] });
  const pgTemp = Math.max(0, cha) + pal;

  return (
    <section className="panel" aria-label="Caballero de la Muerte">
      <h3 className="eyebrow">Caballero de la Muerte</h3>
      <ul className="pc-features grid acts">
        <li>
          <Card name={COIL} head={<>
            <span className="chip-tag">{left} de {poolMax} d8 · CD {dc} CON</span><span className="muted small">acción adicional, 60 pies · vuelve en descanso largo</span>
            <Pips max={poolMax} used={used} label={COIL} onSet={(v) => set({ uses: { ...c.uses, [COIL]: Math.max(0, Math.min(poolMax, v)) } })} />
            <div className="rollrow">
              <input className="input" style={{ width: 70 }} type="number" min={1} max={Math.min(left, perCast)} inputMode="numeric" aria-label="Dados de Death Coil" placeholder={'1-' + Math.min(left, perCast)} value={dice} onChange={(e) => setDice(e.target.value)} />
              <button className="rollbtn dmg" disabled={!n} onClick={() => { spend(COIL, n); roll({ label: who + ' · Death Coil (CD ' + dc + ' CON, mitad si la supera)', kind: 'damage', who, by: null, parts: [{ expr: n + 'd8', type: 'necrótico' }] }); setDice(''); }}>Dañar {n ? n + 'd8' : ''}</button>
              <button className="rollbtn" disabled={!n} onClick={() => { spend(COIL, n); roll({ label: who + ' · Death Coil: cura a un no muerto', kind: 'free', parts: [{ expr: n + 'd8' }] }); setDice(''); }}>Curar no muerto {n ? n + 'd8' : ''}</button>
            </div>
          </>}><p className="pc-text">Gastas hasta {perCast} d8 de la reserva a la vez. El objetivo sufre el total como daño necrótico (mitad si supera la salvación de CON), o un no muerto recupera ese total en PG.{c.level >= 14 ? ' Mejorado: suma ' + Math.max(1, cha) + ' de daño necrótico, supere o no la salvación.' : ''}</p></Card>
        </li>
        {c.level >= 3 && (
          <li>
            <Card name="Runeforging" head={<>
              <span className="muted small">una runa en tu arma cuerpo a cuerpo · se cambia en descanso largo o al subir de nivel</span>
              <div className="rollrow">
                {RUNES.map((r) => <button key={r} className={rune === r ? 'chip on' : 'chip'} aria-pressed={rune === r} onClick={() => set({ choices: { ...(c.choices || {}), [RUNE_KEY]: [rune === r ? '' : r] } })}>{RUNE_ES[r]}</button>)}
                {rune === 'Blood' && <button className="btn small" onClick={() => set({ temp: Math.max(c.temp, pgTemp) })}>PG temporales {fmt(pgTemp)}</button>}
              </div>
            </>}>
              <p className="pc-text">{rune === 'Blood' ? 'Sangre: ganas PG temporales (CAR + nivel de paladín) al inscribirla y en cada descanso largo, y al dejar a un enemigo a 0 PG con el arma.'
                : rune === 'Frost' ? 'Escarcha: tus ataques con el arma, conjuros y rasgos de paladín ignoran la resistencia al frío. El ataque extra de la propiedad Ligera que impacte hace 1d4 de frío más.'
                : rune === 'Unholy' ? 'Profana: ignoras la resistencia al necrótico. Con arma Pesada, la primera criatura que golpeas cada turno sufre ' + Math.max(1, cha) + ' de daño necrótico extra.'
                : 'Elige una runa para ver su efecto.'}</p>
            </Card>
          </li>
        )}
        {c.level >= 3 && rune && (
          <li>
            <Card name="Runic Power" head={<>
              <span className="chip-tag">{channelLeft} de {channelMax} Canalización divina</span><span className="muted small">justo tras lanzar Rune Strike</span>
              <div className="rollrow">
                {rune === 'Frost' && <button className="rollbtn dmg" disabled={channelLeft < 1} onClick={() => { spend(CHANNEL); cold('2d6', 'Runic Power (Escarcha): objetivo y enemigos a 10 pies'); }}>Escarcha 2d6</button>}
                {rune === 'Blood' && <>
                  <input className="input" style={{ width: 80 }} type="number" min={0} inputMode="numeric" aria-label="Daño necrótico de Rune Strike" placeholder="Daño" value={dealt} onChange={(e) => setDealt(e.target.value)} />
                  <button className="btn small" disabled={channelLeft < 1 || hit < 1} onClick={() => { spend(CHANNEL); set({ hp: Math.min(d.hpMax, c.hp + hit) }); setDealt(''); }}>Curarme {hit || ''}</button>
                </>}
                {rune === 'Unholy' && <button className="btn small" disabled={channelLeft < 1} onClick={() => spend(CHANNEL)}>Maldecir al objetivo</button>}
              </div>
            </>}>
              <p className="pc-text">{rune === 'Blood' ? 'Recuperas PG iguales al daño necrótico que hizo tu Rune Strike.' : rune === 'Frost' ? 'El objetivo de Rune Strike y cada enemigo en una emanación de 10 pies a su alrededor sufren 2d6 de frío.' : 'El objetivo queda maldito hasta el final de tu próximo turno: en su siguiente salvación resta 1d6 a la tirada y la maldición termina.'}</p>
            </Card>
          </li>
        )}
        {c.level >= 15 && rune && (
          <li>
            <Card name="Runic Mastery" head={<>
              <span className="chip-tag">{masteryUsed ? 'gastado' : 'disponible'}</span><span className="muted small">vuelve en descanso largo</span>
              <div className="rollrow">
                {rune === 'Frost' && <button className="rollbtn dmg" disabled={masteryUsed} onClick={() => { spend(MASTERY); cold('8d6', 'Runic Mastery (Escarcha): cono de 30 pies, salvación contra tu CD de conjuros'); }}>Aliento 8d6</button>}
                {rune !== 'Frost' && <button className="btn small" disabled={masteryUsed} onClick={() => spend(MASTERY)}>{rune === 'Blood' ? 'Reducir daño ' + pal + ' (pierdes ' + pal + ' PG)' : 'Usar'}</button>}
              </div>
            </>}>
              <p className="pc-text">{rune === 'Blood' ? 'Reacción: cuando una criatura que ves a 10 pies es golpeada, reduces su daño en tu nivel de paladín y pierdes tantos PG.' : rune === 'Frost' ? 'Cambia un ataque de la acción Atacar por un cono de escarcha de 30 pies: 8d6 de frío (mitad si supera la salvación contra tu CD de conjuros).' : 'Invocar a un no muerto sin concentración durante 1 minuto: el espíritu tiene PG temporales (nivel + CAR) y hace ' + Math.ceil(pal / 2) + ' de necrótico extra la primera vez que golpea cada turno.'}</p>
            </Card>
          </li>
        )}
      </ul>
    </section>
  );
}
