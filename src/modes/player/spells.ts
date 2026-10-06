import { useEffect, useMemo } from 'react';
import type { RuleEntry } from '../../engine/rules';
import { useStore } from '../../store/useStore';

/** Conjuro del SRD tal como lo muestra la hoja (sale de reglas_es.json: los 340 del SRD 5.2.1). */
export type SpellEntry = RuleEntry;

/** Texto de reglas sin marcas: [[id|texto]] -> texto, **negrita** -> negrita, encabezados y tablas en línea. */
export function plainText(t: string): string {
  return t.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/^### /gm, '').replace(/^\|#?\s*/gm, '').replace(/\s*\|\s*$/gm, '').replace(/\s\|\s/g, ' · ');
}

/**
 * Índice de conjuros: por id de reglas y, para personajes guardados antes, por la clave antigua (la del bestiario,
 * que solo tenía los conjuros de los monstruos), traducida por su nombre en inglés.
 */
export function useSpells() {
  const rules = useStore((s) => s.rules);
  const legacy = useStore((s) => s.spells);
  useEffect(() => { void useStore.getState().loadRules(); }, []);
  return useMemo(() => {
    const list = (rules || []).filter((e) => e.cat === 'Conjuros');
    const byId = new Map(list.map((e) => [e.id, e]));
    const byEn = new Map(list.map((e) => [(e.en || '').toLowerCase(), e]));
    const get = (key: string): SpellEntry | undefined => byId.get(key) || (legacy[key] ? byEn.get(legacy[key].en.toLowerCase()) : undefined);
    return { loaded: !!rules, list, get };
  }, [rules, legacy]);
}
