import { useEffect, useMemo, useRef, useState } from 'react';
import type { Character } from '../../engine/character';
import { gearCatalog } from '../../engine/gearCatalog';
import Combo from '../../shared/Combo';
import { usePlayer } from '../../store/player';
import { useStore } from '../../store/useStore';

const COINS = [
  { k: 'cp', short: 'PC', name: 'cobre' },
  { k: 'sp', short: 'PP', name: 'plata' },
  { k: 'ep', short: 'PE', name: 'electro' },
  { k: 'gp', short: 'PO', name: 'oro' },
  { k: 'pp', short: 'PT', name: 'platino' },
] as const;
const PERSONA = [
  { k: 'traits', n: 'Rasgos de personalidad' },
  { k: 'ideals', n: 'Ideales' },
  { k: 'bonds', n: 'Vínculos' },
  { k: 'flaws', n: 'Defectos' },
  { k: 'look', n: 'Aspecto' },
] as const;

/** Reduce la imagen a un cuadrado-ish de 256 px como mucho, en JPEG: unos 20-40 KB, cabe de sobra en el personaje. */
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

/**
 * Retrato, dinero, equipo y personalidad. Todo opcional: sin retrato no hay imagen, y quien mira la hoja de otro
 * (readOnly) solo ve lo que esté escrito.
 */
export default function CharacterBioCard({ c, set, readOnly = false }: { c: Character; set: (patch: Partial<Character>) => void; readOnly?: boolean }) {
  const file = useRef<HTMLInputElement>(null);
  const rules = useStore((s) => s.rules);
  const data = usePlayer((s) => s.data);
  useEffect(() => { if (!readOnly) void useStore.getState().loadRules(); }, [readOnly]);
  // sugerencias del manual al escribir; lo que no esté ahí se escribe a mano y vale igual
  const catalog = useMemo(() => (rules ? gearCatalog(rules, data?.weapons, data?.armor) : []), [rules, data]);
  const [err, setErr] = useState('');
  const money = c.money || {};
  const gear = c.gear || [];
  const persona = c.persona || {};
  const hasMoney = COINS.some((x) => (money[x.k] || 0) > 0);
  const hasPersona = PERSONA.some((x) => (persona[x.k] || '').trim());
  const hasGear = gear.some((g) => g.n.trim());
  if (readOnly && !c.portrait && !hasMoney && !hasPersona && !hasGear) return null;

  const pick = async (f?: File) => {
    if (!f) return;
    setErr('');
    try { set({ portrait: await shrink(f) }); } catch { setErr('No se pudo leer esa imagen.'); }
    if (file.current) file.current.value = '';
  };
  const setGear = (list: { n: string; q: number }[]) => set({ gear: list });

  return (
    <section className="panel pc-bio" aria-label="Personaje y equipo" data-sec="rasgos">
      <div className="panel-head">
        <h3 className="eyebrow">Personaje y equipo</h3>
        {!readOnly && !c.portrait && <button className="btn small ghost" onClick={() => file.current?.click()}>Añadir retrato</button>}
      </div>
      {!readOnly && <input ref={file} type="file" accept="image/*" hidden aria-label="Imagen del retrato" onChange={(e) => void pick(e.target.files?.[0])} />}
      {err && <p className="warn small" role="status" style={{ margin: 0 }}>{err}</p>}
      {c.portrait && (
        <div className="pc-bio-portrait">
          <img src={c.portrait} alt={'Retrato de ' + (c.name || 'personaje')} />
          {!readOnly && (
            <span className="rollrow">
              <button className="btn small ghost" onClick={() => file.current?.click()}>Cambiar</button>
              <button className="btn small ghost" onClick={() => set({ portrait: undefined })}>Quitar</button>
            </span>
          )}
        </div>
      )}
      {(!readOnly || hasMoney) && (
        <div className="pc-bio-money" role="group" aria-label="Dinero">
          {COINS.map((x) => (
            <label key={x.k} title={'Monedas de ' + x.name}>
              <span>{x.short}</span>
              {readOnly ? <b>{money[x.k] || 0}</b> : (
                <input className="input" type="number" min={0} inputMode="numeric" aria-label={'Monedas de ' + x.name} value={money[x.k] ?? ''} placeholder="0"
                  onChange={(e) => set({ money: { ...money, [x.k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) } })} />
              )}
            </label>
          ))}
        </div>
      )}
      {(!readOnly || hasGear) && (
        <div className="pc-bio-gear">
          <span className="eyebrow">Equipo</span>
          {readOnly ? (
            <ul>{gear.filter((g) => g.n.trim()).map((g, i) => <li key={i}>{g.n}{g.q > 1 ? ' ×' + g.q : ''}</li>)}</ul>
          ) : (
            <>
              {gear.map((g, i) => (
                <div key={i} className="pc-bio-row">
                  <Combo label={'Nombre del objeto ' + (i + 1)} value={g.n} options={catalog} placeholder="Del manual o escrito por ti" onChange={(v) => setGear(gear.map((x, j) => (j === i ? { ...x, n: v } : x)))} />
                  <input className="input" type="number" min={1} inputMode="numeric" aria-label={'Cantidad del objeto ' + (i + 1)} value={g.q} onChange={(e) => setGear(gear.map((x, j) => (j === i ? { ...x, q: Math.max(1, Math.floor(Number(e.target.value) || 1)) } : x)))} />
                  <button className="btn small ghost" aria-label={'Quitar objeto ' + (i + 1)} onClick={() => setGear(gear.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <button className="btn small ghost" onClick={() => setGear([...gear, { n: '', q: 1 }])}>+ Objeto</button>
            </>
          )}
        </div>
      )}
      {(!readOnly || hasPersona) && (
        <details className="pc-bio-persona" open={hasPersona || undefined}>
          <summary className="eyebrow">Personalidad</summary>
          {PERSONA.filter((x) => !readOnly || (persona[x.k] || '').trim()).map((x) => (
            <div key={x.k} className="field">
              <label htmlFor={'pc-bio-' + x.k}>{x.n}</label>
              {readOnly ? <p className="pc-text">{persona[x.k]}</p> : (
                <textarea id={'pc-bio-' + x.k} className="input" rows={2} value={persona[x.k] || ''} onChange={(e) => set({ persona: { ...persona, [x.k]: e.target.value } })} />
              )}
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
