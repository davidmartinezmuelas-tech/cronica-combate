import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { CONDITIONS, DMG_TYPES, XP_LEVELS } from '../../data/constants';
import { ABILS, type Abil, type ClassData, type ClassFeature, type PlayerData } from '../../data/player';
import { asClass, classEntries, classLevel, derive, expandCustomFeats, longRest, partsLabel, shortRest, usesMax, type Character, type Derived } from '../../engine/character';
import { fmt, sgn, type RollPart } from '../../engine/dice';
import { norm } from '../../engine/util';
import Card, { InfoDialog } from '../../shared/Card';
import Picker from '../../shared/Picker';
import Pips from '../../shared/Pips';
import { useLibrary, type LibraryData } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useStore } from '../../store/useStore';
import type { RollSpec } from '../../store/state';
import { hasInvocation, subclassSpells, subclassText } from '../../engine/subclassChoices';
import { assignSpells, casterPreps } from '../../engine/spellPrep';
import { concDc, concOf, withConc, withoutConc } from '../../engine/concentration';
import { spellCast, spellRoll } from '../../engine/spellRoll';
import { featureUses } from '../../engine/featureUses';
import { plainText, useSpells } from './spells';
import ClassPanel, { classPanelKeys } from './ClassPanel';
import FeatPanel from './FeatPanel';
import SubclassActions, { actionPanelKeys, choiceResources } from './SubclassActions';
import SpellRolls from './SpellRolls';
import LevelUp from './LevelUp';
import RestSpells, { restSwapClasses } from './RestSpells';
import SubclassChoices, { choiceRows, choiceSpells, resolveChoices } from './SubclassChoices';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
const ABIL_S: Record<Abil, string> = { str: 'FUE', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR' };

interface FeatureRow { key: string; n: string; d: string; src: string; max: number | null; per: string }

/** Reparte bloques en columnas seguidas (se leen de arriba abajo) con alturas lo más parecidas posible, según su peso. */
function splitCols<T>(items: T[], weight: (x: T) => number, n: number): T[][] {
  const k = Math.max(1, Math.min(n, items.length));
  const pre = [0];
  items.forEach((x) => pre.push(pre[pre.length - 1] + weight(x)));
  // best[j][i]: la columna más alta al repartir los i primeros en j columnas; cut, dónde empieza la última
  const best = Array.from({ length: k + 1 }, () => Array<number>(items.length + 1).fill(Infinity));
  const cut = Array.from({ length: k + 1 }, () => Array<number>(items.length + 1).fill(0));
  best[0][0] = 0;
  for (let j = 1; j <= k; j++) for (let i = j; i <= items.length; i++) for (let q = j - 1; q < i; q++) {
    const v = Math.max(best[j - 1][q], pre[i] - pre[q]);
    if (v < best[j][i]) { best[j][i] = v; cut[j][i] = q; }
  }
  const cols: T[][] = [];
  for (let j = k, i = items.length; j > 0; j--) { const q = cut[j][i]; cols.unshift(items.slice(q, i)); i = q; }
  return cols;
}

/** Trocea los grupos de más de `max` filas en trozos parecidos; los siguientes llevan «(cont.)» en el título. */
function chunkGroups<G extends { title: string; list: unknown[] }>(groups: G[], max: number): (G & { key: string; first: boolean })[] {
  return groups.flatMap((g) => {
    const pieces = Math.max(1, Math.ceil(g.list.length / max));
    const size = Math.max(1, Math.ceil(g.list.length / pieces));
    return Array.from({ length: pieces }, (_, i) => ({ ...g, key: g.title + i, title: g.title + (i ? ' (cont.)' : ''), first: i === 0, list: g.list.slice(i * size, (i + 1) * size) }));
  });
}

/** Peso (alto aproximado, en filas) de un bloque: su cabecera y una fila por elemento. */
const blockW = (x: { list: unknown[] }) => 1.6 + x.list.length;

/** Rasgos que tiene a su nivel: de clase, de subclase, de especie y dotes, con sus usos. */
function featureRows(c: Character, data: PlayerData | null, lib: LibraryData): FeatureRow[] {
  const sp = data?.species.find((x) => x.id === c.speciesId);
  const rows: FeatureRow[] = [];
  // sin el dato de usos, se deducen de su texto («una cantidad de veces igual a tu modificador por Carisma…»)
  const add = (f: ClassFeature, src: string, who: Character = c, cls?: ClassData) => {
    const u = f.u || (cls ? featureUses(f.n, f.d, who.level) : null) || undefined;
    const max = usesMax(u, who, cls);
    rows.push({ key: f.n, n: f.n, d: f.d, src, max: max && max > 0 ? max : null, per: max ? u?.per || '' : '' });
  };
  // cada clase (multiclase: también las demás) con sus rasgos hasta su nivel y los de su subclase
  for (const e of classEntries(c)) {
    const v = asClass(c, e);
    const cls = data?.classes.find((x) => x.id === e.classId);
    cls?.f.filter((f) => f.lv <= e.level).forEach((f) => add(f, cls.n + ' ' + f.lv, v, cls));
    // los rasgos de la subclase del SRD solo si es la elegida
    if (cls?.sub && e.level >= cls.sub.lv && norm(e.subclass) === norm(cls.sub.n)) cls.sub.f.filter((f) => f.lv <= e.level).forEach((f) => add(f, cls.sub!.n + ' ' + f.lv, v, cls));
    // subclase de la biblioteca propia (si es la elegida)
    const libSub = lib.subclasses.find((s) => s.cls === e.classId && norm(s.n) === norm(e.subclass));
    libSub?.f.filter((f) => f.lv <= e.level).forEach((f) => {
      const u = featureUses(f.n, f.d, e.level) || undefined;
      const max = usesMax(u, v, cls);
      rows.push({ key: libSub.id + f.lv + f.n, n: f.n, d: f.d, src: libSub.n + ' ' + f.lv, max: max && max > 0 ? max : null, per: max ? u?.per || '' : '' });
    });
    choiceRows(resolveChoices(v, data, lib)).forEach((r) => rows.push({ ...r, max: null, per: '' }));
  }
  sp?.t.forEach((f) => add(f, sp.n));
  const CAT: Record<string, string> = { origin: 'Dote de origen', general: 'Dote', 'fighting-style': 'Estilo de combate', 'epic-boon': 'Don épico', other: 'Rasgo propio' };
  c.feats.forEach((name) => {
    const ft = data?.feats.find((x) => x.n === name);
    if (ft) { add({ lv: 0, n: ft.n, d: ft.d, u: ft.u }, CAT[ft.cat] || 'Dote'); return; }
    const lf = lib.feats.find((x) => x.n === name);
    if (lf) rows.push({ key: lf.id, n: lf.n, d: (lf.req ? 'Requisitos: ' + lf.req + '\n\n' : '') + lf.d, src: CAT[lf.cat] || 'Dote', max: null, per: '' });
  });
  expandCustomFeats(c.customFeats).forEach((f) => rows.push({ key: f.id, n: f.n, d: f.d, src: CAT[f.cat] || 'Rasgo propio', max: f.max && f.max > 0 ? f.max : null, per: f.per }));
  return rows;
}

export default function CharacterSheet({ c }: { c: Character }) {
  const data = usePlayer((s) => s.data);
  const { update, replace, setEditing } = usePlayer.getState();
  const spellIdx = useSpells();
  const { roll } = useStore.getState();
  const d = useMemo(() => derive(c, data), [c, data]);
  const lib = useLibrary();
  const features = useMemo(() => featureRows(c, data, lib), [c, data, lib]);
  // multiclase: cada clase vista por separado (su nivel y sus datos) para sus paneles de acciones y elecciones
  const views = useMemo(() => classEntries(c).map((e, i): { v: Character; dv: Derived } => ({ v: i === 0 ? c : asClass(c, e), dv: { ...d, cls: data?.classes.find((x) => x.id === e.classId) } })), [c, d, data]);
  // los usos que ya tienen sus círculos en un panel de acciones no se repiten en «Rasgos y dotes»
  const panelKeys = useMemo(() => new Set(views.flatMap(({ v }) => [...classPanelKeys(v, data), ...actionPanelKeys(v, data, lib)])), [views, data, lib]);
  // rasgos con usos que se gastan desde su propia tarjeta (Astucia mágica, Afinidad con la piedra, Arma de aliento…);
  // Furia y Castigo del paladín se usan desde «Ataques»
  const usable = features.filter((f) => f.max && !panelKeys.has(f.key) && !panelKeys.has(f.n) && !['Furia', 'Castigo del paladín'].includes(f.key));
  const usableKeys = new Set(usable.map((f) => f.key));
  // «Rasgos y dotes» agrupados por origen (cada clase, su subclase, la especie, las dotes); los que ya tienen panel arriba, sin contador
  const upKeys = (f: FeatureRow) => panelKeys.has(f.key) || panelKeys.has(f.n) || ['Furia', 'Castigo del paladín'].includes(f.key);
  const featGroups = (() => {
    const m = new Map<string, FeatureRow[]>();
    features.filter((f) => !usableKeys.has(f.key)).forEach((f) => {
      const g = f.src.replace(/ \d+$/, '');
      m.set(g, [...(m.get(g) || []), f]);
    });
    return [...m].map(([title, list]) => ({ title, list }));
  })();
  const [amount, setAmount] = useState('');
  const [resting, setResting] = useState(false);
  // subir de nivel: el asistente y, tras confirmar, la hoja de antes para poder deshacerlo
  const [leveling, setLeveling] = useState(false);
  const [restSpells, setRestSpells] = useState(false); // tras un descanso largo: cambiar conjuros (según la clase)
  const [undoLevel, setUndoLevel] = useState<Character | null>(null);
  const [confirmLong, setConfirmLong] = useState(false);
  // Atacante salvaje y carga: se aplican al próximo daño y se apagan
  const [savage, setSavage] = useState(false);
  const [charge, setCharge] = useState(false);
  const [pierce, setPierce] = useState(false);
  // de clase: Furia y Marca del cazador duran; Golpe brutal, Ataque furtivo y Golpe divino/primordial, una vez
  const [reckless, setReckless] = useState(false); // Ataque temerario (ventaja en los ataques con Fuerza este turno)
  const [dmgType, setDmgType] = useState(''); // tipo del daño que recibe (para sus resistencias)
  const [sneak, setSneak] = useState(false);
  const [brutal, setBrutal] = useState(false);
  const [strike, setStrike] = useState(false);
  // castigos en el golpe del arma (su daño va en la misma tirada: en un crítico también se doblan sus dados)
  const [smitePick, setSmitePick] = useState('');
  // castigos preparados en cada arma (como Marca del cazador): se suman al siguiente daño cuerpo a cuerpo de esa arma y se gastan ahí
  const [arm, setArm] = useState<Record<string, { smite?: boolean; eld?: boolean }>>({});
  // Marca del cazador y Maleficio duran: mientras estén activos, su daño va en cada tirada de daño con arma
  const [smiteSel, setSmiteSel] = useState('');
  const [buffs, setBuffs] = useState<string[]>([]); // conjuros activos que suman en cada golpe (Marca, Maleficio, Favor divino…)
  // conjuros: pestañas por clase (con varias clases lanzadoras); cada conjuro, plegado hasta pulsarlo (uno abierto a la vez)
  const [spCls, setSpCls] = useState('all');
  const [spOpen, setSpOpen] = useState<string | null>(null);
  const [spText, setSpText] = useState<string | null>(null);
  // conjuros y rasgos van en bloques repartidos en columnas, según el ancho
  const lowRef = useRef<HTMLDivElement>(null);
  const [lowW, setLowW] = useState(0);
  useEffect(() => {
    const el = lowRef.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => setLowW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sp = data?.species.find((x) => x.id === c.speciesId);
  const bg = data?.backgrounds.find((x) => x.id === c.backgroundId) || lib.backgrounds.find((x) => x.id === c.backgroundId);
  const who = c.name || 'Personaje';
  const r = (label: string, kind: RollSpec['kind'], expr: string, extra: Partial<RollSpec> = {}) =>
    roll({ label: who + ' · ' + label, kind, who, parts: [{ expr }], self: { conds: c.conds, exh: c.exh }, ...extra });
  const d20 = (b: number) => '1d20' + sgn(b);
  const set = (patch: Partial<Character>) => update(c.id, patch);
  // concentración: al bajar los PG (daño desde la hoja o desde la sala del máster) se pide la salvación
  const conc = concOf(c.conds);
  const [concCheck, setConcCheck] = useState<{ dmg: number; dc: number } | null>(null);
  const prevHp = useRef({ id: c.id, total: c.hp + c.temp });
  useEffect(() => {
    const now = c.hp + c.temp;
    const prev = prevHp.current;
    prevHp.current = { id: c.id, total: now };
    if (prev.id !== c.id || now >= prev.total || !conc) return;
    // a 0 PG se cae inconsciente: la concentración termina sin tirada
    if (c.hp === 0) { update(c.id, { conds: withoutConc(c.conds) }); return; }
    const dmg = prev.total - now;
    setConcCheck((x) => ({ dmg: (x?.dmg || 0) + dmg, dc: concDc(Math.max(dmg, x?.dmg || 0)) }));
  }, [c.id, c.hp, c.temp]); // eslint-disable-line react-hooks/exhaustive-deps
  // al perder la concentración se apagan las etiquetas de ese conjuro en «Ataques»
  useEffect(() => { setBuffs((bs) => bs.filter((k) => { const b = hitBuffs.find((x) => x.key === k); return !b?.conc || b.n === conc; })); }, [conc]); // eslint-disable-line react-hooks/exhaustive-deps
  const warCaster = c.feats.some((f) => /lanzador de guerra|war caster/i.test(f));
  const concSave = () => {
    if (!concCheck) return;
    const { dc } = concCheck;
    const spell = conc;
    r('salvación de concentración (CD ' + dc + ')', 'save', d20(d.saves.con.bonus), {
      ...(warCaster ? { adv: 'Lanzador de guerra' } : d.saves.con.adv ? { adv: d.saves.con.adv } : {}),
      after: (total) => {
        setConcCheck(null);
        if (total >= dc) return { resultNote: 'Mantienes la concentración en ' + spell + '.' };
        const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
        update(c.id, { conds: withoutConc(cur.conds) });
        return { resultNote: 'Pierdes la concentración en ' + spell + '.' };
      },
    });
  };

  // característica que subió Don del ataque imparable (Fuerza o Destreza)
  const boonAbil: 'str' | 'dex' = c.choices?.['feat.irresistible']?.[0] === 'dex' ? 'dex' : c.choices?.['feat.irresistible']?.[0] === 'str' ? 'str' : c.abil.dex > c.abil.str ? 'dex' : 'str';
  // números de clase a su nivel
  const rageDmg = classLevel(c, 'barbarian') ? Number(d.scale('barbarian.rage-damage')) || 0 : 0;
  const brutalDice = classLevel(c, 'barbarian') ? String(d.scale('barbarian.brutal-strike') || '') : '';
  const sneakDice = classLevel(c, 'rogue') ? String(d.scale('rogue.sneak-attack') || '') : '';
  const markDie = classLevel(c, 'ranger') ? String(d.scale('ranger.mark') || '') : '';
  const blessed = c.choices?.['cleric.blessed']?.[0] === 'Golpe divino' ? String(d.scale('cleric.divine-strike') || '') : '';
  const primal = c.choices?.['druid.fury']?.[0] === 'Golpe primordial' ? String(d.scale('druid.elemental-fury') || '') : '';
  const strikeDice = blessed || primal;
  const strikeName = blessed ? 'Golpe divino' : 'Golpe primordial';
  const barb = data?.classes.find((x) => x.id === 'barbarian');
  const rage = d.cfx.rage;
  // Frenesí (berserker 3): con Furia y Ataque temerario, el primer objetivo al que aciertas recibe tantos d6 como el daño de la Furia
  const frenzy = rage && reckless && classLevel(c, 'barbarian') >= 3 && /berserker/i.test(classEntries(c).find((e) => e.classId === 'barbarian')?.subclass || '');
  const rageMax = classLevel(c, 'barbarian') ? usesMax(barb?.f.find((f) => f.n === 'Furia')?.u, c, barb) || 0 : 0;
  const toggleRage = () => {
    // entrar en Furia gasta un uso
    // la Furia es un estado de la hoja (se guarda, llega al máster por la sala y da resistencias y ventaja en Fuerza)
    if (!rage) set({ conds: [...c.conds, 'Furia'], ...(rageMax && (c.uses['Furia'] || 0) < rageMax ? { uses: { ...c.uses, Furia: (c.uses['Furia'] || 0) + 1 } } : {}) });
    else set({ conds: c.conds.filter((k) => k !== 'Furia') });
  };
  type Hit = { melee: boolean; str: boolean; finesse: boolean };
  const dmgRoll = (label: string, parts: RollPart[], hit: Hit, armKey?: string) => {
    const melee = hit.melee;
    const with_ = (armKey && melee && arm[armKey]) || {};
    const piercing = parts[0]?.type === 'perforante';
    // cada parte con su origen: el arma y lo que se le suma (una fila por fuente en el resultado)
    const weapon = label.replace(/:.*$/, '');
    const ps: RollPart[] = parts.map((p, i) => ({ ...p, src: weapon, ...(i === 0 && savage ? { best2: true } : {}), ...(i === 0 && pierce && piercing ? { rerollLow: true } : {}) }));
    if (charge && melee && d.fx.charge) ps.push({ expr: d.fx.charge, type: parts[0]?.type, src: 'Carga' });
    // solo si el daño es de un crítico: un dado más del arma (Perforador) y la puntuación aumentada (Don del ataque imparable)
    const critBonus: RollPart[] = [];
    const die = /\d*d(\d+)/.exec(parts[0]?.expr || '');
    if (d.fx.piercer && piercing && die) critBonus.push({ expr: '1d' + die[1], type: 'perforante', noDouble: true, src: 'Perforador' });
    if (d.fx.critScore && parts[0]) critBonus.push({ expr: String(c.abil[boonAbil]), type: parts[0].type, noDouble: true, src: 'Ataque imparable' });
    const type = parts[0]?.type || '';
    if (rage && hit.str && rageDmg) ps.push({ expr: String(rageDmg), type, src: 'Furia' });
    if (frenzy && hit.str && rageDmg) ps.push({ expr: rageDmg + 'd6', type, src: 'Frenesí' });
    if (brutal && hit.str && brutalDice) ps.push({ expr: brutalDice, type, src: 'Golpe brutal' });
    if (sneak && hit.finesse && sneakDice) ps.push({ expr: sneakDice, type, src: 'Ataque furtivo' });
    // conjuros activos (Marca del cazador, Maleficio, Favor divino…): su daño en cada impacto, en la misma tirada
    const onBuffs = hitBuffs.filter((b) => buffs.includes(b.key));
    for (const b of onBuffs) if (b.dmg) ps.push({ expr: b.dmg, type: b.type || type, src: b.n });
    if (strike && strikeDice) ps.push({ expr: strikeDice, type: blessed ? 'radiante' : 'elemental', src: strikeName });
    // castigos: con armas cuerpo a cuerpo (y ataques sin armas), gastan su espacio al tirar
    const useSmite = !!with_.smite && melee && !!smiteOpt;
    const useEld = !!with_.eld && melee && !!eldDice;
    if (useSmite) ps.push({ expr: smiteOpt!.dice, type: smiteOpt!.type, src: smiteSpell!.n });
    if (useEld) ps.push({ expr: eldDice, type: 'fuerza', src: 'Castigo arcano' });
    // los extras, como etiquetas del resultado
    const tags = [savage ? 'Atacante salvaje' : '', charge && melee ? 'Carga' : '', pierce && piercing ? 'Perforador' : '',
      rage && hit.str && rageDmg ? 'Furia' : '', frenzy && hit.str && rageDmg ? 'Frenesí (solo al primer objetivo)' : '', brutal && hit.str && brutalDice ? 'Golpe brutal' : '', sneak && hit.finesse && sneakDice ? 'Ataque furtivo' : '',
      ...onBuffs.map((b) => b.n), strike && strikeDice ? strikeName : '',
      useSmite ? smiteSpell!.n : '', useEld ? 'Castigo arcano' : ''].filter(Boolean);
    roll({ label: who + ' · ' + label, kind: 'damage', who, by: null, parts: ps, critBonus, tags });
    if (savage) setSavage(false);
    if (charge && melee) setCharge(false);
    if (pierce && piercing) setPierce(false);
    if (brutal && hit.str) setBrutal(false);
    if (sneak && hit.finesse) setSneak(false);
    if (strike) setStrike(false);
    if (armKey && (useSmite || useEld)) setArm((a) => ({ ...a, [armKey]: {} }));
    if (useSmite || useEld) {
      const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
      const patch: Partial<Character> = {};
      let pact = cur.pactUsed;
      if (useSmite) {
        if (smiteOpt!.key === 'free') patch.uses = { ...cur.uses, 'Castigo del paladín': (cur.uses['Castigo del paladín'] || 0) + 1 };
        else if (smiteOpt!.key === 'p') pact += 1;
        else { const u = cur.slotsUsed.slice(); u[smiteOpt!.lv - 1] = (u[smiteOpt!.lv - 1] || 0) + 1; patch.slotsUsed = u; }
      }
      if (useEld) pact += 1;
      if (useSmite && smiteSpell!.c) patch.conds = withConc(cur.conds, smiteSpell!.n);
      if (pact !== cur.pactUsed) patch.pactUsed = pact;
      update(c.id, patch);
    }
  };
  // castigos de un arma: se pulsan para dejarlos puestos (como Marca del cazador); el siguiente daño cuerpo a cuerpo con ella los suma y gasta
  const smiteChips = (key: string, eldOk = true) => {
    const a = arm[key] || {};
    const both = (x: { smite?: boolean; eld?: boolean }) => !!x.smite && !!x.eld && smiteOpt?.key === 'p' && pactLeft < 2;
    const tog = (k: 'smite' | 'eld') => setArm((m) => ({ ...m, [key]: { ...m[key], [k]: !m[key]?.[k] } }));
    return <>
      {smiteOpt && <button className={a.smite ? 'chip on' : 'chip'} aria-pressed={!!a.smite} disabled={!a.smite && both({ ...a, smite: true })} title={smiteSpell!.n + ': pulsa para dejarlo puesto; el siguiente daño con esta arma lo suma (en un crítico también se dobla) y gasta el espacio elegido arriba.' + (smiteSpell!.en === 'Divine Smite' ? ' +1d8 contra infernales y muertos vivientes.' : '')} onClick={() => tog('smite')}>{smiteShort} +{smiteOpt.dice}</button>}
      {eldOk && eldDice && <button className={a.eld ? 'chip on' : 'chip'} aria-pressed={!!a.eld} disabled={!a.eld && both({ ...a, eld: true })} title="Castigo arcano (con tu arma de pacto, una vez por turno): pulsa para dejarlo puesto; el siguiente daño con esta arma suma 1d8 de fuerza más 1d8 por nivel del espacio de pacto y gasta un espacio de pacto. Si es Enorme o menor, puedes derribarlo." onClick={() => tog('eld')}>Arcano +{eldDice}</button>}
    </>;
  };
  const armTag = (key: string) => {
    const a = arm[key] || {};
    const n = (a.smite && smiteOpt ? 1 : 0) + (a.eld && eldDice ? 1 : 0);
    return n ? <span className="adv-mark" title="Con los castigos puestos">+{n}</span> : null;
  };
  const uaHit: Hit = { melee: true, str: !(classLevel(c, 'monk') && d.mods.dex > d.mods.str), finesse: false };
  const amt = parseInt(amount, 10);
  const resisted = dmgType && d.resist.find((x) => x.type === dmgType);
  const damage = () => {
    if (!(amt > 0)) return;
    const taken = resisted ? Math.floor(amt / 2) : amt;
    const fromTemp = Math.min(c.temp, taken);
    const rest = taken - fromTemp;
    const hp = Math.max(0, c.hp - rest);
    set({ temp: c.temp - fromTemp, hp, death: c.hp > 0 && hp === 0 ? { s: 0, f: 0 } : c.death });
    setAmount('');
  };
  const heal = () => { if (amt > 0) { set({ hp: Math.min(d.hpMax, c.hp + amt), death: { s: 0, f: 0 } }); setAmount(''); } };
  const giveTemp = () => { if (amt > 0) { set({ temp: Math.max(c.temp, amt) }); setAmount(''); } };

  // pulsar un círculo marca hasta él; pulsar el último marcado lo desmarca
  const markDeath = (k: 's' | 'f', j: number) => set({ death: { ...c.death, [k]: c.death[k] === j + 1 ? j : j + 1 } });
  const deathSave = () => r('salvación contra la muerte', 'free', '1d20', {
    after: (total) => {
      const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
      if (total === 20) { update(c.id, { hp: 1, death: { s: 0, f: 0 } }); return { resultNote: '¡20 natural! Recupera 1 PG y vuelve en sí.' }; }
      const ds = { ...cur.death };
      if (total === 1) ds.f += 2; else if (total >= 10) ds.s += 1; else ds.f += 1;
      ds.s = Math.min(3, ds.s); ds.f = Math.min(3, ds.f);
      update(c.id, { death: ds });
      return { resultNote: ds.f >= 3 ? 'Tercer fallo: el personaje muere.' : ds.s >= 3 ? 'Tres éxitos: queda estable.' : total >= 10 ? 'Éxito (' + ds.s + '/3).' : 'Fallo (' + ds.f + '/3).' };
    },
  });

  // dados de golpe que quedan de cada tipo (con una sola clase, uno: el de la clase)
  const multiHd = d.hitDice.length > 1;
  const hdLeft = (die: number) => {
    const n = d.hitDice.find((x) => x.die === die)?.n || 0;
    return multiHd ? Math.max(0, n - (c.hdUsed?.[die] || 0)) : Math.max(0, d.level - c.hdSpent);
  };
  const hdText = d.hitDice.map((x) => hdLeft(x.die) + '/' + x.n + ' d' + x.die).join(' · ');
  const hdMaxText = d.hitDice.map((x) => x.n + 'd' + x.die).join(' + ');
  const hdSpentAll = d.hitDice.reduce((a, x) => a + x.n - hdLeft(x.die), 0);
  const spendHd = (die = d.hdDie) => {
    if (hdLeft(die) <= 0) return;
    r('dado de golpe', 'free', '1d' + die + sgn(d.mods.con), {
      after: (total) => {
        const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
        const gain = Math.max(0, total);
        update(c.id, { hp: Math.min(d.hpMax, cur.hp + gain), hdSpent: cur.hdSpent + 1, ...(multiHd ? { hdUsed: { ...(cur.hdUsed || {}), [die]: (cur.hdUsed?.[die] || 0) + 1 } } : {}) });
        return { resultNote: 'Recupera ' + gain + ' PG.' };
      },
    });
  };

  const skillsSorted = Object.entries(d.skills).sort((a, b) => (data?.skills[a[0]] || a[0]).localeCompare(data?.skills[b[0]] || b[0], 'es'));
  // los de la subclase (siempre preparados) se suman solos a los que ha elegido
  const subSpells = views.flatMap(({ v, dv }) => subclassSpells(v, dv.cls, subclassText(v, dv.cls, lib.subclasses), spellIdx.list).map((x) => ({ ...x, cls: v.classId }))).filter((x, i, a) => !c.spells.includes(x.id) && a.findIndex((y) => y.id === x.id) === i);
  // elegidos por la subclase (Descubrimientos mágicos, conjuros gratis de la escuela del mago)
  const picked = views.flatMap(({ v }) => choiceSpells(v).map((x) => ({ ...x, cls: v.classId }))).filter((x) => !c.spells.includes(x.id) && !subSpells.some((y) => y.id === x.id));
  // Castigo del paladín (paladín 2): Castigo divino siempre preparado
  const smite = classLevel(c, 'paladin') >= 2 ? spellIdx.list.find((x) => x.en === 'Divine Smite') : undefined;
  const classSpells = smite && !c.spells.includes(smite.id) && !subSpells.some((y) => y.id === smite.id) ? [{ k: smite.id, s: smite, sub: 'Paladín · siempre preparado', cls: ['paladin'] }] : [];
  // clases a las que pertenece cada conjuro elegido (para las pestañas por clase): las que lo tienen en su lista
  // cada conjuro elegido va a la clase que lo prepara (su lista y su nivel máximo), como en «Editar hoja»
  const preps = data ? casterPreps(c, data, spellIdx.list) : [];
  const casterIds = preps.map((pr) => pr.id);
  const alwaysIds = new Set([...subSpells.map((x) => x.id), ...(smite ? [smite.id] : [])]);
  const assigned = assignSpells(c.spells, preps, (id) => spellIdx.get(id)?.l || 0, alwaysIds);
  const clsOf = (id: string) => Object.entries(assigned.byClass).filter(([, b]) => b.cantrips.includes(id) || b.spells.includes(id)).map(([k]) => k);
  const spellList = [
    // elegido a mano pero siempre preparado (Castigo divino del paladín): se muestra como tal
    ...c.spells.map((k) => (smite && k === smite.id ? { k, s: spellIdx.get(k), sub: 'Paladín · siempre preparado', cls: ['paladin'] } : { k, s: spellIdx.get(k), sub: '', cls: clsOf(k) })),
    ...classSpells,
    ...subSpells.map((x) => ({ k: x.id, s: spellIdx.get(x.id), sub: 'Subclase · siempre preparado', cls: [x.cls] })),
    ...picked.map((x) => ({ k: x.id, s: spellIdx.get(x.id), sub: x.prepared ? 'Subclase · siempre preparado' : 'Subclase · en tu libro de conjuros', cls: [x.cls] })),
  ].filter((x) => x.s).sort((a, b) => (a.s!.l || 0) - (b.s!.l || 0) || a.s!.n.localeCompare(b.s!.n, 'es'));
  const spClasses = casterIds.filter((k) => spellList.some((x) => x.cls.includes(k)));
  const clsTab = spCls !== 'all' && spClasses.includes(spCls) ? spCls : 'all';
  const spellShown = spellList.filter((x) => clsTab === 'all' || x.cls.includes(clsTab));
  // un bloque por nivel (con sus espacios al lado, como las habilidades bajo su característica): los que tienen conjuros o espacios
  const spBlocks = [...new Set([...spellShown.map((x) => x.s!.l || 0), ...d.slots.map((n, i) => (n > 0 ? i + 1 : -1)).filter((l) => l > 0)])]
    .sort((a, b) => a - b).map((l) => ({ l, title: l ? 'Nivel ' + l : 'Trucos', list: spellShown.filter((x) => (x.s!.l || 0) === l) }));
  const spTextOf = spText ? spellList.find((x) => x.k === spText) : undefined;
  // abajo: conjuros a la izquierda y rasgos a la derecha. En dos columnas, si una es mucho más larga, sus últimos bloques
  // siguen al final de la otra («Conjuros (cont.)» bajo los rasgos o «Rasgos y dotes (cont.)» bajo los conjuros) para que acaben a la par
  const hasSpells = !!(d.spell || spellList.length > 0);
  // CD y ataque de conjuro: una línea por cada combinación distinta (si las clases comparten característica, sale una sola)
  const castLines = d.casters.length > 1
    ? d.casters.reduce<{ key: string; dc: number; abil: Abil; atk: number; names: string[] }[]>((a, x) => {
      const k = x.abil + x.dc + '/' + x.atk;
      const g = a.find((y) => y.key === k);
      if (g) g.names.push(x.n); else a.push({ key: k, dc: x.dc, abil: x.abil, atk: x.atk, names: [x.n] });
      return a;
    }, [])
    : d.spell ? [{ key: '', dc: d.spell.dc, abil: d.spell.abil, atk: d.spell.atk, names: [] as string[] }] : [];
  const castNamed = castLines.length > 1;
  const twoLow = hasSpells && lowW >= 1000;
  const lowN = twoLow ? 1 : lowW >= 900 ? 3 : lowW >= 600 ? 2 : 1;
  // a todo el ancho, los grupos se trocean para llenar todas las columnas; en dos columnas, de 8 en 8
  const chunkMax = (g: { list: unknown[] }[]) => (twoLow ? 8 : Math.max(4, Math.ceil(g.reduce((a, x) => a + x.list.length, 0) / lowN)));
  const spParts = chunkGroups(spBlocks, chunkMax(spBlocks));
  const ftParts = chunkGroups(featGroups, chunkMax(featGroups));
  const sumW = (a: { list: unknown[] }[]) => a.reduce((x, b) => x + blockW(b), 0);
  let spKeep = spParts.length;
  let ftKeep = ftParts.length;
  if (twoLow) {
    const spHead = 2 + (castNamed ? 1.3 * castLines.length : 0) + (d.pact ? 1 : 0) + (spClasses.length > 1 ? 1.2 : 0);
    const ftHead = 1.2;
    const base = Math.max(spHead + sumW(spParts), ftHead + sumW(ftParts));
    let best = base;
    let pick: [number, number] = [spKeep, ftKeep];
    for (let k = 1; k < spParts.length; k++) {
      const m = Math.max(spHead + sumW(spParts.slice(0, k)), ftHead + sumW(ftParts) + 1.4 + sumW(spParts.slice(k)));
      if (m < best) { best = m; pick = [k, ftParts.length]; }
    }
    for (let k = 1; k < ftParts.length; k++) {
      const m = Math.max(spHead + sumW(spParts) + 1.4 + sumW(ftParts.slice(k)), ftHead + sumW(ftParts.slice(0, k)));
      if (m < best) { best = m; pick = [spParts.length, k]; }
    }
    if (base - best > 1.5) [spKeep, ftKeep] = pick;
  }
  const freeSmite = features.find((f) => f.key === 'Castigo del paladín' && f.max);
  // conjuros que, mientras duran, suman en cada golpe con arma: se activan como etiquetas en «Ataques»
  // (los del SRD por su nombre en inglés; los del libro del usuario, por el nombre en español)
  const has = (en: string, es: RegExp) => spellList.some((x) => x.s!.en === en || es.test(norm(x.s!.n)));
  const hitBuffs = [
    ...(markDie || has("Hunter's Mark", /^marca del cazador$/) ? [{ key: 'mark', n: 'Marca del cazador', dmg: markDie || '1d6', type: 'fuerza', atk: 0, conc: true, why: 'su daño de fuerza en cada golpe al objetivo marcado' }] : []),
    ...(has('Hex', /^maleficio$/) ? [{ key: 'hex', n: 'Maleficio', dmg: '1d6', type: 'necrótico', atk: 0, conc: true, why: '1d6 necrótico en cada golpe al objetivo maldito' }] : []),
    ...(has('Divine Favor', /^favor divino$/) ? [{ key: 'favor', n: 'Favor divino', dmg: '1d4', type: 'radiante', atk: 0, conc: false, why: '1d4 radiante en cada golpe con arma (1 minuto)' }] : []),
    ...(has("Crusader's Mantle", /^manto del cruzado$/) ? [{ key: 'mantle', n: 'Manto del cruzado', dmg: '1d4', type: 'radiante', atk: 0, conc: true, why: '1d4 radiante en cada golpe con arma (concentración)' }] : []),
    ...(has('Elemental Weapon', /^arma elemental$/) ? [{ key: 'elemental', n: 'Arma elemental', dmg: '1d4', type: '', atk: 1, conc: true, why: '+1 al ataque y 1d4 del tipo elegido con el arma encantada (a nivel 3)' }] : []),
    ...(has('Magic Weapon', /^arma magica$/) ? [{ key: 'magic', n: 'Arma mágica', dmg: '1', type: '', atk: 1, conc: false, why: '+1 al ataque y al daño con el arma encantada (a nivel 2)' }] : []),
  ];
  const toggleBuff = (b: (typeof hitBuffs)[number]) => {
    const on = buffs.includes(b.key);
    setBuffs(on ? buffs.filter((x) => x !== b.key) : [...buffs, b.key]);
    if (b.conc && !on) set({ conds: withConc(c.conds, b.n) });
    if (b.conc && on && concOf(c.conds) === b.n) set({ conds: withoutConc(c.conds) });
  };
  const buffAtk = hitBuffs.filter((b) => buffs.includes(b.key)).reduce((a, b) => a + b.atk, 0);
  // castigos: se lanzan al acertar y su daño va en la misma tirada que el arma (Castigo divino, abrasador, brillante…)
  const SMITES = ['Divine Smite', 'Searing Smite', 'Shining Smite', 'Thunderous Smite', 'Wrathful Smite', 'Blinding Smite', 'Staggering Smite', 'Banishing Smite'];
  const smiteSpells = spellList.filter((x) => (SMITES.includes(x.s!.en || '') || /^castigo (divino|abrasador|brillante|atronador|colerico|furioso|cegador|asombroso|desterrador|aturdidor)$/.test(norm(x.s!.n))) && spellRoll(x.s!.t)?.damage).map((x) => x.s!);
  const smiteSpell = smiteSpells.find((x) => x.id === smiteSel) || smiteSpells.find((x) => x.en === 'Divine Smite') || smiteSpells[0];
  const hasSmite = !!smiteSpell;
  const pactLeft = d.pact ? d.pact.n - Math.min(d.pact.n, c.pactUsed) : 0;
  const smiteBase = smiteSpell?.l || 1;
  const smiteRoll = smiteSpell ? spellRoll(smiteSpell.t) : null;
  // espacios: gratis (Castigo del paladín, solo el divino), normales desde su nivel o de pacto
  const smiteOpts = !smiteSpell || !smiteRoll ? [] : [
    ...(smiteSpell.en === 'Divine Smite' && freeSmite && (c.uses[freeSmite.key] || 0) < freeSmite.max! ? [{ key: 'free', lv: 1, label: 'Gratis' }] : []),
    ...d.slots.map((n, i) => ({ key: String(i + 1), lv: i + 1, label: 'Nivel ' + (i + 1), left: n - (c.slotsUsed[i] || 0) })).filter((o) => o.left > 0 && o.lv >= smiteBase),
    ...(d.pact && pactLeft > 0 && d.pact.lv >= smiteBase ? [{ key: 'p', lv: d.pact.lv, label: 'Pacto' }] : []),
  ].map((o) => { const dm = spellCast(smiteRoll, smiteBase, o.lv, d.level, 0, false).dmg; return { ...o, dice: dm?.expr || '', type: dm?.type || 'radiante' }; });
  const smiteOpt = smiteOpts.find((o) => o.key === smitePick) || smiteOpts[0];
  const smiteShort = smiteSpell ? smiteSpell.n.replace(/^castigo\s+/i, '').replace(/^\p{Ll}/u, (m) => m.toUpperCase()) : '';
  // Castigo arcano (invocación): 1d8 de fuerza más 1d8 por nivel del espacio de pacto
  const eldDice = hasInvocation(c, 'Castigo arcano') && d.pact && pactLeft > 0 ? d.pact.lv + 1 + 'd8' : '';
  // competencias con armaduras y armas de su clase (la primera; con multiclase, las de las demás son menos)
  const pcls = data?.classes.find((x) => x.id === c.classId);
  const ARMOR_N: Record<string, string> = { lgt: 'ligeras', med: 'intermedias', hvy: 'pesadas', shl: 'escudos' };
  const WEAPON_N: Record<string, string> = { sim: 'sencillas', mar: 'marciales' };
  const profText = {
    armor: (pcls?.armor || []).map((k) => ARMOR_N[k] || k).join(', '),
    weapons: (pcls?.weapons || []).map((k) => WEAPON_N[k] || data?.weapons.find((w) => w.base === k)?.n || k).join(', '),
  };
  // las notas rellenan la columna más corta (en pantallas estrechas, tras las características)
  const splitRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [notesSide, setNotesSide] = useState<'left' | 'right'>('left');
  useEffect(() => {
    const l = leftRef.current, rr = rightRef.current, sp = splitRef.current;
    if (!l || !rr || !sp || typeof ResizeObserver !== 'function') return;
    // alto de su contenido (el último panel de la columna sin notas se estira hasta abajo: se mide hasta su último hijo)
    const natural = (el: HTMLElement) => {
      const last = el.lastElementChild as HTMLElement | null;
      const inner = last?.lastElementChild as HTMLElement | null;
      if (!last || !inner) return el.offsetHeight;
      const cs = getComputedStyle(last);
      return inner.getBoundingClientRect().bottom - el.getBoundingClientRect().top + parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
    };
    const place = () => {
      const twoCols = getComputedStyle(sp).display === 'grid';
      setNotesSide(twoCols && natural(rr) < natural(l) ? 'right' : 'left');
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(l); ro.observe(rr); ro.observe(sp);
    // también cada panel y su contenido: un panel estirado no cambia de alto aunque crezca lo de dentro
    [l, rr].forEach((col) => [...col.children].forEach((pn) => { ro.observe(pn); if (pn.lastElementChild) ro.observe(pn.lastElementChild); }));
    return () => ro.disconnect();
  }, []);
  const notesPanel = (
    <section className="panel pc-notes" aria-label="Notas">
      <label className="eyebrow" htmlFor="pc-notes">Notas</label>
      <textarea id="pc-notes" className="input" value={c.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Equipo, objetivos, vínculos, lo que pasó la última sesión…" />
    </section>
  );
  // un bloque de conjuros (un nivel) y uno de rasgos (un origen); y su rejilla de columnas
  const spellBlock = ({ key, title, first, l, list }: (typeof spParts)[number]) => (
    <div key={key} className="pc-abil pc-block pc-block-sp" role="group" aria-label={l ? 'Conjuros de nivel ' + l : 'Trucos'}>
      <div className="pc-block-head">
        <span className="pc-abil-k">{title}</span>
        {first && l > 0 && (d.slots[l - 1] || 0) > 0 && <Pips max={d.slots[l - 1]} used={Math.min(d.slots[l - 1], c.slotsUsed[l - 1] || 0)} label={'Espacios de nivel ' + l} onSet={(v) => { const u = c.slotsUsed.slice(); u[l - 1] = Math.max(0, Math.min(d.slots[l - 1], v)); set({ slotsUsed: u }); }} />}
      </div>
      {!list.length ? <span className="muted small">Ningún conjuro de este nivel{clsTab !== 'all' ? ' en esta clase' : ''}.</span> : (
        <ul className="pc-features sp-list">
          {list.map(({ k, s, sub }) => {
            const open = spOpen === k;
            const tag = sub ? (/libro/.test(sub) ? 'libro' : 'siempre') : '';
            return (
              <li key={k} className={open ? 'card sp-row open' : 'card sp-row'}>
                {/* plegado: nombre y marcas; al pulsarlo, sus tiradas y «Lanzar» */}
                <button className="sp-row-head" aria-expanded={open} title={open ? 'Plegar' : 'Desplegar para usarlo'} onClick={() => setSpOpen(open ? null : k)}>
                  <span className="sp-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                  <b>{s!.n}</b>
                  {!!s!.c && <span className="sp-mark" title="Concentración">C</span>}
                  {!!s!.rit && <span className="sp-mark" title="Ritual">R</span>}
                  {tag && <span className="chip-tag" title={sub}>{tag}</span>}
                </button>
                {open && (
                  <div className="sp-row-body">
                    <span className="muted small sp-row-meta">{[s!.ct, s!.r, s!.du].filter(Boolean).join(' · ')}{sub ? ' · ' + sub : ''}</span>
                    <SpellRolls c={c} d={d} s={s!} set={set} />
                    <button className="btn small ghost" aria-haspopup="dialog" onClick={() => setSpText(k)}>Ver texto</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
  const featBlock = ({ key, title, list }: (typeof ftParts)[number]) => (
    <div key={key} className="pc-abil pc-block pc-block-ft" role="group" aria-label={title}>
      <span className="pc-abil-k">{title}</span>
      <ul className="pc-features ft-list">
        {list.map((f) => {
          const lv = / (\d+)$/.exec(f.src)?.[1];
          const up = upKeys(f);
          return (
            <li key={f.src + f.key}>
              {/* una línea por rasgo: al pulsar el nombre se abre su texto */}
              <Card name={f.n} head={<>
                {lv && <span className="ft-lv" title={'Nivel ' + lv}>{lv}</span>}
                {up && <span className="chip-tag" title="Se usa desde su panel, más arriba">arriba</span>}
                {f.max != null && !up && <Pips max={f.max} used={Math.min(f.max, c.uses[f.key] || 0)} label={'Usos de ' + f.n} onSet={(v) => set({ uses: { ...c.uses, [f.key]: Math.max(0, Math.min(f.max!, v)) } })} />}
              </>}>
                <p className="muted small" style={{ margin: 0 }}>{f.src}{f.per ? ' · se recupera en descanso ' + (f.per === 'sr' ? 'corto o largo' : 'largo') : ''}</p>
                {f.d && <p className="pc-text">{f.d.split(/\*\*([^*]+)\*\*/).map((x, i) => (i % 2 ? <b key={i}>{x}</b> : plainText(x)))}</p>}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
  const blockGrid = <T extends { list: unknown[] }>(parts: T[], render: (p: T) => JSX.Element, n: number) => (
    <div className="pc-blocks" style={{ gridTemplateColumns: 'repeat(' + n + ', minmax(0, 1fr))' }}>
      {splitCols(parts, blockW, n).map((col, ci) => <div key={ci} className="pc-block-col">{col.map(render)}</div>)}
    </div>
  );
  // PX para el siguiente nivel; al alcanzarlos se resalta «Subir de nivel» (subir es a mano: hay que elegir)
  const xpNext = d.level < 20 ? XP_LEVELS[d.level] : null;
  const xpReady = xpNext != null && (c.xp || 0) >= xpNext;
  const hpPct = Math.max(0, Math.min(100, Math.round((c.hp / Math.max(1, d.hpMax)) * 100)));

  return (
    <div className="pc">
      <div className="panel pc-head">
        <div className="panel-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <h2>{c.name || 'Sin nombre'}</h2>
            <span className="muted">{[sp?.n || c.speciesName, classEntries(c).map((e) => (data?.classes.find((x) => x.id === e.classId)?.n || e.className || 'Sin clase') + ' ' + e.level + (e.subclass ? ' (' + e.subclass + ')' : '')).join(' / '), bg?.n || c.backgroundName].filter(Boolean).join(' · ')}</span>
            {d.resist.length > 0 && <span className="small pc-resist">Resistencias: {d.resist.map((x) => x.type + ' (' + x.why + ')').join(' · ')}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data && <button className={xpReady ? 'btn small primary lvl-ready' : 'btn small primary'} title={xpReady ? 'Tienes PX para el nivel ' + (d.level + 1) : undefined} onClick={() => setLeveling(true)}>{xpReady ? '¡Subir de nivel!' : 'Subir de nivel'}</button>}
            <button className="btn small" data-tour="edit" onClick={() => setEditing(true)}>Editar hoja</button>
          </div>
        </div>
        {undoLevel && undoLevel.id === c.id && (
          <div className="lvl-done" role="status">
            <span>¡Has subido de nivel! Revisa tus rasgos, conjuros y usos nuevos.</span>
            <button className="btn small" onClick={() => { replace(undoLevel); setUndoLevel(null); }}>Deshacer la subida</button>
            <button className="btn small ghost" onClick={() => setUndoLevel(null)}>Cerrar</button>
          </div>
        )}
        {restSpells && data && <RestSpells c={c} data={data} onClose={() => setRestSpells(false)} />}
        {leveling && data && <LevelUp c={c} data={data} lib={lib} onClose={() => setLeveling(false)} onDone={(prev) => { setLeveling(false); setUndoLevel(prev); }} />}
        {/* franja como la de la hoja oficial: nivel y PX, CA, PG, dados de golpe, salvaciones contra la muerte, iniciativa y velocidad */}
        <div className="pc-stats">
          <div className="stat stat-lv"><span className="stat-k">Nivel</span><span className="stat-v">{d.level}</span>
            <label className="stat-xp"><span>PX</span><input className="input" type="number" min={0} inputMode="numeric" aria-label="Puntos de experiencia" value={c.xp ?? ''} placeholder="0" onChange={(e) => set({ xp: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0) })} /></label>
            {xpNext != null && <span className={xpReady ? 'stat-note stat-xp-next on' : 'stat-note stat-xp-next'}>sig.: {xpNext.toLocaleString('es-ES')}</span>}</div>
          {/* CA con forma de escudo; debajo, «Escudo» con su casilla (embrazarlo o soltarlo en mitad del combate). De qué sale la CA, al pasar el ratón */}
          <div className="stat stat-ac" title={'CA: ' + d.acNote}><span className="stat-k">CA</span><span className="stat-v">{d.ac}</span>
            <label className="stat-shield" title={c.shield ? 'Soltar el escudo' : 'Embrazar un escudo: +' + (2 + (c.shieldBonus || 0)) + ' a la CA'}>
              <span className="stat-note">Escudo</span>
              <input type="checkbox" checked={c.shield} aria-label={'Escudo +' + (2 + (c.shieldBonus || 0))} onChange={(e) => set({ shield: e.target.checked })} />
            </label></div>
          <div className="stat stat-hp">
            <span className="stat-k">PG</span>
            <div className="stat-hp-row">
              <span className="stat-hp-cur"><span className="stat-v">{c.hp}</span><span className="stat-note">actuales</span></span>
              <span className="stat-hp-side">
                <span><b className={c.temp > 0 ? 'stat-tmp' : ''}>{c.temp}</b> <span className="stat-note">temp.</span></span>
                <span><b className="stat-max">{d.hpMax}</b> <span className="stat-note">máx.</span></span>
              </span>
            </div>
            <span className="hpbar"><span className={'hpfill ' + (hpPct <= 25 ? 'low' : hpPct <= 50 ? 'mid' : '')} style={{ width: hpPct + '%' }} /></span>
          </div>
          <div className="stat stat-hd"><span className="stat-k">Dados de golpe</span>
            <span className="stat-hd-row"><span className="stat-v">{hdSpentAll}</span><span className="stat-note">gastados de {hdMaxText}</span></span>
            {/* gastar uno cura (un dado más la Constitución): en descansos cortos */}
            <span className="stat-hd-btns">{d.hitDice.map((x) => <button key={x.die} className="btn small" disabled={hdLeft(x.die) <= 0 || c.hp >= d.hpMax} title={'Gastar un d' + x.die + ' y curarte (descanso corto)'} onClick={() => spendHd(x.die)}>{multiHd ? 'd' + x.die : 'Usar uno'}</button>)}</span>
          </div>
          <div className={c.hp === 0 ? 'stat stat-death on' : 'stat stat-death'}><span className="stat-k">Salv. contra la muerte</span>
            {/* se marcan a mano: un golpe estando a 0 PG es un fallo (dos si es crítico) */}
            <span className="death-row"><span className="stat-note">Éxitos</span><span className="pips">{[0, 1, 2].map((j) => <button key={j} className={j < c.death.s ? 'pip ok' : 'pip off'} aria-label={'Éxitos: ' + (j + 1)} aria-pressed={j < c.death.s} onClick={() => markDeath('s', j)} />)}</span></span>
            <span className="death-row"><span className="stat-note">Fallos</span><span className="pips">{[0, 1, 2].map((j) => <button key={j} className={j < c.death.f ? 'pip bad' : 'pip off'} aria-label={'Fallos: ' + (j + 1)} aria-pressed={j < c.death.f} onClick={() => markDeath('f', j)} />)}</span></span>
            <button className="btn small gold" disabled={c.hp > 0} title={c.hp > 0 ? 'Solo a 0 PG' : 'Tirar una salvación contra la muerte'} onClick={deathSave}>Tirar</button>
          </div>
          {/* la iniciativa se tira pulsándola: botón dorado con su d20, como los de ataque */}
          <button className="stat stat-init" onClick={() => r('iniciativa', 'init', d20(d.init), d.initAdv ? { adv: d.initAdv } : {})} title={'Tirar iniciativa' + (d.initAdv ? ' con ventaja (' + d.initAdv + ')' : '')}>
            <svg className="init-die" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7z" /><path d="M12 2 6.5 12 12 22M12 2l5.5 10L12 22M3 7l3.5 5L3 17M21 7l-3.5 5 3.5 5M6.5 12h11" fill="none" /></svg>
            <span className="init-txt"><span className="stat-k">Iniciativa{d.initAdv && <span className="adv-mark">V</span>}</span><span className="stat-v">{fmt(d.init)}</span><span className="init-hint">Tirar</span></span>
          </button>
          <div className="stat stat-sm"><span className="stat-k">Velocidad</span><span className="stat-v">{d.speed}<span className="stat-of"> pies</span></span></div>
        </div>
        <div className="pc-hp-row" data-tour="hp">
          <input className="input" type="number" min={0} inputMode="numeric" aria-label="Cantidad de PG" placeholder="PG" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') damage(); }} />
          <select className="input pc-dmg-type" aria-label="Tipo de daño recibido" value={dmgType} onChange={(e) => setDmgType(e.target.value)}>
            <option value="">sin tipo</option>
            {DMG_TYPES.map((t) => <option key={t} value={t}>{t}{d.resist.some((x) => x.type === t) ? ' (resistes)' : ''}</option>)}
          </select>
          <button className="btn primary" onClick={damage} title={resisted ? 'Resistencia (' + resisted.why + '): recibes la mitad' : undefined}>Daño{resisted ? ' (mitad)' : ''}</button>
          <button className="btn heal" onClick={heal}>Curación</button>
          <button className="btn temp" onClick={giveTemp}>PG temporales</button>
          {conc && <button className="chip on pc-conc" title="Te concentras en este conjuro. Pulsa para dejar de concentrarte." onClick={() => set({ conds: withoutConc(c.conds) })}>Concentración: {conc} ✕</button>}
        </div>
        {concCheck && conc && (
          <InfoDialog title="Salvación de concentración" onClose={() => setConcCheck(null)}>
            <p style={{ marginTop: 0 }}>Has recibido {concCheck.dmg} de daño mientras te concentras en <b>{conc}</b>. Tira una salvación de Constitución con <b>CD {concCheck.dc}</b>{warCaster ? ' (con ventaja por Lanzador de guerra)' : ''}: si fallas, el conjuro termina.</p>
            <div className="rollrow">
              <button className="btn primary" onClick={concSave}>Tirar salvación {fmt(d.saves.con.bonus)}</button>
              <button className="btn" onClick={() => setConcCheck(null)}>Mantener sin tirar</button>
              <button className="btn ghost" onClick={() => { set({ conds: withoutConc(c.conds) }); setConcCheck(null); }}>Perder la concentración</button>
            </div>
          </InfoDialog>
        )}
      </div>

      {/* características a la izquierda (como la hoja oficial); ataques y rasgos de clase a la derecha */}
      <div className="pc-split" ref={splitRef}>
      <div className="pc-split-col">
      <div className="pc-split-in" ref={leftRef}>
      {/* como en la hoja oficial: cada característica con su modificador (prueba), su puntuación, su salvación y sus habilidades */}
      <section className="panel" aria-label="Características" data-tour="rolls">
        <h3 className="eyebrow">Características, salvaciones y habilidades</h3>
        <div className="pc-abils">
          {[ABILS.slice(0, 3), ABILS.slice(3)].map((col, ci) => <div key={ci} className="pc-abil-col">
            {/* como en la hoja oficial: el bonificador por competencia arriba de la primera columna */}
            {ci === 0 && <div className="pc-abil pc-pb"><span className="pc-abil-k">Bonificador por competencia</span><b>{fmt(d.pb)}</b></div>}
            {col.map((a) => (
            <div key={a} className="pc-abil" data-abil={a}>
              <div className="pc-abil-head">
                <span className="pc-abil-k">{ABIL_N[a]} <span className="pc-abil-s">{ABIL_S[a]}</span></span>
                <button className="pc-abil-mod" title={'Prueba de ' + ABIL_N[a] + (d.checks[a].adv ? ' con ventaja (' + d.checks[a].adv + ')' : '')} onClick={() => r('prueba de ' + ABIL_N[a], 'check', d20(d.checks[a].bonus), d.checks[a].adv ? { adv: d.checks[a].adv } : {})}>
                  <span className="pc-abil-mod-k">Prueba</span> <b>{fmt(d.checks[a].bonus)}</b>{d.checks[a].adv && <span className="adv-mark">V</span>}
                </button>
                <span className="pc-abil-score" title="Puntuación">{d.abil[a]}</span>
              </div>
              <ul className="pc-skills">
                <li>
                  <button className="pc-skill pc-save" aria-label={'Salvación de ' + ABIL_N[a] + ' ' + fmt(d.saves[a].bonus) + (d.saves[a].prof ? ' (competente)' : '') + (d.saves[a].adv ? ' V' : '')} title={'Salvación de ' + ABIL_N[a] + (d.saves[a].prof ? ' (competente)' : '') + (d.saves[a].why ? ' · ' + d.saves[a].why : '') + (d.saves[a].adv ? ' · ventaja (' + d.saves[a].adv + ')' : '')} onClick={() => r('salvación de ' + ABIL_N[a], 'save', d20(d.saves[a].bonus), d.saves[a].adv ? { adv: d.saves[a].adv } : {})}>
                    <span className={d.saves[a].prof ? 'dot on' : 'dot'} aria-label={d.saves[a].prof ? 'Competente' : 'Sin competencia'} />
                    <span className="pc-skill-n">Salvación</span>
                    {d.saves[a].adv && <span className="adv-mark">V</span>}
                    <b>{fmt(d.saves[a].bonus)}</b>
                  </button>
                </li>
                {skillsSorted.filter(([, sk]) => sk.abil === a).map(([k, sk]) => (
                  <li key={k}>
                    <button className="pc-skill" onClick={() => r(data?.skills[k] || k, 'check', d20(sk.bonus), { ...(sk.adv ? { adv: sk.adv } : {}), ...(sk.min10 ? { parts: [{ expr: d20(sk.bonus), minD20: 10 }] } : {}) })} title={'Tirar ' + (data?.skills[k] || k) + (sk.adv ? ' con ventaja (' + sk.adv + ')' : '') + (sk.min10 ? ' · Talento fiable: el d20 cuenta como 10 como mínimo' : '')}>
                      <span className={sk.exp ? 'dot exp' : sk.prof ? 'dot on' : 'dot'} aria-label={sk.exp ? 'Pericia' : sk.prof ? 'Competente' : 'Sin competencia'} />
                      <span className="pc-skill-n">{data?.skills[k] || k}</span>
                      {sk.adv && <span className="adv-mark" title={sk.adv}>V</span>}
                      <b>{fmt(sk.bonus)}</b>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
            {/* bajo la Constitución: Inspiración heroica y Percepción pasiva */}
            {ci === 0 && (
              <div className="pc-abil pc-extra">
                <button className={c.inspiration ? 'pc-insp on' : 'pc-insp'} aria-pressed={c.inspiration} title="Ventaja en una tirada d20 (se gasta al usarla)" onClick={() => set({ inspiration: !c.inspiration })}>
                  <span className="pc-insp-box">{c.inspiration ? '★' : ''}</span><span>Inspiración heroica</span>
                </button>
                <div className="pc-pp"><span className="pc-abil-k">Percepción pasiva</span><b>{d.pp}</b></div>
              </div>
            )}
            {/* competencias con equipo, herramientas e idiomas */}
            {ci === 0 && (
            <div className="pc-abil pc-profs">
              <span className="pc-abil-k">Competencias</span>
              <dl>
                <dt>Armaduras</dt><dd>{profText.armor || 'ninguna'}</dd>
                <dt>Armas</dt><dd>{profText.weapons || 'ninguna'}</dd>
                <dt><label htmlFor="pc-tools">Herramientas</label></dt><dd><input id="pc-tools" className="input pc-prof-input" value={c.tools} placeholder="—" onChange={(e) => set({ tools: e.target.value })} /></dd>
                <dt><label htmlFor="pc-langs">Idiomas</label></dt><dd><input id="pc-langs" className="input pc-prof-input" value={c.langs} placeholder="—" onChange={(e) => set({ langs: e.target.value })} /></dd>
              </dl>
            </div>
            )}
          </div>)}
        </div>
      </section>

      {/* ataques y paneles de rasgos con pocas tarjetas, uno al lado del otro (con muchas tarjetas, a todo el ancho) */}
      </div>
      {notesSide === 'left' && notesPanel}
      </div>
      <div className="pc-split-col">
      <div className="pc-duo pc-split-in" ref={rightRef}>
      <section className="panel" aria-label="Ataques">
        <div className="panel-head">
          <h3 className="eyebrow">Ataques</h3>
          {(d.fx.savage || d.fx.charge || d.fx.piercer || rageDmg > 0 || !!sneakDice || !!strikeDice || hasSmite || hitBuffs.length > 0) && (
            <span className="rollrow">
              {d.fx.savage && <button className={savage ? 'chip on' : 'chip'} aria-pressed={savage} title="Una vez por turno: el próximo daño con arma tira sus dados dos veces y usa el mejor" onClick={() => setSavage(!savage)}>Atacante salvaje</button>}
              {rageDmg > 0 && <button className={rage ? 'chip on' : 'chip'} aria-pressed={rage} title={'Mientras dure: +' + rageDmg + ' al daño de los ataques con Fuerza; resistencia a contundente, cortante y perforante. Entrar gasta un uso de Furia.'} onClick={toggleRage}>Furia +{rageDmg}</button>}
              {classLevel(c, 'barbarian') >= 2 && <button className={reckless ? 'chip on' : 'chip'} aria-pressed={reckless} title={'Este turno: ventaja en tus ataques con Fuerza (y los ataques contra ti también la tienen)' + (frenzy ? '. Con Furia: Frenesí, ' + rageDmg + 'd6 más al primer objetivo que aciertes' : '')} onClick={() => setReckless(!reckless)}>Ataque temerario</button>}
              {brutalDice && <button className={brutal ? 'chip on' : 'chip'} aria-pressed={brutal} title="Renuncias a la ventaja en un ataque con Fuerza: si acierta, este daño extra" onClick={() => setBrutal(!brutal)}>Golpe brutal +{brutalDice}</button>}
              {sneakDice && <button className={sneak ? 'chip on' : 'chip'} aria-pressed={sneak} title="Una vez por turno, con un arma sutil o a distancia, si tienes ventaja o un aliado junto al objetivo" onClick={() => setSneak(!sneak)}>Ataque furtivo +{sneakDice}</button>}
              {hitBuffs.map((b) => { const on = buffs.includes(b.key); return <button key={b.key} className={on ? 'chip on' : 'chip'} aria-pressed={on} title={'Mientras dure: ' + b.why} onClick={() => toggleBuff(b)}>{b.n} +{b.atk && !/d/.test(b.dmg) ? b.atk : b.dmg}</button>; })}
              {strikeDice && <button className={strike ? 'chip on' : 'chip'} aria-pressed={strike} title={'Una vez por turno al impactar con un arma: ' + (blessed ? 'radiante o necrótico' : 'frío, fuego, relámpago o trueno')} onClick={() => setStrike(!strike)}>{strikeName} +{strikeDice}</button>}
              {hasSmite && (smiteOpt ? (
                <label className="smite-pick small" title="Castigo y espacio que gasta su botón en tus armas cuerpo a cuerpo">{smiteSpells.length > 1 ? 'Castigo' : smiteSpell!.n}
                  {smiteSpells.length > 1 && <select className="input pc-slot-pick" aria-label="Castigo" value={smiteSpell!.id} onChange={(e) => { setSmiteSel(e.target.value); setSmitePick(''); }}>{smiteSpells.map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}</select>}
                  <select className="input pc-slot-pick" aria-label="Espacio del castigo" value={smiteOpt.key} onChange={(e) => setSmitePick(e.target.value)}>{smiteOpts.map((o) => <option key={o.key} value={o.key}>{o.label} · {o.dice}</option>)}</select>
                </label>
              ) : <span className="muted small">{smiteSpell!.n}: sin espacios</span>)}
              {d.fx.piercer && <button className={pierce ? 'chip on' : 'chip'} aria-pressed={pierce} title="Una vez por turno: el próximo daño perforante repite su dado más bajo si no llega a la mitad" onClick={() => setPierce(!pierce)}>Perforador</button>}
              {d.fx.charge && <button className={charge ? 'chip on' : 'chip'} aria-pressed={charge} title={'Tras moverte 3 m en línea recta: el próximo daño cuerpo a cuerpo suma ' + d.fx.charge} onClick={() => setCharge(!charge)}>Carga +{d.fx.charge}</button>}
            </span>
          )}
        </div>
        {!d.attacks.length && !d.unarmed && <p className="muted small" style={{ margin: 0 }}>Añade tus armas en «Editar hoja».</p>}
        <div className="pc-attacks">
        {d.attacks.map(({ w, atk, abil, parts, verParts, throwParts, offParts, poleParts, notes }) => (
          <div key={w.id} className="pc-attack">
            <span className="pc-attack-n">{w.name}<span className="muted small">{[w.kind === 'ranged' ? 'distancia' : 'cuerpo a cuerpo', w.range, ...(w.props || []), w.mastery ? 'maestría: ' + w.mastery : ''].filter(Boolean).join(' · ')}</span>{notes.length > 0 && <span className="pc-attack-feat small">{notes.join(' · ')}</span>}
              {d.fx.dmgOneHand != null && w.kind === 'melee' && !(w.props || []).some((p) => norm(p) === 'a dos manos') && (
                <label className="check small pc-duel"><input type="checkbox" checked={w.duel !== false} onChange={(e) => set({ weapons: c.weapons.map((x) => (x.id === w.id ? { ...x, duel: e.target.checked } : x)) })} />A una mano, sin nada en la otra (Duelo)</label>
              )}
            </span>
            <span className="rollrow">
              <button className="rollbtn" onClick={() => r(w.name + ': ataque', 'attack', d20(atk + buffAtk), { critOn: d.critOn, ...(reckless && abil === 'str' ? { adv: 'Ataque temerario' } : {}) })}>Ataque {fmt(atk + buffAtk)}{reckless && abil === 'str' && <span className="adv-mark">V</span>}</button>
              <button className="rollbtn dmg" onClick={() => dmgRoll(w.name + ': daño', parts, { melee: w.kind === 'melee', str: abil === 'str', finesse: w.finesse || w.kind === 'ranged' }, w.id)}>Daño {partsLabel(parts)}{armTag(w.id)}</button>
              {w.kind === 'melee' && smiteChips(w.id)}
              {verParts.length > 0 && <button className="rollbtn dmg" onClick={() => dmgRoll(w.name + ': daño a dos manos', verParts, { melee: true, str: abil === 'str', finesse: w.finesse }, w.id)}>A dos manos {partsLabel(verParts)}{armTag(w.id)}</button>}
              {throwParts.length > 0 && <button className="rollbtn dmg" onClick={() => dmgRoll(w.name + ': daño lanzada', throwParts, { melee: false, str: abil === 'str', finesse: true })}>Lanzada {partsLabel(throwParts)}</button>}
              {offParts.length > 0 && <button className="rollbtn dmg" title="Ataque extra de la propiedad «ligera» (acción adicional); el ataque se tira con «Ataque»" onClick={() => dmgRoll(w.name + ': ataque extra', offParts, { melee: w.kind === 'melee', str: abil === 'str', finesse: w.finesse || w.kind === 'ranged' })}>Acción adicional {partsLabel(offParts)}</button>}
              {poleParts.length > 0 && <button className="rollbtn dmg" title="Maestro en armas de asta: ataque con el otro extremo (acción adicional)" onClick={() => dmgRoll(w.name + ': otro extremo', poleParts, { melee: true, str: abil === 'str', finesse: false }, w.id)}>Otro extremo {partsLabel(poleParts)}</button>}
            </span>
          </div>
        ))}
        {d.unarmed && (
          <div className="pc-attack">
            <span className="pc-attack-n">Ataque sin armas<span className="muted small">cuerpo a cuerpo</span><span className="pc-attack-feat small">{d.unarmed.notes.join(', ')}{d.unarmed.parts[0].reroll1 ? ' · repite los 1' : ''}</span></span>
            <span className="rollrow">
              <button className="rollbtn" onClick={() => r('ataque sin armas', 'attack', d20(d.unarmed!.atk), { critOn: d.critOn, ...(reckless && uaHit.str ? { adv: 'Ataque temerario' } : {}) })}>Ataque {fmt(d.unarmed.atk)}{reckless && uaHit.str && <span className="adv-mark">V</span>}</button>
              <button className="rollbtn dmg" onClick={() => dmgRoll('ataque sin armas: daño', d.unarmed!.parts, uaHit, 'ua')}>Daño {partsLabel(d.unarmed.parts)}{armTag('ua')}</button>
              {smiteChips('ua', false)}
              {d.unarmed.free.length > 0 && <button className="rollbtn dmg" title="Sin empuñar armas ni embrazar escudo" onClick={() => dmgRoll('ataque sin armas: daño', d.unarmed!.free, uaHit, 'ua')}>Sin armas ni escudo {partsLabel(d.unarmed.free)}</button>}
              {d.unarmed.grapple && <button className="rollbtn dmg" title="Al principio de tu turno, a una criatura que tengas agarrada" onClick={() => roll({ label: who + ' · daño a la criatura agarrada', kind: 'damage', who, by: null, parts: [{ expr: d.unarmed!.grapple, type: 'contundente' }] })}>Agarrada {d.unarmed.grapple} contundente</button>}
            </span>
          </div>
        )}
        </div>
      </section>

      {views.map(({ v, dv }, i) => (
        <Fragment key={i}>
          <SubclassActions c={v} d={dv} data={data} lib={lib} set={set} />
          <ClassPanel c={v} d={dv} data={data} set={set} />
        </Fragment>
      ))}
      <FeatPanel c={c} d={d} set={set} />
      {usable.length > 0 && (
        <section className="panel" aria-label="Rasgos con usos">
          <h3 className="eyebrow">Rasgos con usos</h3>
          <ul className="pc-features grid acts">
            {usable.map((f) => {
              const used = Math.min(f.max!, c.uses[f.key] || 0);
              const spend = (patch: Partial<Character> = {}) => set({ ...patch, uses: { ...c.uses, [f.key]: used + 1 } });
              // Astucia mágica (brujo): recupera la mitad de los espacios de pacto (redondeando arriba); con Maestro arcano, todos
              const cunning = f.key === 'Astucia mágica' && d.pact ? Math.min(c.pactUsed, classLevel(c, 'warlock') >= 20 ? d.pact.n : Math.ceil(d.pact.n / 2)) : null;
              return (
                <li key={f.key}>
                  <Card name={f.n} head={<>
                    <span className="muted small">{f.src} · {f.per === 'sr' ? 'descanso corto o largo' : 'descanso largo'}</span>
                    <span className="rollrow">
                      <Pips max={f.max!} used={used} label={'Usos de ' + f.n} onSet={(v) => set({ uses: { ...c.uses, [f.key]: Math.max(0, Math.min(f.max!, v)) } })} />
                      {cunning != null
                        ? <button className="btn small" disabled={used >= f.max! || cunning <= 0} title="Recupera espacios de pacto gastados" onClick={() => spend({ pactUsed: c.pactUsed - cunning })}>{cunning > 0 ? 'Usar: recupera ' + cunning + (cunning === 1 ? ' espacio de pacto' : ' espacios de pacto') : 'Usar (no has gastado espacios de pacto)'}</button>
                        : <button className="btn small" disabled={used >= f.max!} onClick={() => spend()}>Usar (gasta un uso)</button>}
                    </span>
                  </>}>
                    {f.d && <p className="pc-text">{f.d.split(/\*\*([^*]+)\*\*/).map((t, i) => (i % 2 ? <b key={i}>{t}</b> : plainText(t)))}</p>}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {/* estados y descansos, al final de la columna derecha (junto a PG y ataques) */}
      <section className="panel" aria-label="Estados y descansos">
        <Picker title="Estados" summary={[...c.conds, c.exh ? 'Agotamiento ' + c.exh : ''].filter(Boolean).join(', ')}>
          <div className="chips">
            {CONDITIONS.map(([k]) => <button key={k} className={c.conds.includes(k) ? 'chip on' : 'chip'} aria-pressed={c.conds.includes(k)} onClick={() => set({ conds: c.conds.includes(k) ? c.conds.filter((x) => x !== k) : [...c.conds, k] })}>{k}</button>)}
          </div>
          <span className="res">Agotamiento
            <span className="stepper">
              <button className="step" aria-label="Reducir agotamiento" onClick={() => set({ exh: Math.max(0, c.exh - 1) })}>−</button>
              <span className="qty">{c.exh}</span>
              <button className="step" aria-label="Aumentar agotamiento" onClick={() => set({ exh: Math.min(6, c.exh + 1) })}>+</button>
            </span>
          </span>
        </Picker>
        {withoutConc(c.conds).length > 0 && <ul className="rem">{withoutConc(c.conds).map((k) => <li key={k}><span><strong>{k}:</strong> {k === 'Furia' ? 'resistencia a daño contundente, cortante y perforante, ventaja en pruebas y salvaciones de Fuerza y +' + rageDmg + ' al daño con Fuerza. Quítala con el botón «Furia» de Ataques.' : CONDITIONS.find((x) => x[0] === k)?.[1]}</span></li>)}</ul>}
        <div className="pc-rest">
          <button className="btn small" onClick={() => setResting(!resting)} aria-expanded={resting}>Descanso corto</button>
          <button className="btn small" onClick={() => { if (confirmLong) { replace(longRest(c, d)); setConfirmLong(false); if (data && restSwapClasses(c).length && c.spells.length) setRestSpells(true); } else setConfirmLong(true); }}>{confirmLong ? '¿Seguro? Descanso largo' : 'Descanso largo'}</button>
        </div>
        {resting && (
          <div className="sub">
            <span className="small">Gasta dados de golpe para curarte ({fmt(d.mods.con)} cada uno). Te quedan {hdText}.</span>
            <div className="rollrow">
              {d.hitDice.map((x) => (
                <button key={x.die} className="rollbtn" disabled={hdLeft(x.die) <= 0 || c.hp >= d.hpMax} onClick={() => spendHd(x.die)}>{multiHd ? 'Gastar un d' + x.die : 'Gastar un dado de golpe'}</button>
              ))}
              <button className="btn small primary" onClick={() => {
                const res = views.flatMap(({ v }) => choiceResources(v, data, lib));
                // los de la clase que en 2024 recuperan uno en descanso corto (y todos en largo)
                const one = new Set([...res.filter((r) => r.now === 'sr1').map((r) => r.key), 'Furia', 'Forma salvaje', 'Segundo aliento', 'Canalizar Divinidad', 'Canalización divina']);
                const all = [...features.filter((f) => f.per === 'sr').map((f) => f.key), ...res.filter((r) => r.now === 'sr').map((r) => r.key)].filter((k) => !one.has(k));
                const rested = shortRest(c, all);
                // los que recuperan uno en descanso corto (dados psiónicos, Canalizar divinidad)
                one.forEach((k) => { if (rested.uses[k]) rested.uses[k] -= 1; });
                replace(rested); setResting(false);
              }}>Terminar descanso corto</button>
            </div>
          </div>
        )}
      </section>
      </div>
      {notesSide === 'right' && notesPanel}
      </div>
      </div>

      {/* abajo, en dos columnas como arriba: conjuros a la izquierda y rasgos a la derecha */}
      <div className="pc-low" ref={lowRef}>
      {hasSpells && (
        <div className="pc-low-col">
        <section className="panel" aria-label="Conjuros">
          <div className="panel-head">
            <h3 className="eyebrow">Conjuros</h3>
            {d.spell && <span className="rollrow">
              {castLines.map((x) => (
                <span key={x.key} className="rollrow">
                  <span className="muted small">CD {x.dc} · {ABIL_N[x.abil]}{castNamed ? ' (' + x.names.join(', ') + ')' : ''}</span>
                  <button className="rollbtn" onClick={() => r('ataque de conjuro' + (castNamed ? ' de ' + x.names.join(', ').toLowerCase() : ''), 'attack', d20(x.atk))}>Ataque de conjuro {fmt(x.atk)}</button>
                </span>
              ))}
            </span>}
          </div>
          {d.pact && <div className="pc-slots"><span className="res">Magia de pacto (nivel {d.pact.lv})<Pips max={d.pact.n} used={Math.min(d.pact.n, c.pactUsed)} label="Espacios de pacto" onSet={(v) => set({ pactUsed: Math.max(0, Math.min(d.pact!.n, v)) })} /></span></div>}
          {spClasses.length > 1 && (
            <div className="sp-tabs" role="tablist" aria-label="Conjuros por clase">
              {['all', ...spClasses].map((k) => <button key={k} role="tab" aria-selected={clsTab === k} className={clsTab === k ? 'sp-tab on' : 'sp-tab'} onClick={() => setSpCls(k)}>{k === 'all' ? 'Todas las clases' : data?.classes.find((x) => x.id === k)?.n || k}</button>)}
            </div>
          )}
          {!spellList.length && <p className="muted small" style={{ margin: 0 }}>Añade tus conjuros en «Editar hoja».</p>}
          {spKeep > 0 && blockGrid(spParts.slice(0, spKeep), spellBlock, lowN)}
          {spTextOf && (
            <InfoDialog title={spTextOf.s!.n} onClose={() => setSpText(null)}>
              <p className="muted small" style={{ margin: 0 }}>{spTextOf.s!.l ? 'Nivel ' + spTextOf.s!.l : 'Truco'}{spTextOf.s!.c ? ' · concentración' : ''}{spTextOf.s!.rit ? ' · ritual' : ''}{spTextOf.sub ? ' · ' + spTextOf.sub : ''}</p>
              <p className="muted small" style={{ margin: '4px 0' }}>{[spTextOf.s!.ct, spTextOf.s!.r, spTextOf.s!.cmp, spTextOf.s!.du].filter(Boolean).join(' · ')}</p>
              <p className="pc-text">{plainText(spTextOf.s!.t)}</p>
              <SpellRolls c={c} d={d} s={spTextOf.s!} set={set} />
            </InfoDialog>
          )}
        </section>
        {ftKeep < ftParts.length && (
          <section className="panel" aria-label="Rasgos y dotes (cont.)">
            <h3 className="eyebrow">Rasgos y dotes (cont.)</h3>
            {blockGrid(ftParts.slice(ftKeep), featBlock, lowN)}
          </section>
        )}
        </div>
      )}

      <div className="pc-low-col">
      <section className="panel" aria-label="Rasgos y dotes" data-tour="traits">
        <h3 className="eyebrow">Rasgos y dotes</h3>
        {views.map(({ v }, i) => <SubclassChoices key={i} c={v} data={data} lib={lib} set={set} restOnly />)}
        {!features.length && <p className="muted small" style={{ margin: 0 }}>Elige especie, clase y dotes en «Editar hoja» para ver aquí sus rasgos.</p>}
        {ftKeep > 0 && blockGrid(ftParts.slice(0, ftKeep), featBlock, lowN)}
      </section>
      {spKeep < spParts.length && (
        <section className="panel" aria-label="Conjuros (cont.)">
          <h3 className="eyebrow">Conjuros (cont.)</h3>
          {blockGrid(spParts.slice(spKeep), spellBlock, lowN)}
        </section>
      )}
      </div>
      </div>
    </div>
  );
}
