import type { ReactNode } from 'react';
import { classLevel, partsShort, type Character, type Derived } from '../../engine/character';
import { fmt, sgn } from '../../engine/dice';
import { norm } from '../../engine/util';
import InfoPop from '../../shared/InfoPop';
import type { QuickRow } from './QuickActions';
import { plainText } from './spells';
import { useStore } from '../../store/useStore';

/** Clave del uso de la reacción en la hoja (se recupera al empezar tu turno). */
export const REACTION = 'Reacción';

/**
 * Dotes y estilos de combate que dan una reacción: solo la mecánica, en corto (el texto de cada una sale del SRD o
 * de la biblioteca). `roll`: lo que se tira al usarla.
 */
const REACTIONS: { n: string[]; what: string; roll?: (d: Derived) => { label: string; expr: string } }[] = [
  { n: ['Centinela', 'Sentinel'], what: 'Ataque de oportunidad aunque se retire (Destrabarse) o si ataca a otro a 5 pies de ti; si aciertas, su velocidad pasa a 0.' },
  { n: ['Maestro en armas de asta', 'Polearm Master'], what: 'Ataque de oportunidad cuando una criatura entra en tu alcance con un arma de asta o pesada.' },
  { n: ['Lanzador de guerra', 'Lanzador en combate', 'War Caster'], what: 'En lugar del ataque de oportunidad, lanzas un conjuro de 1 acción que solo afecte a esa criatura. Ventaja en las salvaciones de concentración (ya se aplica sola).' },
  { n: ['Cazamagos', 'Asesino de magos', 'Matamagos', 'Mage Slayer'], what: 'Ataque cuerpo a cuerpo contra quien lance un conjuro a 5 pies de ti. Si le dañas, desventaja en su salvación de concentración.' },
  { n: ['Maestro en escudos', 'Maestro de escudos', 'Shield Master'], what: 'Con escudo, si un efecto te permite una salvación de Destreza para recibir la mitad de daño, no recibes ninguno si la superas.' },
  { n: ['Protección', 'Protection'], what: 'Con escudo, un atacante tiene desventaja contra un aliado a 5 pies de ti.' },
  { n: ['Intercepción', 'Interception'], what: 'Con escudo o arma, reduces el daño a un aliado a 5 pies de ti.', roll: (d) => ({ label: 'Intercepción: daño que evitas', expr: '1d10+' + d.pb }) },
  { n: ['Duelista defensivo', 'Defensive Duelist'], what: 'Con un arma sutil, +competencia a la CA contra un ataque cuerpo a cuerpo hasta el principio de tu siguiente turno.' },
];

/** Nombres de las dotes con reacción de esta lista (no repetirlas como tarjeta genérica). */
export const REACTION_FEATS = REACTIONS.flatMap((x) => x.n.map(norm));

