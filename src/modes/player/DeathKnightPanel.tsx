import { useState } from 'react';
import type { Character, Derived } from '../../engine/character';
import { fmt } from '../../engine/dice';
import { norm } from '../../engine/util';
import Card, { InfoDialog } from '../../shared/Card';
import Pips from '../../shared/Pips';
import { useStore } from '../../store/useStore';

/** Subclase de WoW «Oath of the Ebon Blade» (Caballero de la Muerte): sus rasgos se reconocen por el nombre de la subclase. */
export const isEbonBlade = (c: Character): boolean => c.classId === 'paladin' && /ebon blade|hoja de ebano/.test(norm(c.subclass || ''));

const COIL = 'Death Coil';
const MASTERY = 'Runic Mastery';
const CHANNEL = 'Canalización divina';
export const RUNE_KEY = 'dk.rune';
const STRIKE = 'dk.strike'; // Rune Strike lanzado: habilita Runic Power
const TURN = 'dk.turn'; // el primer golpe del turno con arma Pesada (runa Profana) ya se ha hecho
const LIGHT = 'dk.light'; // el próximo golpe es el ataque extra de la propiedad Ligera (runa de Escarcha)

/** Rune Strike como conjuro de castigo (acción adicional tras impactar): 2d8 necróticos, +1d8 por nivel de espacio sobre 1. Sale siempre preparado. */
export const RUNE_STRIKE = {
  id: 'dk-rune-strike', en: 'Rune Strike', n: 'Rune Strike', l: 1, c: 0, rit: 0, ct: 'Acción adicional (tras impactar con un arma cuerpo a cuerpo o un ataque sin armas)', r: 'Personal', cmp: 'V', du: 'Instantánea',
  t: 'El objetivo sufre 2d8 de daño necrótico adicional (1d8 más si es un Celestial). El daño aumenta en 1d8 por cada nivel de espacio de conjuro por encima de 1.',
};

/** Efectos pasivos del Caballero de la Muerte en un golpe con arma cuerpo a cuerpo: Golpes rúnicos (nivel 11) y la runa del arma. */
export function dkPassives(c: Character, d: Derived, props: string[]): { parts: { expr: string; type: string; src: string }[]; uses: Record<string, number> } | null {
  if (!isEbonBlade(c)) return null;
  const rune = c.choices?.[RUNE_KEY]?.[0] || '';
  const parts: { expr: string; type: string; src: string }[] = [];
  const uses: Record<string, number> = {};
  if (c.level >= 11) parts.push({ expr: '1d8', type: 'necrótico', src: 'Golpes rúnicos' });
  if (rune === 'Unholy' && !c.uses[TURN] && props.some((x) => norm(x) === 'pesada')) { parts.push({ expr: String(Math.max(1, d.mods.cha)), type: 'necrótico', src: 'Runa profana' }); uses[TURN] = 1; }
  if (rune === 'Frost' && c.uses[LIGHT]) { parts.push({ expr: '1d4', type: 'frío', src: 'Runa de escarcha' }); uses[LIGHT] = 0; }
  return { parts, uses };
}
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
  const power = (k: string = CHANNEL) => set({ uses: { ...c.uses, [CHANNEL]: (c.uses[CHANNEL] || 0) + (k === CHANNEL ? 1 : 0), [STRIKE]: 0 } });
  const spend = (k: string, by = 1) => set({ uses: { ...c.uses, [k]: (c.uses[k] || 0) + by } });
  const channelMax = c.level >= 11 ? 3 : 2;
  const channelLeft = channelMax - Math.min(channelMax, c.uses[CHANNEL] || 0);
  const struck = !!c.uses[STRIKE];
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
                {rune === 'Frost' && <button className="chip" aria-pressed={!!c.uses[LIGHT]} title="El siguiente golpe es el ataque extra de la propiedad Ligera: suma 1d4 de frío" onClick={() => set({ uses: { ...c.uses, [LIGHT]: c.uses[LIGHT] ? 0 : 1 } })}>Ataque extra Ligera +1d4</button>}
                {rune === 'Unholy' && <button className="chip" aria-pressed={!c.uses[TURN]} title="La primera criatura que golpeas cada turno con un arma Pesada recibe necrótico extra. Pulsa para empezar un turno nuevo" onClick={() => set({ uses: { ...c.uses, [TURN]: 0 } })}>{c.uses[TURN] ? 'Nuevo turno' : 'Primer golpe pesado listo'}</button>}
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
              <span className="chip-tag">{channelLeft} de {channelMax} Canalización divina</span><span className="muted small">{struck ? 'Rune Strike lanzado: elige' : 'se desbloquea al lanzar Rune Strike'}</span><button className="chip" aria-pressed={struck} title="Marcar a mano que acabas de lanzar Rune Strike" onClick={() => set({ uses: { ...c.uses, [STRIKE]: struck ? 0 : 1 } })}>Rune Strike lanzado</button>
              <div className="rollrow">
                {rune === 'Frost' && <button className="rollbtn dmg" disabled={channelLeft < 1 || !struck} onClick={() => { power(); cold('2d6', 'Runic Power (Escarcha): objetivo y enemigos a 10 pies'); }}>Escarcha 2d6</button>}
                {rune === 'Blood' && <>
                  <input className="input" style={{ width: 80 }} type="number" min={0} inputMode="numeric" aria-label="Daño necrótico de Rune Strike" placeholder="Daño" value={dealt} onChange={(e) => setDealt(e.target.value)} />
                  <button className="btn small" disabled={channelLeft < 1 || !struck || hit < 1} onClick={() => { set({ hp: Math.min(d.hpMax, c.hp + hit), uses: { ...c.uses, [CHANNEL]: (c.uses[CHANNEL] || 0) + 1, [STRIKE]: 0 } }); setDealt(''); }}>Curarme {hit || ''}</button>
                </>}
                {rune === 'Unholy' && <button className="btn small" disabled={channelLeft < 1 || !struck} onClick={() => power()}>Maldecir al objetivo</button>}
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

