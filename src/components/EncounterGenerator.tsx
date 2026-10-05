import { useMemo, useState } from 'react';
import { DIFF_NAMES, partyBudget, proposeEncounter, targetRange, type DiffLevel, type Proposal } from '../engine/encounter';
import { nfmt } from '../engine/util';
import { useStore } from '../store/useStore';

/** Propone monstruos del bestiario para la dificultad elegida, según el nivel de los jugadores. */
export default function EncounterGenerator() {
  const srd = useStore((s) => s.srd);
  const custom = useStore((s) => s.custom);
  const types = useStore((s) => s.types);
  const roster = useStore((s) => s.roster);
  const combatants = useStore((s) => s.combatants);
  const [diff, setDiff] = useState<DiffLevel>(1);
  const [hab, setHab] = useState('');
  const [type, setType] = useState('');
  const [prop, setProp] = useState<Proposal | null>(null);
  const [msg, setMsg] = useState('');

  // los jugadores ya en el encuentro; si no hay, todo el grupo guardado
  const inCombat = combatants.filter((c) => c.kind === 'pc');
  const levels = inCombat.length ? inCombat.map((c) => c.level || 1) : roster.map((r) => parseInt(r.level, 10) || 1);
  const habitats = useMemo(() => Array.from(new Set(srd.flatMap((m) => m.hab || []))).sort((a, b) => a.localeCompare(b, 'es')), [srd]);
  const budget = partyBudget(levels);
  const range = targetRange(budget, diff);

  const propose = () => {
    const pool = custom.concat(srd).filter((m) => (!hab || (m.hab || []).includes(hab)) && (!type || m.t.split(' (')[0] === type));
    const p = proposeEncounter(pool, range);
    setProp(p);
    setMsg(p ? '' : 'Nada del bestiario con esos filtros encaja en ' + nfmt(range[0]) + '–' + nfmt(range[1]) + ' PX. Prueba sin hábitat o sin tipo.');
  };
  const add = () => {
    if (!prop) return;
    const st = useStore.getState();
    st.snap('generar encuentro');
    prop.picks.forEach((p) => st.addMonster(p.m, p.n, { silent: true, inLair: false }));
    st.showToast('Encuentro añadido: ' + prop.picks.map((p) => p.n + ' × ' + p.m.n).join(', '));
    setProp(null);
  };

  return (
    <section className="gen" aria-label="Generador de encuentro">
      <div className="panel-head">
        <span className="eyebrow">Generador de encuentro</span>
        <span className="muted small">{levels.length ? levels.length + ' PJ (niv. ' + levels.join(', ') + ')' : 'sin jugadores'}</span>
      </div>
      {!levels.length ? (
        <p className="muted small" style={{ margin: 0 }}>Guarda a tus jugadores en Grupo (con su nivel) para que proponga monstruos a su medida.</p>
      ) : (
        <>
          <div className="gen-controls">
            <div className="segbox" role="group" aria-label="Dificultad">
              {DIFF_NAMES.map((n, i) => (
                <button key={n} className={diff === i ? 'seg on' : 'seg'} aria-pressed={diff === i} onClick={() => { setDiff(i as DiffLevel); setProp(null); }}>{n}</button>
              ))}
            </div>
            <select className="input" aria-label="Hábitat" value={hab} onChange={(e) => setHab(e.target.value)}>
              <option value="">Cualquier hábitat</option>
              {habitats.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <select className="input" aria-label="Tipo de criatura" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Cualquier tipo</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="btn small gold" onClick={propose}>{prop ? 'Otra propuesta' : 'Proponer'}</button>
          </div>
          <span className="muted small">{DIFF_NAMES[diff]}: entre {nfmt(range[0])} y {nfmt(range[1])} PX de monstruos.</span>
          {msg && <p className="warn small" role="status" style={{ margin: 0 }}>{msg}</p>}
          {prop && (
            <div className="gen-result" role="status">
              <div className="panel-head"><strong>{prop.style}</strong><span className="muted small">{nfmt(prop.xp)} PX</span></div>
              <ul>
                {prop.picks.map((p) => (
                  <li key={p.m.id}>
                    <button className="gen-link" title="Ver su hoja en el Bestiario" onClick={() => useStore.getState().set({ tab: 'bestiary', viewId: p.m.id, search: p.m.n })}>{p.n} × {p.m.n}</button>
                    <span className="muted small"> · VD {p.m.cr} · {nfmt(p.m.xp)} PX{p.n > 1 ? ' c/u' : ''}</span>
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn small primary" onClick={add}>Añadir al encuentro</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