/** Las reacciones del personaje: ataque de oportunidad, sus dotes y sus conjuros de reacción, con el uso de la reacción. */
export default function ReactionPanel({ c, d, set, spells, extra = [], onSpell, onHit, rows }: { c: Character; d: Derived; set: (patch: Partial<Character>) => void; spells: { n: string; ct?: string; r?: string; k?: string }[]; extra?: QuickRow[]; onSpell?: (k: string) => void; onHit?: (a: Derived['attacks'][number] | null) => void; rows?: ReactNode }) {
  const { roll } = useStore.getState();
  const who = c.name || 'Personaje';
  // las dotes elegidas y los rasgos propios con el mismo nombre (una dote de otro libro escrita a mano)
  const all = [...c.feats, ...c.customFeats.map((f) => f.n)];
  const names = new Set(all.map(norm));
  const feats = REACTIONS.filter((x) => x.n.some((n) => names.has(norm(n)))).map((x) => ({ ...x, name: all.find((f) => x.n.some((n) => norm(n) === norm(f)))! }));
  const castable = spells.filter((s) => /reacci/i.test(s.ct || ''));
  // Lanzador de guerra: en lugar del ataque de oportunidad, un conjuro de 1 acción que solo afecte a esa criatura (los de alcance de toque o 5 pies)
  const meleeSpells = spells.filter((s) => /^(1\s+)?acci[oó]n$/i.test((s.ct || '').trim()) && /toque|tocar|5 pies/i.test(s.r || ''));
  const hitBtn = (a: Derived['attacks'][number] | null) => (a
    ? <button key={'d' + a.w.id} className="rollbtn dmg" title={'Daño de ' + a.w.name} onClick={() => onHit?.(a)}>{partsShort(a.parts)}</button>
    : <button key="dua" className="rollbtn dmg" title="Daño sin armas" onClick={() => onHit?.(null)}>{partsShort(d.unarmed!.parts)}</button>);
  const melee = d.attacks.filter((a) => a.w.kind === 'melee');
  const used = Math.min(1, c.uses[REACTION] || 0);
  const spend = () => set({ uses: { ...c.uses, [REACTION]: 1 } });
  return (
    <section className="panel pc-rx" aria-label="Reacción" data-sec="combate">
      <div className="panel-head">
        <h3 className="eyebrow">Reacción</h3>
        <button type="button" className={used ? 'btn small' : 'btn small gold'} aria-pressed={!used} title="Vuelve al empezar tu turno" onClick={() => set({ uses: { ...c.uses, [REACTION]: used ? 0 : 1 } })}>{used ? 'Usada · recuperar' : 'Disponible'}</button>
      </div>
      <ul className="pc-rx-list">
        <li>
          <InfoPop label="Ataque de oportunidad" title="Ataque de oportunidad"><p>Cuando una criatura que ves sale de tu alcance sin Destrabarse, puedes hacer un ataque cuerpo a cuerpo contra ella con tu reacción.</p></InfoPop>
          <span className="rollrow rx-weap">
            {melee.length ? melee.map((a) => (
              <span key={a.w.id} className="rx-pair"><button className="rollbtn" disabled={!!used} onClick={() => { spend(); roll({ label: who + ' · ' + a.w.name + ': ataque de oportunidad', kind: 'attack', who, parts: [{ expr: '1d20' + sgn(a.atk) }], self: { conds: c.conds, exh: c.exh } }); }}><span className="rx-n">{a.w.name}</span> <span>{fmt(a.atk)}</span></button>{onHit && hitBtn(a)}</span>
            )) : null}
            {d.unarmed && <span className="rx-pair"><button className="rollbtn" disabled={!!used} onClick={() => { spend(); roll({ label: who + ' · ataque sin armas de oportunidad', kind: 'attack', who, parts: [{ expr: '1d20' + sgn(d.unarmed!.atk) }], self: { conds: c.conds, exh: c.exh } }); }}><span className="rx-n">Sin armas</span> <span>{fmt(d.unarmed.atk)}</span></button>{onHit && hitBtn(null)}</span>}
            {!melee.length && !d.unarmed && <span className="muted small">sin arma cuerpo a cuerpo</span>}
          </span>
        </li>
        {feats.map((f) => (
          <li key={f.name}>
            <InfoPop label={f.name} title={f.name}><p>{f.what}</p></InfoPop>
            <span className="rollrow">
              {f.roll ? <button className="rollbtn" disabled={!!used} onClick={() => { spend(); const x = f.roll!(d); roll({ label: who + ' · ' + x.label, kind: 'free', parts: [{ expr: x.expr }] }); }}>{f.roll(d).expr}</button>
                : <button className="rollbtn" disabled={!!used} onClick={spend}>Usar</button>}
              {/^lanzador|^war caster/.test(norm(f.name)) && meleeSpells.map((s) => (onSpell && s.k
                ? <button key={s.k} className="btn small" title="Conjuro de 1 acción de toque o 5 pies: ábrelo y lánzalo desde Conjuros" onClick={() => { spend(); onSpell(s.k!); }}>{s.n}</button>
                : <span key={s.n} className="chip-tag">{s.n}</span>))}
            </span>
          </li>
        ))}
        {rows}
        {extra.filter((r) => r.kind !== 'bonus').map((r) => (
          <li key={r.key}>
            <InfoPop label={r.n} title={r.n}><p className="muted">{r.src.replace(/ \d+$/, '')}</p><p>{plainText(r.d)}</p></InfoPop>
            {r.tag && <span className="chip-tag">{r.tag}</span>}
            <span className={'rollrow' + (melee.length > 0 && /ataque cuerpo a cuerpo|ataque de oportunidad/.test(norm(r.d).slice(0, 420)) ? ' rx-weap' : '')}>
              {/ataque cuerpo a cuerpo|ataque de oportunidad/.test(norm(r.d).slice(0, 420)) && melee.length > 0
                ? melee.map((a) => <span key={a.w.id} className="rx-pair"><button className="rollbtn" disabled={!!used} onClick={() => { spend(); roll({ label: who + ' · ' + r.n + ': ' + a.w.name, kind: 'attack', who, parts: [{ expr: '1d20' + sgn(a.atk) }], self: { conds: c.conds, exh: c.exh } }); }}><span className="rx-n">{a.w.name}</span> <span>{fmt(a.atk)}</span></button>{onHit && hitBtn(a)}</span>)
                : /^desviar ataques/.test(norm(r.n)) ? <button className="rollbtn" disabled={!!used} onClick={() => { spend(); roll({ label: who + ' · desviar ataques', kind: 'free', parts: [{ expr: '1d10' + sgn(d.mods.dex + classLevel(c, 'monk')) }] }); }}>1d10{sgn(d.mods.dex + classLevel(c, 'monk'))}</button>
                : <button className="rollbtn" disabled={!!used} onClick={spend}>Usar</button>}
            </span>
          </li>
        ))}
        {castable.length > 0 && (
          <li>
            <span className="muted small">Conjuros</span>
            <span className="rollrow">{castable.map((s) => (onSpell && s.k
              ? <button key={s.k} className="btn small" title="Ver el conjuro (se lanza desde Conjuros y gasta la reacción)" onClick={() => onSpell(s.k!)}>{s.n}</button>
              : <span key={s.n} className="chip-tag">{s.n}</span>))}</span>
          </li>
        )}
      </ul>
    </section>
  );
}
