import { useState } from 'react';
import type { PlayerData } from '../../data/player';
import type { Character } from '../../engine/character';
import { activeChoices, choiceCount, choiceOptions, invocationOptions, spellOptions, subclassText, type ChoiceDef, type ChoiceOption } from '../../engine/subclassChoices';
import { norm } from '../../engine/util';
import Picker from '../../shared/Picker';
import type { LibraryData } from '../../store/library';
import { useSpells } from './spells';

/** En habilidades y conjuros `n` es la clave y `d` el nombre que se ve. */
const keyed = (def: ChoiceDef) => 'skills' in def.from || 'spells' in def.from;
const shown = (def: ChoiceDef, o: ChoiceOption) => (keyed(def) ? o.d : o.n);

export interface ResolvedChoice { def: ChoiceDef; n: number; options: ChoiceOption[]; picked: string[] }

type SpellList = { id: string; n: string; l?: number; esc?: string; classes?: string[] }[];

/** Elecciones de la subclase del personaje con sus opciones y lo elegido (como mucho las que le tocan). */
export function resolveChoices(c: Character, data: PlayerData | null, lib: LibraryData, spells: SpellList = []): ResolvedChoice[] {
  const cls = data?.classes.find((x) => x.id === c.classId);
  const src = subclassText(c, cls, lib.subclasses);
  return activeChoices(c).map((def) => {
    const n = choiceCount(def, c.level);
    const picked = (c.choices?.[def.id] || []).slice(0, n);
    const all = 'spells' in def.from ? spellOptions(def.from.spells, c.level, data, spells) : choiceOptions(def, src, data, cls);
    const options = 'invocations' in def.from ? invocationOptions(all, data, c.level, picked) : all;
    return { def, n, options, picked };
  });
}

/** Conjuros elegidos por la subclase (van a la lista de conjuros de la hoja), con si siempre están preparados. */
export function choiceSpells(c: Character): { id: string; prepared: boolean }[] {
  return activeChoices(c).filter((d) => 'spells' in d.from).flatMap((d) => (c.choices?.[d.id] || []).slice(0, choiceCount(d, c.level)).map((id) => ({ id, prepared: !!d.prepared })));
}

/** Filas para «Rasgos y dotes» de la hoja: cada opción elegida con su texto (los conjuros van a «Conjuros»). */
export function choiceRows(rs: ResolvedChoice[]): { key: string; n: string; d: string; src: string }[] {
  return rs.flatMap(({ def, options, picked }) => {
    if (!picked.length || 'spells' in def.from) return [];
    if ('section' in def.from || 'feature' in def.from || 'invocations' in def.from) {
      return picked.map((p) => ({ key: def.id + ':' + p, n: p, d: options.find((o) => o.n === p)?.d || '', src: def.label }));
    }
    const names = picked.map((p) => { const o = options.find((x) => x.n === p); return o ? shown(def, o) : p; });
    return [{ key: def.id, n: def.label + ': ' + names.join(', '), d: '', src: 'Subclase' }];
  });
}

/** Elección entre muchos conjuros: buscador y los elegidos arriba. */
function SpellChoice({ def, n, options, picked, title, setPicked }: ResolvedChoice & { title: string; setPicked: (v: string[]) => void }) {
  const [q, setQ] = useState('');
  const nq = norm(q);
  const list = options.filter((o) => !picked.includes(o.n) && (!nq || norm(o.d).includes(nq))).slice(0, 40);
  const name = (id: string) => options.find((o) => o.n === id)?.d || id;
  return (
    <Picker title={title} summary={picked.map(name).join(', ')}>
      {picked.length > 0 && <div className="chips">{picked.map((p) => <button key={p} className="chip on" aria-pressed title="Quitar" onClick={() => setPicked(picked.filter((x) => x !== p))}>{name(p)} ✕</button>)}</div>}
      {picked.length < n ? (
        <>
          <input className="input" aria-label={'Buscar en ' + def.label} placeholder={'Buscar entre ' + options.length + ' conjuros…'} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chips">{list.map((o) => <button key={o.n} className="chip" onClick={() => { setPicked([...picked, o.n]); setQ(''); }}>+ {o.d}</button>)}</div>
        </>
      ) : <span className="muted small">Ya tienes los {n}. Quita uno para cambiarlo.</span>}
    </Picker>
  );
}

/**
 * Editor de las elecciones de subclase. `restOnly`: solo las que se cambian tras un descanso, en una línea
 * (para la hoja); si no, todas (para «Editar hoja»).
 */
export default function SubclassChoices({ c, data, lib, set, restOnly = false }: { c: Character; data: PlayerData | null; lib: LibraryData; set: (patch: Partial<Character>) => void; restOnly?: boolean }) {
  const spellIdx = useSpells();
  const rs = resolveChoices(c, data, lib, spellIdx.list).filter((r) => !restOnly || r.def.rest);
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
      {rs.map((r) => {
        const { def, n, options, picked } = r;
        const id = 'ce-ch-' + def.id.replace(/\W+/g, '-');
        const title = def.label + (n > 1 ? ' (' + picked.length + ' de ' + n + ')' : '') + (def.rest ? ' · cambia tras un descanso ' + (def.rest === 'sr' ? 'corto o largo' : 'largo') : '');
        if ('text' in def.from) {
          return <div key={def.id} className="field"><label htmlFor={id}>{def.label}</label><input id={id} className="input" value={picked[0] || ''} onChange={(e) => setPicked(def.id, e.target.value ? [e.target.value] : [])} /></div>;
        }
        if ('spells' in def.from) {
          if (!spellIdx.loaded) return <p key={def.id} className="muted small" style={{ margin: 0 }}>Cargando conjuros…</p>;
          return <SpellChoice key={def.id} {...r} title={title + (def.prepared ? ' · siempre preparados' : '')} setPicked={(v) => setPicked(def.id, v)} />;
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
              {!keyed(def) && options.find((o) => o.n === picked[0])?.d && <p className="muted small" style={{ margin: 0 }}>{options.find((o) => o.n === picked[0])!.d}</p>}
            </div>
          );
        }
        const toggle = (o: string) => setPicked(def.id, picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o]);
        return (
          <Picker key={def.id} title={title} summary={picked.map((p) => { const o = options.find((x) => x.n === p); return o ? shown(def, o) : p; }).join(', ')}>
            <div className="chips">
              {options.map((o) => {
                const on = picked.includes(o.n);
                return <button key={o.n} className={on ? 'chip on' : 'chip'} aria-pressed={on} disabled={!on && picked.length >= n} title={keyed(def) ? undefined : o.d} onClick={() => toggle(o.n)}>{shown(def, o)}</button>;
              })}
            </div>
            {picked.length > 0 && !keyed(def) && (
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
