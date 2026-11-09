import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerData } from '../data/player';
import { blankCharacter, derive } from '../engine/character';
import { dkPassives, LIGHT, RUNE_KEY } from '../modes/player/DeathKnightPanel';

const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/jugador_es.json'), 'utf8')) as PlayerData;
const dk = (rune: string, uses: Record<string, number> = {}) => {
  const c = { ...blankCharacter(), classId: 'paladin', level: 5, subclass: 'Oath of the Ebon Blade', choices: { [RUNE_KEY]: [rune] }, uses };
  return { c, d: derive(c, data) };
};

describe('Caballero de la Muerte: runa de Escarcha y el ataque extra de la propiedad Ligera', () => {
  it('el ataque marcado como de acción adicional suma 1d4 de frío sin elegir nada', () => {
    const { c, d } = dk('Frost');
    const r = dkPassives(c, d, ['Ligera'], true)!;
    expect(r.parts).toEqual([{ expr: '1d4', type: 'frío', src: 'Runa de escarcha' }]);
    expect(r.uses[LIGHT]).toBe(0);
  });
  it('un ataque normal no lo suma', () => {
    const { c, d } = dk('Frost');
    expect(dkPassives(c, d, ['Ligera'])!.parts).toEqual([]);
  });
  it('con el modo de acción adicional elegido, el siguiente daño lo suma y el modo se apaga', () => {
    const { c, d } = dk('Frost', { [LIGHT]: 1 });
    const r = dkPassives(c, d, [])!;
    expect(r.parts.map((p) => p.src)).toEqual(['Runa de escarcha']);
    expect(r.uses[LIGHT]).toBe(0);
  });
  it('con otra runa no suma nada', () => {
    const { c, d } = dk('Blood', { [LIGHT]: 1 });
    expect(dkPassives(c, d, ['Ligera'], true)!.parts).toEqual([]);
  });
});
