import { describe, expect, it } from 'vitest';
import { matchScore, rankBy } from '../engine/search';

describe('búsqueda por relevancia', () => {
  const beasts = [
    { n: 'Capitán hobgoblin', en: 'Hobgoblin Captain' },
    { n: 'Jefe goblin', en: 'Goblin Boss' },
    { n: 'Goblin guerrero', en: 'Goblin Warrior' },
    { n: 'Aboleth', en: 'Aboleth' },
    { n: 'Goblin', en: 'Goblin' },
  ];
  const names = (b: { n: string; en: string }) => [b.n, b.en];

  it('lo idéntico primero, luego lo que empieza igual, luego palabras y al final lo que lo contiene', () => {
    expect(rankBy(beasts, 'goblin', names).map((b) => b.n)).toEqual(['Goblin', 'Goblin guerrero', 'Jefe goblin', 'Capitán hobgoblin']);
  });

  it('sin acentos ni mayúsculas, y el nombre en inglés también cuenta', () => {
    expect(matchScore('capitan', 'Capitán hobgoblin')).toBe(3);
    expect(rankBy(beasts, 'BOSS', names).map((b) => b.n)).toEqual(['Jefe goblin']);
  });

  it('sin búsqueda devuelve todo en el mismo orden', () => {
    expect(rankBy(beasts, '  ', names)).toBe(beasts);
  });
});
