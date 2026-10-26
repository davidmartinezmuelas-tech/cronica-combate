import type { ReactNode } from 'react';
import { classLevel, type Character, type Derived } from '../../engine/character';
import { sgn } from '../../engine/dice';
import { norm } from '../../engine/util';
import { useStore } from '../../store/useStore';
import { actionKindOf, firstSentence, type ActionKind } from '../../engine/actionKind';
import Card from '../../shared/Card';
import { plainText } from './spells';

/** Un rasgo, dote o especie que se usa con una acción adicional o una reacción y no tiene otra tarjeta en la hoja. */
export interface QuickRow { key: string; n: string; d: string; src: string; kind: ActionKind; tag?: string }

/** Los rasgos con acción adicional o reacción, sacados de su texto, que no tienen ya su propio panel. */
export function quickRows(rows: { key: string; n: string; d: string; src: string }[], skip: (r: { key: string; n: string }) => boolean, tagOf: (n: string) => string | undefined = () => undefined): QuickRow[] {
  const seen = new Set<string>();
  const out: QuickRow[] = [];
  for (const r of rows) {
    if (!r.d || skip(r) || seen.has(r.n)) continue;
    const kind = actionKindOf(r.d);
    if (!kind) continue;
    seen.add(r.n);
    out.push({ ...r, kind, tag: tagOf(r.n) });
  }
  return out;
}

/** Tarjeta de uno de esos rasgos: su origen, su primera frase y, al pulsar el nombre, el texto completo. */
export function QuickCard({ r, head }: { r: QuickRow; head?: ReactNode }) {
  const text = plainText(r.d);
  return (
    <Card name={r.n} head={<><span className="muted small">{r.src.replace(/ \d+$/, '')}</span>{r.tag && <span className="chip-tag">{r.tag}</span>}{head}</>}>
      <p className="pc-text">{text}</p>
    </Card>
  );
}

/** Lo que se ve de un vistazo en la tarjeta de algunos rasgos (número o resumen), por su nombre. */
export function quickTag(c: Character, n: string): string | undefined {
  switch (norm(n)) {
    case 'caida lenta': return '−' + 5 * classLevel(c, 'monk') + ' al daño de caída';
    case 'esquiva asombrosa': return 'mitad del daño';
    case 'defensa superior del cazador': return 'resistencia a ese daño';
    case 'contracanto': return 'repite la salvación con ventaja';
    case 'embestida instintiva': case 'cambio tactico': return 'muévete media velocidad';
    case 'accion astuta': return 'Carrera, Destrabarse o Esconderse';
    case 'punteria firme': return 'ventaja, velocidad 0';
    default: return undefined;
  }
}

/** Furia implacable: al caer a 0 PG con la Furia activa, salvación de Constitución con CD 10 (+5 cada vez, hasta un descanso). */
export const RELENTLESS = 'Furia implacable';
function Relentless({ c, d, set }: { c: Character; d: Derived; set: (patch: Partial<Character>) => void }) {
  const lv = classLevel(c, 'barbarian');
  const n = c.uses[RELENTLESS] || 0;
  const dc = 10 + 5 * n;
  const who = c.name || 'Personaje';
  return (
    <Card name={RELENTLESS} head={<>
      <span className="muted small">Bárbaro · se reinicia en descanso corto o largo</span>
      <span className="chip-tag">CD {dc}</span>
      <span className="rollrow">
        <button className="rollbtn" onClick={() => { set({ uses: { ...c.uses, [RELENTLESS]: n + 1 } }); useStore.getState().roll({ label: who + ' · Furia implacable: salvación de Constitución (CD ' + dc + ')', kind: 'save', who, parts: [{ expr: '1d20' + sgn(d.saves.con.bonus) }], self: { conds: c.conds, exh: c.exh }, ...(d.saves.con.adv ? { adv: d.saves.con.adv } : {}) }); }}>Salvación CON {sgn(d.saves.con.bonus)}</button>
        {n > 0 && <button className="btn small ghost" onClick={() => set({ uses: { ...c.uses, [RELENTLESS]: 0 } })}>Reiniciar CD</button>}
      </span>
    </>}>
      <p className="pc-text">Si caes a 0 PG con la Furia activa y no mueres en el acto, haces una salvación de Constitución con CD {dc}. Si la superas, te quedas con {2 * lv} PG (el doble de tu nivel de bárbaro). Cada vez que lo uses tras la primera, la CD sube 5.</p>
    </Card>
  );
}

/** Rasgos y dotes que se usan con una acción adicional (los de reacción salen en el panel de la reacción). */
export default function QuickActions({ rows, c, d, set }: { rows: QuickRow[]; c: Character; d: Derived; set: (patch: Partial<Character>) => void }) {
  const list = rows.filter((r) => r.kind !== 'reaction');
  const rage = classLevel(c, 'barbarian') >= 11;
  if (!list.length && !rage) return null;
  return (
    <section className="panel" aria-label={list.length ? 'Acción adicional' : 'Rasgos de clase'} data-sec="combate">
      <h3 className="eyebrow">{list.length ? 'Acción adicional' : 'Rasgos de clase'}</h3>
      <ul className="pc-features grid acts">
        {rage && <li><Relentless c={c} d={d} set={set} /></li>}
        {list.map((r) => (
          <li key={r.key}>
            <QuickCard r={r} head={<p className="muted small" style={{ margin: 0 }}>{firstSentence(plainText(r.d))}</p>} />
          </li>
        ))}
      </ul>
    </section>
  );
}
