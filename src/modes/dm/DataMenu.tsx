import { useRef, useState } from 'react';
import { InfoDialog } from '../../shared/Card';
import { useStore } from '../../store/useStore';

/**
 * Botón «Copia» del encabezado: la copia de seguridad guarda todo (grupo, criaturas, encuentros, combate),
 * así que se alcanza desde cualquier pestaña y no solo desde Grupo.
 */
export default function DataMenu() {
  const [open, setOpen] = useState(false);
  const ioMsg = useStore((s) => s.ioMsg);
  const storageOk = useStore((s) => s.storageOk);
  const persistent = useStore((s) => s.persistent);
  const bookCount = useStore((s) => s.book.length);
  const { set, exportData, importText } = useStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [withBook, setWithBook] = useState(true);

  const doExport = async () => {
    set({ ioMsg: 'Preparando la copia…' });
    const blob = new Blob([await exportData({ book: withBook && bookCount > 0 })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cronica-combate-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    set({ ioMsg: 'Copia descargada. Guárdala donde quieras (Drive, USB…).' });
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 300 * 1024 * 1024) { set({ ioMsg: 'El archivo es demasiado grande para ser una copia de la app.' }); return; }
    set({ ioMsg: 'Cargando la copia…' });
    await importText(await f.text());
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <button className="btn small" aria-haspopup="dialog" title="Descargar o cargar una copia de seguridad" onClick={() => { set({ ioMsg: '' }); setOpen(true); }}>Copia</button>
      {open && (
        <InfoDialog title="Copia de seguridad" onClose={() => setOpen(false)}>
          <p className="muted small" style={{ margin: 0 }}>
            {storageOk
              ? 'Tu grupo, tus criaturas y el combate en curso se guardan solos en este dispositivo' + (persistent ? ' (protegidos frente a limpiezas automáticas del navegador).' : '. El navegador podría borrarlos si se queda sin espacio: haz copias de vez en cuando.')
              : 'Este navegador no permite guardar datos (¿modo privado?). Descarga una copia antes de cerrar.'}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
            <button className="btn small primary" onClick={() => void doExport()}>Descargar copia</button>
            <button className="btn small" onClick={() => fileRef.current?.click()}>Cargar copia…</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Archivo de copia" onChange={(e) => void doImport(e.target.files?.[0])} />
          </div>
          {bookCount > 0 && <label className="check"><input type="checkbox" checked={withBook} onChange={(e) => setWithBook(e.target.checked)} />Incluir las {bookCount} criaturas de mi Manual de Monstruos (con lo revisado)</label>}
          <p className="muted small" style={{ margin: '6px 0 0' }}>La copia incluye grupo (con sus hojas en PDF), criaturas propias, encuentros y el combate abierto{bookCount > 0 ? ', y si lo marcas, las criaturas de tu Manual (pásala solo a quien tenga el libro)' : ''}. Al cargarla se fusiona con lo que ya tienes: así se pasan criaturas o encuentros de un dispositivo o de otro máster.</p>
          {ioMsg && <p className="small" role="status" style={{ margin: '6px 0 0', color: '#e8c062' }}>{ioMsg}</p>}
        </InfoDialog>
      )}
    </>
  );
}
