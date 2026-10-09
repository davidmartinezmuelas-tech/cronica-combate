import { describe, expect, it } from 'vitest';
import { featureUses, textUses } from '../engine/featureUses';

// textos inventados con las fórmulas habituales de los rasgos 2024
describe('usos de un rasgo según su texto', () => {
  it('modificador de característica, competencia y número fijo', () => {
    expect(textUses('Puedes hacerlo una cantidad de veces igual a tu modificador por Carisma (mínimo una vez) y recuperas todos los usos tras finalizar un descanso largo.')).toEqual({ max: 'max(1, @abilities.cha.mod)', per: 'lr' });
    expect(textUses('Un número de veces igual a tu bonificador por competencia; recuperas los usos tras un descanso corto o largo.')).toEqual({ max: '@prof', per: 'sr' });
    expect(textUses('Puedes usarlo dos veces y recuperas los usos tras un descanso largo.')).toEqual({ max: '2', per: 'lr' });
  });
  it('una vez por descanso, mirando el descanso de esa regla', () => {
    expect(textUses('Brillas. Una vez que uses este rasgo, no podrás volver a hacerlo hasta que finalices un descanso corto o largo.')).toEqual({ max: '1', per: 'sr' });
    expect(textUses('Puedes lanzarlo sin gastar un espacio, pero debes terminar un descanso largo antes de poder lanzarlo de este modo de nuevo.')).toEqual({ max: '1', per: 'lr' });
    expect(textUses('Lanzas el conjuro una cantidad de veces igual a tu modificador por Sabiduría y recuperas los usos tras un descanso largo. Otra cosa distinta se recupera tras un descanso corto.')?.per).toBe('lr');
  });
  it('sin usos o con un conjuro por nivel', () => {
    expect(textUses('Tienes ventaja en las pruebas de Sigilo.')).toBeNull();
    expect(featureUses('Arcano místico', '', 15)).toEqual({ max: '3', per: 'lr' });
    expect(featureUses('Arcano místico', '', 10)).toBeNull();
  });
});
