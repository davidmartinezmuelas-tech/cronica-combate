import { useEffect, useState } from 'react';
import type { Combatant } from '../data/types';
import { rollModifiers } from '../engine/combat';
import { fmt, rollDie } from '../engine/dice';
import { uid as newId } from '../engine/util';
import { useRoom } from '../store/room';
import { useStore } from '../store/useStore';

const ABIL_N = ['Fuerza', 'Destreza', 'Constitución', 'Inteligencia', 'Sabiduría', 'Carisma'];

interface Save { total: number | null; fail: boolean; note: string; manual?: boolean; pending?: string }

/**
 * Efecto con salvación: elegir objetivos de la lista de iniciativa, tirar sus salvaciones (los monstruos con su
 * bonificador; los jugadores, lo que digan) y, tras revisarlo, aplicar el daño (completo o mitad) y los estados.
 */
export default function EffectTargets() {
  const r = useStore((s) => s.result)!;
  const combatants = useStore((s) => s.combatants);
  const { monById, applyEffect } = useStore.getState();
  const e = r.effect!;
  const list = combatants.filter((c) => c.kind !== 'lair' && c.id !== r.by);
  // los objetivos ya elegidos (lanzamiento de un jugador que el máster está revisando)
  const [sel, setSel] = useState<string[]>(() => { const pre = useStore.getState().effectSel; if (pre) useStore.setState({ effectSel: null }); return pre || []; });
  const roster = useStore((s) => s.roster);
  const room = useRoom();
  // jugador de la sala al que se le puede pedir la salvación en su hoja
  const roomUidOf = (c: Combatant) => (room.code && room.role === 'dm' && c.kind === 'pc' ? roster.find((r) => r.id === c.rosterId)?.roomUid : undefined);
  const online = new Set(room.members.map((m) => m.uid));
  const [saves, setSaves] = useState<Record<string, Save>>({});
  const [conds, setConds] = useState<string[]>(e.conds);
  const hasDmg = r.parts.length > 0;
  const abil = ABIL_N[e.abil];

  const bonusOf = (c: Combatant): number | null => (c.kind === 'monster' ? monById(c.monsterId)?.sv?.[e.abil] ?? null : null);
  const rollFor = (c: Combatant): Save => {
    const mods = rollModifiers(c, 'save', e.abil);
    if (mods.autoFail) return { total: null, fail: true, note: 'falla sola: ' + mods.reasons.join(', ') };
    const b = bonusOf(c) ?? 0;
    const a = rollDie(20), d = rollDie(20);
    const nat = mods.adv && !mods.dis ? Math.max(a, d) : mods.dis && !mods.adv ? Math.min(a, d) : a;
    const total = nat + b + (mods.flat || 0);
    const how = mods.adv !== mods.dis ? (mods.adv ? 'ventaja ' : 'desventaja ') + '[' + a + ', ' + d + ']' : '[' + nat + ']';
    return { total, fail: total < e.dc, note: how + ' ' + fmt(b) + (c.kind === 'pc' && bonusOf(c) == null ? ' (sin su bonificador: corrígelo)' : '') };
  };
  const rollAll = () => {
    const next: Record<string, Save> = {};
    for (const id of sel) {
      const c = list.find((x) => x.id === id);
      if (!c) continue;
      if (saves[id]?.manual || saves[id]?.pending) { next[id] = saves[id]; continue; }
      const ru = roomUidOf(c);
      if (ru && online.has(ru)) {
        // en la sala: se la pide al jugador, que la tira en su hoja con su bonificador
        const reqId = newId() + '-' + id;
        useRoom.getState().requestSave(ru, reqId, e.dc, e.abil, r.label);
        next[id] = { total: null, fail: true, note: 'esperando su tirada…', pending: reqId };
      } else next[id] = rollFor(c);
    }
    setSaves(next);
  };
  // las respuestas de los jugadores rellenan su salvación
  useEffect(() => {
    const done: string[] = [];
    let changed = false;
    const next = { ...saves };
    for (const [id, sv] of Object.entries(saves)) {
      const rep = sv.pending && room.replies.find((x) => x.reqId === sv.pending);
      if (!rep) continue;
      next[id] = { total: rep.total, fail: rep.total < e.dc, note: 'su tirada', manual: true };
      done.push(rep.id);
      changed = true;
    }
    if (changed) { setSaves(next); done.forEach((x) => useRoom.getState().dismissReply(x)); }
  }, [room.replies, saves, e.dc]);
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const setTotal = (id: string, v: string) => {
    const n = parseInt(v, 10);
    setSaves({ ...saves, [id]: Number.isNaN(n) ? { total: null, fail: true, note: '', manual: true } : { total: n, fail: n < e.dc, note: 'tirada del jugador', manual: true } });
  };
  const flip = (id: string) => setSaves({ ...saves, [id]: { ...saves[id], fail: !saves[id].fail } });
  const ready = sel.length > 0 && sel.every((id) => saves[id] && !saves[id].pending);
  const consequence = (s: Save) => (s.fail
    ? [hasDmg ? 'todo el daño' : '', conds.length ? conds.join(', ') : ''].filter(Boolean).join(' y ') || 'falla'
    : hasDmg && e.half ? 'la mitad del daño' : 'nada');

  return (
    <div className="targets effect">
      <span className="small muted">
        Salvación de {abil} CD {e.dc}{e.half ? ' · mitad si supera' : ''}{e.rounds ? ' · estados durante ' + (e.rounds === 1 ? 'hasta el final del siguiente turno' : e.rounds + ' rondas') : ''}{e.repeat ? ' · repite la salvación al final de cada turno' : ''}. Elige objetivos:
      </span>
      <div className="chips" role="group" aria-label="Objetivos del efecto">
        {list.map((c) => <button key={c.id} className={sel.includes(c.id) ? 'chip on' : 'chip'} aria-pressed={sel.includes(c.id)} onClick={() => toggle(c.id)}>{c.name}</button>)}
      </div>
      {e.conds.length > 0 && (
        <div className="chips" role="group" aria-label="Estados que pone">
          <span className="small muted">Estados a quien falla:</span>
          {e.conds.map((k) => <button key={k} className={conds.includes(k) ? 'chip vuln' : 'chip'} aria-pressed={conds.includes(k)} onClick={() => setConds(conds.includes(k) ? conds.filter((x) => x !== k) : [...conds, k])}>{k}</button>)}
        </div>
      )}
      {sel.length > 0 && <button className="btn small gold" style={{ alignSelf: 'flex-start' }} onClick={rollAll}>Tirar salvaciones</button>}
      {sel.length > 0 && (
        <ul className="effect-rows">
          {sel.map((id) => {
            const c = list.find((x) => x.id === id);
            if (!c) return null;
            const s = saves[id];
            return (
              <li key={id}>
                <b>{c.name}</b>
                {c.kind === 'pc' && <input className="input effect-in" inputMode="numeric" aria-label={'Salvación de ' + c.name} placeholder="Tirada" value={s?.manual && s.total != null ? s.total : ''} onChange={(ev) => setTotal(id, ev.target.value)} />}
                {s && <span className="muted small">{s.total != null ? s.total + ' ' : ''}{s.note}</span>}
                {s && <button className={s.fail ? 'chip vuln' : 'chip on'} aria-label={(s.fail ? 'Falla' : 'Supera') + ': pulsa para cambiar'} onClick={() => flip(id)}>{s.fail ? 'Falla' : 'Supera'}</button>}
                {s && <span className="small">→ {consequence(s)}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <button className="btn small primary" style={{ alignSelf: 'flex-start' }} disabled={!ready}
        onClick={() => applyEffect(sel.map((id) => ({ id, total: saves[id].total, fail: saves[id].fail })), e, conds, r.parts, !!r.crit)}>
        Aplicar
      </button>
    </div>
  );
}
