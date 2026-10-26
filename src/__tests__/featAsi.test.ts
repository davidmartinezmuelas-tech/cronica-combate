import { describe, expect, it } from 'vitest';
import { blankCharacter } from '../engine/character';
import { applyFeatAsi, featAsi, featAsiOptions, removeFeatAsi } from '../engine/featAsi';
import type { PlayerData } from '../data/player';

const data = { classes: [{ id: 'fighter', saves: ['str', 'con'] }] } as unknown as PlayerData;

describe('mejora de característica de las dotes', () => {
  it('lee las características que puede subir', () => {
    expect(featAsi('Obtienes los siguientes beneficios:\n\nMejora de característica. Aumenta tu puntuación de Fuerza o Destreza en 1, hasta un máximo de 20.\n\nVelocidad trepando.')).toMatchObject({ from: ['str', 'dex'], max: 20, save: false });
    expect(featAsi('Mejora de característica. Aumenta tu puntuación de Inteligencia, Sabiduría o Carisma en 1, hasta un máximo de 20.')?.from).toEqual(['int', 'wis', 'cha']);
    expect(featAsi('**Mejora de puntuación de característica.** Aumenta en 1 tu puntuación de fuerza o destreza, hasta un máximo de 20.')?.from).toEqual(['str', 'dex']);
    expect(featAsi('Mejora de característica. Aumenta una puntuación de característica de tu elección en 1, hasta un máximo de 20.')?.from).toHaveLength(6);
  });
  it('un don épico llega a 30 y la dote de mejora general no cuenta', () => {
    expect(featAsi('**Mejora de puntuación de característica.** Aumenta en 1 una puntuación de característica de tu elección, hasta un máximo de 30.')?.max).toBe(30);
    expect(featAsi('Aumenta en 2 una puntuación de característica que elijas o aumenta dos en 1 cada una. Esta dote no puede aumentar una puntuación de característica por encima de 20.')).toBeNull();
    expect(featAsi('Ganas competencia en cualquier combinación de tres habilidades o herramientas.')).toBeNull();
  });
  it('Resiliente: una característica sin competencia en su salvación, que además la da', () => {
    const fa = featAsi('Obtienes los siguientes beneficios:\n\nMejora de característica. Elige una característica en la que no tengas competencia en tiradas de salvación. Aumenta la puntuación de característica en 1, hasta un máximo de 20.\n\nCompetencia en tiradas de salvación. Ganas competencia en las tiradas de salvación de la característica elegida.')!;
    expect(fa).toMatchObject({ save: true, noSave: true, max: 20 });
    const c = { ...blankCharacter(), classId: 'fighter', level: 4 };
    const opts = featAsiOptions(fa, c, data);
    expect(opts).toEqual(['dex', 'int', 'wis', 'cha']);
    const up = applyFeatAsi(c, 'Resiliente', fa, 'wis', data);
    expect(up.abil!.wis).toBe(11);
    expect(up.saveExtra).toEqual(['wis']);
    const back = removeFeatAsi({ ...c, ...up } as typeof c, 'Resiliente');
    expect(back.abil!.wis).toBe(10);
    expect(back.saveExtra).toEqual([]);
    expect(back.choices!['feat.asi']).toEqual([]);
  });
  it('no pasa del tope', () => {
    const fa = featAsi('Mejora de característica. Aumenta tu puntuación de Fuerza o Destreza en 1, hasta un máximo de 20.')!;
    const c = { ...blankCharacter(), abil: { ...blankCharacter().abil, str: 20 } };
    expect(featAsiOptions(fa, c, null)).toEqual(['dex']);
  });
});
