import { useMemo, useState } from 'react';
import type { Monster } from '../../data/types';
import { BLOCK_FORMAT } from '../../engine/scriptBlocks';
import { norm } from '../../engine/util';
import { InfoDialog } from '../../shared/Card';
import { useStore } from '../../store/useStore';

interface Row { m: Monster; qty: number }

/** El texto del bloque «encuentro» tal como lo lee la app (sin tener que conocer su estructura). */
export function encounterBlock(name: string, lair: boolean, rows: Row[]): string {
  return ['```encuentro', 'formato: ' + BLOCK_FORMAT, 'nombre: ' + name.trim(), 'guarida: ' + (lair ? 'sí' : 'no'), ...rows.map((r) => '- ' + r.qty + ' x ' + r.m.n), '```'].join('\n');
}

/** Formulario para crear un encuentro dentro del guion: elige nombre y criaturas y se escribe el bloque en el punto del texto donde esté el cursor. */
export default function EncounterInsert({ onInsert, onClose }: { onInsert: (block: string) => void; onClose: () => void }) {
  const custom = useStore((s) => s.custom);
  const book = useStore((s) => s.book);
  const srd = useStore((s) => s.srd);
  const encounters = useStore((s) => s.encounters);
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [lair, setLair] = useState(false);
  const all = useMemo(() => [...custom, ...book, ...srd], [custom, book, srd]);
  const hits = useMemo(() => {
    const k = norm(q.trim());
    if (!k) return [];
    return all.filter((m) => norm(m.n).includes(k) || (!!m.en && norm(m.en).includes(k))).slice(0, 8);
  }, [q, all]);
  const add = (m: Monster) => { setRows((r) => (r.some((x) => x.m.id === m.id) ? r.map((x) => (x.m.id === m.id ? { ...x, qty: Math.min(20, x.qty + 1) } : x)) : r.concat([{ m, qty: 1 }]))); setQ(''); };
  const setQty = (id: string, d: number) => setRows((r) => r.map((x) => (x.m.id === id ? { ...x, qty: Math.max(1, Math.min(20, x.qty + d)) } : x)));
  const hasLair = rows.some((r) => r.m.lair);
  const dup = name.trim() && encounters.some((e) => norm(e.name) === norm(name));
  const ready = !!name.trim() && rows.length > 0;
  return (
    <InfoDialog title="Añadir encuentro al guion" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>Se escribe un bloque de encuentro en el punto del texto donde tenías el cursor, y se guarda el encuentro: así el botón de combate aparece justo ahí.</p>
      <div className="field"><label htmlFor="ei-name">Nombre del encuentro</label>
        <input id="ei-name" className="input" value={name} placeholder="Emboscada en el puente" onChange={(e) => setName(e.target.value)} autoFocus /></div>
      {dup && <p className="warn small" style={{ margin: 0 }}>Ya tienes un encuentro con ese nombre: se actualizará.</p>}
      <div className="field"><label htmlFor="ei-q">Añadir criatura</label>
        <input id="ei-q" className="input" value={q} placeholder="Busca por nombre (español o inglés)" onChange={(e) => setQ(e.target.value)} /></div>
      {hits.length > 0 && (
        <ul className="rem" aria-label="Criaturas encontradas">
          {hits.map((m) => <li key={m.id}><span style={{ flex: 1 }}><strong>{m.n}</strong> <span className="muted small">VD {m.cr}{m.custom ? ' · propia' : ''}</span></span><button className="btn small" onClick={() => add(m)} aria-label={'Añadir ' + m.n}>Añadir</button></li>)}
        </ul>
      )}
      {q.trim() && !hits.length && <p className="muted small" style={{ margin: 0 }}>No hay criaturas con ese nombre. Puedes crearla antes en Forja.</p>}
      {rows.length > 0 && (
        <ul className="rem" aria-label="Criaturas del encuentro">
          {rows.map((r) => (
            <li key={r.m.id}>
              <span style={{ flex: 1 }}><strong>{r.m.n}</strong></span>
              <button className="btn small ghost" aria-label={'Una menos de ' + r.m.n} onClick={() => setQty(r.m.id, -1)}>−</button>
              <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 700 }}>{r.qty}</span>
              <button className="btn small ghost" aria-label={'Una más de ' + r.m.n} onClick={() => setQty(r.m.id, 1)}>+</button>
              <button className="btn small ghost danger" aria-label={'Quitar ' + r.m.n} onClick={() => setRows(rows.filter((x) => x.m.id !== r.m.id))}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
      {hasLair && <label className="check"><input type="checkbox" checked={lair} onChange={(e) => setLair(e.target.checked)} />Con acciones de guarida</label>}
      <div className="rollrow">
        <button className="btn small primary" disabled={!ready} onClick={() => { onInsert(encounterBlock(name, lair && hasLair, rows)); onClose(); }}>Insertar en el guion</button>
        <button className="btn small ghost" onClick={onClose}>Cancelar</button>
      </div>
    </InfoDialog>
  );
}
