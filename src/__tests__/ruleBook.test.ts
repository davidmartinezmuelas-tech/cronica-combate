import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBook, chapterId } from '../engine/ruleBook';
import { searchRules, type RulesData } from '../engine/rules';

const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/reglas_es.json'), 'utf8')) as RulesData;

describe('libro de reglas', () => {
  const book = buildBook(data.e);
  it('capítulos en orden de lectura y conjuros los últimos; no se pierde ninguna entrada', () => {
    expect(book[0].cat).toBe('Reglas rápidas');
    expect(book[book.length - 1].cat).toBe('Conjuros');
    expect(book.reduce((n, c) => n + c.entries.length, 0)).toBe(data.e.length);
    expect(new Set(book.map((c) => c.id)).size).toBe(book.length);
    expect(chapterId('Daño y curación')).toBe('rule-cat-dano-y-curacion');
  });
  it('dentro de un capítulo manda el orden del libro; estados, glosario y conjuros van de la A a la Z', () => {
    const names = (cat: string) => book.find((c) => c.cat === cat)!.entries.map((e) => e.n);
    expect(names('Combate').slice(0, 3)).toEqual(['Visión general', 'El orden del combate', 'Iniciativa']);
    const est = names('Estados');
    expect(est).toEqual([...est].sort((a, b) => a.localeCompare(b, 'es')));
  });
  it('los atajos y los nombres alternativos se encuentran', () => {
    expect(searchRules(data.e, 'empujar')[0].n).toBe('Empujar');
    expect(searchRules(data.e, 'ataque desarmado')[0].n).toBe('Golpe sin armas');
    expect(searchRules(data.e, 'dos armas')[0].n).toBe('Combate con dos armas');
    expect(searchRules(data.e, 'zafarse')[0].n).toBe('Escapar de un agarre');
  });
});
