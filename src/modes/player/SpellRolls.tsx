import { useState } from 'react';
import type { Abil } from '../../data/player';
import type { Character, Derived } from '../../engine/character';
import { fmt } from '../../engine/dice';
import { spellCast, spellRoll } from '../../engine/spellRoll';
import { usePlayer } from '../../store/player';
import { useStore } from '../../store/useStore';
import type { SpellEntry } from './spells';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };

/**
 * Tiradas de un conjuro en la hoja: ataque de conjuro, daño o curación con el nivel de espacio elegido (los trucos
 * mejoran solos con el nivel) y la CD si pide salvación. «Lanzar» gasta el espacio.
 */
export default function SpellRolls({ c, d, s, set }: { c: Character; d: Derived; s: SpellEntry; set: (patch: Partial<Character>) => void }) {
  const { roll } = useStore.getState();
  const r = spellRoll(s.t);
  const base = s.l || 0;
  // espacios con los que se puede lanzar: los suyos desde su nivel; el brujo, siempre al nivel de su magia de pacto
  const levels = base === 0 ? [] : d.pact ? [Math.max(base, d.pact.lv)] : d.slots.map((n, i) => (n > 0 && i + 1 >= base ? i + 1 : 0)).filter(Boolean);
  const [slot, setSlot] = useState(0);
  const lv = base === 0 ? 0 : levels.includes(slot) ? slot : levels[0] || base;
  const who = c.name || 'Personaje';
  const mod = d.spell ? d.mods[d.spell.abil] : 0;
  // Lanzamiento de conjuros potente (clérigo o druida de nivel 7): + Sabiduría al daño de sus trucos
  const potent = base === 0 && [c.choices?.['cleric.blessed']?.[0], c.choices?.['druid.fury']?.[0]].includes('Lanzamiento de conjuros potente');
  // sin tirada (Escudo, Detectar magia…): solo «Lanzar»
  const none = { attack: null, save: null, half: false, damage: null, heal: null, count: 1, cantrip: null, upDice: '', upCount: false } as const;
  const rr = r || none;
  const cast = spellCast(rr, base, lv, c.level, mod, potent);
  const label = (what: string) => who + ' · ' + s.n + (lv > base ? ' (nivel ' + lv + ')' : '') + ': ' + what;
  // espacio que gasta «Lanzar»
  const pactLeft = d.pact ? d.pact.n - Math.min(d.pact.n, c.pactUsed) : 0;
  const slotLeft = lv && !d.pact ? (d.slots[lv - 1] || 0) - (c.slotsUsed[lv - 1] || 0) : 0;
  const spendSlot = () => {
    if (d.pact) { set({ pactUsed: c.pactUsed + 1 }); return; }
    const u = c.slotsUsed.slice(); u[lv - 1] = (u[lv - 1] || 0) + 1; set({ slotsUsed: u });
  };
  const healAfter = (total: number) => {
    const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
    usePlayer.getState().update(c.id, { hp: Math.min(d.hpMax, cur.hp + Math.max(0, total)), death: { s: 0, f: 0 } });
    return { resultNote: 'Recuperas ' + Math.max(0, total) + ' PG.' };
  };
  const dc = d.spell?.dc;

  return (
    <span className="rollrow" onClick={(e) => e.preventDefault()}>
      {rr.save && dc != null && <span className="chip-tag">CD {dc} {ABIL_N[rr.save]}{rr.half ? ' · mitad si supera' : ''}</span>}
      {r && levels.length > 1 && (
        <select className="input pc-slot-pick" aria-label={'Nivel de espacio para ' + s.n} value={lv} onChange={(e) => setSlot(parseInt(e.target.value, 10))}>
          {levels.map((l) => <option key={l} value={l}>Nivel {l}</option>)}
        </select>
      )}
      {rr.attack && d.spell && (
        <button className="rollbtn" onClick={() => roll({ label: label('ataque' + (cast.count > 1 ? ' (uno por ' + (s.n.match(/dardo|rayo/i)?.[0] || 'impacto') + ')' : '')), kind: 'attack', who, parts: [{ expr: '1d20' + (d.spell!.atk >= 0 ? '+' : '') + d.spell!.atk }] })}>Ataque {fmt(d.spell.atk)}{cast.count > 1 ? ' ×' + cast.count : ''}</button>
      )}
      {cast.dmg && (rr.attack || cast.count === 1 ? (
        <button className="rollbtn dmg" onClick={() => roll({ label: label('daño'), kind: 'damage', who, by: null, parts: [cast.dmg!] })}>Daño {cast.dmg.expr}{cast.dmg.type ? ' ' + cast.dmg.type : ''}{cast.count > 1 ? ' cada uno' : ''}</button>
      ) : (
        <button className="rollbtn dmg" onClick={() => roll({ label: label(cast.count + ' impactos'), kind: 'damage', who, by: null, parts: Array.from({ length: cast.count }, () => cast.dmg!) })}>Daño {cast.count} × {cast.dmg.expr}{cast.dmg.type ? ' ' + cast.dmg.type : ''}</button>
      ))}
      {cast.heal && (
        <>
          <button className="rollbtn" onClick={() => roll({ label: label('curación'), kind: 'free', parts: [{ expr: cast.heal }] })}>Curar {cast.heal}</button>
          <button className="rollbtn" onClick={() => roll({ label: label('curarme'), kind: 'free', parts: [{ expr: cast.heal }], after: healAfter })}>Curarme</button>
        </>
      )}
      {base > 0 && (d.pact || d.slots.length > 0) && (
        <button className="btn small" disabled={d.pact ? pactLeft <= 0 : slotLeft <= 0} title="Marca el espacio de conjuro gastado" onClick={spendSlot}>Lanzar (gasta {d.pact ? 'espacio de pacto' : 'espacio de nivel ' + lv})</button>
      )}
    </span>
  );
}
