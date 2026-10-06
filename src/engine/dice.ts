export interface DiceGroup {
  n: number;
  sides: number;
  sign: 1 | -1;
}
export interface ParsedExpr {
  groups: DiceGroup[];
  mod: number;
}

export type Rng = () => number;
export const defaultRng: Rng = () => Math.random();

export const rollDie = (sides: number, rng: Rng = defaultRng) => 1 + Math.floor(rng() * sides);
export const modOf = (score: number | string) => Math.floor(((Number(score) || 10) - 10) / 2);
/** Formato con signo tipográfico: +3 / −2. */
export const fmt = (n: number) => (n >= 0 ? '+' + n : '−' + Math.abs(n));
/** Formato con signo ASCII para fórmulas: +3 / -2. */
export const sgn = (n: number) => (n >= 0 ? '+' + n : String(n));

/** Analiza una fórmula tipo "2d6+3", "1d20-1", "4d6". Devuelve null si no es válida. */
export function parseExpr(input: string | null | undefined): ParsedExpr | null {
  const s = String(input ?? '').replace(/\s+/g, '').replace(/−/g, '-').toLowerCase();
  if (!s) return null;
  const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g;
  let m: RegExpExecArray | null;
  let pos = 0;
  const groups: DiceGroup[] = [];
  let mod = 0;
  while ((m = re.exec(s))) {
    if (m.index !== pos) return null;
    pos = re.lastIndex;
    if (m[3]) {
      const n = m[2] === '' ? 1 : parseInt(m[2], 10);
      const sides = parseInt(m[3], 10);
      if (n < 1 || n > 60 || sides < 2 || sides > 100) return null;
      groups.push({ n, sides, sign: m[1] === '-' ? -1 : 1 });
    } else {
      mod += (m[4] === '-' ? -1 : 1) * parseInt(m[5], 10);
    }
  }
  if (pos !== s.length || !groups.length) return null;
  return { groups, mod };
}

/** Media (redondeada hacia abajo, mínimo 1). Si no es una fórmula, intenta leer un número. */
export function avgOf(expr: string | null | undefined): number {
  const p = parseExpr(expr);
  if (!p) {
    const n = parseInt(String(expr ?? ''), 10);
    return isNaN(n) ? 0 : n;
  }
  let t = p.mod;
  p.groups.forEach((g) => { t += (g.sign * g.n * (g.sides + 1)) / 2; });
  return Math.max(1, Math.floor(t));
}

export function rollFormula(expr: string, rng: Rng = defaultRng): number {
  const p = parseExpr(expr);
  if (!p) return avgOf(expr);
  let t = p.mod;
  p.groups.forEach((g) => { for (let i = 0; i < g.n; i++) t += g.sign * rollDie(g.sides, rng); });
  return t;
}

export const prettyExpr = (e: string | null | undefined) =>
  String(e ?? '').replace(/\s+/g, '').replace(/([+-])/g, ' $1 ').replace(/-/g, '−').trim();


export type AdvMode = 'normal' | 'adv' | 'dis';
export type RollKind = 'attack' | 'check' | 'save' | 'damage' | 'free' | 'death' | 'init';

export interface RollPart {
  expr: string;
  type?: string;
  min?: number; // en daño, cada dado vale como mínimo esto (Combate con armas a dos manos: 1 y 2 cuentan como 3)
  reroll1?: boolean; // en daño, un 1 se repite una vez (Matón de taberna)
  best2?: boolean; // en daño, los dados se tiran dos veces y cuenta la mejor (Atacante salvaje)
}

export interface PhysicalDie {
  sides: number;
  final: number;
  dim?: boolean;
  type?: string; // tipo de daño de la parte a la que pertenece
}

export interface RollOutcome {
  total: number;
  nat: number | null;
  dice: PhysicalDie[];
  detail: string;
  byType: { type: string; amt: number }[];
  usedAdv: boolean;
}

/**
 * Tira las partes de una fórmula. Ventaja/desventaja solo se aplica a un d20 suelto en tiradas que no son de daño.
 * `doubleDice` duplica los dados (críticos). `flat` se suma al total (penalizadores de agotamiento, etc.).
 */
