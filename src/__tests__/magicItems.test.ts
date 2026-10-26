import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerData } from '../data/player';
import { blankCharacter, derive, type Character } from '../engine/character';
import { attunedCount, itemEffects, ITEM_PRESETS, type MagicItem } from '../engine/magicItems';

const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/jugador_es.json'), 'utf8')) as PlayerData;
const item = (n: string, over: Partial<MagicItem>): MagicItem => ({ id: 'mi-' + n, n, kind: 'wondrous', rarity: 'raro', attune: true, attuned: true, worn: true, d: '', mods: [], ...over });
const pj = (items: MagicItem[], over: Partial<Character> = {}): Character => ({ ...blankCharacter(), classId: 'wizard', level: 5, abil: { str: 10, dex: 14, con: 12, int: 16, wis: 10, cha: 8 }, magicItems: items, ...over });

describe('objetos mágicos', () => {
  it('solo cuentan si están puestos y, si lo piden, sintonizados', () => {
    const ring = item('Anillo de protección', { mods: [{ k: 'ac', v: 1 }, { k: 'saves', v: 1 }] });
    const base = derive(pj([]), data);
    const on = derive(pj([ring]), data);
    expect(on.ac).toBe(base.ac + 1);
    expect(on.saves.wis.bonus).toBe(base.saves.wis.bonus + 1);
    expect(derive(pj([{ ...ring, worn: false }]), data).ac).toBe(base.ac);
    expect(derive(pj([{ ...ring, attuned: false }]), data).ac).toBe(base.ac);
    expect(derive(pj([{ ...ring, attune: false, attuned: false }]), data).ac).toBe(base.ac + 1);
  });
  it('una característica fija solo sube; un aumento suma con tope 30', () => {
    const gaunt = item('Guanteletes', { mods: [{ k: 'abilSet', abil: 'str', v: 19 }] });
    expect(derive(pj([gaunt]), data).abil.str).toBe(19);
    expect(derive(pj([gaunt], { abil: { ...blankCharacter().abil, str: 21 } }), data).abil.str).toBe(21);
    const tome = item('Tomo', { mods: [{ k: 'abilAdd', abil: 'int', v: 2 }] });
    expect(derive(pj([tome]), data).abil.int).toBe(18);
    expect(derive(pj([tome], { abil: { ...blankCharacter().abil, int: 29 } }), data).abil.int).toBe(30);
    // el modificador sale de la puntuación con el objeto
    expect(derive(pj([gaunt]), data).mods.str).toBe(4);
  });
  it('PG, velocidad, iniciativa, CD y ataque de conjuros y resistencias', () => {
    const it1 = item('Todo', { mods: [{ k: 'hp', v: 10 }, { k: 'speed', v: 10 }, { k: 'init', v: 2 }, { k: 'spellDc', v: 1 }, { k: 'spellAtk', v: 1 }, { k: 'resist', type: 'fuego' }] });
    const a = derive(pj([]), data);
    const b = derive(pj([it1]), data);
    expect(b.hpMax).toBe(a.hpMax + 10);
    expect(b.speed).toBe(a.speed + 10);
    expect(b.init).toBe(a.init + 2);
    expect(b.spell!.dc).toBe(a.spell!.dc + 1);
    expect(b.spell!.atk).toBe(a.spell!.atk + 1);
    expect(b.resist.some((r) => r.type === 'fuego' && r.why === 'Todo')).toBe(true);
  });
  it('con la CA fijada a mano, el objeto no la cambia', () => {
    const ring = item('Anillo', { mods: [{ k: 'ac', v: 1 }] });
    expect(derive(pj([ring], { ov: { ac: 15 } }), data).ac).toBe(15);
  });
  it('cuenta la sintonía y los ejemplos son válidos', () => {
    expect(attunedCount([item('a', {}), item('b', { attuned: false }), item('c', { attune: false })])).toBe(1);
    expect(itemEffects(undefined).ac).toBe(0);
    for (const p of ITEM_PRESETS) expect(p.n.length).toBeGreaterThan(2);
  });
});
