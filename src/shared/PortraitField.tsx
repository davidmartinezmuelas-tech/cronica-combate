import { useRef, useState } from 'react';

/** Reduce la imagen a 256 px como mucho, en JPEG: unos 20-40 KB, cabe de sobra en el personaje. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * k));
  cv.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close();
  return cv.toDataURL('image/jpeg', 0.82);
}

/** Retrato opcional del personaje: elegir, cambiar o quitar la imagen (sale en la cabecera de la hoja). */
export default function PortraitField({ value, name, onChange }: { value?: string; name: string; onChange: (v: string | undefined) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  const pick = async (f?: File) => {
    if (!f) return;
    setErr('');
    try { onChange(await shrink(f)); } catch { setErr('No se pudo leer esa imagen.'); }
    if (file.current) file.current.value = '';
  };
  return (
    <div className="ce-portrait">
      {value && <img src={value} alt={'Retrato de ' + (name || 'personaje')} />}
      <span className="rollrow">
        <button type="button" className="btn small" onClick={() => file.current?.click()}>{value ? 'Cambiar retrato' : 'Añadir retrato'}</button>
        {value && <button type="button" className="btn small ghost" onClick={() => onChange(undefined)}>Quitar retrato</button>}
      </span>
      <input ref={file} type="file" accept="image/*" hidden aria-label="Imagen del retrato" onChange={(e) => void pick(e.target.files?.[0])} />
      {err && <span className="warn small" role="status">{err}</span>}
    </div>
  );
}
