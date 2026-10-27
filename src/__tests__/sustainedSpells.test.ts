import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerData } from '../data/player';
import { blankCharacter, derive, type Character } from '../engine/character';
import { spellFx } from '../engine/spellEffects';

const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/jugador_es.json'), 'utf8')) as PlayerData;
const pj = (over: Partial<Character> = {}): Character => ({ ...blankCharacter(), classId: 'cleric', level: 5, abil: { str: 10, dex: 14, con: 12, int: 10, wis: 16, cha: 8 }, ...over });
const active = (en: string, n: string) => ({ k: spellFx({ en, n })!.key, n, lv: 3, conc: false, at: 0 });

describe('conjuros de efecto sostenido en la hoja', () => {
  it('Aura sagrada: ventaja en todas las salvaciones; Señal de esperanza, solo Sabiduría', () => {
    const holy = derive(pj({ active: [active('Holy Aura', 'Aura sagrada')] }), data);
    expect(Object.values(holy.saves).every((s) => s.adv)).toBe(true);
    const bea = derive(pj({ active: [active('Beacon of Hope', 'Señal de esperanza')] }), data);
    expect(bea.saves.wis.adv).toBeTruthy();
    expect(bea.saves.dex.adv).toBeUndefined();
  });
  it('Vínculo protector suma +1 a la CA y a las salvaciones; Pasar sin rastro, +10 a Sigilo', () => {
    const base = derive(pj(), data);
    const bond = derive(pj({ active: [active('Warding Bond', 'Vínculo protector')] }), data);
    expect(bond.ac).toBe(base.ac + 1);
    expect(bond.saves.str.bonus).toBe(base.saves.str.bonus + 1);
    const pass = derive(pj({ active: [active('Pass without Trace', 'Pasar sin rastro')] }), data);
    expect(pass.skills.ste.bonus).toBe(base.skills.ste.bonus + 10);
    expect(pass.skills.prc.bonus).toBe(base.skills.prc.bonus);
  });
  it('resistencias de Aura de vida, Forma gaseosa y Mente en blanco', () => {
    const r = (en: string, n: string) => derive(pj({ active: [active(en, n)] }), data).resist.map((x) => x.type);
    expect(r('Aura of Life', 'Aura de vida')).toContain('necrótico');
    expect(r('Gaseous Form', 'Forma gaseosa')).toEqual(expect.arrayContaining(['contundente', 'cortante', 'perforante']));
    expect(r('Mind Blank', 'Mente en blanco')).toContain('psíquico');
  });
  it('los conjuros que no son un efecto sostenido siguen sin efecto', () => {
    expect(spellFx({ en: 'Fireball', n: 'Bola de fuego' })).toBeNull();
    expect(spellFx({ en: 'Guidance', n: 'Guía' })).not.toBeNull();
  });
});
