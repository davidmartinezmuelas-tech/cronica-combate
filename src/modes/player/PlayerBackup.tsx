import { useRef, useState } from 'react';
import { useLibrary } from '../../store/library';
import { activeCharacter, lastBackup, usePlayer } from '../../store/player';

/**
 * Copia de seguridad de personajes: guardar todos (con la biblioteca si se marca: no va a la nube), exportar el activo
 * o cargar una copia. Está al final de la hoja y en Ajustes.
 */
export default function PlayerBackup() {
  const characters = usePlayer((s) => s.characters);
  const active = usePlayer(activeCharacter);
  const lib = useLibrary();
  const libTotal = lib.feats.length + lib.backgrounds.length + lib.spells.length + lib.subclasses.length;
  const [withLib, setWithLib] = useState(true);
  const [note, setNote] = useState('');
  const [last, setLast] = useState(lastBackup());
  const backupRef = useRef<HTMLInputElement>(null);

  const download = (text: string, name: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'personaje';
  const backupAll = () => {
    const file = JSON.parse(usePlayer.getState().exportText());
    if (withLib && libTotal > 0) file.biblioteca = JSON.parse(lib.exportText());
    download(JSON.stringify(file), 'personajes-cronica-' + new Date().toISOString().slice(0, 10) + '.json');
    setLast(lastBackup());
    setNote('Copia guardada con ' + characters.length + (characters.length === 1 ? ' personaje' : ' personajes') + (withLib && libTotal > 0 ? ' y tu biblioteca.' : '.'));
  };
  const exportOne = () => {
    if (!active) return;
    download(usePlayer.getState().exportText([active.id]), slug(active.name) + '-cronica.json');
    setNote((active.name || 'El personaje') + ' exportado: se carga con «Cargar copia» en otro dispositivo.');
  };
  const loadBackup = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    let libMsg = '';
    try { const b = JSON.parse(text)?.biblioteca; if (b) libMsg = ' ' + await useLibrary.getState().importText(JSON.stringify(b)); } catch { /* el aviso lo da la copia de personajes */ }
    setNote((await usePlayer.getState().importText(text)) + libMsg);
    if (backupRef.current) backupRef.current.value = '';
  };

  return (
    <>
      <div className="rollrow">
        <button className="btn small" disabled={!characters.length} onClick={backupAll} title={'Descarga todos tus personajes en un archivo' + (withLib && libTotal > 0 ? ' con tu biblioteca' : '')}>Guardar copia</button>
        {active && <button className="btn small" onClick={exportOne} aria-label={'Exportar ' + (active.name || 'personaje')} title={'Descarga solo a ' + (active.name || 'este personaje')}>Exportar personaje</button>}
        <button className="btn small" onClick={() => backupRef.current?.click()}>Cargar copia</button>
        {characters.length > 0 && <span className="muted small">{last ? 'Última copia: ' + new Date(last).toLocaleDateString('es-ES') + '.' : 'Aún no tienes copia: guarda una copia de vez en cuando.'}</span>}
      </div>
      {libTotal > 0 && <label className="check small"><input type="checkbox" checked={withLib} onChange={(e) => setWithLib(e.target.checked)} />Incluir mi biblioteca ({lib.subclasses.length} subclases, {lib.feats.length} dotes, {lib.backgrounds.length} trasfondos, {lib.spells.length} conjuros): no va a la nube; pásala solo a quien tenga el libro</label>}
      {note && <p className="muted small" role="status" style={{ margin: 0 }}>{note}</p>}
      <input ref={backupRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Copia de personajes" onChange={(e) => void loadBackup(e.target.files?.[0])} />
    </>
  );
}
