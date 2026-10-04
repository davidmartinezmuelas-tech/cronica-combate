import { describe, expect, it } from 'vitest';
import { heightAt, throwFrames, throwOrigin } from '../engine/throw';

describe('lanzamiento de los dados', () => {
  const fr = throwFrames({ dx: -300, dy: 200, spin: 720, tilt: 40 });

  it('acaba en reposo, derecho y en su sitio', () => {
    const last = fr.die[fr.die.length - 1];
    expect(last.offset).toBe(1);
    expect(last.transform).toBe('translate(0px,0px) perspective(400px) rotateX(0deg) rotateY(0deg) rotate(0deg) scale(1)');
    expect(fr.shadow[fr.shadow.length - 1].transform).toBe('translate(0px,0px) scale(1)');
  });

  it('empieza fuera de su sitio, girado y en el aire, y entra con un fundido', () => {
    expect(fr.die[0].transform).toContain('translate(-300px,200px)');
    expect(fr.die[0].transform).toContain('rotate(720deg)');
    expect(fr.die[0].transform).toContain('scale(1.5)');
    expect(fr.die[0].opacity).toBe(0);
  });

  it('bota cada vez más bajo y toca el tapete entre botes', () => {
    expect(heightAt(0.38)).toBeCloseTo(0, 5);
    const peaks = [0.5, 0.705, 0.845].map(heightAt);
    expect(peaks[0]).toBeGreaterThan(peaks[1]);
    expect(peaks[1]).toBeGreaterThan(peaks[2]);
    expect(heightAt(0.95)).toBe(0);
  });

  it('el avance se frena: recorre más al principio que al final', () => {
    const x = (i: number) => Number(/translate\((-?[\d.]+)px/.exec(String(fr.die[i].transform))![1]);
    expect(Math.abs(x(0) - x(9))).toBeGreaterThan(Math.abs(x(27) - x(36)) * 5);
  });

  it('los dados salen de fuera del tapete', () => {
    const seq = [0.1, 0.5, 0.6, 0.3, 0.9, 0.2];
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    for (let k = 0; k < 3; k++) {
      const o = throwOrigin(rng);
      expect(o.ox < 0 || o.ox > 1 || o.oy > 1).toBe(true);
    }
  });
});
