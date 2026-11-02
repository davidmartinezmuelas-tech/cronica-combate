import { useId, useMemo, useState } from 'react';
import { norm } from '../engine/util';

/**
 * Campo de texto con lista desplegable de sugerencias: se elige de la lista o se escribe lo que se quiera.
 * La lista es propia (con barra de desplazamiento) y se coloca bajo el campo.
 */
export default function Combo({ value, onChange, options, placeholder, label, onCommit, clearOnPick = false }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; label: string; onCommit?: (v: string) => void; clearOnPick?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const q = norm(value);
  const shown = useMemo(() => options.filter((o) => !q || norm(o).includes(q)).slice(0, 300), [options, q]);
  const pick = (v: string) => { setOpen(false); if (clearOnPick) { onChange(''); onCommit?.(v); } else { onChange(v); onCommit?.(v); } };
  return (
    <span className="combo">
      <input className="input" role="combobox" aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-label={label} value={value} placeholder={placeholder} autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && onCommit && value.trim()) { e.preventDefault(); pick(shown.find((o) => norm(o) === q) ?? value.trim()); }
        }} />
      {open && shown.length > 0 && (
        <ul className="combo-list" id={id} role="listbox">
          {shown.map((o) => <li key={o} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); pick(o); }}>{o}</li>)}
        </ul>
      )}
    </span>
  );
}

/** Lista de cosas separadas por comas (herramientas, idiomas): cada una es una etiqueta que se quita, y se añade del desplegable o escribiendo. */
export function TagPicker({ value, onChange, options, label, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; label: string; placeholder?: string }) {
  const [text, setText] = useState('');
  const tags = value.split(',').map((t) => t.trim()).filter(Boolean);
  const add = (t: string) => { const v = t.trim(); if (v && !tags.some((x) => norm(x) === norm(v))) onChange([...tags, v].join(', ')); };
  return (
    <span className="tagpick">
      {tags.map((t) => (
        <span key={t} className="chip-tag tagpick-t">{t}<button type="button" aria-label={'Quitar ' + t} onClick={() => onChange(tags.filter((x) => x !== t).join(', '))}>×</button></span>
      ))}
      <Combo value={text} onChange={setText} options={options.filter((o) => !tags.some((x) => norm(x) === norm(o)))} label={label} placeholder={tags.length ? 'Añadir…' : placeholder} onCommit={add} clearOnPick />
    </span>
  );
}
