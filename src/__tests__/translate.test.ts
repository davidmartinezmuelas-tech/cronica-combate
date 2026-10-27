import { afterEach, describe, expect, it } from 'vitest';
import type { LibItem } from '../engine/magicItems';
import { fixTerms, translateItems } from '../store/translate';

const item = (id: string, d: string, dEn?: string): LibItem => ({ id, n: id, kind: 'other', rarity: 'raro', attune: false, d, mods: [], ...(dEn ? { dEn } : {}) });
const g = globalThis as unknown as { Translator?: unknown };

describe('traducir objetos', () => {
  afterEach(() => { delete g.Translator; });
  it('sin traductor en el navegador avisa', async () => {
    await expect(translateItems([item('a', 'Hi')], () => {}, () => {}, { cancelled: false })).rejects.toThrow(/Chrome/);
  });
  it('traduce por párrafos, guarda el original y se salta lo ya traducido', async () => {
    g.Translator = { availability: async () => 'available', create: async () => ({ translate: async (t: string) => 'ES:' + t }) };
    const got: LibItem[] = [];
    const n = await translateItems([item('a', 'One.\nTwo.'), item('b', 'Hecho', 'Done'), item('c', '')], () => {}, (b) => got.push(...b), { cancelled: false });
    expect(n).toBe(1);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ id: 'a', d: 'ES:One.\nES:Two.', dEn: 'One.\nTwo.' });
  });
  it('detener guarda lo ya hecho y corrige términos del juego', async () => {
    g.Translator = { availability: async () => 'available', create: async () => ({ translate: async (t: string) => t }) };
    const sig = { cancelled: false };
    const got: LibItem[] = [];
    await translateItems([item('a', 'x'), item('b', 'y'), item('c', 'z')], (d) => { if (d === 1) sig.cancelled = true; }, (b) => got.push(...b), sig);
    expect(got.map((x) => x.id)).toEqual(['a']);
    expect(fixTerms('recuperas 5 puntos de impacto en un descanso prolongado')).toBe('recuperas 5 puntos de golpe en un descanso largo');
  });
});
