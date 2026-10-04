/**
 * Geometría de los dados (sin dependencias: la usan la física, el dibujo y los tests).
 * Cada dado se describe por sus vértices; las caras se obtienen como envolvente
 * convexa, así no hay listas de caras escritas a mano que puedan estar mal.
 */
export type V3 = [number, number, number];

/** Fotogramas por segundo de la simulación y de la reproducción. */
export const FPS = 60;

export interface Poly {
  sides: number;
  vertices: V3[];
  faces: number[][]; // índices de vértices, en sentido antihorario visto desde fuera
  normals: V3[];
  centers: V3[];
}

const PHI = (1 + Math.sqrt(5)) / 2;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.sqrt(dot(a, a));
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function rawVertices(sides: number): V3[] {
  switch (sides) {
    case 4: return [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];
    case 6: { const v: V3[] = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]); return v; }
    case 8: return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case 10: {
      // trapezoedro pentagonal: altura del vértice h = z·(1+cos36°)/(1−cos36°) para que las cometas sean planas
      const z = 0.1;
      const c = Math.cos(Math.PI / 5);
      const h = (z * (1 + c)) / (1 - c);
      const v: V3[] = [[0, h, 0], [0, -h, 0]];
      for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5; v.push([Math.cos(a), i % 2 ? -z : z, Math.sin(a)]); }
      return v;
    }
    case 12: {
      const v: V3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
      for (const a of [-1, 1]) for (const b of [-1, 1]) { v.push([0, a / PHI, b * PHI]); v.push([a / PHI, b * PHI, 0]); v.push([a * PHI, 0, b / PHI]); }
      return v;
    }
    case 20: {
      const v: V3[] = [];
      for (const a of [-1, 1]) for (const b of [-1, 1]) { v.push([0, a, b * PHI]); v.push([a, b * PHI, 0]); v.push([a * PHI, 0, b]); }
      return v;
    }
    default: throw new Error('Dado no soportado: d' + sides);
  }
}

/** Caras de la envolvente convexa: planos que dejan todos los vértices a un lado. */
function hullFaces(v: V3[]): number[][] {
  const eps = 1e-6;
  const seen = new Set<string>();
  const faces: number[][] = [];
  const centroid: V3 = v.reduce<V3>((s, p) => [s[0] + p[0] / v.length, s[1] + p[1] / v.length, s[2] + p[2] / v.length], [0, 0, 0]);
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) for (let k = j + 1; k < v.length; k++) {
    let n = cross(sub(v[j], v[i]), sub(v[k], v[i]));
    if (len(n) < eps) continue;
    n = norm(n);
    let d = dot(n, v[i]);
    if (dot(n, centroid) > d) { n = [-n[0], -n[1], -n[2]]; d = -d; }
    if (v.some((p) => dot(n, p) - d > eps * 100)) continue;
    const on = v.map((p, idx) => [p, idx] as const).filter(([p]) => Math.abs(dot(n, p) - d) < 1e-4).map(([, idx]) => idx);
    const key = on.slice().sort((a, b) => a - b).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    // ordenar alrededor del centro de la cara, en sentido antihorario visto desde fuera
    const c: V3 = on.reduce<V3>((s, idx) => [s[0] + v[idx][0] / on.length, s[1] + v[idx][1] / on.length, s[2] + v[idx][2] / on.length], [0, 0, 0]);
    const u = norm(sub(v[on[0]], c));
    const w = cross(n, u);
    on.sort((a, b) => {
      const pa = sub(v[a], c);
      const pb = sub(v[b], c);
      return Math.atan2(dot(pa, w), dot(pa, u)) - Math.atan2(dot(pb, w), dot(pb, u));
    });
    faces.push(on);
  }
  return faces;
}

const cache = new Map<number, Poly>();

/** Poliedro de un dado escalado a radio circunscrito 1. */
export function polyFor(sides: number): Poly {
  const key = sides === 100 ? 10 : sides;
  const hit = cache.get(key);
  if (hit) return hit;
  const raw = rawVertices(key);
  const r = Math.max(...raw.map(len));
  const vertices = raw.map((p): V3 => [p[0] / r, p[1] / r, p[2] / r]);
  const faces = hullFaces(vertices);
  const normals: V3[] = faces.map((f) => norm(cross(sub(vertices[f[1]], vertices[f[0]]), sub(vertices[f[2]], vertices[f[0]]))));
  const centers: V3[] = faces.map((f) => f.reduce<V3>((s, i) => [s[0] + vertices[i][0] / f.length, s[1] + vertices[i][1] / f.length, s[2] + vertices[i][2] / f.length], [0, 0, 0]));
  const p: Poly = { sides: key, vertices, faces, normals, centers };
  cache.set(key, p);
  return p;
}

/** Rota un vector por un cuaternión [x, y, z, w]. */
export function rotate(q: [number, number, number, number], v: V3): V3 {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

/** Cara que queda mirando hacia arriba (hacia la cámara) con la orientación final. */
export function topFace(poly: Poly, q: [number, number, number, number]): number {
  let best = 0;
  let by = -Infinity;
  poly.normals.forEach((n, i) => { const y = rotate(q, n)[1]; if (y > by) { by = y; best = i; } });
  return best;
}

/**
 * Números de cada cara para que la cara de arriba muestre `value`.
 * Parte de la numeración normal (1…N) e intercambia solo dos caras,
 * como un dado de verdad al que se le hubiera girado la etiqueta.
 * En el d100 la cara de arriba lleva el valor (1–100) y el resto, decenas.
 */
export function faceLabels(sides: number, top: number, value: number): string[] {
  const n = polyFor(sides).faces.length;
  if (sides === 100) {
    const tens = Array.from({ length: n }, (_, i) => String(i === 0 ? 100 : i * 10));
    tens[top] = String(value);
    return tens;
  }
  const labels = Array.from({ length: n }, (_, i) => String(i + 1));
  const at = labels.indexOf(String(value));
  if (at >= 0 && at !== top) [labels[at], labels[top]] = [labels[top], labels[at]];
  else if (at < 0) labels[top] = String(value);
  return labels;
}
