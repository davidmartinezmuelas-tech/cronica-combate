import { useEffect, useMemo } from 'react';
import type { Monster } from '../../data/types';
import { fmt } from '../../engine/dice';
import { rankBy } from '../../engine/search';
import { crNum, nfmt } from '../../engine/util';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store/useStore';

const CR_RANGES: Record<string, [number, number]> = { a: [0, 1], b: [2, 4], c: [5, 10], d: [11, 16], e: [17, 99] };

function Beast({ m }: { m: Monster }) {
  const isSel = useStore((s) => s.viewId === m.id);
  const qty = useStore((s) => s.qty[m.id] || 1);
  const confirmKey = useStore((s) => s.confirmKey);
  const { set, addMonster, editMonster, deleteCustom } = useStore.getState();
  const setQty = (v: number) => set({ qty: { ...useStore.getState().qty, [m.id]: Math.max(1, Math.min(20, v)) } });
  return (
    <li className={isSel ? 'beast on' : 'beast'}>
      <button className="beast-main" onClick={() => set({ viewId: m.id, spellOpen: null })} aria-pressed={isSel}>
        <span className="beast-name">
          {m.n}
          {m.custom && <span className="tag">Propio</span>}
          {m.lg && <span className="tag leg">Legendario</span>}
          {m.lair && <span className="tag lair">Guarida</span>}
        </span>
        <span style={{ fontSize: 13, color: '#b9a88a', fontStyle: 'italic' }}>{m.sz} {m.t} · VD {m.cr} · {nfmt(m.xp)} PX{m.en ? ' · ' + m.en : ''}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#cdbd9f' }}>CA {m.ac} · PG {m.hp} · Ini {fmt(m.ini || 0)}</span>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <button className="step" onClick={() => setQty(qty - 1)} aria-label={'Uno menos de ' + m.n}>−</button>
        <span className="qty" aria-label="Cantidad">{qty}</span>
        <button className="step" onClick={() => setQty(qty + 1)} aria-label={'Uno más de ' + m.n}>+</button>
        <button className="btn small primary" onClick={() => addMonster(m, qty)}>Al combate</button>
        {m.custom ? (
          <>
            <button className="btn small ghost" onClick={() => editMonster(m, true)}>Editar</button>
            <button className="btn small ghost" onClick={() => deleteCustom(m.id)}>{confirmKey === 'del-' + m.id ? '¿Seguro? Borrar' : 'Borrar'}</button>
          </>
        ) : (
          <button className="btn small ghost" title="Abrir en la Forja como base de una criatura nueva" onClick={() => editMonster(m, false)}>Variante</button>
        )}
      </div>
    </li>
  );
}

