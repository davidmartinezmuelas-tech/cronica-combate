import { useState } from 'react';
import type { Abil, PlayerData } from '../../data/player';
import type { Character, Derived } from '../../engine/character';
import { fmt } from '../../engine/dice';
import { saveEffectOf } from '../../engine/saveEffect';
import { spellCast, spellRoll } from '../../engine/spellRoll';
import { hasInvocation } from '../../engine/subclassChoices';
import { withConc } from '../../engine/concentration';
import { castOnPatch, debuffOf, spellFx } from '../../engine/spellEffects';
import { elementalTypes } from '../../engine/metamagic';
import type { Grant } from '../../engine/grantedSpells';
import { useRoom } from '../../store/room';
import { usePlayer } from '../../store/player';
import { useStore } from '../../store/useStore';
import type { SpellEntry } from './spells';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };

/**
 * Ataque, CD y fórmulas de un conjuro lanzado a ese nivel, con lo que lo cambia (característica del rasgo que lo da,
 * la clase que lo tiene en su lista, Lanzamiento potente, Ráfaga agónica, Adepto elemental). Lo usan Conjuros y Ataques.
 */
export function spellCastFor(c: Character, d: Derived, s: SpellEntry, lv: number, data: PlayerData | null, grant?: Grant) {
  // los propios llevan sus tiradas escritas; los demás se leen del texto
  const r = s.sr ?? spellRoll(s.t);
  const base = s.l || 0;
  // los que da un rasgo (especie, invocación, dote) usan su característica; si no, la de la clase que lo tiene en su lista
  const own = grant?.abil ? { abil: grant.abil, dc: 8 + d.pb + d.mods[grant.abil], atk: d.pb + d.mods[grant.abil] } : null;
  const caster = own || (d.casters.length > 1 && d.casters.find((x) => data?.classes.find((k) => k.id === x.classId)?.spells.includes(s.id))) || d.spell;
  const mod = caster ? d.mods[caster.abil] : 0;
  // Lanzamiento de conjuros potente (clérigo o druida de nivel 7): + Sabiduría al daño de sus trucos
  const potent = base === 0 && [c.choices?.['cleric.blessed']?.[0], c.choices?.['druid.fury']?.[0]].includes('Lanzamiento de conjuros potente');
  // Ráfaga agónica (invocación de brujo): + Carisma al daño de sus trucos de brujo
  const agonizing = base === 0 && hasInvocation(c, 'Ráfaga agónica') && !!data?.classes.find((k) => k.id === 'warlock')?.spells.includes(s.id);
  // sin tirada (Escudo, Detectar magia…): solo «Lanzar»
  const none = { attack: null, save: null, half: false, damage: null, heal: null, count: 1, cantrip: null, upDice: '', upCount: false } as const;
  const rr = r || none;
  const cast0 = spellCast(rr, base, lv, d.level, agonizing ? d.mods.cha : mod, potent || agonizing);
  // Adepto elemental: en su elemento, cada 1 de los dados cuenta como 2
  const adept = !!cast0.dmg && elementalTypes(c).includes(cast0.dmg.type);
  const cast = adept ? { ...cast0, dmg: { ...cast0.dmg!, min: 2 } } : cast0;
  return { r, rr, caster, mod, cast };
}

/**
 * Tiradas de un conjuro en la hoja: ataque de conjuro, daño o curación con el nivel de espacio elegido (los trucos
 * mejoran solos con el nivel) y la CD si pide salvación. «Lanzar» gasta el espacio.
 */
