import type { PlayerData } from '../../data/player';
import type { Character } from '../../engine/character';
import { activeChoices, choiceCount, choiceOptions, subclassText, type ChoiceDef, type ChoiceOption } from '../../engine/subclassChoices';
import Picker from '../../shared/Picker';
import type { LibraryData } from '../../store/library';

/** Nombre visible de una opción (en las habilidades `n` es la clave y `d` el nombre). */
const shown = (def: ChoiceDef, o: ChoiceOption) => ('skills' in def.from ? o.d : o.n);

export interface ResolvedChoice { def: ChoiceDef; n: number; options: ChoiceOption[]; picked: string[] }

/** Elecciones de la subclase del personaje con sus opciones y lo elegido (como mucho las que le tocan). */
export function resolveChoices(c: Character, data: PlayerData | null, lib: LibraryData): ResolvedChoice[] {
  const cls = data?.classes.find((x) => x.id === c.classId);
  const src = subclassText(c, cls, lib.subclasses);
  return activeChoices(c).map((def) => {
    const n = choiceCount(def, c.level);
    return { def, n, options: choiceOptions(def, src, data, cls), picked: (c.choices?.[def.id] || []).slice(0, n) };
  });
}

/** Filas para «Rasgos y dotes» de la hoja: cada opción elegida con su texto. */
export function choiceRows(rs: ResolvedChoice[]): { key: string; n: string; d: string; src: string }[] {
  return rs.flatMap(({ def, options, picked }) => {
    if (!picked.length) return [];
    if ('section' in def.from || 'feature' in def.from) {
      return picked.map((p) => ({ key: def.id + ':' + p, n: p, d: options.find((o) => o.n === p)?.d || '', src: def.label }));
    }
    const names = picked.map((p) => { const o = options.find((x) => x.n === p); return o ? shown(def, o) : p; });
    return [{ key: def.id, n: def.label + ': ' + names.join(', '), d: '', src: 'Subclase' }];
  });
}

/**
 * Editor de las elecciones de subclase. `restOnly`: solo las que se cambian tras un descanso, en una línea
 * (para la hoja); si no, todas (para «Editar hoja»).
 */
export default function SubclassChoices({ c, data, lib, set, restOnly = false }: { c: Character; data: PlayerData | null; lib: LibraryData; set: (patch: Partial<Character>) => void; restOnly?: boolean }) {
  const rs = resolveChoices(c, data, lib).filter((r) => !restOnly || r.def.rest);
  if (!rs.length) return null;
  const setPicked = (id: string, v: string[]) => set({ choices: { ...(c.choices || {}), [id]: v } });

  if (restOnly) {
    return (
      <div className="ce-choice-rest">
        {rs.map(({ def, options, picked }) => options.length > 0 && (
          <label key={def.id} className="field ce-choice-one">
            <span className="muted small">{def.label}</span>
            <select className="input" value={picked[0] || ''} onChange={(e) => setPicked(def.id, e.target.value ? [e.target.value] : [])}>
              <option value="">Sin elegir</option>
              {options.map((o) => <option key={o.n} value={o.n}>{shown(def, o)}</option>)}
            </select>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="ce-choices">
      {rs.map(({ def, n, options, picked }) => {
        const id = 'ce-ch-' + def.id.replace(/\W+/g, '-');
        const title = def.label + (n > 1 ? ' (' + picked.length + ' de ' + n + ')' : '') + (def.rest ? ' · cambia tras un descanso ' + (def.rest === 'sr' ? 'corto o largo' : 'largo') : '');
        if ('text' in def.from) {
          return <div key={def.id} className="field"><label htmlFor={id}>{def.label}</label><input id={id} className="input" value={picked[0] || ''} onChange={(e) => setPicked(def.id, e.target.value ? [e.target.value] : [])} /></div>;
        }
        if (!options.length) {
          return <p key={def.id} className="muted small" style={{ margin: 0 }}><b>{def.label}</b>: las opciones salen del rasgo de tu libro. Importa (o vuelve a importar) el Manual del Jugador en «Biblioteca» para elegirlas aquí.</p>;
        }
        if (n === 1) {
          return (
            <div key={def.id} className="field"><label htmlFor={id}>{title}</label>
              <select id={id} className="input" value={picked[0] || ''} onChange={(e) => setPicked(def.id, e.target.value ? [e.target.value] : [])}>
                <option value="">Sin elegir</option>
                {options.map((o) => <option key={o.n} value={o.n}>{shown(def, o)}</option>)}
              </select>
              {!('skills' in def.from) && options.find((o) => o.n === picked[0])?.d && <p className="muted small" style={{ margin: 0 }}>{options.find((o) => o.n === picked[0])!.d}</p>}
            </div>
          );
        }
        const toggle = (o: string) => setPicked(def.id, picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o]);
        return (
          <Picker key={def.id} title={title} summary={picked.map((p) => { const o = options.find((x) => x.n === p); return o ? shown(def, o) : p; }).join(', ')}>
            <div className="chips">
              {options.map((o) => {
                const on = picked.includes(o.n);
                return <button key={o.n} className={on ? 'chip on' : 'chip'} aria-pressed={on} disabled={!on && picked.length >= n} title={'skills' in def.from ? undefined : o.d} onClick={() => toggle(o.n)}>{shown(def, o)}</button>;
              })}
            </div>
            {picked.length > 0 && !('skills' in def.from) && (
              <ul className="pc-features">
                {picked.map((p) => <li key={p}><details><summary><b>{p}</b></summary><p className="pc-text">{options.find((o) => o.n === p)?.d}</p></details></li>)}
              </ul>
            )}
          </Picker>
        );
      })}
    </div>
  );
}
