import type { RuleEntry } from './rules';

/** Nombres de equipo del manual para sugerir al escribir: armas, armaduras, equipo de aventurero y herramientas. */
/** Idiomas del manual (comunes y poco comunes); se puede escribir cualquier otro. */
export const LANGUAGES = ['Común', 'Lengua de signos común', 'Dracónico', 'Enano', 'Élfico', 'Gigante', 'Gnomo', 'Goblin', 'Mediano', 'Orco', 'Abisal', 'Celestial', 'Druídico', 'Habla profunda', 'Infernal', 'Jerga de ladrones', 'Primordial', 'Silvano'];

/** Herramientas del manual: de artesano, kits, juegos e instrumentos. */
export function toolCatalog(rules: Pick<RuleEntry, 'n' | 'cat' | 't'>[]): string[] {
  const out = new Set<string>();
  for (const e of rules) {
    if (e.cat !== 'Equipo' || (e.n !== 'Herramientas de artesano' && e.n !== 'Otras herramientas')) continue;
    for (const m of e.t.matchAll(/^###\s+(.+?)\s*(?:\([^)]*\))?\s*$/gm)) out.add(m[1].trim());
  }
  return [...out].sort((a, b) => a.localeCompare(b, 'es'));
}

export function gearCatalog(rules: Pick<RuleEntry, 'n' | 'cat' | 't'>[], weapons: { n: string }[] = [], armor: { n: string }[] = []): string[] {
  const out = new Set<string>();
  const add = (n: string) => { const v = n.replace(/\s*\((var[ií]a|requiere[^)]*)\)\s*$/i, '').trim(); if (v && v !== '—') out.add(v); };
  weapons.forEach((w) => add(w.n));
  armor.forEach((a) => add(a.n));
  for (const e of rules) {
    if (e.cat !== 'Equipo') continue;
    if (e.n === 'Tabla de equipo de aventurero') {
      for (const line of e.t.split('\n')) {
        const m = /^\|\s*([^|]+?)\s*\|/.exec(line);
        if (m && !m[1].startsWith('#') && !/^-+$/.test(m[1])) add(m[1]);
      }
    } else if (e.n === 'Herramientas de artesano' || e.n === 'Otras herramientas') {
      for (const m of e.t.matchAll(/^###\s+(.+?)\s*(?:\([^)]*\))?\s*$/gm)) add(m[1]);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b, 'es'));
}