export default function SpellRolls({ c, d, s, set, grant }: { c: Character; d: Derived; s: SpellEntry; set: (patch: Partial<Character>) => void; grant?: Grant & { key: string } }) {
  const { roll } = useStore.getState();
  const base = s.l || 0;
  // espacios con los que se puede lanzar: los normales desde su nivel y, con magia de pacto, el de pacto (a su nivel).
  // Con multiclase valen los dos tipos; la opción «p» es el pacto.
  const pactLv = d.pact && d.pact.lv >= base ? d.pact.lv : 0;
  const normal = base === 0 ? [] : d.slots.map((n, i) => (n > 0 && i + 1 >= base ? i + 1 : 0)).filter(Boolean);
  const options: (number | 'p')[] = base === 0 ? [] : [...normal, ...(pactLv ? ['p' as const] : [])];
  const [slot, setSlot] = useState<number | 'p'>(0);
  const pick = options.includes(slot) ? slot : options[0] ?? base;
  const usePact = pick === 'p';
  const lv = base === 0 ? 0 : usePact ? pactLv : (pick as number) || base;
  const who = c.name || 'Personaje';
  const data = usePlayer((x) => x.data);
  const { r, caster, rr, cast } = spellCastFor(c, d, s, lv, data, grant);
  const label = (what: string) => who + ' · ' + s.n + (lv > base ? ' (nivel ' + lv + ')' : '') + ': ' + what;
  // espacio que gasta «Lanzar»
  const pactLeft = d.pact ? d.pact.n - Math.min(d.pact.n, c.pactUsed) : 0;
  const slotLeft = lv && !usePact ? (d.slots[lv - 1] || 0) - (c.slotsUsed[lv - 1] || 0) : 0;
  // lo que hace el conjuro sobre quien lo recibe (PG temporales, CA, Auxilio…): «Lanzar sobre mí» lo aplica en la hoja
  const fx = spellFx(s);
  const inRoom = useRoom((x) => !!x.code && x.role === 'player');
  const table = useRoom((x) => x.table);
  // tras «Sobre otro» en una sala: a quién (de la lista de iniciativa del máster)
  const [targets, setTargets] = useState<{ lv: number; sel: string[] } | null>(null);
  const [sentNote, setSentNote] = useState('');
  const sendBuff = async () => {
    if (!targets || !fx) return;
    const ok = await useRoom.getState().sendCast({ label: label('sobre otros'), targets: targets.sel, crit: false, parts: [], attack: null, heal: null, effect: null,
      buff: { k: fx.key, n: s.n, lv: targets.lv, conc: !!s.c, note: (fx.fx.hpMax ? '+' + fx.fx.hpMax(targets.lv) + ' ' : '') + fx.fx.note } });
    if (ok) { setTargets(null); setSentNote('Enviado al máster: lo aplica a los objetivos.'); }
  };
  // sin espacio, por el rasgo: a voluntad, una vez por descanso largo o tantas como el bonificador por competencia
  const freeMax = !grant || grant.how === 'known' ? 0 : grant.how === 'will' || grant.how === 'ritual' ? Infinity : grant.how === 'lr' ? 1 : d.pb;
  const freeUsed = grant ? c.uses[grant.key] || 0 : 0;
  const spendSlot = (onMe = false, free = false) => {
    // un conjuro de concentración la empieza (y termina la de otro)
    const conds = s.c ? withConc(c.conds, s.n) : c.conds;
    const patch: Partial<Character> = { conds };
    const castLv = free ? Math.max(1, base) : lv;
    if (free) { if (freeMax !== Infinity) patch.uses = { ...c.uses, [grant!.key]: freeUsed + 1 }; }
    else if (usePact) patch.pactUsed = c.pactUsed + 1;
    else { const u = c.slotsUsed.slice(); u[lv - 1] = (u[lv - 1] || 0) + 1; patch.slotsUsed = u; }
    if (onMe && fx && !grant?.noFx) {
      const { patch: fxPatch, tempDice } = castOnPatch({ ...c, conds }, fx.key, s.n, castLv, !!s.c, d.mods);
      Object.assign(patch, fxPatch);
      if (tempDice) {
        // Vigor infernal: los PG temporales al máximo, sin tirar
        if (free && grant?.max) patch.temp = Math.max(c.temp, tempDice.split('+').reduce((t, x) => { const m = /^(\d*)d(\d+)$/.exec(x.trim()); return t + (m ? (parseInt(m[1] || '1', 10) * parseInt(m[2], 10)) : Number(x) || 0); }, 0));
        // PG temporales: no se suman, se queda el mayor
        else roll({ label: label('PG temporales'), kind: 'free', parts: [{ expr: tempDice }], after: (total) => {
          const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
          usePlayer.getState().update(c.id, { temp: Math.max(cur.temp, total) });
          return { resultNote: total > cur.temp ? 'PG temporales: ' + total + '.' : 'Ya tenías ' + cur.temp + ' PG temporales: te quedas con esos.' };
        } });
      }
    }
    // sobre otros en la sala: se eligen los objetivos y se manda a la mesa del máster
    if (!onMe && fx && !fx.fx.self && inRoom) setTargets({ lv: castLv, sel: [] });
    set(patch);
  };
  const healAfter = (total: number) => {
    const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
    usePlayer.getState().update(c.id, { hp: Math.min(d.hpMax, cur.hp + Math.max(0, total)), death: { s: 0, f: 0 } });
    return { resultNote: 'Recuperas ' + Math.max(0, total) + ' PG.' };
  };
  const dc = caster?.dc;
  // con salvación: el daño lleva el efecto (CD, mitad, estados) para mandarlo a la mesa del máster
  const effect0 = rr.save && dc != null ? saveEffectOf(dc, rr.save, rr.half, s.t) : null;
  // los que perjudican sin un estado del juego (Perdición, Ralentizar…): su efecto como estado para quien falla
  const debuff = s.cond || debuffOf(s);
  const effect = effect0 && debuff && !effect0.conds.includes(debuff) ? { ...effect0, conds: [...effect0.conds, debuff] } : effect0;

  return (
    <span className="rollrow" onClick={(e) => e.preventDefault()}>
      {rr.save && dc != null && <span className="chip-tag">CD {dc} {ABIL_N[rr.save]}{rr.half ? ' · mitad si supera' : ''}</span>}
      {options.length > 1 && (r || pactLv > 0) && (
        <select className="input pc-slot-pick" aria-label={'Nivel de espacio para ' + s.n} value={String(pick)} onChange={(e) => setSlot(e.target.value === 'p' ? 'p' : parseInt(e.target.value, 10))}>
          {options.map((l) => <option key={l} value={l}>{l === 'p' ? 'Pacto (nivel ' + pactLv + ')' : 'Nivel ' + l}</option>)}
        </select>
      )}
      {rr.attack && caster && (
        <button className="rollbtn" onClick={() => roll({ label: label('ataque' + (cast.count > 1 ? ' (uno por ' + (s.n.match(/dardo|rayo/i)?.[0] || 'impacto') + ')' : '')), kind: 'attack', who, parts: [{ expr: '1d20' + (caster.atk >= 0 ? '+' : '') + caster.atk + (d.bless ? '+1d4' : '') }], self: { conds: c.conds, exh: c.exh } })}>Ataque {fmt(caster.atk)}{d.bless ? ' +1d4' : ''}{cast.count > 1 ? ' ×' + cast.count : ''}</button>
      )}
      {cast.dmg && (rr.attack || cast.count === 1 ? (
        <button className="rollbtn dmg" onClick={() => roll({ label: label('daño'), kind: 'damage', who, by: null, parts: [cast.dmg!], ...(effect ? { effect } : {}) })}>Daño {cast.dmg.expr}{cast.dmg.type ? ' ' + cast.dmg.type : ''}{cast.count > 1 ? ' cada uno' : ''}</button>
      ) : (
        <button className="rollbtn dmg" onClick={() => roll({ label: label(cast.count + ' impactos'), kind: 'damage', who, by: null, parts: Array.from({ length: cast.count }, () => cast.dmg!), ...(effect ? { effect } : {}) })}>Daño {cast.count} × {cast.dmg.expr}{cast.dmg.type ? ' ' + cast.dmg.type : ''}</button>
      ))}
      {effect && !cast.dmg && !cast.heal && inRoom && (
        <button className="rollbtn" title="Elige objetivos en la mesa del máster" onClick={() => useStore.getState().startEffect(label('efecto'), effect)}>Objetivos{effect.conds.length ? ' (' + effect.conds.join(', ').toLowerCase() + ')' : ''}</button>
      )}
      {cast.heal && (
        <>
          <button className="rollbtn" onClick={() => roll({ label: label('curación'), kind: 'free', heal: true, parts: [{ expr: cast.heal }] })}>Curar {cast.heal}</button>
          <button className="rollbtn" onClick={() => roll({ label: label('curarme'), kind: 'free', parts: [{ expr: cast.heal }], after: healAfter })}>Curarme</button>
        </>
      )}
      {freeMax > 0 && (
        <>
          {freeMax !== Infinity && <span className="muted small">{Math.max(0, freeMax - freeUsed)} de {freeMax} sin espacio</span>}
          <button className="btn small" disabled={freeUsed >= freeMax} title={grant!.src + ': sin gastar espacio' + (fx && !grant!.noFx ? '; lo aplica en tu hoja: ' + fx.fx.note : '')} onClick={() => spendSlot(true, true)}>{grant!.how === 'ritual' ? 'Lanzar como ritual (sin espacio, 10 min más)' : freeMax === Infinity ? 'Lanzar (a voluntad)' : 'Lanzar sin espacio'}</button>
        </>
      )}
      {base > 0 && grant?.how !== 'will' && (d.pact || d.slots.length > 0) && (fx ? (
        <>
          <button className="btn small" disabled={usePact ? pactLeft <= 0 : slotLeft <= 0} title={'Gasta el espacio y lo aplica en tu hoja: ' + fx.fx.note} onClick={() => spendSlot(true)}>{fx.fx.self ? 'Lanzar' : 'Lanzar sobre mí'} (gasta {usePact ? 'espacio de pacto' : 'espacio de nivel ' + lv})</button>
          {!fx.fx.self && <button className="btn small ghost" disabled={usePact ? pactLeft <= 0 : slotLeft <= 0} title="Lo lanzas sobre otra criatura: gasta el espacio" onClick={() => spendSlot(false)}>Sobre otro</button>}
        </>
      ) : (
        <button className="btn small" disabled={usePact ? pactLeft <= 0 : slotLeft <= 0} title="Marca el espacio de conjuro gastado" onClick={() => spendSlot()}>Lanzar (gasta {usePact ? 'espacio de pacto' : 'espacio de nivel ' + lv})</button>
      ))}
      {targets && (
        <span className="targets send-table">
          <span className="small muted">{s.n} sobre otros: elige a quién en la mesa del máster</span>
          {!table.length ? <span className="small muted">El máster aún no ha compartido la lista de iniciativa.</span> : (
            <span className="chips" role="group" aria-label={'Objetivos de ' + s.n}>
              {table.map((t) => <button key={t.id} className={targets.sel.includes(t.id) ? 'chip on' : 'chip'} aria-pressed={targets.sel.includes(t.id)} onClick={() => setTargets({ ...targets, sel: targets.sel.includes(t.id) ? targets.sel.filter((x) => x !== t.id) : [...targets.sel, t.id] })}>{t.name}</button>)}
            </span>
          )}
          <span className="rollrow">
            <button className="btn small primary" disabled={!targets.sel.length} onClick={() => void sendBuff()}>Enviar a la mesa</button>
            <button className="btn small ghost" onClick={() => setTargets(null)}>No enviar</button>
          </span>
        </span>
      )}
      {sentNote && <span className="small muted" role="status">{sentNote}</span>}
    </span>
  );
}
