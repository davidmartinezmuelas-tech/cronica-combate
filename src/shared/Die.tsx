import { useLayoutEffect, useRef } from 'react';
import type { DieView } from '../data/types';
import { throwFrames } from '../engine/throw';

type Pt = [number, number];
interface Geo {
  outer: Pt[];
  face: Pt[]; // cara frontal (lleva el número)
  facets: [Pt[], number][]; // caras laterales y su luz: >0 aclara, <0 oscurece
  num: [number, number]; // centro del número
  size: number;
}

// Siluetas vistas desde arriba, con la luz arriba a la izquierda (viewBox 0 0 100 100).
const D20_T: Pt = [50, 22];
const D20_L: Pt = [19, 72];
const D20_R: Pt = [81, 72];
const HEX: Pt[] = [[50, 2], [94, 26], [94, 74], [50, 98], [6, 74], [6, 26]];
const PENT: Pt[] = [[50, 2], [97, 36], [79, 96], [21, 96], [3, 36]];
const PENT_IN = PENT.map(([x, y]): Pt => [50 + (x - 50) * 0.55, 56 + (y - 56) * 0.55]);

const GEO: Record<number, Geo> = {
  4: {
    outer: [[50, 4], [97, 92], [3, 92]],
    face: [[50, 4], [97, 92], [3, 92]],
    facets: [[[[50, 4], [3, 92], [50, 64]], 0.22], [[[50, 4], [97, 92], [50, 64]], -0.18], [[[3, 92], [97, 92], [50, 64]], -0.32]],
    num: [50, 66], size: 24,
  },
  6: {
    outer: [[6, 6], [94, 6], [94, 94], [6, 94]],
    face: [[20, 20], [80, 20], [80, 80], [20, 80]],
    facets: [[[[6, 6], [94, 6], [80, 20], [20, 20]], 0.3], [[[6, 6], [20, 20], [20, 80], [6, 94]], 0.12], [[[94, 6], [94, 94], [80, 80], [80, 20]], -0.22], [[[6, 94], [20, 80], [80, 80], [94, 94]], -0.36]],
    num: [50, 51], size: 34,
  },
  8: {
    outer: [[50, 2], [98, 50], [50, 98], [2, 50]],
    face: [[50, 2], [84, 64], [16, 64]],
    facets: [[[[50, 2], [16, 64], [2, 50]], 0.2], [[[50, 2], [98, 50], [84, 64]], -0.2], [[[16, 64], [84, 64], [50, 98], [2, 50]], -0.34], [[[84, 64], [98, 50], [50, 98]], -0.42]],
    num: [50, 45], size: 28,
  },
  10: {
    outer: [[50, 2], [95, 40], [90, 62], [50, 98], [10, 62], [5, 40]],
    face: [[50, 8], [76, 46], [50, 74], [24, 46]],
    facets: [
      [[[50, 2], [24, 46], [5, 40]], 0.26], [[[50, 2], [95, 40], [76, 46]], -0.14], [[[5, 40], [24, 46], [50, 74], [10, 62]], 0.06],
      [[[95, 40], [90, 62], [50, 74], [76, 46]], -0.3], [[[10, 62], [50, 74], [90, 62], [50, 98]], -0.42], [[[50, 2], [76, 46], [50, 8]], 0], [[[50, 2], [50, 8], [24, 46]], 0],
    ],
    num: [50, 44], size: 26,
  },
  12: {
    outer: PENT,
    face: PENT_IN,
    facets: [
      [[PENT[4], PENT[0], PENT_IN[0], PENT_IN[4]], 0.3], [[PENT[0], PENT[1], PENT_IN[1], PENT_IN[0]], 0.08], [[PENT[1], PENT[2], PENT_IN[2], PENT_IN[1]], -0.24],
      [[PENT[2], PENT[3], PENT_IN[3], PENT_IN[2]], -0.38], [[PENT[3], PENT[4], PENT_IN[4], PENT_IN[3]], -0.06],
    ],
    num: [50, 58], size: 28,
  },
  20: {
    outer: HEX,
    face: [D20_T, D20_R, D20_L],
    facets: [
      [[HEX[0], HEX[5], D20_T], 0.32], [[HEX[0], D20_T, HEX[1]], 0.12], [[D20_T, D20_L, HEX[5]], 0.2], [[D20_T, HEX[1], D20_R], -0.14],
      [[HEX[1], HEX[2], D20_R], -0.3], [[D20_L, D20_R, HEX[3]], -0.26], [[HEX[2], HEX[3], D20_R], -0.42], [[HEX[3], HEX[4], D20_L], -0.18], [[HEX[4], HEX[5], D20_L], 0.04],
    ],
    num: [50, 57], size: 26,
  },
};