/** ¿Se puede usar Runic Power ahora? Runa elegida, nivel 3 y algún uso de Canalización divina. */
export function runicPowerReady(c: Character): boolean {
  if (!isEbonBlade(c) || c.level < 3 || !c.choices?.[RUNE_KEY]?.[0]) return false;
  const max = c.level >= 11 ? 3 : 2;
  return (c.uses[CHANNEL] || 0) < max;
}

/** Ventana que sale justo tras lanzar Rune Strike: gasta un uso de Canalización divina para el efecto de la runa, o no. */
export function RunicPowerDialog({ c, d, set, onClose }: { c: Character; d: Derived; set: (patch: Partial<Character>) => void; onClose: () => void }) {
  const { roll } = useStore.getState();
  const [dealt, setDealt] = useState('');
  const rune = c.choices?.[RUNE_KEY]?.[0] || '';
  const max = c.level >= 11 ? 3 : 2;
  const left = max - Math.min(max, c.uses[CHANNEL] || 0);
  const hit = parseInt(dealt, 10) || 0;
  const done = (patch: Partial<Character> = {}) => { set({ uses: { ...c.uses, [CHANNEL]: (c.uses[CHANNEL] || 0) + 1, [STRIKE]: 0 }, ...patch }); onClose(); };
  return (
    <InfoDialog title="Runic Power" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>Rune Strike lanzado. Runa {RUNE_ES[rune] || rune}. ¿Gastas un uso de Canalización divina? Te quedan {left} de {max}.</p>
      <div className="rollrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, marginTop: 8 }}>
        {rune === 'Frost' && (
          <>
            <p className="pc-text">El objetivo de Rune Strike y cada enemigo en una emanación de 10 pies a su alrededor sufren 2d6 de frío.</p>
            <button className="btn gold" onClick={() => { roll({ label: (c.name || 'Personaje') + ' · Runic Power (Escarcha)', kind: 'damage', who: c.name || 'Personaje', by: null, parts: [{ expr: '2d6', type: 'frío' }] }); done(); }}>Escarcha: 2d6 de frío</button>
          </>
        )}
        {rune === 'Blood' && (
          <>
            <p className="pc-text">Recuperas PG iguales al daño necrótico que hizo tu Rune Strike.</p>
            <input className="input" type="number" min={0} inputMode="numeric" aria-label="Daño necrótico de Rune Strike" placeholder="Daño necrótico del Rune Strike" value={dealt} onChange={(e) => setDealt(e.target.value)} />
            <button className="btn gold" disabled={hit < 1} onClick={() => done({ hp: Math.min(d.hpMax, c.hp + hit) })}>Sangre: curarme {hit || ''}</button>
          </>
        )}
        {rune === 'Unholy' && (
          <>
            <p className="pc-text">El objetivo queda maldito hasta el final de tu próximo turno: en su siguiente salvación resta 1d6 a la tirada y la maldición termina.</p>
            <button className="btn gold" onClick={() => done()}>Profana: maldecir al objetivo</button>
          </>
        )}
        <button className="btn" onClick={onClose}>No usarlo</button>
      </div>
    </InfoDialog>
  );
}
