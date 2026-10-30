import { describe, expect, it } from 'vitest';
import { draftText, HIST_MAX, historyText, kindOf, makeHist, normHist, pushHist } from '../engine/history';

describe('historial del combate', () => {
  it('clasifica por el título y compone el texto', () => {
    expect(kindOf('Goblin recibe 7 de daño')).toBe('dano');
    expect(kindOf('Tarek se cura')).toBe('cura');
    expect(kindOf('Brenna muere')).toBe('muerte');
    expect(kindOf('Tarek pierde la concentración')).toBe('estado');
    expect(kindOf('Ronda 2')).toBe('otro');
    expect(draftText({ label: 'Goblin recibe 7 de daño', detail: '7 cortante', total: '3/10' })).toBe('Goblin recibe 7 de daño · 7 cortante (3/10)');
  });
  it('respeta el tope descartando lo más antiguo', () => {
    const many = Array.from({ length: HIST_MAX + 20 }, (_, i) => makeHist('otro', 'n' + i, 1, i));
    const out = pushHist([], many);
    expect(out).toHaveLength(HIST_MAX);
    expect(out[0].text).toBe('n20');
    const same: never[] = [];
    expect(pushHist(same, [])).toBe(same);
  });
  it('repara lo dañado y agrupa por rondas al copiar', () => {
    const h = normHist([{ t: 1, r: 1, k: 'dano', text: 'A' }, { t: 2, r: 2, k: 'raro', text: 'B' }, { r: 3 }, null, 'x', { t: 5, r: 0, text: 'C' }]);
    expect(h.map((e) => [e.r, e.k, e.text])).toEqual([[1, 'dano', 'A'], [2, 'otro', 'B'], [1, 'otro', 'C']]);
    expect(normHist(undefined)).toEqual([]);
    expect(historyText(h)).toBe('Ronda 1\n- A\n\nRonda 2\n- B\n\nRonda 1\n- C');
    expect(historyText(h, ['dano'])).toBe('Ronda 1\n- A');
  });
});