const pts = (p: Pt[]) => p.map(([x, y]) => x + ',' + y).join(' ');

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** Dibujo de un dado (también se usa en los botones de dados rápidos). */
export function DieShape({ sides, value, uidKey }: { sides: number; value?: number | string; uidKey: string }) {
  const g = GEO[sides] || GEO[sides === 100 ? 10 : 6];
  const grad = 'dg-' + uidKey;
  const label = value == null ? '' : String(value);
  return (
    <svg className="die-svg" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--die-a)' }} />
          <stop offset="0.55" style={{ stopColor: 'var(--die-b)' }} />
          <stop offset="1" style={{ stopColor: 'var(--die-c)' }} />
        </linearGradient>
      </defs>
      <polygon className="die-body" points={pts(g.outer)} fill={'url(#' + grad + ')'} />
      {g.facets.map(([p, light], i) => (
        <polygon key={i} points={pts(p)} fill={light > 0 ? '#fff' : '#000'} fillOpacity={Math.abs(light)} className="die-facet" />
      ))}
      <polygon className="die-face" points={pts(g.face)} fill={'url(#' + grad + ')'} />
      <polygon className="die-shine" points={pts(g.face)} fill="url(#die-shine)" />
      {label && (
        <text x={g.num[0]} y={g.num[1]} className="die-label" fontSize={g.size * (label.length > 2 ? 0.7 : label.length === 2 && sides >= 8 ? 0.84 : 1)} textAnchor="middle" dominantBaseline="central">{label}</text>
      )}
    </svg>
  );
}

const SPARKS = Array.from({ length: 12 }, (_, i) => i * 30);

/** Un dado sobre el tapete: vuela, bota y se para en su sitio. */
export default function Die({ d }: { d: DieView }) {
  const wrap = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const w = wrap.current;
    const sh = shadow.current;
    const felt = w?.closest('.felt') as HTMLElement | null;
    if (!w || !sh || !felt || typeof w.animate !== 'function' || d.done || reducedMotion()) return;
    const spot = w.parentElement as HTMLElement;
    const fr = throwFrames({ dx: d.ox * felt.clientWidth - spot.offsetLeft, dy: d.oy * felt.clientHeight - spot.offsetTop, spin: d.spin, tilt: d.tilt });
    const opts: KeyframeAnimationOptions = { duration: d.dur, delay: d.delay, fill: 'both', easing: 'linear' };
    const a = w.animate(fr.die, opts);
    const b = sh.animate(fr.shadow, opts);
    return () => { a.cancel(); b.cancel(); };
    // la trayectoria se calcula una sola vez, al aparecer el dado
  }, []);
  const cls = ['die', d.extra, d.done && d.dim ? 'dim' : '', d.done && d.kept ? 'kept' : ''].filter(Boolean).join(' ');
  return (
    <div className="die-spot" style={{ ['--x' as string]: d.x / 100, ['--y' as string]: d.y / 100 }}>
      <div ref={shadow} className="die-shadow" />
      <div ref={wrap} className="die-wrap">
        <div className={cls} data-dt={d.dtype || undefined}>
          <DieShape sides={d.sides} value={d.face} uidKey={d.id} />
          {d.done && d.dim && <span className="die-strike" />}
        </div>
        {d.done && d.extra === 'nat20' && (
          <span className="sparks">{SPARKS.map((a) => <i key={a} style={{ ['--ang' as string]: a + 'deg' }} />)}</span>
        )}
      </div>
    </div>
  );
}
