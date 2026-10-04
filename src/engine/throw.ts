/**
 * Trayectoria de un dado lanzado sobre el tapete, vista desde arriba.
 * Simula vuelo y botes con altura decreciente (la altura se ve como tamaño y
 * separación de la sombra), avance frenado por el rozamiento, giro que se
 * apaga y volteo en 3D mientras está en el aire. Siempre acaba en reposo,
 * derecho y en su sitio, para que el número final se lea.
 */
export interface ThrowParams {
  dx: number; // desplazamiento inicial respecto a su sitio final (px)
  dy: number;
  spin: number; // giro total en grados (signo = sentido)
  tilt: number; // volteo máximo en grados
}

export interface ThrowFrames {
  die: Keyframe[];
  shadow: Keyframe[];
}

/** Momentos en que toca el tapete y altura (relativa) de cada vuelo. */
const CONTACTS = [0.38, 0.62, 0.79, 0.9];
const HEIGHTS = [1, 0.32, 0.12, 0.04];

/** Altura del dado en el instante t (0–1). */
export function heightAt(t: number): number {
  if (t <= 0) return HEIGHTS[0];
  if (t < CONTACTS[0]) { const u = t / CONTACTS[0]; return HEIGHTS[0] * (1 - u * u); }
  for (let i = 0; i < CONTACTS.length - 1; i++) {
    if (t < CONTACTS[i + 1]) {
      const u = (t - CONTACTS[i]) / (CONTACTS[i + 1] - CONTACTS[i]);
      return 4 * HEIGHTS[i + 1] * u * (1 - u);
    }
  }
  return 0;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function throwFrames(p: ThrowParams, samples = 36): ThrowFrames {
  const die: Keyframe[] = [];
  const shadow: Keyframe[] = [];
  for (let k = 0; k <= samples; k++) {
    const t = k / samples;
    const left = Math.pow(1 - t, 3); // el rozamiento frena el avance
    const x = p.dx * left;
    const y = p.dy * left;
    const h = heightAt(t);
    const fade = Math.pow(1 - t, 2);
    const rz = p.spin * Math.pow(1 - t, 2.2);
    const rx = p.tilt * Math.sin(t * Math.PI * 6) * fade;
    const ry = p.tilt * 0.8 * Math.sin(t * Math.PI * 5 + 1.2) * fade;
    const op = t < 0.05 ? t / 0.05 : 1;
    const s = 1 + h * 0.5;
    die.push({
      offset: t,
      opacity: r2(op),
      transform: `translate(${r2(x)}px,${r2(y)}px) perspective(400px) rotateX(${r2(rx)}deg) rotateY(${r2(ry)}deg) rotate(${r2(rz)}deg) scale(${r2(s)})`,
    });
    shadow.push({
      offset: t,
      opacity: r2((0.25 + 0.7 * (1 - h)) * op),
      transform: `translate(${r2(x + h * 16)}px,${r2(y + h * 26)}px) scale(${r2(1 - h * 0.5)})`,
    });
  }
  return { die, shadow };
}

/** Parámetros aleatorios de una tirada: todos los dados salen de la misma mano. */
export function throwOrigin(rng: () => number = Math.random): { ox: number; oy: number } {
  const side = rng();
  if (side < 0.5) return { ox: 0.15 + rng() * 0.7, oy: 1.4 }; // desde el lado del DM
  if (side < 0.75) return { ox: -0.35, oy: 0.2 + rng() * 0.6 };
  return { ox: 1.35, oy: 0.2 + rng() * 0.6 };
}
