import type { Character, Derived } from '../../engine/character';
import { fmt, sgn } from '../../engine/dice';
import { norm } from '../../engine/util';
import Pips from '../../shared/Pips';
import { firstSentence } from '../../engine/actionKind';
import { QuickCard, type QuickRow } from './QuickActions';
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
export default function ReactionPanel({ c, d, set, spells, extra = [] }: { c: Character; d: Derived; set: (patch: Partial<Character>) => void; spells: { n: string; ct?: string }[]; extra?: QuickRow[] }) {
  const { roll } = useStore.getState();
  const who = c.name || 'Personaje';
  // las dotes elegidas y los rasgos propios con el mismo nombre (una dote de otro libro escrita a mano)
  const all = [...c.feats, ...c.customFeats.map((f) => f.n)];
  const names = new Set(all.map(norm));
  const feats = REACTIONS.filter((x) => x.n.some((n) => names.has(norm(n)))).map((x) => ({ ...x, name: all.find((f) => x.n.some((n) => norm(n) === norm(f)))! }));
  const castable = spells.filter((s) => /reacci/i.test(s.ct || ''));
  const melee = d.attacks.filter((a) => a.w.kind === 'melee');
  const used = Math.min(1, c.uses[REACTION] || 0);
  const spend = () => set({ uses: { ...c.uses, [REACTION]: 1 } });
  return (
    <section className="panel" aria-label="Reacción" data-sec="combate">
      <div className="panel-head">
        <h3 className="eyebrow">Reacción</h3>
        <span className="rollrow">
          <span className="muted small">{used ? 'usada: vuelve al empezar tu turno' : 'disponible'}</span>
          <Pips max={1} used={used} label="Reacción" onSet={(v) => set({ uses: { ...c.uses, [REACTION]: Math.max(0, Math.min(1, v)) } })} />
        </span>
      </div>
      <ul className="pc-react">
        <li>
          <b>Ataque de oportunidad</b>
          <span className="muted small">cuando una criatura que ves sale de tu alcance</span>
          {melee.length > 0 && <span className="rollrow">{melee.map((a) => (
            <button key={a.w.id} className="rollbtn" disabled={!!used} onClick={() => { spend(); roll({ label: who + ' · ' + a.w.name + ': ataque de oportunidad', kind: 'attack', who, parts: [{ expr: '1d20' + sgn(a.atk) }], self: { conds: c.conds, exh: c.exh } }); }}>{a.w.name} {fmt(a.atk)}</button>
          ))}</span>}
        </li>
        {feats.map((f) => (
          <li key={f.name}>
            <b>{f.name}</b>
            <span className="muted small">{f.what}</span>
            <span className="rollrow">
              {f.roll ? <button className="rollbtn" disabled={!!used} onClick={() => { spend(); const x = f.roll!(d); roll({ label: who + ' · ' + x.label, kind: 'free', parts: [{ expr: x.expr }] }); }}>Tirar {f.roll(d).expr}</button>
                : <button className="btn small" disabled={!!used} onClick={spend}>Usar la reacción</button>}
            </span>
          </li>
        ))}
        {extra.filter((r) => r.kind !== 'bonus').map((r) => (
          <li key={r.key} className="rx">
            <QuickCard r={r} head={<><p className="muted small" style={{ margin: 0 }}>{firstSentence(plainText(r.d))}</p><button className="btn small" disabled={!!used} onClick={spend}>Usar la reacción</button></>} />
          </li>
        ))}
        {castable.length > 0 && (
          <li>
            <b>Conjuros de reacción</b>
            <span className="muted small">{castable.map((s) => s.n).join(', ')} · se lanzan desde Conjuros (gastan la reacción)</span>
          </li>
        )}
      </ul>
    </section>
  );
}
