import { useEffect, useMemo } from 'react';
import type { RuleEntry } from '../../engine/rules';
import { norm } from '../../engine/util';
import { useLibrary } from '../../store/library';
import { useStore } from '../../store/useStore';

/** Conjuro tal como lo muestra la hoja: los 340 del SRD (reglas_es.json) y los de la biblioteca propia. */
export type SpellEntry = RuleEntry & { classes?: string[]; lib?: boolean };

/** Texto de reglas sin marcas: [[id|texto]] -> texto, **negrita** -> negrita, encabezados y tablas en línea. */
export function plainText(t: string): string {
  return t.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/^### /gm, '').replace(/^\|#?\s*/gm, '').replace(/\s*\|\s*$/gm, '').replace(/\s\|\s/g, ' · ');
}

/**
 * Índice de conjuros: SRD + biblioteca propia (sin duplicar los que ya están en el SRD), por id y, para personajes
 * guardados antes, por la clave antigua del bestiario traducida por su nombre en inglés.
 */
export function useSpells() {
  const rules = useStore((s) => s.rules);
  const legacy = useStore((s) => s.spells);
  const lib = useLibrary((s) => s.spells);
  useEffect(() => { void useStore.getState().loadRules(); void useLibrary.getState().init(); }, []);
  return useMemo(() => {
    const srd = (rules || []).filter((e) => e.cat === 'Conjuros') as SpellEntry[];
    const srdNames = new Set(srd.map((e) => norm(e.n)));
    const extra: SpellEntry[] = lib.filter((s) => !srdNames.has(norm(s.n))).map((s) => ({
      id: s.id, n: s.n, en: '', cat: 'Conjuros', t: s.t, l: s.l, esc: s.esc, ct: s.ct, r: s.r, du: s.du, c: s.c, rit: s.rit, cmp: s.cmp, classes: s.classes, lib: true,
    }));
    const list = [...srd, ...extra];
    const byId = new Map(list.map((e) => [e.id, e]));
    const byEn = new Map(srd.map((e) => [(e.en || '').toLowerCase(), e]));
    const get = (key: string): SpellEntry | undefined => byId.get(key) || (legacy[key] ? byEn.get(legacy[key].en.toLowerCase()) : undefined);
    return { loaded: !!rules, list, get };
  }, [rules, legacy, lib]);
}