export function rollParts(parts: RollPart[], opts: { kind: RollKind; adv?: AdvMode; doubleDice?: boolean; flat?: number; rng?: Rng }): RollOutcome | null {
  const rng = opts.rng ?? defaultRng;
  const adv = opts.adv ?? 'normal';
  const dice: PhysicalDie[] = [];
  let total = 0;
  let nat: number | null = null;
  let usedAdv = false;
  const detail: string[] = [];
  const byType = new Map<string, number>();
  for (const part of parts) {
    const p = parseExpr(part.expr);
    if (!p) return null;
    let sub = p.mod;
    const segs: string[] = [];
    for (const g of p.groups) {
      const n = opts.doubleDice ? g.n * 2 : g.n;
      if (g.sides === 20 && n === 1 && opts.kind !== 'damage' && opts.kind !== 'death' && adv !== 'normal') {
        const a = rollDie(20, rng);
        const b = rollDie(20, rng);
        const keepA = adv === 'adv' ? a >= b : a <= b;
        const keep = keepA ? a : b;
        dice.push({ sides: 20, final: a, dim: !keepA }, { sides: 20, final: b, dim: keepA });
        usedAdv = true;
        sub += g.sign * keep;
        nat = keep;
        segs.push((adv === 'adv' ? 'ventaja ' : 'desventaja ') + '[' + a + ', ' + b + ']');
      } else {
        const dmg = opts.kind === 'damage';
        // en daño: mínimo por dado (armas a dos manos) y repetir los 1 una vez (Matón de taberna)
        const one = () => {
          let v = rollDie(g.sides, rng);
          if (dmg && part.reroll1 && v === 1) v = rollDie(g.sides, rng);
          return dmg && part.min ? Math.max(part.min, v) : v;
        };
        const roll = () => Array.from({ length: n }, one);
        let vals = roll();
        let other: number[] | null = null;
        // Atacante salvaje: los dados se tiran dos veces y se queda la mejor
        if (dmg && part.best2) {
          const b = roll();
          const s = (a: number[]) => a.reduce((x, y) => x + y, 0);
          if (s(b) > s(vals)) [vals, other] = [b, vals]; else other = b;
        }
        const die = (v: number, dim?: boolean): PhysicalDie => ({ sides: g.sides, final: v, ...(part.type && dmg ? { type: part.type } : {}), ...(dim ? { dim: true } : {}) });
        vals.forEach((v) => dice.push(die(v)));
        other?.forEach((v) => dice.push(die(v, true)));
        sub += g.sign * vals.reduce((x, y) => x + y, 0);
        if (g.sides === 20 && n === 1) nat = vals[0];
        segs.push((g.sign < 0 ? '− ' : '') + '[' + vals.join(', ') + ']' + (other ? ' (la otra: [' + other.join(', ') + '])' : ''));
      }
    }
    if (p.mod) segs.push(fmt(p.mod));
    if (opts.kind === 'damage') sub = Math.max(0, sub);
    total += sub;
    if (opts.kind === 'damage') byType.set(part.type || '', (byType.get(part.type || '') || 0) + sub);
    detail.push(segs.join(' ') + (part.type ? ' ' + part.type : '') + (parts.length > 1 ? ' = ' + sub : ''));
  }
  if (opts.flat) {
    total += opts.flat;
    detail.push(fmt(opts.flat) + ' agotamiento');
  }
  return {
    total,
    nat,
    dice,
    detail: detail.join(' · ') + (opts.doubleDice ? ' · crítico: dados x2' : ''),
    byType: Array.from(byType.entries()).map(([type, amt]) => ({ type, amt })),
    usedAdv,
  };
}

/** Combina ventaja manual con fuentes automáticas: si hay de las dos, se anulan. */
export function combineAdv(manual: AdvMode, autoAdv: boolean, autoDis: boolean): AdvMode {
  const adv = manual === 'adv' || autoAdv;
  const dis = manual === 'dis' || autoDis;
  if (adv && dis) return 'normal';
  if (adv) return 'adv';
  if (dis) return 'dis';
  return 'normal';
}
