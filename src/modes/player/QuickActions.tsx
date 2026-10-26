import type { ReactNode } from 'react';
import { actionKindOf, firstSentence, type ActionKind } from '../../engine/actionKind';
import Card from '../../shared/Card';
import { plainText } from './spells';

/** Un rasgo, dote o especie que se usa con una acción adicional o una reacción y no tiene otra tarjeta en la hoja. */
export interface QuickRow { key: string; n: string; d: string; src: string; kind: ActionKind }

/** Los rasgos con acción adicional o reacción, sacados de su texto, que no tienen ya su propio panel. */
export function quickRows(rows: { key: string; n: string; d: string; src: string }[], skip: (r: { key: string; n: string }) => boolean): QuickRow[] {
  const seen = new Set<string>();
  const out: QuickRow[] = [];
  for (const r of rows) {
    if (!r.d || skip(r) || seen.has(r.n)) continue;
    const kind = actionKindOf(r.d);
    if (!kind) continue;
    seen.add(r.n);
    out.push({ ...r, kind });
  }
  return out;
}

/** Tarjeta de uno de esos rasgos: su origen, su primera frase y, al pulsar el nombre, el texto completo. */
export function QuickCard({ r, head }: { r: QuickRow; head?: ReactNode }) {
  const text = plainText(r.d);
  return (
    <Card name={r.n} head={<><span className="muted small">{r.src.replace(/ \d+$/, '')}</span>{head}</>}>
      <p className="pc-text">{text}</p>
    </Card>
  );
}

/** Rasgos y dotes que se usan con una acción adicional (los de reacción salen en el panel de la reacción). */
export default function QuickActions({ rows }: { rows: QuickRow[] }) {
  const list = rows.filter((r) => r.kind !== 'reaction');
  if (!list.length) return null;
  return (
    <section className="panel" aria-label="Acción adicional" data-sec="combate">
      <h3 className="eyebrow">Acción adicional</h3>
      <ul className="pc-features grid acts">
        {list.map((r) => (
          <li key={r.key}>
            <QuickCard r={r} head={<p className="muted small" style={{ margin: 0 }}>{firstSentence(plainText(r.d))}</p>} />
          </li>
        ))}
      </ul>
    </section>
  );
}