export default function BestiaryPanel() {
  const s = useStore(useShallow((st) => ({ srd: st.srd, custom: st.custom, search: st.search, fType: st.fType, fCr: st.fCr, fLeg: st.fLeg, fMine: st.fMine, bLimit: st.bLimit, loaded: st.loaded, loadError: st.loadError, types: st.types, hpMode: st.hpMode, shareInit: st.shareInit, addLair: st.addLair })));
  const { set, newForge } = useStore.getState();
  const pool = useMemo(() => {
    const r = CR_RANGES[s.fCr];
    const filtered = s.custom.concat(s.srd).filter((m) =>
      (!s.fType || m.t.split(' (')[0] === s.fType) &&
      (!r || (crNum(m.cr) >= r[0] && crNum(m.cr) <= r[1])) &&
      (!s.fLeg || !!m.lg) && (!s.fMine || !!m.custom));
    // «goblin» muestra antes al Goblin que al Capitán hobgoblin
    return rankBy(filtered, s.search, (m) => [m.n, m.en]);
  }, [s.custom, s.srd, s.search, s.fType, s.fCr, s.fLeg, s.fMine]);
  const shown = pool.slice(0, s.bLimit);
  // la ficha de la derecha sigue a la búsqueda: si la criatura abierta ya no está en la lista, se abre la primera
  useEffect(() => {
    const { viewId } = useStore.getState();
    if (pool.length && !pool.some((m) => m.id === viewId)) set({ viewId: pool[0].id, spellOpen: null });
  }, [pool, set]);
  const filtering = !!(s.search.trim() || s.fType || s.fCr !== 'all' || s.fLeg || s.fMine);
  return (
    <div className="panel bestiary-panel">
      <div className="panel-head"><h2>Bestiario</h2><span className="muted small">{s.custom.length + s.srd.length} criaturas</span></div>
      {!s.loaded && <p className="muted" style={{ margin: 0 }}>Cargando el bestiario…</p>}
      {s.loadError && <p className="warn">{s.loadError}</p>}
      <div className="field"><label htmlFor="search">Buscar (español o inglés)</label>
        <input id="search" className="input" type="search" value={s.search} onChange={(e) => set({ search: e.target.value, bLimit: 50 })} placeholder="Dragón, goblin, lich…" /></div>
      <div className="row2">
        <div className="field"><label htmlFor="ftype">Tipo</label>
          <select id="ftype" className="input" value={s.fType} onChange={(e) => set({ fType: e.target.value, bLimit: 50 })}>
            <option value="">Todos</option>
            {s.types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></div>
        <div className="field"><label htmlFor="fcr">Desafío</label>
          <select id="fcr" className="input" value={s.fCr} onChange={(e) => set({ fCr: e.target.value, bLimit: 50 })}>
            <option value="all">Todos</option><option value="a">VD 0 – 1</option><option value="b">VD 2 – 4</option><option value="c">VD 5 – 10</option><option value="d">VD 11 – 16</option><option value="e">VD 17+</option>
          </select></div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 14px' }}>
        <label className="check"><input type="checkbox" checked={s.fLeg} onChange={(e) => set({ fLeg: e.target.checked, bLimit: 50 })} />Legendarios</label>
        <label className="check"><input type="checkbox" checked={s.fMine} onChange={(e) => set({ fMine: e.target.checked, bLimit: 50 })} />Mis criaturas</label>
      </div>
      <details className="sub add-opts">
        <summary>
          <span className="eyebrow">Al añadir al combate</span>
          <span className="muted small">{[s.hpMode === 'avg' ? 'PG medios' : 'PG tirados', s.shareInit ? 'iniciativa por grupo' : 'iniciativa individual', s.addLair ? 'en su guarida' : ''].filter(Boolean).join(' · ')}</span>
        </summary>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="small" style={{ fontWeight: 700 }} id="hp-mode">Puntos de golpe</span>
          <div className="segbox" role="group" aria-labelledby="hp-mode">
            <button className={s.hpMode === 'avg' ? 'seg on' : 'seg'} aria-pressed={s.hpMode === 'avg'} onClick={() => set({ hpMode: 'avg' })}>Media</button>
            <button className={s.hpMode === 'roll' ? 'seg on' : 'seg'} aria-pressed={s.hpMode === 'roll'} onClick={() => set({ hpMode: 'roll' })}>Tirados</button>
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={s.shareInit} onChange={(e) => set({ shareInit: e.target.checked })} />Misma iniciativa para los del mismo grupo</label>
        <label className="check"><input type="checkbox" checked={s.addLair} onChange={(e) => set({ addLair: e.target.checked })} />Están en su guarida (si tienen)</label>
      </details>
      {s.loaded && filtering && pool.length > 0 && <p className="muted small" style={{ margin: 0 }} aria-live="polite">{pool.length === 1 ? '1 criatura' : pool.length + ' criaturas'}</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map((m) => <Beast key={m.id} m={m} />)}
      </ul>
      {pool.length > s.bLimit && <button className="btn" onClick={() => set({ bLimit: s.bLimit + 50 })}>Mostrar más ({pool.length - s.bLimit} restantes)</button>}
      {s.loaded && !pool.length && <p className="muted" style={{ margin: 0 }}>Ninguna criatura coincide con los filtros.</p>}
      <button className="btn gold" onClick={newForge}>Forjar un monstruo nuevo</button>
    </div>
  );
}

