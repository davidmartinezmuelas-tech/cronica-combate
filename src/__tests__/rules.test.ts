import { describe, expect, it } from 'vitest';
import { findRule, parseInline, parseMarkup, searchRules, type RuleEntry } from '../engine/rules';

const E = (id: string, n: string, en: string, cat: string, t = ''): RuleEntry => ({ id, n, en, cat, t });
const entries = [
  E('p', 'Derribado', 'Prone', 'Estados', 'Tienes [[d|Desventaja]] en las tiradas de ataque.'),
  { ...E('r', 'Restringido', 'Restrained', 'Estados'), al: ['Apresado'] },
  E('d', 'Desventaja', 'Disadvantage', 'Glosario', 'Tiras dos d20 y usas el menor.'),
  E('c', 'Cobertura', 'Cover', 'Combate', 'Media, tres cuartos y total.'),
  E('s', 'Derribar', 'Topple', 'Equipo'),
  E('f', 'Bola de fuego', 'Fireball', 'Conjuros', 'Esfera de 20 pies.'),
];

describe('buscador de reglas', () => {
  it('encuentra por el nombre en inglés o en español, sin tildes ni mayúsculas', () => {
    expect(searchRules(entries, 'prone')[0].id).toBe('p');
    expect(searchRules(entries, 'DERRIBADO')[0].id).toBe('p');
    expect(searchRules(entries, 'cobertura')[0].id).toBe('c');
    expect(searchRules(entries, 'fuego')[0].id).toBe('f');
  });
  it('ordena: exacto, empieza por, palabra, contiene y por último el texto', () => {
    expect(searchRules(entries, 'derrib').map((e) => e.id)).toEqual(['p', 's']); // a igualdad, primero el estado
    expect(searchRules(entries, 'esfera').map((e) => e.id)).toEqual(['f']); // solo en el texto
  });
  it('filtra por categoría y sin búsqueda lista en orden alfabético', () => {
    expect(searchRules(entries, '', 'Conjuros').map((e) => e.id)).toEqual(['f']);
    expect(searchRules(entries, '').map((e) => e.n)).toEqual(['Bola de fuego', 'Cobertura', 'Derribado', 'Derribar', 'Desventaja', 'Restringido']);
  });
  it('localiza una regla por su nombre', () => {
    expect(findRule(entries, 'derribado', 'Estados')?.id).toBe('p');
    expect(findRule(entries, 'Prone')?.id).toBe('p');
    expect(findRule(entries, 'Apresado', 'Estados')?.id).toBe('r'); // nombre que usa la app
    expect(searchRules(entries, 'apresado')[0].id).toBe('r');
  });
});

describe('formato del texto de las reglas', () => {
  it('negrita, cursiva y enlaces', () => {
    expect(parseInline('**Daño.** Ver [[x|Cobertura]] y *esto*')).toEqual([
      { k: 'b', c: [{ k: 't', s: 'Daño.' }] }, { k: 't', s: ' Ver ' }, { k: 'a', id: 'x', s: 'Cobertura' }, { k: 't', s: ' y ' }, { k: 'i', c: [{ k: 't', s: 'esto' }] },
    ]);
  });
  it('párrafos, títulos, listas y tablas', () => {
    const b = parseMarkup('Uno\n\n### Título\n\n- a\n- b\n\n### Tabla\n|# Grado | CA |\n| Media | +2 |');
    expect(b.map((x) => x.k)).toEqual(['p', 'h', 'ul', 'h', 'table']);
    const t = b[4] as Extract<typeof b[number], { k: 'table' }>;
    expect(t.head).toHaveLength(2);
    expect(t.rows).toEqual([[[{ k: 't', s: 'Media' }], [{ k: 't', s: '+2' }]]]);
  });
  it('los enlaces dentro de una tabla no parten la celda', () => {
    const [t] = parseMarkup('|# Acción | Resumen |\n| [[a1|Ataque]] | Ataca con un arma. |') as Extract<ReturnType<typeof parseMarkup>[number], { k: 'table' }>[];
    expect(t.rows[0]).toHaveLength(2);
    expect(t.rows[0][0]).toEqual([{ k: 'a', id: 'a1', s: 'Ataque' }]);
  });
});
