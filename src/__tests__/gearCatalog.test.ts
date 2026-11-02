import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gearCatalog } from '../engine/gearCatalog';

const rules = JSON.parse(readFileSync('public/data/reglas_es.json', 'utf8')).e as { n: string; cat: string; t: string }[];

describe('catálogo de equipo', () => {
  it('reúne equipo de aventurero, herramientas, armas y armaduras sin la cabecera ni los «varía»', () => {
    const list = gearCatalog(rules, [{ n: 'Espada larga' }], [{ n: 'Cota de malla' }]);
    for (const n of ['Mochila', 'Palanca', 'Kit de disfraz', 'Espada larga', 'Cota de malla', 'Munición']) expect(list).toContain(n);
    expect(list.some((n) => n.startsWith('#') || /var[ií]a/i.test(n))).toBe(false);
  });
});
