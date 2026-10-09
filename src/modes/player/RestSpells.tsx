import { useEffect, useState } from 'react';
import type { PlayerData } from '../../data/player';
import { classEntries, derive, type Character } from '../../engine/character';
import { spellSwapRules } from '../../engine/subclassChoices';
import { InfoDialog } from '../../shared/Card';
import { usePlayer } from '../../store/player';
import SpellSwap, { applySwap, emptySwap, type SwapState } from './SpellSwap';
import { useSpells } from './spells';

/** Clases del personaje que cambian conjuros tras un descanso largo (y tienen conjuros suyos). */
export function restSwapClasses(c: Character): string[] {
  return classEntries(c).map((e) => e.classId).filter((id) => { const r = spellSwapRules(id); return r.cantrip === 'rest' || r.spells?.when === 'rest'; });
}

/**
 * Tras un descanso largo: cambiar conjuros según cada clase (clérigo, druida y mago, todos los preparados; paladín y
 * explorador, uno; el mago, también un truco).
 */
export default function RestSpells({ c, data, onClose }: { c: Character; data: PlayerData; onClose: () => void }) {
  const spellIdx = useSpells();
  const d = derive(c, data);
  const maxLv = Math.max(d.slots.length, d.pact?.lv || 0);
  const classes = restSwapClasses(c);
  const [states, setStates] = useState<Record<string, SwapState>>(() => Object.fromEntries(classes.map((id) => [id, emptySwap()])));
  const parts = classes.map((id) => {
    const cls = data.classes.find((x) => x.id === id);
    const lv = classEntries(c).find((e) => e.classId === id)?.level || 0;
    const list = new Set([...(cls?.spells || []), ...spellIdx.list.filter((s) => s.classes?.includes(id)).map((s) => s.id)]);
    const known = c.spells.map((k) => spellIdx.get(k)).filter((x): x is NonNullable<typeof x> => !!x && list.has(x.id));
    const pool = spellIdx.list.filter((s) => list.has(s.id) && !c.spells.includes(s.id) && (s.l || 0) <= maxLv).sort((a, b) => (a.l || 0) - (b.l || 0) || a.n.localeCompare(b.n, 'es'));
    let prepared: number | null = null;
    for (const [l, v] of Object.entries(cls?.sc[id + '.max-prepared'] || {})) if (parseInt(l, 10) <= lv) prepared = Number(v) || null;
    return { id, cls, known, pool, prepared, rules: spellSwapRules(id) };
  }).filter((p) => p.known.length > 0);
  // sin conjuros que cambiar: se cierra sola
  useEffect(() => { if (spellIdx.loaded && !parts.length) onClose(); });
  if (!parts.length) return null;
  const apply = () => {
    let spells = c.spells;
    for (const p of parts) spells = applySwap(spells, states[p.id], p.known.filter((x) => !!x.l).map((x) => x.id));
    if (spells.join() !== c.spells.join()) usePlayer.getState().update(c.id, { spells });
    onClose();
  };
  return (
    <InfoDialog title="Conjuros tras el descanso largo" onClose={onClose}>
      <div className="lvl">
        {parts.map((p) => (
          <section key={p.id} className="lvl-step">
            <h3 className="eyebrow">{p.cls?.n}</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {p.rules.spells?.all ? 'Puedes cambiar cualquiera de tus conjuros preparados' + (p.id === 'wizard' ? ' por otros de tu libro de conjuros' : ' por otros de tu lista') : p.rules.spells ? 'Puedes cambiar un conjuro por otro de tu lista' : ''}
              {p.rules.cantrip === 'rest' ? (p.rules.spells ? ' y un truco por otro.' : 'Puedes cambiar un truco por otro.') : '.'}
            </p>
            <SpellSwap cls={p.cls} known={p.known} pool={p.pool} cantrip={p.rules.cantrip === 'rest'} spells={p.rules.spells?.when === 'rest' ? (p.rules.spells.all ? 'all' : 'one') : null} preparedMax={p.prepared} state={states[p.id]} setState={(s) => setStates({ ...states, [p.id]: s })} />
          </section>
        ))}
        <div className="lvl-actions">
          <button className="btn primary" onClick={apply}>Guardar cambios</button>
          <button className="btn ghost" onClick={onClose}>Sin cambios</button>
        </div>
      </div>
    </InfoDialog>
  );
}
