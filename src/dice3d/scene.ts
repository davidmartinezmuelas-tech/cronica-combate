/**
 * Escena 3D de la mesa de dados (se carga bajo demanda la primera vez que se tira).
 * Solo reproduce: la física llega ya calculada del worker y los números de cada
 * dado se eligen para que la cara de arriba muestre el resultado de la app.
 * Pinta únicamente mientras hay movimiento; en reposo no gasta batería.
 */
import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, PCFShadowMap,
  PerspectiveCamera, PlaneGeometry, Quaternion, Scene, ShadowMaterial, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { FPS, faceLabels, polyFor } from './polyhedra';
import type { SimInput, SimOutput } from './sim';

// sin worker (raro): la física se calcula aquí, cargándola solo entonces
const simulateHere = (input: SimInput) => import('./sim').then((m) => m.simulate(input));

export interface Palette {
  a: string; b: string; c: string; n: string; edge: string;
  op: number; // opacidad (gema)
  glow: string | null; // brillo propio (20 natural, dado que cuenta)
  dim: boolean; // descartado por ventaja/desventaja
  metal: boolean;
}

export interface Die3D {
  sides: number;
  value: number;
  palette: Palette;
}

export interface Stage3D {
  play(dice: Die3D[], opts: { origin: { ox: number; oy: number }; sizePx: number; seed: number }): Promise<void>;
  skip(): void;
  resize(): void;
  dispose(): void;
}

const WORLD_W = 10; // ancho del tapete en unidades del mundo
const FOV = 30;
const STRIDE = 7;

// ---------- calidad adaptable (se conserva entre tiradas) ----------
const quality = { ratio: Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2), shadows: true, slowFrames: 0 };

// ---------- física en un worker ----------
let worker: Worker | null = null;
let workerBroken = false;
let reqId = 0;
const waiting = new Map<number, (o: SimOutput) => void>();
function runSim(input: SimInput): Promise<SimOutput> {
  if (!workerBroken && !worker) {
    try {
      worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; out: SimOutput }>) => { waiting.get(e.data.id)?.(e.data.out); waiting.delete(e.data.id); };
      worker.onerror = () => { workerBroken = true; worker = null; waiting.forEach((_, id) => waiting.delete(id)); };
    } catch { workerBroken = true; }
  }
  if (!worker) return simulateHere(input);
  const id = ++reqId;
  return new Promise((res) => {
    waiting.set(id, res);
    worker!.postMessage({ id, input });
    // si el worker no contesta, se calcula aquí
    setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); void simulateHere(input).then(res); } }, 1500);
  });
}

