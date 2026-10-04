import { CONDITIONS, DMG_TYPES } from '../data/constants';
import type { Combatant } from '../data/types';
import { useStore } from '../store/useStore';
import { Pips } from './StatBlock';

export default function CombatantCard({ c }: { c: Combatant }) {
  const m = useStore((s) => s.monById(c.monsterId));
  const amount = useStore((s) => s.amount);
  const dmgType = useStore((s) => s.dmgType);
  const condRounds = useStore((s) => s.condRounds);
  const confirmKey = useStore((s) => s.confirmKey);
  const initDraft = useStore((s) => s.initDraft);
  const { set, patchC, applyParts, heal, giveTemp, removeCombatant, confirm, toggleCond, deathMark, rollDeath } = useStore.getState();
  const amt = parseInt(amount, 10);
  const defs: string[] = [];
  if (m) {
    if (m.res.length) defs.push('Resiste ' + m.res.join(', '));
    if (m.imm.length) defs.push('Inmune a ' + m.imm.join(', '));
    if (m.vul.length) defs.push('Vulnerable a ' + m.vul.join(', '));
  } else if (c.res?.length) defs.push('Resiste ' + c.res.join(', '));
  const doDamage = () => { if (amt > 0) applyParts({ [c.id]: 'full' }, [{ amt, type: dmgType }]); };
  const initVal = initDraft && initDraft.id === c.id ? initDraft.text : c.init == null ? '' : String(c.init);
  const d = c.death || { s: 0, f: 0 };
  const kindLabel = c.kind === 'pc' ? 'Jugador' + (c.level ? ' · nivel ' + c.level : '') : c.kind === 'lair' ? 'Actúa en la cuenta de iniciativa 20 y pierde los empates' : m ? m.n + ' · VD ' + m.cr + (c.inLair ? ' · en su guarida' : '') : 'Monstruo (hoja no disponible)';

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2>{c.name}</h2>
          <span className="muted">{kindLabel}</span>
        </div>
        <button className="btn small ghost" onClick={() => confirm('rm-' + c.id, () => removeCombatant(c.id))}>{confirmKey === 'rm-' + c.id ? '¿Seguro? Pulsa otra vez' : 'Quitar del combate'}</button>
      </div>

      {c.kind === 'lair' ? (
        <div className="field"><label htmlFor="lair-note">Acciones de guarida (cópialas de tu manual o invéntalas)</label>
          <textarea id="lair-note" className="input" rows={5} value={c.note || ''} onChange={(e) => patchC(c.id, { note: e.target.value }, 'notas de guarida')} /></div>
      ) : (
        <>
          <div className="row3">
            <div className="stat"><span className="stat-k">Puntos de golpe</span><span className="stat-v">{c.hp}<span className="stat-of"> / {c.maxHp}</span></span>{c.temp > 0 && <span className="stat-tmp">+{c.temp} temporales</span>}</div>
            <div className="stat"><span className="stat-k">Clase de armadura</span><span className="stat-v">{c.ac}</span></div>
            <div className="stat"><label className="stat-k" htmlFor="sel-init">Iniciativa</label>
              <input id="sel-init" type="text" inputMode="numeric" className="input stat-input" value={initVal}
                onChange={(e) => {
                  const t = e.target.value.replace(/[^0-9−-]/g, '').replace('−', '-');
                  set({ initDraft: { id: c.id, text: t } });
                  const v = parseInt(t, 10);
                  if (!isNaN(v)) patchC(c.id, { init: v }, 'iniciativa');
                  else if (t === '') patchC(c.id, { init: null }, 'iniciativa');
                }}
                onBlur={() => set({ initDraft: null })} /></div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
            <div className="field" style={{ width: 100 }}><label htmlFor="amt">Cantidad</label>
              <input id="amt" type="number" min={0} className="input" value={amount} onChange={(e) => set({ amount: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') doDamage(); }} /></div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}><label htmlFor="dtype">Tipo de daño</label>
              <select id="dtype" className="input" value={dmgType} onChange={(e) => set({ dmgType: e.target.value })}>
                <option value="">sin tipo</option>
                {DMG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="btn primary" style={{ flex: 1 }} onClick={doDamage}>Daño</button>
            <button className="btn heal" style={{ flex: 1 }} onClick={() => amt > 0 && heal(c.id, amt)}>Curación</button>
            <button className="btn temp" style={{ flex: 1 }} onClick={() => amt > 0 && giveTemp(c.id, amt)}>PG temporales</button>
          </div>
          {defs.length > 0 && <p className="def-note">{defs.join(' · ')}. El daño se ajusta solo según el tipo.</p>}

          {c.kind === 'pc' && c.hp === 0 && !c.dead && (
            <div className="sub" style={{ borderColor: '#c0513c' }}>
              <div className="panel-head"><strong style={{ color: '#f3e6c8' }}>Salvaciones de muerte</strong>{c.stable && <span className="tag">Estable</span>}</div>
              <div className="res-row">
                <span className="res">Éxitos <span className="pips">{[0, 1, 2].map((j) => <span key={j} className={j < d.s ? 'pip ok' : 'pip off'} />)}</span></span>
                <span className="res">Fallos <span className="pips">{[0, 1, 2].map((j) => <span key={j} className={j < d.f ? 'pip bad' : 'pip off'} />)}</span></span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn small gold" onClick={() => rollDeath(c.id)}>Tirar salvación</button>
                <button className="btn small" onClick={() => deathMark(c.id, 's')}>+ Éxito</button>
                <button className="btn small" onClick={() => deathMark(c.id, 'f')}>+ Fallo</button>
                <button className="btn small ghost" onClick={() => patchC(c.id, { stable: true }, 'estabilizar')}>Estabilizar</button>
              </div>
            </div>
          )}
          {c.dead && (
            <div className="sub" style={{ borderColor: '#c0513c', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ color: '#f0a090' }}>Muerto</strong>
              <button className="btn small ghost" onClick={() => patchC(c.id, { dead: false, death: { s: 0, f: 0 } }, 'revivir')}>Deshacer</button>
            </div>
          )}

          <div className="res-row">
            <button className={c.react ? 'chip on' : 'chip'} aria-pressed={c.react} onClick={() => patchC(c.id, { react: !c.react }, 'reacción')}>Reacción usada</button>
            <button className={c.conc ? 'chip on' : 'chip'} aria-pressed={c.conc} onClick={() => patchC(c.id, { conc: !c.conc }, 'concentración')}>Concentrando</button>
            <span className="res">Agotamiento
              <span className="stepper">
                <button className="step" aria-label="Reducir agotamiento" onClick={() => patchC(c.id, { exh: Math.max(0, c.exh - 1) }, 'agotamiento')}>−</button>
                <span className="qty" aria-live="polite">{c.exh}</span>
                <button className="step" aria-label="Aumentar agotamiento" onClick={() => patchC(c.id, { exh: Math.min(6, c.exh + 1) }, 'agotamiento')}>+</button>
              </span>
            </span>
          </div>
          {c.lrMax > 0 && <div className="res-row"><span className="res">Resistencia legendaria ({c.lrMax - c.lrUsed}/{c.lrMax})<Pips max={c.lrMax} used={c.lrUsed} label="Resistencia legendaria" onSet={(v) => patchC(c.id, { lrUsed: Math.max(0, Math.min(c.lrMax, v)) }, 'resistencia legendaria')} /></span></div>}
          {c.laMax > 0 && <div className="res-row"><span className="res">Acciones legendarias ({c.laMax - c.laUsed}/{c.laMax})<Pips max={c.laMax} used={c.laUsed} label="Acciones legendarias" onSet={(v) => patchC(c.id, { laUsed: Math.max(0, Math.min(c.laMax, v)) }, 'acción legendaria')} /></span></div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="eyebrow">Estados</span>
              <label className="small muted" htmlFor="crounds" style={{ marginLeft: 'auto' }}>Duración al añadir (rondas)</label>
              <input id="crounds" type="number" min={0} className="input" value={condRounds} onChange={(e) => set({ condRounds: e.target.value })} placeholder="∞" style={{ width: 70, minHeight: 34, padding: '4px 8px' }} />
            </div>
            <div className="chips" role="group" aria-label="Estados">
              {CONDITIONS.map(([k]) => {
                const cd = c.conds.find((x) => x.k === k);
                return <button key={k} className={cd ? 'chip on' : 'chip'} aria-pressed={!!cd} onClick={() => toggleCond(c.id, k)}>{k}{cd && cd.r != null && <span className="chip-tag">{cd.r}</span>}</button>;
              })}
            </div>
            {c.conds.length > 0 && (
              <ul className="rem">
                {c.conds.map((cd) => <li key={cd.k}><span><strong>{cd.k}:</strong> {CONDITIONS.find((x) => x[0] === cd.k)?.[1]}</span></li>)}
              </ul>
            )}
            {(c.conds.length > 0 || c.exh > 0) && c.kind === 'monster' && <p className="muted small" style={{ margin: 0 }}>Las tiradas de esta criatura ya aplican sus estados y su agotamiento.</p>}
          </div>
        </>
      )}
    </div>
  );
}
