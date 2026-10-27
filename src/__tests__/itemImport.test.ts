import { describe, expect, it } from 'vitest';
import { parseItems, parseItemsEs } from '../engine/itemImport';

const L = (...t: string[]) => t.map((x, i) => ({ t: x, col: 0, y: 700 - i }));

describe('importar objetos mágicos de la guía', () => {
  const lines = L(
    'Test Ring of Protection',
    'Ring, Rare (Requires Attunement)',
    'You gain a +1 bonus to Armor Class and saving throws while wearing this ring.',
    'Test Amulet of Health',
    'Wondrous Item, Rare (Requires Attunement)',
    'Your Constitution is 19 while you wear this amulet.',
    'ARTIST: SOMEONE',
    'Test Weapon, +1, +2, or +3',
    'Weapon (Any), Uncommon (+1), Rare (+2), or Very Rare (+3)',
    'You have a bonus to attack rolls and damage rolls with this weapon.',
    'Test Healing Potion',
    'Potion, Common',
    'You regain 2d4 + 2 Hit Points when you drink this potion.',
    'Test Staff of Sparks',
    'Staff, Rare (Requires Attunement)',
    'The staff has 10 charges and regains some at dawn.',
  );
  const items = parseItems(lines);
  const by = (n: string) => items.find((i) => i.n === n)!;
  it('lee tipo, rareza y sintonía', () => {
    expect(by('Test Ring of Protection')).toMatchObject({ kind: 'ring', rarity: 'raro', attune: true });
    expect(by('Test Healing Potion')).toMatchObject({ kind: 'potion', rarity: 'común', attune: false });
  });
  it('saca los efectos del texto', () => {
    expect(by('Test Ring of Protection').mods).toEqual([{ k: 'ac', v: 1 }, { k: 'saves', v: 1 }]);
    expect(by('Test Amulet of Health').mods).toEqual([{ k: 'abilSet', abil: 'con', v: 19 }]);
    expect(by('Test Healing Potion')).toMatchObject({ roll: '2d4+2', charges: { max: 1, per: '' } });
    expect(by('Test Staff of Sparks').charges).toEqual({ max: 10, per: 'lr' });
  });
  it('«+1, +2, o +3» da tres objetos con su rareza y se ignoran los créditos', () => {
    expect(items.map((i) => i.n)).toEqual(['Test Ring of Protection', 'Test Amulet of Health', 'Test Weapon +1', 'Test Weapon +2', 'Test Weapon +3', 'Test Healing Potion', 'Test Staff of Sparks']);
    expect(by('Test Weapon +3')).toMatchObject({ rarity: 'muy raro', mods: [{ k: 'wBonus', v: 3 }] });
    expect(by('Test Amulet of Health').d).not.toMatch(/ARTIST/);
  });
});

describe('importar objetos de la guía en español', () => {
  const items = parseItemsEs(L(
    'Texto del objeto anterior que acaba bien.',
    'ANILLO DE PRUEBA',
    'Anillo, raro (requiere sintonización)',
    'Recibes un bonificador de +1 a la clase de armadura y a las',
    'tiradas de salvación mientras lleves puesto este anillo.',
    'AMULETO DE SALUD',
    'Objeto maravilloso, raro (requiere sintonización)',
    'Tu Constitución es de 19 mientras lleves puesto este amuleto.',
    'BASTÓN DE LA PRUEBA',
    'DE LOS DOS RENGLONES',
    'Bastón, muy raro (requiere sintonización por parte de un',
    'mago)',
    'Mientras lo empuñes, tendrás resistencia al daño de fuego. El bastón tiene 10 cargas y recupera algunas al amanecer.',
    'ARMA +l, +2 0 +3',
    'Arma (cualquiera), infrecuente (+1), rara (+2) o muy rara (+3)',
    'Tienes un bonificador a las tiradas de ataque y de daño.',
  ));
  const by = (n: string) => items.find((i) => i.n === n)!;
  it('lee título (también en dos líneas), tipo, rareza y sintonía', () => {
    expect(by('Anillo de prueba')).toMatchObject({ kind: 'ring', rarity: 'raro', attune: true, es: true });
    expect(by('Bastón de la prueba de los dos renglones')).toMatchObject({ kind: 'staff', rarity: 'muy raro', attune: true });
  });
  it('saca los efectos del texto en español', () => {
    expect(by('Anillo de prueba').mods).toEqual([{ k: 'ac', v: 1 }, { k: 'saves', v: 1 }]);
    expect(by('Amuleto de salud').mods).toEqual([{ k: 'abilSet', abil: 'con', v: 19 }]);
    expect(by('Bastón de la prueba de los dos renglones')).toMatchObject({ charges: { max: 10, per: 'lr' }, mods: [{ k: 'resist', type: 'fuego' }] });
  });
  it('«+1, +2 o +3» (con el «+l» del OCR) da tres objetos', () => {
    expect(items.filter((i) => i.n.startsWith('Arma +')).map((i) => [i.n, i.rarity])).toEqual([['Arma +1', 'poco común'], ['Arma +2', 'raro'], ['Arma +3', 'muy raro']]);
  });
});
