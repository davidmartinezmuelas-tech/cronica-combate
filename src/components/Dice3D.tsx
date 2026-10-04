import { useEffect, useRef } from 'react';
import type { DieView } from '../data/types';
import type { Palette, Stage3D } from '../dice3d/scene';
import { diceStage } from '../store/kit';

let webgl: boolean | null = null;
/** ¿Puede este equipo pintar en 3D? (se comprueba una vez) */
export function hasWebGL(): boolean {
  if (webgl != null) return webgl;
  try {
    const c = document.createElement('canvas');
    webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { webgl = false; }
  return webgl;
}

const ELEMENTAL = ['ácido', 'frío', 'fuego', 'fuerza', 'necrótico', 'psíquico', 'radiante', 'relámpago', 'trueno', 'veneno'];

/** Colores del dado leídos del CSS (tema, tipo de daño, 20/1 natural): una sola fuente de verdad para 2D y 3D. */
function paletteReader(root: HTMLElement, theme: string) {
  const cache = new Map<string, Palette>();
  return (d: DieView): Palette => {
    const nat = d.sides === 20 && !d.dim ? (d.final === 20 ? 'nat20' : d.final === 1 ? 'nat1' : '') : '';
    const key = [theme, d.dtype, nat, d.dim, d.kept].join('|');
    const hit = cache.get(key);
    if (hit) return hit;
    const probe = document.createElement('div');
    probe.className = 'die ' + nat;
    if (d.dtype) probe.dataset.dt = d.dtype;
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    root.appendChild(probe);
    const cs = getComputedStyle(probe);
    const v = (n: string, def: string) => cs.getPropertyValue(n).trim() || def;
    const p: Palette = {
      a: v('--die-a', '#e2594c'), b: v('--die-b', '#9b2219'), c: v('--die-c', '#560e0a'), n: v('--die-n', '#fbefd6'), edge: v('--die-edge', 'rgba(0,0,0,.3)'),
      op: parseFloat(v('--die-op', '1')) || 1,
      glow: nat === 'nat20' ? '#ffcc55' : nat === 'nat1' ? '#6a0c00' : d.kept ? '#7a5a18' : null,
      dim: d.dim,
      metal: theme === 'metal' && !ELEMENTAL.includes(d.dtype) && !nat,
    };
    root.removeChild(probe);
    cache.set(key, p);
    return p;
  };
}

/** Mesa 3D: se carga en segundo plano y, cuando está lista, las tiradas la usan. */
export default function Dice3D({ theme, onReady }: { theme: string; onReady: (ok: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage3D | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    let alive = true;
    let ro: ResizeObserver | null = null;
    const load = () => {
      import('../dice3d/scene').then(({ createStage }) => {
        if (!alive || !canvas.current) return;
        try { stage.current = createStage(canvas.current); } catch { onReady(false); return; }
        const cv = canvas.current;
        let read = paletteReader(cv.parentElement!, themeRef.current);
        let readTheme = themeRef.current;
        diceStage.current = {
          play: (shown, size) => {
            if (readTheme !== themeRef.current) { read = paletteReader(cv.parentElement!, themeRef.current); readTheme = themeRef.current; }
            const ox = shown.reduce((s, d) => s + d.ox, 0) / (shown.length || 1);
            const oy = shown.reduce((s, d) => s + d.oy, 0) / (shown.length || 1);
            return stage.current!.play(shown.map((d) => ({ sides: d.sides, value: d.final, palette: read(d) })), { origin: { ox, oy }, sizePx: size, seed: (Math.random() * 2 ** 31) | 0 });
          },
          skip: () => stage.current?.skip(),
        };
        if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => stage.current?.resize()); ro.observe(cv); }
        onReady(true);
      }, () => onReady(false));
    };
    // se carga cuando el navegador está libre, para no competir con el arranque
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const h = ric ? ric(load, { timeout: 2000 }) : window.setTimeout(load, 600);
    return () => {
      alive = false;
      if (!ric) clearTimeout(h);
      ro?.disconnect();
      diceStage.current = null;
      stage.current?.dispose();
      stage.current = null;
      onReady(false);
    };
    // se monta una vez; el tema se lee en cada tirada
  }, []);

  return <canvas ref={canvas} className="felt-3d" onPointerDown={() => stage.current?.skip()} />;
}
