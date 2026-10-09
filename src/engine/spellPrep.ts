import type { PlayerData } from '../data/player';
import { classEntries, pactSlots, type Character } from './character';
import { subclassCaster } from './subclassChoices';

/**
 * Conjuros que prepara cada clase lanzadora del personaje (reglas 2024: en multiclase cada clase prepara los suyos,
 * de su lista y hasta el nivel de conjuro que esa clase puede lanzar).
 */
export interface CasterPrep {
  id: string; // clase (la de la lista: Caballero/Embaucador arcano usan la de mago)
  n: string;
  level: number; // nivel en esa clase
  maxLv: number; // nivel de conjuro más alto de su lista que puede preparar
  cantrips: number | null; // trucos que conoce (null: la clase no tiene trucos)
  prepared: number | null; // conjuros preparados de nivel 1+
  list: Set<string>; // ids de los conjuros de su lista
}

type SpellLite = { id: string; l?: number; classes?: string[] };

const at = (table: Record<string, number | string> | undefined, lv: number): number | null => {
  if (!table) return null;
  let v: number | null = null;
  for (const [k, x] of Object.entries(table)) if (parseInt(k, 10) <= lv) v = Number(x) || 0;
  return v;
};

/** Nivel de conjuro más alto que da una clase a su nivel: completa, media (2024: 1, 5, 9, 13, 17) o de pacto. */
export function classMaxSpell(caster: string, level: number): number {
  if (caster === 'full') return Math.min(9, Math.ceil(level / 2));
  if (caster === 'half') return Math.min(5, Math.ceil(level / 4));
  if (caster === 'pact') return pactSlots(level).lv;
  return 0;
}

export function casterPreps(c: Character, data: PlayerData, spells: SpellLite[]): CasterPrep[] {
  const out: CasterPrep[] = [];
  for (const e of classEntries(c)) {
    const cls = data.classes.find((x) => x.id === e.classId);
    if (!cls) continue;
    // Caballero arcano y Embaucador arcano: un tercio de lanzador con la lista de mago
    const sub = cls.caster === 'none' ? subclassCaster({ classId: e.classId, subclass: e.subclass || '', level: e.level }) : null;
    if (cls.caster === 'none' && !sub) continue;
    const listCls = sub ? data.classes.find((x) => x.id === sub.list) : cls;
    if (!listCls) continue;
    const list = new Set([...listCls.spells, ...spells.filter((s) => s.classes?.includes(listCls.id)).map((s) => s.id)]);
    const third = (lv: number) => (lv < 3 ? 0 : lv < 7 ? 1 : lv < 13 ? 2 : lv < 19 ? 3 : 4);
    out.push({
      id: listCls.id, n: cls.n, level: e.level, list,
      maxLv: sub ? third(e.level) : classMaxSpell(cls.caster, e.level),
      cantrips: sub ? sub.cantrips : at(cls.sc[cls.id + '.cantrips-known'], e.level),
      prepared: sub ? sub.prepared : at(cls.sc[cls.id + '.max-prepared'], e.level),
    });
  }
  return out;
}

/**
 * Reparte los conjuros elegidos entre sus clases: el de una sola lista va a esa clase; el que está en varias, a la
 * primera a la que aún le quede hueco. `always`: los que se tienen preparados sin contar (subclase, Castigo del paladín).
 */
export function assignSpells(ids: string[], preps: CasterPrep[], levelOf: (id: string) => number, always: Set<string>): { byClass: Record<string, { cantrips: string[]; spells: string[] }>; other: string[] } {
  const byClass: Record<string, { cantrips: string[]; spells: string[] }> = Object.fromEntries(preps.map((p) => [p.id, { cantrips: [], spells: [] }]));
  const other: string[] = [];
  // primero los que solo pueden ir a una clase, así los compartidos ocupan los huecos que queden
  const order = [...ids].filter((id) => !always.has(id)).sort((a, b) => preps.filter((p) => p.list.has(a)).length - preps.filter((p) => p.list.has(b)).length);
  for (const id of order) {
    const cantrip = levelOf(id) === 0;
    const owners = preps.filter((p) => p.list.has(id));
    if (!owners.length) { other.push(id); continue; }
    const room = (p: CasterPrep) => { const b = byClass[p.id]; const max = cantrip ? p.cantrips : p.prepared; return max == null ? Infinity : max - (cantrip ? b.cantrips : b.spells).length; };
    const to = owners.find((p) => room(p) > 0 && (cantrip ? p.cantrips != null : levelOf(id) <= p.maxLv)) || owners[0];
    (cantrip ? byClass[to.id].cantrips : byClass[to.id].spells).push(id);
  }
  return { byClass, other };
}
