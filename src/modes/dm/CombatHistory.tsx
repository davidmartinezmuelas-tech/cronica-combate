import { useState } from 'react';
import type { HistKind } from '../../data/types';
import { HIST_KINDS, HIST_LABELS, historyText } from '../../engine/history';
import { useStore } from '../../store/useStore';

/** Historial del combate en curso: lo último arriba, con filtros por tipo, copiar al portapapeles y vaciar. */
export default function CombatHistory() {
  const history = useStore((s) => s.history);
  const confirmKey = useStore((s) => s.confirmKey);
  const { clearHistory, confirm, showToast } = useStore.getState();
  const [kinds, setKinds] = useState<HistKind[]>([]); // vacío = todos
  const shown = (kinds.length ? history.filter((e) => kinds.includes(e.k)) : history).slice().reverse();
  const toggle = (k: HistKind) => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : kinds.concat([k]));
  const copy = async () => {
    const text = historyText(history, kinds);
    try { await navigator.clipboard.writeText(text); showToast('Historial copiado'); } catch { showToast('No se pudo copiar: selecciona el texto a mano'); }
  };
  if (!history.length) return <p className="muted small" style={{ margin: 0 }}>Aquí se irá anotando el combate: daño, curaciones, estados, caídas y turnos.</p>;
  return (
    <>
      <div className="chips" role="group" aria-label="Filtrar el historial">
        {HIST_KINDS.map((k) => <button key={k} className={kinds.includes(k) ? 'chip resist' : 'chip'} aria-pressed={kinds.includes(k)} onClick={() => toggle(k)}>{HIST_LABELS[k]}</button>)}
      </div>
      <ol className="hist-list" aria-label="Historial del combate">
        {shown.map((e, i) => <li key={history.length - i} className={'hist-' + e.k}><span className="hist-r">R{e.r}</span><span>{e.text}</span></li>)}
        {!shown.length && <li className="muted small">Nada con ese filtro.</li>}
      </ol>
      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={() => void copy()}>Copiar</button>
        <button className="btn small ghost danger" onClick={() => confirm('hist', clearHistory)}>{confirmKey === 'hist' ? '¿Seguro? Vaciar' : 'Vaciar historial'}</button>
      </span>
    </>
  );
}
