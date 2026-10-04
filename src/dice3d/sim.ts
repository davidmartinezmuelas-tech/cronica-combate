/**
 * Simulación física de una tirada (solo estética: el resultado ya lo decidió la app).
 * Se calcula de una vez, normalmente en un Web Worker, y devuelve la posición y
 * orientación de cada dado en cada fotograma para reproducirla después.
 */
import { Body, ContactMaterial, ConvexPolyhedron, Material, Plane, Quaternion, Vec3, World } from 'cannon-es';
import { FPS, polyFor, topFace } from './polyhedra';

export interface SimDie {
  sides: number;
  radius: number; // radio circunscrito, en unidades del mundo
}

export interface SimInput {
  dice: SimDie[];
  width: number; // tapete, en unidades del mundo (x)
  depth: number; // (z)
  origin: { ox: number; oy: number }; // de dónde sale la mano (fracciones del tapete, fuera de él)
  seed: number;
  maxFrames?: number;
}

export interface SimOutput {
  frames: Float32Array; // por fotograma y dado: x, y, z, qx, qy, qz, qw
  nFrames: number;
  top: number[]; // cara de arriba de cada dado al final
}

const STRIDE = 7;

/** Generador pseudoaleatorio con semilla (mulberry32). */
export function rngFrom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shapes = new Map<number, ConvexPolyhedron>();
function shapeFor(sides: number, radius: number): ConvexPolyhedron {
  const key = (sides === 100 ? 10 : sides) * 1000 + Math.round(radius * 100);
  const hit = shapes.get(key);
  if (hit) return hit;
  const p = polyFor(sides);
  const s = new ConvexPolyhedron({
    vertices: p.vertices.map(([x, y, z]) => new Vec3(x * radius, y * radius, z * radius)),
    faces: p.faces.map((f) => f.slice()),
  });
  shapes.set(key, s);
  return s;
}

export function simulate(input: SimInput): SimOutput {
  const rng = rngFrom(input.seed);
  const maxFrames = input.maxFrames ?? 108;
  const world = new World({ gravity: new Vec3(0, -140, 0), allowSleep: true });
  world.defaultContactMaterial.friction = 0.32;
  world.defaultContactMaterial.restitution = 0.32;
  const dieMat = new Material('dado');
  const tableMat = new Material('tapete');
  world.addContactMaterial(new ContactMaterial(dieMat, tableMat, { friction: 0.42, restitution: 0.38 }));
  world.addContactMaterial(new ContactMaterial(dieMat, dieMat, { friction: 0.2, restitution: 0.35 }));

  // suelo y cuatro paredes invisibles en el borde del tapete
  const W = input.width / 2;
  const D = input.depth / 2;
  const wall = (pos: Vec3, axis: Vec3, angle: number) => {
    const b = new Body({ mass: 0, material: tableMat, shape: new Plane() });
    b.position.copy(pos);
    b.quaternion.setFromAxisAngle(axis, angle);
    world.addBody(b);
  };
  wall(new Vec3(0, 0, 0), new Vec3(1, 0, 0), -Math.PI / 2);
  wall(new Vec3(-W, 0, 0), new Vec3(0, 1, 0), Math.PI / 2);
  wall(new Vec3(W, 0, 0), new Vec3(0, 1, 0), -Math.PI / 2);
  wall(new Vec3(0, 0, -D), new Vec3(0, 1, 0), 0);
  wall(new Vec3(0, 0, D), new Vec3(0, 1, 0), Math.PI);

  // la mano: un borde del tapete; los dados salen juntos, algo separados, hacia el centro
  const { ox, oy } = input.origin;
  const maxR = Math.max(...input.dice.map((d) => d.radius));
  const hx = ox < 0 ? -W + maxR * 1.6 : ox > 1 ? W - maxR * 1.6 : (ox - 0.5) * input.width * 0.8;
  const hz = oy > 1 ? D - maxR * 1.6 : oy < 0 ? -D + maxR * 1.6 : (oy - 0.5) * input.depth * 0.8;
  const cols = Math.ceil(Math.sqrt(input.dice.length));
  const bodies = input.dice.map((d, i) => {
    const b = new Body({ mass: 1, material: dieMat, shape: shapeFor(d.sides, d.radius), linearDamping: 0.12, angularDamping: 0.12 });
    b.sleepSpeedLimit = 0.6;
    b.sleepTimeLimit = 0.15;
    const gx = (i % cols) - (cols - 1) / 2;
    const gz = Math.floor(i / cols) - (cols - 1) / 2;
    b.position.set(hx + gx * maxR * 2.3 * (ox > 1 ? -1 : 1) * 0.6, maxR * 2.5 + rng() * maxR * 2 + i * 0.05, hz + gz * maxR * 2.3 * 0.6);
    b.position.x = Math.max(-W + d.radius, Math.min(W - d.radius, b.position.x));
    b.position.z = Math.max(-D + d.radius, Math.min(D - d.radius, b.position.z));
    const q = new Quaternion();
    q.setFromEuler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
    b.quaternion.copy(q);
    // hacia el centro con algo de dispersión
    const tx = (rng() - 0.5) * input.width * 0.5 - b.position.x;
    const tz = (rng() - 0.5) * input.depth * 0.5 - b.position.z;
    const l = Math.hypot(tx, tz) || 1;
    const speed = 16 + rng() * 10;
    b.velocity.set((tx / l) * speed, 4 + rng() * 6, (tz / l) * speed);
    b.angularVelocity.set((rng() - 0.5) * 50, (rng() - 0.5) * 50, (rng() - 0.5) * 50);
    world.addBody(b);
    return b;
  });

  const out = new Float32Array(maxFrames * input.dice.length * STRIDE);
  let n = 0;
  const dt = 1 / FPS;
  for (; n < maxFrames; n++) {
    world.step(dt, dt, 3);
    bodies.forEach((b, i) => {
      const o = (n * bodies.length + i) * STRIDE;
      out[o] = b.position.x; out[o + 1] = b.position.y; out[o + 2] = b.position.z;
      out[o + 3] = b.quaternion.x; out[o + 4] = b.quaternion.y; out[o + 5] = b.quaternion.z; out[o + 6] = b.quaternion.w;
    });
    if (n > 20 && bodies.every((b) => b.sleepState === Body.SLEEPING)) { n++; break; }
  }
  const top = bodies.map((b, i) => topFace(polyFor(input.dice[i].sides), [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
  return { frames: out.slice(0, n * bodies.length * STRIDE), nFrames: n, top };
}
