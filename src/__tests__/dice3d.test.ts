import { describe, expect, it } from 'vitest';
import { faceLabels, polyFor, rotate, topFace, type V3 } from '../dice3d/polyhedra';

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('geometría de los dados 3D', () => {
  it.each([[4, 4, 3], [6, 6, 4], [8, 8, 3], [10, 10, 4], [12, 12, 5], [20, 20, 3], [100, 10, 4]])('d%i tiene %i caras de %i lados, planas y hacia fuera', (sides, faces, edges) => {
    const p = polyFor(sides);
    expect(p.faces).toHaveLength(faces);
    p.faces.forEach((f, i) => {
      expect(f).toHaveLength(edges);
      const d = dot(p.normals[i], p.vertices[f[0]]);
      f.forEach((v) => expect(dot(p.normals[i], p.vertices[v])).toBeCloseTo(d, 4)); // plana
      expect(dot(p.normals[i], p.centers[i])).toBeGreaterThan(0); // normal hacia fuera
    });
  });

  it('la cara de arriba es la que más mira hacia arriba tras rotar', () => {
    const p = polyFor(6);
    const id: [number, number, number, number] = [0, 0, 0, 1];
    expect(p.normals[topFace(p, id)]).toEqual([0, 1, 0].map((x) => expect.closeTo(x, 6)));
    // 90° alrededor de X: la cara que miraba hacia +Z pasa a mirar hacia arriba
    const s = Math.SQRT1_2;
    const q: [number, number, number, number] = [-s, 0, 0, s];
    const t = topFace(p, q);
    expect(rotate(q, p.normals[t])[1]).toBeCloseTo(1, 6);
    expect(p.normals[t][2]).toBeCloseTo(1, 6);
  });

  it('renumera para que la cara de arriba muestre el resultado de la app', () => {
    for (const sides of [4, 6, 8, 10, 12, 20]) {
      const n = polyFor(sides).faces.length;
      for (let top = 0; top < n; top++) for (let value = 1; value <= sides; value++) {
        const l = faceLabels(sides, top, value);
        expect(l[top]).toBe(String(value));
        expect(new Set(l).size).toBe(n); // sin números repetidos
      }
    }
    expect(faceLabels(100, 3, 47)[3]).toBe('47');
  });
});
