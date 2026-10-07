import { describe, expect, it } from 'vitest';
import { spellCast, spellRoll } from '../engine/spellRoll';

// textos inventados con la forma de los del SRD y del libro
const BURST = 'Una explosión llena la zona. Cada criatura hace una tirada de salvación de Destreza: recibe 6d6 de daño de Fuego si falla o la mitad del daño si tiene éxito. **Usar un espacio de conjuro de nivel superior.** El daño aumenta en 1d6 por cada nivel del espacio de conjuro por encima de 2.';
const BOLT = 'Haz un ataque de conjuro a distancia contra el objetivo. Si impactas, recibe 1d10 de daño de Fuerza. **Mejora de truco.** El conjuro crea dos rayos a nivel 5, tres rayos a nivel 11 y cuatro rayos a nivel 17.';
const SPARK = 'El objetivo debe superar una tirada de salvación de Destreza o recibir 1d8 de daño Radiante. **Mejora de truco.** El daño aumenta en 1d8 cuando alcanzas los niveles 5 (2d8), 11 (3d8) y 17 (4d8).';
const MEND = 'Una criatura que tocas recupera una cantidad de Puntos de Golpe igual a 2d8 + tu modificador de característica de lanzamiento de conjuros. **Usar un espacio de conjuro de nivel superior.** La curación aumenta en 2d8 por cada nivel del espacio de conjuro por encima de 1.';
const DARTS = 'Creas tres dardos de luz. Un dardo inflige 1d4 + 1 de daño de Fuerza. **Usar un espacio de conjuro de nivel superior.** El conjuro crea un dardo más por cada nivel del espacio de conjuro por encima de 1.';
const BLADE = 'Puedes hacer un ataque de conjuro cuerpo a cuerpo. Si acierta, el objetivo recibe una cantidad de daño de fuerza igual a 148 más tu modificador por aptitud mágica.';
const CHAIN = 'Lanzas un rayo y luego tres rayos más saltan a otros objetivos. Cada uno hace una tirada de salvación de Destreza y recibe 10d8 de daño de relámpago, o la mitad del daño si la supera.';

describe('tiradas de conjuros', () => {
  it('salvación, mitad y daño que sube con el espacio', () => {
    const r = spellRoll(BURST)!;
    expect([r.save, r.half, r.damage?.dice, r.damage?.type, r.upDice]).toEqual(['dex', true, '6d6', 'fuego', '1d6']);
    expect(spellCast(r, 2, 2, 5, 3).dmg!.expr).toBe('6d6');
    expect(spellCast(r, 2, 4, 9, 3).dmg!.expr).toBe('8d6');
  });

  it('trucos: más dados o más rayos con el nivel del personaje', () => {
    const b = spellRoll(BOLT)!;
    expect([b.attack, b.cantrip]).toEqual(['a distancia', 'count']);
    expect([1, 5, 11, 17].map((l) => spellCast(b, 0, 0, l, 3).count)).toEqual([1, 2, 3, 4]);
    const s = spellRoll(SPARK)!;
    expect([1, 5, 11, 17].map((l) => spellCast(s, 0, 0, l, 3).dmg!.expr)).toEqual(['1d8', '2d8', '3d8', '4d8']);
    // Lanzamiento de conjuros potente: + el modificador al daño del truco
    expect(spellCast(s, 0, 0, 7, 4, true).dmg!.expr).toBe('2d8+4');
  });

  it('curación con el modificador, dardos que suben con el espacio, dados estropeados por el OCR y áreas sin multiplicar', () => {
    const m = spellRoll(MEND)!;
    expect(spellCast(m, 1, 3, 5, 3).heal).toBe('6d8+3');
    expect(m.damage).toBeNull();
    const d = spellRoll(DARTS)!;
    const c = spellCast(d, 1, 2, 3, 3);
    expect([c.count, c.dmg!.expr]).toEqual([4, '1d4+1']);
    expect(spellCast(spellRoll(BLADE)!, 2, 2, 3, 4).dmg!.expr).toBe('1d8+4');
    expect(spellCast(spellRoll(CHAIN)!, 6, 6, 11, 3).count).toBe(1);
    expect(spellRoll('Sin tiradas: solo luz.')).toBeNull();
  });
});