// ---------- textura de números (una por paleta y juego de números, con caché) ----------
const FONT_SCALE: Record<number, number> = { 4: 0.3, 6: 0.54, 8: 0.4, 10: 0.38, 12: 0.46, 20: 0.4 };
const atlasCache = new Map<string, { tex: CanvasTexture; cells: string[]; grid: number }>();
function atlasFor(p: Palette, sides: number, labels: string[]) {
  const cells = Array.from(new Set(labels)).sort((a, b) => Number(a) - Number(b));
  const key = [p.a, p.b, p.c, p.n, p.edge, sides, cells.join(',')].join('|');
  const hit = atlasCache.get(key);
  if (hit) return hit;
  const grid = Math.ceil(Math.sqrt(cells.length));
  const C = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = grid * C;
  const g = cv.getContext('2d')!;
  const fs = FONT_SCALE[sides === 100 ? 10 : sides] || 0.34;
  cells.forEach((label, i) => {
    const x = (i % grid) * C;
    const y = Math.floor(i / grid) * C;
    const grad = g.createRadialGradient(x + C * 0.35, y + C * 0.3, C * 0.05, x + C / 2, y + C / 2, C * 0.75);
    grad.addColorStop(0, p.a);
    grad.addColorStop(0.55, p.b);
    grad.addColorStop(1, p.c);
    g.fillStyle = grad;
    g.fillRect(x, y, C, C);
    const size = C * fs * (label.length > 2 ? 0.7 : label.length === 2 ? 0.85 : 1);
    g.font = `800 ${size}px 'Alegreya Sans', sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = p.n;
    g.fillText(label, x + C / 2, y + C / 2 + size * 0.04);
    if ((label === '6' || label === '9') && sides !== 100) g.fillRect(x + C / 2 - size * 0.22, y + C / 2 + size * 0.42, size * 0.44, size * 0.07);
  });
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const entry = { tex, cells, grid };
  atlasCache.set(key, entry);
  if (atlasCache.size > 48) { const [k, v] = atlasCache.entries().next().value!; v.tex.dispose(); atlasCache.delete(k); }
  return entry;
}

// ---------- geometría de un dado con sus números ----------
/**
 * `upright`: la cara de arriba y la orientación final; su número se gira para leerse
 * derecho desde la cámara (el resto de caras quedan como caigan).
 */
function dieGeometry(sides: number, radius: number, labels: string[], atlas: { cells: string[]; grid: number }, upright?: { face: number; q: Quaternion }): BufferGeometry {
  const p = polyFor(sides);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  p.faces.forEach((f, fi) => {
    const n = p.normals[fi];
    const c = p.centers[fi];
    // base del plano de la cara: u hacia el primer vértice, w perpendicular
    const nv = new Vector3(...n);
    let u = new Vector3(...p.vertices[f[0]]).sub(new Vector3(...c)).normalize();
    let w = nv.clone().cross(u).normalize();
    if (upright && upright.face === fi) {
      // «arriba» de la pantalla (hacia −Z del mundo) llevado a coordenadas del dado y proyectado en la cara
      const screenUp = new Vector3(0, 0, -1).applyQuaternion(upright.q.clone().invert());
      const t = screenUp.sub(nv.clone().multiplyScalar(screenUp.dot(nv)));
      if (t.lengthSq() > 1e-6) { w = t.normalize(); u = w.clone().cross(nv).normalize(); }
    }
    const pts = f.map((vi) => { const d = new Vector3(...p.vertices[vi]).sub(new Vector3(...c)); return [d.dot(u), d.dot(w)] as const; });
    const ext = Math.max(...pts.map(([a, b]) => Math.max(Math.abs(a), Math.abs(b))));
    const cell = atlas.cells.indexOf(labels[fi]);
    const cx = ((cell % atlas.grid) + 0.5) / atlas.grid;
    const cy = 1 - (Math.floor(cell / atlas.grid) + 0.5) / atlas.grid;
    const half = 0.5 / atlas.grid;
    const toUv = (i: number) => [cx + (pts[i][0] / ext) * half * 0.98, cy + (pts[i][1] / ext) * half * 0.98];
    for (let k = 1; k < f.length - 1; k++) {
      for (const i of [0, k, k + 1]) {
        const v = p.vertices[f[i]];
        pos.push(v[0] * radius, v[1] * radius, v[2] * radius);
        nor.push(n[0], n[1], n[2]);
        uv.push(...toUv(i));
      }
    }
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  return geo;
}

export function createStage(canvas: HTMLCanvasElement): Stage3D {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: quality.ratio < 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(quality.ratio);
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = PCFShadowMap;
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.5, 200);
  scene.add(new HemisphereLight(0xfff4e0, 0x1a2a20, 1.6));
  const sun = new DirectionalLight(0xffffff, 2.4);
  sun.position.set(-6, 16, -5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.bias = -0.0015;
  scene.add(sun);
  const floorMat = new ShadowMaterial({ opacity: 0.38 });
  const floor = new Mesh(new PlaneGeometry(1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  let depth = WORLD_W;
  let meshes: Mesh[] = [];
  let raf = 0;
  let endAt = 0;
  let finish: (() => void) | null = null;

  const size = () => {
    const w = canvas.clientWidth || 260;
    const h = canvas.clientHeight || 280;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    depth = (WORLD_W * h) / w;
    // un poco inclinada para que se vean los lados; alta lo justo para ver todo el tapete
    const dist = ((depth / 2) / Math.tan((FOV * Math.PI) / 360)) * 1.1;
    camera.position.set(0, dist, dist * 0.14);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    floor.geometry.dispose();
    floor.geometry = new PlaneGeometry(WORLD_W, depth);
    const sc = sun.shadow.camera;
    sc.left = -WORLD_W / 2 - 1; sc.right = WORLD_W / 2 + 1; sc.top = depth / 2 + 1; sc.bottom = -depth / 2 - 1;
    sc.updateProjectionMatrix();
    return { w, h };
  };
  size();

  const clear = () => {
    meshes.forEach((m) => { scene.remove(m); m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); });
    meshes = [];
  };

  const applyQuality = () => {
    renderer.setPixelRatio(quality.ratio);
    renderer.shadowMap.enabled = quality.shadows;
    size();
  };

  const q0 = new Quaternion();
  const q1 = new Quaternion();
  const draw = (out: SimOutput, f: number) => {
    const a = Math.min(out.nFrames - 1, Math.floor(f));
    const b = Math.min(out.nFrames - 1, a + 1);
    const t = Math.min(1, f - a);
    const n = meshes.length;
    meshes.forEach((m, i) => {
      const oa = (a * n + i) * STRIDE;
      const ob = (b * n + i) * STRIDE;
      const fr = out.frames;
      m.position.set(fr[oa] + (fr[ob] - fr[oa]) * t, fr[oa + 1] + (fr[ob + 1] - fr[oa + 1]) * t, fr[oa + 2] + (fr[ob + 2] - fr[oa + 2]) * t);
      q0.set(fr[oa + 3], fr[oa + 4], fr[oa + 5], fr[oa + 6]);
      q1.set(fr[ob + 3], fr[ob + 4], fr[ob + 5], fr[ob + 6]);
      m.quaternion.slerpQuaternions(q0, q1, t);
    });
    renderer.render(scene, camera);
  };

  let last: SimOutput | null = null;
  let playId = 0;
  let skipNext = false; // se pidió saltar antes de que llegara la física

  return {
    async play(dice, opts) {
      cancelAnimationFrame(raf);
      finish?.();
      clear();
      const id = ++playId;
      skipNext = false;
      const { w } = size();
      const unitPx = w / WORLD_W;
      const radius = (opts.sizePx / 2 / unitPx) * 1.35;
      const out = await runSim({ dice: dice.map((d) => ({ sides: d.sides, radius })), width: WORLD_W, depth, origin: opts.origin, seed: opts.seed });
      if (id !== playId) return; // ya se lanzó otra tirada
      last = out;
      dice.forEach((d, i) => {
        const labels = faceLabels(d.sides, out.top[i], d.value);
        const atlas = atlasFor(d.palette, d.sides, labels);
        const mat = new MeshStandardMaterial({
          map: atlas.tex, roughness: d.palette.metal ? 0.28 : 0.42, metalness: d.palette.metal ? 0.65 : 0.08, flatShading: true,
          transparent: d.palette.op < 1 || d.palette.dim, opacity: d.palette.dim ? 0.45 : d.palette.op,
        });
        if (d.palette.glow) { mat.emissive = new Color(d.palette.glow); mat.emissiveIntensity = 0.35; }
        if (d.palette.dim) mat.color = new Color(0x8a8a8a);
        const lo = ((out.nFrames - 1) * dice.length + i) * STRIDE;
        const qEnd = new Quaternion(out.frames[lo + 3], out.frames[lo + 4], out.frames[lo + 5], out.frames[lo + 6]);
        const m = new Mesh(dieGeometry(d.sides, radius, labels, atlas, { face: out.top[i], q: qEnd }), mat);
        m.castShadow = true;
        scene.add(m);
        meshes.push(m);
      });
      // reproducción: a tiempo real, interpolando si la pantalla va a más de 60 Hz
      const start = performance.now();
      const total = ((out.nFrames - 1) / FPS) * 1000;
      endAt = start + total;
      let prev = start;
      let slow = 0;
      await new Promise<void>((resolve) => {
        finish = () => { finish = null; cancelAnimationFrame(raf); draw(out, out.nFrames - 1); resolve(); };
        const tick = (now: number) => {
          if (now - prev > 28) slow++;
          prev = now;
          const f = ((now - start) / 1000) * FPS;
          if (now >= endAt) { finish?.(); return; }
          draw(out, f);
          raf = requestAnimationFrame(tick);
        };
        if (skipNext) { finish(); return; }
        raf = requestAnimationFrame(tick);
      });
      // si ha ido a tirones, la próxima vez con menos resolución y sin sombras
      if (slow > 8 && (quality.ratio > 1 || quality.shadows)) {
        quality.slowFrames++;
        if (quality.ratio > 1) quality.ratio = Math.max(1, quality.ratio - 0.5);
        else quality.shadows = false;
        applyQuality();
        draw(out, out.nFrames - 1);
      }
    },
    skip() { if (finish) finish(); else skipNext = true; },
    resize() { size(); if (last && meshes.length) draw(last, last.nFrames - 1); else renderer.render(scene, camera); },
    dispose() {
      cancelAnimationFrame(raf);
      finish?.();
      clear();
      floor.geometry.dispose();
      floorMat.dispose();
      renderer.dispose();
    },
  };
}
