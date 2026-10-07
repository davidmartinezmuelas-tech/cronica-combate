import { describe, expect, it } from 'vitest';
import { blankCharacter, expandCustomFeats } from '../engine/character';
import { featCatOf, splitFeatText } from '../engine/featText';

describe('dotes escritas en lista', () => {
  it('separa una lista en una sola línea o en varias', () => {
    expect(splitFeatText('- Duro: más vida - Protección: reacción a 1,5 m si llevo escudo')).toEqual([
      { n: 'Duro', d: 'más vida' },
      { n: 'Protección', d: 'reacción a 1,5 m si llevo escudo' },
    ]);
    expect(splitFeatText('• Alerta: iniciativa\n• Mi dote rara\n  sigue aquí')).toEqual([
      { n: 'Alerta', d: 'iniciativa' },
      { n: 'Mi dote rara', d: 'sigue aquí' },
    ]);
  });
  it('no toca un texto normal ni un guion dentro de una frase', () => {
    expect(splitFeatText('Inventor')).toBeNull();
    expect(splitFeatText('Golpe - fuerte: hace más daño')).toBeNull();
    expect(splitFeatText('Texto previo\n- A: x\n- B: y')).toBeNull();
  });
  it('clasifica por el nombre y la hoja la cuenta como dotes separadas (con su efecto)', () => {
    expect(featCatOf('Protección')).toBe('fighting-style');
    expect(featCatOf('Duro')).toBe('origin');
    expect(featCatOf('Inventada')).toBeNull();
    const c = { ...blankCharacter(), customFeats: [{ id: 'f1', n: '- Duro: más vida - Protección: escudo', d: '', cat: 'other' as const, max: null, per: '' as const }] };
    expect(expandCustomFeats(c.customFeats).map((f) => [f.n, f.cat])).toEqual([['Duro', 'origin'], ['Protección', 'fighting-style']]);
  });
});
