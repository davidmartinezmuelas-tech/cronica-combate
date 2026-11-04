import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { masteryText, weaponPropText } from '../../engine/weaponRules';
import { replacedFeatures } from '../../engine/featureNames';
import { libReplaces } from '../../engine/homebrew';
import InfoPop from '../../shared/InfoPop';
import { CONDITIONS, DMG_TYPES, XP_LEVELS } from '../../data/constants';
import { ABILS, type Abil, type ClassData, type ClassFeature, type PlayerData } from '../../data/player';
import { asClass, classEntries, classLevel, derive, expandCustomFeats, longRest, partsLabel, partsShort, shortRest, shortType, usesMax, type Character, type Derived } from '../../engine/character';
import { fmt, sgn, shotParts, type RollPart } from '../../engine/dice';
import { norm } from '../../engine/util';
import Card, { InfoDialog } from '../../shared/Card';
import Picker from '../../shared/Picker';
import Pips from '../../shared/Pips';
import { actionKindOf } from '../../engine/actionKind';
import { useLibrary, type LibraryData } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useStore } from '../../store/useStore';
import type { RollSpec } from '../../store/state';
import { hasInvocation, subclassSpells, subclassText } from '../../engine/subclassChoices';
import { assignSpells, casterPreps, classAlwaysSpells } from '../../engine/spellPrep';
import { concDc, concOf, withConc, withoutConc } from '../../engine/concentration';
import { spellCast, spellRoll } from '../../engine/spellRoll';
import { featureUses } from '../../engine/featureUses';
import type { HbFx } from '../../engine/homebrew';
import type { SaveEffect } from '../../engine/saveEffect';
import { useMobileTabs } from './mobileTabs';
import { useRoom } from '../../store/room';
import { fxCond, staleEffects } from '../../engine/spellEffects';
import { grantedSpells, type Grant } from '../../engine/grantedSpells';
import { plainText, useSpells } from './spells';
import ClassPanel, { classPanelKeys } from './ClassPanel';
import FeatPanel, { FEAT_PANEL_NAMES } from './FeatPanel';
import ReactionPanel, { REACTION, REACTION_FEATS } from './ReactionPanel';
import KitPanel from './KitPanel';
import QuickActions, { quickRows, quickTag, RELENTLESS } from './QuickActions';
import MetamagicPanel from './MetamagicPanel';
import MagicItemsPanel from './MagicItemsPanel';
import CharacterBioCard from './CharacterBioCard';
import { TagPicker } from '../../shared/Combo';
import { LANGUAGES, toolCatalog } from '../../engine/gearCatalog';
import { itemKey } from '../../engine/magicItems';
import SubclassActions, { actionPanelKeys, choiceResources } from './SubclassActions';
import { activeKits, KITS } from '../../engine/subclassActions';
import SpellRolls, { spellCastFor } from './SpellRolls';
import LevelUp from './LevelUp';
import RestSpells, { restSwapClasses } from './RestSpells';
import SubclassChoices, { choiceRows, choiceSpells, resolveChoices } from './SubclassChoices';
import DeathKnightPanel from './DeathKnightPanel';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };
const ABIL_S: Record<Abil, string> = { str: 'FUE', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR' };

export interface FeatureRow { key: string; n: string; d: string; src: string; max: number | null; per: string; fx?: HbFx }

/** Trocea los grupos de más de `max` filas en trozos parecidos; los siguientes llevan «(cont.)» en el título. */
function chunkGroups<G extends { title: string; list: unknown[] }>(groups: G[], max: number): (G & { key: string; first: boolean })[] {
  return groups.flatMap((g) => {
    const pieces = Math.max(1, Math.ceil(g.list.length / max));
    const size = Math.max(1, Math.ceil(g.list.length / pieces));
    return Array.from({ length: pieces }, (_, i) => ({ ...g, key: g.title + i, title: g.title + (i ? ' (cont.)' : ''), first: i === 0, list: g.list.slice(i * size, (i + 1) * size) }));
  });
}

/** Rasgos que tiene a su nivel: de clase, de subclase, de especie y dotes, con sus usos. */
export function featureRows(c: Character, data: PlayerData | null, lib: LibraryData, levelOnly = false): FeatureRow[] {
  const sp = data?.species.find((x) => x.id === c.speciesId);
  const rows: FeatureRow[] = [];
  // sin el dato de usos, se deducen de su texto («una cantidad de veces igual a tu modificador por Carisma…»)
  const add = (f: ClassFeature, src: string, who: Character = c, cls?: ClassData) => {
    const u = f.u || (cls ? featureUses(f.n, f.d, who.level) : null) || undefined;
    const max = usesMax(u, who, cls);
    rows.push({ key: f.n, n: f.n, d: f.d, src, max: max && max > 0 ? max : null, per: max ? u?.per || '' : '', ...(f.fx ? { fx: f.fx } : {}) });
  };
  // cada clase (multiclase: también las demás) con sus rasgos hasta su nivel y los de su subclase
  for (const e of classEntries(c)) {
    const v = asClass(c, e);
    const cls = data?.classes.find((x) => x.id === e.classId);
    // los rasgos de clase que una subclase de la biblioteca sustituye («This feature replaces…») no se tienen
    const gone = replacedFeatures([e], lib.subclasses).map((g) => norm(g.feature));
    cls?.f.filter((f) => f.lv <= e.level && !gone.includes(norm(f.n))).forEach((f) => add(f, cls.n + ' ' + f.lv, v, cls));
    // los rasgos de la subclase del SRD solo si es la elegida
    if (cls?.sub && e.level >= cls.sub.lv && norm(e.subclass) === norm(cls.sub.n)) cls.sub.f.filter((f) => f.lv <= e.level).forEach((f) => add(f, cls.sub!.n + ' ' + f.lv, v, cls));
    // subclase de la biblioteca propia (si es la elegida y no es la misma del SRD: el manual repite sus nombres)
    const libSub = cls?.sub && norm(e.subclass) === norm(cls.sub.n) ? undefined : lib.subclasses.find((s) => s.cls === e.classId && norm(s.n) === norm(e.subclass));
    libSub?.f.filter((f) => f.lv <= e.level).forEach((f) => {
      const u = f.u || featureUses(f.n, f.d, e.level) || undefined;
      const max = usesMax(u, v, cls);
      rows.push({ key: libSub.id + f.lv + f.n, n: f.n, d: f.d, src: libSub.n + ' ' + f.lv, max: max && max > 0 ? max : null, per: max ? u?.per || '' : '', ...(f.fx ? { fx: f.fx } : {}) });
    });
    if (!levelOnly) choiceRows(resolveChoices(v, data, lib)).forEach((r) => rows.push({ ...r, max: null, per: '' }));
  }
  sp?.t.forEach((f) => add(f, sp.n));
  if (levelOnly) return rows;
  const CAT: Record<string, string> = { origin: 'Dote de origen', general: 'Dote', 'fighting-style': 'Estilo de combate', 'epic-boon': 'Don épico', other: 'Rasgo propio' };
  c.feats.forEach((name) => {
    const ft = data?.feats.find((x) => x.n === name);
    if (ft) { add({ lv: 0, n: ft.n, d: ft.d, u: ft.u }, CAT[ft.cat] || 'Dote'); return; }
    const lf = lib.feats.find((x) => x.n === name);
    if (lf) rows.push({ key: lf.id, n: lf.n, d: (lf.req ? 'Requisitos: ' + lf.req + '\n\n' : '') + lf.d, src: CAT[lf.cat] || 'Dote', max: null, per: '' });
  });
  expandCustomFeats(c.customFeats).forEach((f) => rows.push({ key: f.id, n: f.n, d: f.d, src: CAT[f.cat] || 'Rasgo propio', max: f.max && f.max > 0 ? f.max : null, per: f.per, ...(f.fx ? { fx: f.fx } : {}) }));
  return rows;
}

/** `readOnly`: la hoja de otro (la de un jugador en la mesa del máster): se ve igual pero no guarda ni manda nada. */
/** Ancho de la hoja (px) desde el que va en dos columnas. */
const TWO_COLS = 520;

export default function CharacterSheet({ c, readOnly = false }: { c: Character; readOnly?: boolean }) {
  const data = usePlayer((s) => s.data);
  const store = usePlayer.getState();
  const update: typeof store.update = readOnly ? () => {} : store.update;
  const { replace, setEditing } = store;
  const spellIdx = useSpells();
  const { roll } = useStore.getState();
  const lib = useLibrary();
  // (las subclases propias de la biblioteca pueden sumar CA, velocidad o resistencias)
  const d = useMemo(() => derive(c, data), [c, data, lib.subclasses]); // eslint-disable-line react-hooks/exhaustive-deps
  const features = useMemo(() => featureRows(c, data, lib), [c, data, lib]);
  // multiclase: cada clase vista por separado (su nivel y sus datos) para sus paneles de acciones y elecciones
  const views = useMemo(() => classEntries(c).map((e, i): { v: Character; dv: Derived } => ({ v: i === 0 ? c : asClass(c, e), dv: { ...d, cls: data?.classes.find((x) => x.id === e.classId) } })), [c, d, data]);
  // los usos que ya tienen sus círculos en un panel de acciones no se repiten en «Rasgos y dotes»
  const panelKeys = useMemo(() => new Set(views.flatMap(({ v }) => [...classPanelKeys(v, data), ...actionPanelKeys(v, data, lib)])), [views, data, lib]);
  // rasgos con usos que se gastan desde su propia tarjeta (Astucia mágica, Afinidad con la piedra, Arma de aliento…);
  // Furia y Castigo del paladín se usan desde «Ataques»
  const usable = features.filter((f) => (f.max || (f.fx && f.fx.kind !== 'bonus' && f.fx.kind !== 'hit')) && !panelKeys.has(f.key) && !panelKeys.has(f.n) && !['Furia', 'Castigo del paladín'].includes(f.key));
  const usableKeys = new Set(usable.map((f) => f.key));
  // los que además son una reacción (Fulgor protector, Giro seductor…) van en la tarjeta Reacción, con su contador
  const rxCounted = usable.filter((f) => f.max && !f.fx && actionKindOf(f.d) === 'reaction');
  const usableCards = usable.filter((f) => !rxCounted.includes(f));
  // rasgos con acción adicional o reacción (por su texto) que no tienen otra tarjeta: Acción astuta, Esquiva asombrosa…
  const quick = quickRows(features, (r) => usableKeys.has(r.key) || panelKeys.has(r.key) || panelKeys.has(r.n) || REACTION_FEATS.includes(norm(r.n)) || FEAT_PANEL_NAMES.includes(norm(r.n)) || ['Furia', 'Castigo del paladín'].includes(r.key) || r.n === RELENTLESS, (n) => quickTag(c, n));
  // subclases escritas que no son del SRD, ni de la biblioteca de este dispositivo, ni de las que la app ya conoce
  const missingSubs = views.map(({ v }) => v.subclass).filter((n, i) => !!n && !subclassText(views[i].v, views[i].dv.cls, lib.subclasses)
    && !KITS.some((k) => k.subs.some((x) => norm(x) === norm(n))) && norm(n) !== 'otra subclase');
  // clase propia que no está en la biblioteca de este dispositivo (la biblioteca no va a la mesa ni a quien no la tiene)
  const missingClass = !!data && classEntries(c).some((e) => !!e.classId && !data.classes.some((x) => x.id === e.classId));
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
  const [smitePending, setSmitePending] = useState<{ label: string; parts: RollPart[]; hit: Hit; armKey: string } | null>(null);
  const [eldPick, setEldPick] = useState(false);
  // Marca del cazador y Maleficio duran: mientras estén activos, su daño va en cada tirada de daño con arma
  const [smiteSel, setSmiteSel] = useState('');
  const [buffs, setBuffs] = useState<string[]>([]); // conjuros activos que suman en cada golpe (Marca, Maleficio, Favor divino…)
  // conjuros: pestañas por clase (con varias clases lanzadoras); cada conjuro, plegado hasta pulsarlo (uno abierto a la vez)
  const [spCls, setSpCls] = useState('all');
  const [spOpen, setSpOpen] = useState<string | null>(null);
  const [spQ, setSpQ] = useState(''); // buscador de conjuros
  const [spFold, setSpFold] = useState<number[]>([]); // niveles plegados (solo en esta visita)
  const [spText, setSpText] = useState<string | null>(null);
  // conjuros y rasgos van en bloques repartidos en columnas, según el ancho
  const rulesList = useStore((s) => s.rules);
  useEffect(() => { if (!readOnly) void useStore.getState().loadRules(); }, [readOnly]);
  const toolOpts = useMemo(() => (rulesList ? toolCatalog(rulesList) : []), [rulesList]);
  const lowRef = useRef<HTMLDivElement>(null);
  const [lowW, setLowW] = useState(0);
  // columna (0 izquierda, 1 derecha) de cada tarjeta que se reparte
  const [side, setSide] = useState<Record<string, 0 | 1>>({});
  useEffect(() => {
    const el = lowRef.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => setLowW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // tarjetas de combate y rasgos: van de dos en dos solo si las dos tienen una altura parecida; si no, la tarjeta ocupa toda la línea (sin huecos).
  // Se mide con todas a media anchura y se vuelve a decidir cuando cambia el alto de alguna (se abre un rasgo, llegan los datos…)
  useLayoutEffect(() => {
    const duo = lowRef.current?.querySelector<HTMLElement>('.pc-duo');
    if (!duo) return;
    const ps = [...duo.children].filter((e): e is HTMLElement => e instanceof HTMLElement && e.classList.contains('panel'));
    const pairable = (k: number) => ps[k]?.getAttribute('aria-label') !== 'Ataques';
    const decide = () => {
      ps.forEach((p) => { p.removeAttribute('data-solo'); p.style.removeProperty('order'); (p.firstElementChild as HTMLElement | null)?.style.removeProperty('min-height'); });
      if (lowW < 1000) return;
      duo.style.alignItems = 'flex-start'; // alto propio de cada tarjeta, sin estirar
      const h = ps.map((p) => p.offsetHeight);
      duo.style.alignItems = '';
      // Reacción es corta y ancha: se empareja con la tarjeta posterior de altura más parecida (a media anchura se vuelve casi cuadrada), nunca con una que la deje vacía
      const seq = ps.map((_, k) => k);
      const ri = ps.findIndex((p) => p.getAttribute('aria-label') === 'Reacción');
      if (ri >= 0) {
        let best = -1;
        for (let j = ri + 1; j < ps.length; j++) if (pairable(j) && (best < 0 || Math.abs(h[j] - h[ri]) < Math.abs(h[best] - h[ri]))) best = j;
        const alike = (a: number, b: number) => Math.abs(h[a] - h[b]) <= Math.max(36, 0.25 * Math.max(h[a], h[b]));
        if (best > ri + 1 && alike(ri, best)) { seq.splice(seq.indexOf(best), 1); seq.splice(ri + 1, 0, best); seq.forEach((k, pos) => { ps[k].style.order = String(pos); }); }
      }
      const pairs: number[] = [];
      for (let n = 0; n < seq.length; n++) {
        const i = seq[n];
        const j = seq[n + 1];
        if (pairable(i) && j != null && pairable(j) && Math.abs(h[i] - h[j]) <= Math.max(36, 0.25 * Math.max(h[i], h[j]))) { pairs.push(i, j); n++; continue; }
        ps[i].setAttribute('data-solo', '');
      }
      // las cabeceras de una pareja miden lo mismo (una con contador de usos y otra sin): sus tarjetas empiezan a la misma altura
      for (let n = 0; n < pairs.length; n += 2) {
        const hd = [ps[pairs[n]], ps[pairs[n + 1]]].map((p) => p.firstElementChild as HTMLElement | null);
        if (hd[0] && hd[1]) { const m = Math.max(hd[0].offsetHeight, hd[1].offsetHeight); hd.forEach((e) => { e!.style.minHeight = m + 'px'; }); }
      }
    };
    decide();
    if (typeof ResizeObserver !== 'function') return;
    let busy = false;
    const ro = new ResizeObserver(() => {
      if (busy) return;
      busy = true; // los cambios de tamaño que provoca esta misma decisión no la repiten
      decide();
      requestAnimationFrame(() => { busy = false; });
    });
    ps.forEach((p) => ro.observe(p));
    return () => ro.disconnect();
  });

  // reparto: a la columna más corta, contando lo fijo de cada una (izquierda: características y notas; derecha: ataques y estados)
  const placeSig = useRef('');
  const lastTouch = useRef(0);
  useEffect(() => {
    const m = lowRef.current;
    if (!m) return;
    const t = () => { lastTouch.current = Date.now(); };
    m.addEventListener('pointerdown', t, true);
    m.addEventListener('keydown', t, true);
    return () => { m.removeEventListener('pointerdown', t, true); m.removeEventListener('keydown', t, true); };
  }, [lowW >= TWO_COLS]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const m = lowRef.current;
    if (!m || typeof ResizeObserver !== 'function' || lowW < TWO_COLS) return;
    const [ca, cb] = [m.children[0], m.children[1]];
    if (!ca || !cb) return;
    const ht = (e: Element) => e.getBoundingClientRect().height + 14;
    const fixed = (col: Element) => [...col.children].filter((e) => !e.classList.contains('pc-fill')).reduce((a, e) => a + ht(e), 0);
    const place = () => {
      // una tarjeta que se abre o se cierra por una pulsación no mueve a las demás: el reparto solo cambia si cambia el ancho o las tarjetas
      const sig = lowW + '|' + fillers.map((f) => f.key).join(',');
      if (placeSig.current === sig && Date.now() - lastTouch.current < 1500) return;
      placeSig.current = sig;
      // los conjuros van seguidos: las primeras piezas a la izquierda y el resto a la derecha (o todas juntas en una columna si cuadra igual de bien).
      // El resto de tarjetas, cada una a la columna más corta. Siempre en el mismo orden (el del DOM cambia al mover tarjetas y el reparto oscilaría)
      const hs = fillers.map(({ key }) => { if (key === 'nt') return 190; const p = m.querySelector('[data-fk="' + key + '"]')?.firstElementChild; return p ? ht(p) : 0; });
      const spKeys = fillers.map((f) => f.key).filter((k) => k.startsWith('sp'));
      const run = (spCol: 0 | 1, k: number) => {
        let hA = fixed(ca);
        let hB = fixed(cb);
        const out: Record<string, 0 | 1> = {};
        let n = 0;
        fillers.forEach(({ key }, i) => {
          if (!key.startsWith('sp')) return;
          const col: 0 | 1 = n < k ? 0 : spCol === 0 ? 0 : 1;
          n++;
          out[key] = col;
          if (col === 0) hA += hs[i]; else hB += hs[i];
        });
        fillers.forEach(({ key }, i) => {
          if (key.startsWith('sp')) return;
          if (hA <= hB) { out[key] = 0; hA += hs[i]; } else { out[key] = 1; hB += hs[i]; }
        });
        return { out, diff: Math.abs(hA - hB) };
      };
      let next = run(0, 0).out;
      let best = run(0, 0).diff;
      const r1 = run(1, 0);
      if (r1.diff < best - 0.5) { best = r1.diff; next = r1.out; }
      // partir la lista tiene un pequeño coste: solo si mejora de verdad el equilibrio
      for (let k = 1; k < spKeys.length; k++) {
        const r = run(1, k);
        if (r.diff + 80 < best) { best = r.diff; next = r.out; }
      }
      setSide((prev) => { const ks = Object.keys(next); return ks.length === Object.keys(prev).length && ks.every((k) => prev[k] === next[k]) ? prev : next; });
      m.querySelectorAll('.panel').forEach((p) => ro.observe(p));
    };
    const ro = new ResizeObserver(place);
    ro.observe(m);
    place();
    return () => ro.disconnect();
  });

  const sp = data?.species.find((x) => x.id === c.speciesId);
  const bg = data?.backgrounds.find((x) => x.id === c.backgroundId) || lib.backgrounds.find((x) => x.id === c.backgroundId);
  const who = c.name || 'Personaje';
  const r = (label: string, kind: RollSpec['kind'], expr: string, extra: Partial<RollSpec> = {}) =>
    roll({ label: who + ' · ' + label, kind, who, parts: [{ expr }], self: { conds: c.conds, exh: c.exh }, ...extra });
  const d20 = (b: number) => '1d20' + sgn(b);
  // Bendición: +1d4 a ataques y salvaciones
  const d20b = (b: number) => d20(b) + (d.bless ? '+1d4' : '');
  const set = (patch: Partial<Character>) => update(c.id, patch);
  // concentración: al bajar los PG (daño desde la hoja o desde la sala del máster) se pide la salvación
  const conc = concOf(c.conds);
  const [concCheck, setConcCheck] = useState<{ dmg: number; dc: number } | null>(null);
  const prevHp = useRef({ id: c.id, total: c.hp + c.temp });
  // a 0 PG se cae Inconsciente; al recuperar algún PG termina, pero sigue Derribado
  const prevLife = useRef({ id: c.id, hp: c.hp });
  useEffect(() => {
    const was = prevLife.current;
    prevLife.current = { id: c.id, hp: c.hp };
    if (was.id !== c.id) return;
    // estados al día (otro efecto puede haberlos cambiado en este mismo momento, como la concentración al caer)
    const conds = (usePlayer.getState().characters.find((x) => x.id === c.id) || c).conds;
    if (was.hp > 0 && c.hp === 0 && !conds.includes('Inconsciente')) update(c.id, { conds: [...conds, 'Inconsciente'] });
    else if (was.hp === 0 && c.hp > 0 && conds.includes('Inconsciente')) update(c.id, { conds: [...conds.filter((k) => k !== 'Inconsciente'), ...(conds.includes('Derribado') ? [] : ['Derribado'])] });
  }, [c.id, c.hp]); // eslint-disable-line react-hooks/exhaustive-deps
  // bajar PG sin daño (se acaba Auxilio): sin salvación
  const noDamage = useRef(false);
  useEffect(() => {
    const now = c.hp + c.temp;
    const prev = prevHp.current;
    prevHp.current = { id: c.id, total: now };
    if (noDamage.current) { noDamage.current = false; return; }
    if (readOnly || prev.id !== c.id || now >= prev.total || !conc) return;
    // a 0 PG se cae inconsciente: la concentración termina sin tirada
    if (c.hp === 0) { update(c.id, { conds: withoutConc(c.conds) }); return; }
    const dmg = prev.total - now;
    setConcCheck((x) => ({ dmg: (x?.dmg || 0) + dmg, dc: concDc(Math.max(dmg, x?.dmg || 0)) }));
  }, [c.id, c.hp, c.temp]); // eslint-disable-line react-hooks/exhaustive-deps
  // al perder la concentración se apagan las etiquetas de ese conjuro en «Ataques»
  useEffect(() => { setBuffs((bs) => bs.filter((k) => { const b = hitBuffs.find((x) => x.key === k); return !b?.conc || b.n === conc; })); }, [conc]); // eslint-disable-line react-hooks/exhaustive-deps
  // y si ese conjuro lo habías lanzado sobre otros en la sala, se acaba también en la mesa y en sus hojas
  const prevConc = useRef(conc);
  useEffect(() => {
    const was = prevConc.current;
    prevConc.current = conc;
    if (was && was !== conc && !readOnly) useRoom.getState().endBuff(was);
  }, [conc]);
  const warCaster = c.feats.some((f) => /lanzador de guerra|war caster/i.test(f));
  const concSave = () => {
    if (!concCheck) return;
    const { dc } = concCheck;
    const spell = conc;
    r('salvación de concentración (CD ' + dc + ')', 'save', d20b(d.saves.con.bonus), {
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
  type Hit = { melee: boolean; str: boolean; finesse: boolean; thrownMelee?: boolean };
  // con un arma cuerpo a cuerpo y un castigo disponible, al pulsar el daño se pregunta si se añade (y con qué espacio)
  const dmgRoll = (label: string, parts: RollPart[], hit: Hit, armKey?: string) => {
    const smiteMelee = hit.melee || !!hit.thrownMelee;
    if (armKey && smiteMelee && (smiteOpt || (armKey !== 'ua' && eldDice))) { setEldPick(false); setSmitePending({ label, parts, hit, armKey }); return; }
    doDamage(label, parts, hit);
  };
  const doDamage = (label: string, parts: RollPart[], hit: Hit, ch: { smite?: boolean; eld?: boolean; opt?: string } = {}) => {
    const melee = hit.melee;
    // los castigos valen con armas cuerpo a cuerpo, también lanzadas (lanza, jabalina, hacha de mano…)
    const smiteMelee = melee || !!hit.thrownMelee;
    const with_ = smiteMelee ? ch : {};
    const smOpt = (ch.opt && smiteOpts.find((o) => o.key === ch.opt)) || smiteOpt;
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
    const useSmite = !!with_.smite && smiteMelee && !!smOpt;
    const useEld = !!with_.eld && smiteMelee && !!eldDice;
    if (useSmite) ps.push({ expr: smOpt!.dice, type: smOpt!.type, src: smiteSpell!.n });
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
    if (useSmite || useEld) {
      const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
      const patch: Partial<Character> = {};
      let pact = cur.pactUsed;
      if (useSmite) {
        if (smOpt!.key === 'free') patch.uses = { ...cur.uses, 'Castigo del paladín': (cur.uses['Castigo del paladín'] || 0) + 1 };
        else if (smOpt!.key === 'p') pact += 1;
        else { const u = cur.slotsUsed.slice(); u[smOpt!.lv - 1] = (u[smOpt!.lv - 1] || 0) + 1; patch.slotsUsed = u; }
      }
      if (useEld) pact += 1;
      if (useSmite && smiteSpell!.c) patch.conds = withConc(cur.conds, smiteSpell!.n);
      if (pact !== cur.pactUsed) patch.pactUsed = pact;
      update(c.id, patch);
    }
  };
  const uaHit: Hit = { melee: true, str: !(classLevel(c, 'monk') && d.mods.dex > d.mods.str), finesse: false };
  const amt = parseInt(amount, 10);
  const resisted = dmgType && d.resist.find((x) => x.type === dmgType);
  // a 0 PG: cada golpe es un fallo de salvación contra la muerte (el crítico, dos); daño masivo (lo que sobra llega a tus PG máximos): muere
  const [deathHit, setDeathHit] = useState<{ msg: string; crit: boolean } | null>(null);
  const damage = () => {
    if (!(amt > 0)) return;
    const taken = resisted ? Math.floor(amt / 2) : amt;
    const fromTemp = Math.min(c.temp, taken);
    const rest = taken - fromTemp;
    const hp = Math.max(0, c.hp - rest);
    let death = c.hp > 0 && hp === 0 ? { s: 0, f: 0 } : c.death;
    setDeathHit(null);
    if (rest > 0 && (c.hp === 0 ? rest : rest - c.hp) >= d.hpMax && hp === 0) {
      death = { s: 0, f: 3 };
      setDeathHit({ msg: 'Daño masivo: el daño que sobra llega a tus PG máximos. El personaje muere.', crit: false });
    } else if (c.hp === 0 && rest > 0) {
      // estable: deja de estarlo y vuelve a tirar salvaciones (los contadores empiezan de cero)
      const stable = c.death.s >= 3;
      death = stable ? { s: 0, f: 1 } : { s: c.death.s, f: Math.min(3, c.death.f + 1) };
      setDeathHit({ msg: (stable ? 'Dejas de estar estable. ' : '') + 'Golpe estando a 0 PG: un fallo de salvación contra la muerte (' + death.f + '/3).' + (death.f >= 3 ? ' Tercer fallo: el personaje muere.' : ''), crit: death.f < 3 });
    }
    set({ temp: c.temp - fromTemp, hp, death });
    setAmount('');
  };
  const critHit = () => {
    const f = Math.min(3, c.death.f + 1);
    set({ death: { ...c.death, f } });
    setDeathHit({ msg: 'Golpe crítico a 0 PG: dos fallos (' + f + '/3).' + (f >= 3 ? ' Tercer fallo: el personaje muere.' : ''), crit: false });
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
      if (ds.s >= 3 && ds.f < 3) ds.f = 0; // estable: los fallos vuelven a cero
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
  // los que da la clase siempre preparados (Castigo divino y Hallar corcel del paladín, Marca del cazador del explorador,
  // Hablar con los animales del druida): aunque no se hayan elegido
  const classAlways = classAlwaysSpells(c, spellIdx.list, lib.subclasses);
  const alwaysOf = (id: string) => classAlways.find((a) => a.id === id);
  const classSpells = classAlways.filter((a) => !c.spells.includes(a.id) && !subSpells.some((y) => y.id === a.id)).map((a) => ({ k: a.id, s: spellIdx.get(a.id), sub: a.n + ' · siempre preparado', cls: [a.cls] }));
  // clases a las que pertenece cada conjuro elegido (para las pestañas por clase): las que lo tienen en su lista
  // cada conjuro elegido va a la clase que lo prepara (su lista y su nivel máximo), como en «Editar hoja»
  const preps = data ? casterPreps(c, data, spellIdx.list) : [];
  const casterIds = preps.map((pr) => pr.id);
  const alwaysIds = new Set([...subSpells.map((x) => x.id), ...classAlways.map((a) => a.id)]);
  const assigned = assignSpells(c.spells, preps, (id) => spellIdx.get(id)?.l || 0, alwaysIds);
  const clsOf = (id: string) => Object.entries(assigned.byClass).filter(([, b]) => b.cantrips.includes(id) || b.spells.includes(id)).map(([k]) => k);
  type SpellItem = { k: string; s: ReturnType<typeof spellIdx.get>; sub: string; cls: string[]; grant?: Grant & { id: string; key: string } };
  const baseList: SpellItem[] = [
    // elegido a mano pero siempre preparado (Castigo divino del paladín…): se muestra como tal
    ...c.spells.map((k) => { const a = alwaysOf(k); return a ? { k, s: spellIdx.get(k), sub: a.n + ' · siempre preparado', cls: [a.cls] } : { k, s: spellIdx.get(k), sub: '', cls: clsOf(k) }; }),
    ...classSpells,
    ...subSpells.map((x) => ({ k: x.id, s: spellIdx.get(x.id), sub: 'Subclase · siempre preparado', cls: [x.cls] })),
    ...picked.map((x) => ({ k: x.id, s: spellIdx.get(x.id), sub: x.prepared ? 'Subclase · siempre preparado' : 'Subclase · en tu libro de conjuros', cls: [x.cls] })),
  ];
  // los que dan los rasgos (invocaciones, especie, Iniciado en la magia): con su uso sin espacio
  const grantText = (g: Grant) => g.src + ' · ' + (g.how === 'will' ? 'a voluntad' : g.how === 'ritual' ? 'como ritual sin espacio' : g.how === 'lr' ? '1 vez por descanso largo sin espacio' : g.how === 'pb' ? d.pb + ' veces por descanso largo sin espacio' : g.how === 'charges' ? 'gasta ' + g.charge!.cost + (g.charge!.cost === 1 ? ' carga' : ' cargas') : 'lo conoces');
  for (const g of grantedSpells(c, spellIdx.list, d.mods)) {
    const have = baseList.find((x) => x.k === g.id);
    if (have) { if (!have.grant) have.grant = g; } else baseList.push({ k: g.id, s: spellIdx.get(g.id), sub: grantText(g), cls: [], grant: g });
  }
  const spellList = baseList.filter((x) => x.s).sort((a, b) => (a.s!.l || 0) - (b.s!.l || 0) || a.s!.n.localeCompare(b.s!.n, 'es'));
  const spClasses = casterIds.filter((k) => spellList.some((x) => x.cls.includes(k)));
  const clsTab = spCls !== 'all' && spClasses.includes(spCls) ? spCls : 'all';
  const spQn = norm(spQ.trim());
  const spellShown = spellList.filter((x) => (clsTab === 'all' || x.cls.includes(clsTab)) && (!spQn || norm(x.s!.n).includes(spQn)));
  // un bloque por nivel (con sus espacios al lado, como las habilidades bajo su característica): los que tienen conjuros o espacios
  // (buscando, solo los niveles con resultados; un nivel plegado muestra solo su título)
  const spBlocks = [...new Set([...spellShown.map((x) => x.s!.l || 0), ...(spQn ? [] : d.slots.map((n, i) => (n > 0 ? i + 1 : -1)).filter((l) => l > 0))])]
    .sort((a, b) => a - b).map((l) => {
      const all = spellShown.filter((x) => (x.s!.l || 0) === l);
      const folded = !spQn && spFold.includes(l);
      return { l, title: l ? 'Nivel ' + l : 'Trucos', n: all.length, folded, list: folded ? [] : all };
    });
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
  // hoja en mosaico (desde 1000 px de ancho: dos columnas que reparte el navegador). Para que encajen sin huecos, conjuros y rasgos se parten
  // en tarjetas de unas 6 filas («Conjuros (cont.)», «Rasgos y dotes (cont.)»); a menos ancho, una sola tarjeta cada uno
  const wide = lowW >= TWO_COLS; // dos columnas en la hoja (el móvil, con su propia vista, queda aparte)
  const roomy = lowW >= 1000; // con sitio de sobra: columnas también dentro de las tarjetas, tarjetas de combate de dos en dos…
  const lowN = roomy ? 2 : wide ? 1 : lowW >= 600 ? 2 : 1;
  const spParts = chunkGroups(spBlocks, Infinity); // los conjuros fluyen en columnas dentro de su tarjeta: cada nivel entero
  const ftParts = chunkGroups(featGroups, Infinity); // rasgos como los conjuros: una lista que fluye en columnas, cada origen entero
  const spPieces = [spParts]; // una sola tarjeta de conjuros, con sus columnas dentro
  const ftPieces = [ftParts]; // una sola tarjeta, con sus columnas dentro
  const freeSmite = features.find((f) => f.key === 'Castigo del paladín' && f.max);
  // conjuros que, mientras duran, suman en cada golpe con arma: se activan como etiquetas en «Ataques»
  // (los del SRD por su nombre en inglés; los del libro del usuario, por el nombre en español)
  const has = (en: string, es: RegExp) => spellList.some((x) => x.s!.en === en || es.test(norm(x.s!.n)));
  // rasgos propios: la característica que usan (la de conjuros, la mejor de Fuerza y Destreza o una concreta)
  const hbMod = (a: HbFx['abil']) => (a === 'spell' ? (d.spell ? d.mods[d.spell.abil] : Math.max(d.mods.int, d.mods.wis, d.mods.cha)) : a === 'best' ? Math.max(d.mods.str, d.mods.dex) : d.mods[a || 'str']);
  const hbButtons = (f: FeatureRow, spend: () => void, left: boolean) => {
    const fx = f.fx;
    if (!fx) return null;
    const m = hbMod(fx.abil);
    const amount = (fx.dmg || '') + (fx.addMod && m ? sgn(m) : '');
    const label = (what: string) => who + ' · ' + f.n + ': ' + what;
    const out: JSX.Element[] = [];
    const use = (go: () => void) => () => { if (f.max) spend(); go(); };
    if (fx.kind === 'attack') {
      const atk = d.pb + m;
      out.push(<button key="a" className="rollbtn" disabled={!left} onClick={use(() => r(f.n + ': ataque', 'attack', d20b(atk)))}>Ataque {fmt(atk)}</button>);
      if (fx.dmg) out.push(<button key="d" className="rollbtn dmg" onClick={() => roll({ label: label('daño'), kind: 'damage', who, by: null, parts: [{ expr: amount, type: fx.type || '' }] })} title={amount + (fx.type ? ' ' + fx.type : '')}>{amount}{fx.type ? ' ' + shortType(fx.type) : ''}</button>);
    }
    if (fx.kind === 'save') {
      const dc = 8 + d.pb + m;
      const effect: SaveEffect = { dc, abil: ABILS.indexOf(fx.save || 'dex'), half: !!fx.half, conds: fx.cond ? [fx.cond] : [], rounds: null, until: null, repeat: false };
      out.push(<span key="dc" className="chip-tag">CD {dc} {ABIL_N[fx.save || 'dex']}{fx.half ? ' · mitad si supera' : ''}{fx.cond ? ' · ' + fx.cond : ''}</span>);
      if (fx.dmg) out.push(<button key="d" className="rollbtn dmg" disabled={!left} onClick={use(() => roll({ label: label('daño'), kind: 'damage', who, by: null, half: !!fx.half, parts: [{ expr: amount, type: fx.type || '' }], effect }))} title={amount + (fx.type ? ' ' + fx.type : '')}>{amount}{fx.type ? ' ' + shortType(fx.type) : ''}</button>);
    }
    if (fx.kind === 'heal' && fx.dmg) out.push(<button key="h" className="rollbtn" disabled={!left} onClick={use(() => roll({ label: label('curación'), kind: 'free', heal: true, parts: [{ expr: amount }] }))}>Curar {amount}</button>);
    if (fx.kind === 'temp' && fx.dmg) out.push(<button key="t" className="rollbtn" disabled={!left} onClick={use(() => roll({ label: label('PG temporales'), kind: 'free', parts: [{ expr: amount }], after: (total) => {
      const cur = usePlayer.getState().characters.find((x) => x.id === c.id) || c;
      usePlayer.getState().update(c.id, { temp: Math.max(cur.temp, total) });
      return { resultNote: total > cur.temp ? 'PG temporales: ' + total + '.' : 'Ya tenías ' + cur.temp + ' PG temporales: te quedas con esos.' };
    } }))}>PG temporales {amount}</button>);
    return out.length ? out : null;
  };
  const hitBuffs = [
    ...(markDie || has("Hunter's Mark", /^marca del cazador$/) ? [{ key: 'mark', n: 'Marca del cazador', dmg: markDie || '1d6', type: 'fuerza', atk: 0, conc: true, why: 'su daño de fuerza en cada golpe al objetivo marcado' }] : []),
    ...(has('Hex', /^maleficio$/) ? [{ key: 'hex', n: 'Maleficio', dmg: '1d6', type: 'necrótico', atk: 0, conc: true, why: '1d6 necrótico en cada golpe al objetivo maldito' }] : []),
    ...(has('Divine Favor', /^favor divino$/) ? [{ key: 'favor', n: 'Favor divino', dmg: '1d4', type: 'radiante', atk: 0, conc: false, why: '1d4 radiante en cada golpe con arma (1 minuto)' }] : []),
    ...(has("Crusader's Mantle", /^manto del cruzado$/) ? [{ key: 'mantle', n: 'Manto del cruzado', dmg: '1d4', type: 'radiante', atk: 0, conc: true, why: '1d4 radiante en cada golpe con arma (concentración)' }] : []),
    ...(has('Elemental Weapon', /^arma elemental$/) ? [{ key: 'elemental', n: 'Arma elemental', dmg: '1d4', type: '', atk: 1, conc: true, why: '+1 al ataque y 1d4 del tipo elegido con el arma encantada (a nivel 3)' }] : []),
    ...(has('Magic Weapon', /^arma magica$/) ? [{ key: 'magic', n: 'Arma mágica', dmg: '1', type: '', atk: 1, conc: false, why: '+1 al ataque y al daño con el arma encantada (a nivel 2)' }] : []),
    ...(has('Conjure Minor Elementals', /^conjurar elementales menores$/) ? [{ key: 'minorelem', n: 'Elementales menores', dmg: '2d8', type: '', atk: 0, conc: true, why: '2d8 de ácido, frío, fuego o relámpago (a tu elección) contra criaturas en la emanación' }] : []),
    ...(has('Enlarge/Reduce', /^agrandar\/reducir$/) ? [{ key: 'enlarge', n: 'Agrandado', dmg: '1d4', type: '', atk: 0, conc: true, why: '1d4 extra con armas mientras estás agrandado' }] : []),
    // rasgos propios (subclase de «Mis creaciones») que suman daño al golpear
    ...features.filter((f) => f.fx?.kind === 'hit' && f.fx.dmg).map((f) => {
      const m = f.fx!.addMod ? hbMod(f.fx!.abil) : 0;
      return { key: 'own:' + f.key, n: f.n, dmg: f.fx!.dmg! + (m ? sgn(m) : ''), type: f.fx!.type || '', atk: 0, conc: false, why: f.fx!.dmg + (m ? sgn(m) : '') + (f.fx!.type ? ' ' + f.fx!.type : '') + ' en cada golpe (' + f.src + ')' };
    }),
  ];
  // el conjuro de cada etiqueta (las propias de rasgos no lo tienen): al encenderla se pide confirmar el lanzamiento
  const BUFF_SPELL: Record<string, [string, RegExp]> = {
    mark: ["Hunter's Mark", /^marca del cazador$/], hex: ['Hex', /^maleficio$/], favor: ['Divine Favor', /^favor divino$/], mantle: ["Crusader's Mantle", /^manto del cruzado$/],
    elemental: ['Elemental Weapon', /^arma elemental$/], magic: ['Magic Weapon', /^arma magica$/], minorelem: ['Conjure Minor Elementals', /^conjurar elementales menores$/], enlarge: ['Enlarge/Reduce', /^agrandar\/reducir$/],
  };
  const buffSpellOf = (b: { key: string }) => { const m = BUFF_SPELL[b.key]; return m ? spellList.find((x) => x.s!.en === m[0] || m[1].test(norm(x.s!.n)))?.s : undefined; };
  const [castBuff, setCastBuff] = useState<{ b: (typeof hitBuffs)[number]; s: NonNullable<ReturnType<typeof buffSpellOf>> } | null>(null);
  const switchBuff = (b: (typeof hitBuffs)[number], patch: Partial<Character> = {}) => {
    const on = buffs.includes(b.key);
    setBuffs(on ? buffs.filter((x) => x !== b.key) : [...buffs, b.key]);
    const conds = b.conc && !on ? withConc(c.conds, b.n) : b.conc && on && concOf(c.conds) === b.n ? withoutConc(c.conds) : null;
    const all = { ...patch, ...(conds ? { conds } : {}) };
    if (Object.keys(all).length) set(all);
  };
  const toggleBuff = (b: (typeof hitBuffs)[number]) => {
    const sp = buffs.includes(b.key) ? undefined : buffSpellOf(b);
    if (sp) setCastBuff({ b, s: sp });
    else switchBuff(b);
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
  const notesPanel = (
    <section className="panel pc-notes" aria-label="Notas" data-sec="tiradas">
      <label className="eyebrow" htmlFor="pc-notes">Notas</label>
      <textarea id="pc-notes" className="input" value={c.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Equipo, objetivos, vínculos, lo que pasó la última sesión…" />
    </section>
  );
  // un bloque de conjuros (un nivel) y uno de rasgos (un origen); y su rejilla de columnas
  const spellBlock = ({ key, title, first, l, list, n, folded }: (typeof spParts)[number]) => (
    <div key={key} className="pc-abil pc-block pc-block-sp" role="group" aria-label={l ? 'Conjuros de nivel ' + l : 'Trucos'}>
      <div className="pc-block-head">
        {first && !spQn ? (
          <button className="pc-abil-k pc-fold" aria-expanded={!folded} title={folded ? 'Desplegar' : 'Plegar'} onClick={() => setSpFold(folded ? spFold.filter((x) => x !== l) : [...spFold, l])}>
            <span aria-hidden="true">{folded ? '▸' : '▾'}</span> {title}{folded && n > 0 && <span className="pc-fold-n"> ({n})</span>}
          </button>
        ) : <span className="pc-abil-k">{title}</span>}
      </div>
      {folded ? null : !list.length ? <span className="muted small">Ningún conjuro de este nivel{clsTab !== 'all' ? ' en esta clase' : ''}.</span> : (
        <ul className="pc-features sp-list">
          {list.map(({ k, s, sub, grant }) => {
            const open = spOpen === k;
            const tag = grant && (!sub || sub === grantText(grant)) ? (grant.how === 'will' ? 'a voluntad' : grant.how === 'known' ? 'rasgo' : grant.how === 'ritual' ? 'ritual' : grant.how === 'charges' ? 'cargas' : 'sin espacio') : sub ? (/libro/.test(sub) ? 'libro' : 'siempre') : '';
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
                    <span className="muted small sp-row-meta">{[s!.ct, s!.r, s!.du].filter(Boolean).join(' · ')}{sub ? ' · ' + sub : ''}{grant && sub !== grantText(grant) ? ' · ' + grantText(grant) : ''}</span>
                    <SpellRolls c={c} d={d} s={s!} set={set} grant={grant} />
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
  // conjuros sin cuadros por nivel: una lista que fluye en dos columnas dentro de la tarjeta, con el nivel como título de sección
  const flow = <T extends { key: string; list: unknown[] }>(parts: T[], render: (p: T) => JSX.Element, split = false) => {
    const rows = parts.reduce((a, x) => a + Math.max(1, x.list.length), 0);
    const n = Math.max(1, Math.min(rows < 6 ? 1 : lowN, split ? rows : parts.length));
    const W_HEAD = 1.6;
    // puntos de corte posibles: entre grupos y, si `split`, entre filas de un mismo grupo (el trozo que sigue deja su título en blanco para que las filas arranquen a la misma altura)
    const cand: { at: [number, number]; w: number; mid: boolean }[] = [];
    let acc = 0;
    parts.forEach((x, pi) => {
      if (pi > 0) cand.push({ at: [pi, 0], w: acc, mid: false });
      acc += W_HEAD;
      x.list.forEach((_, ri) => { if (split && ri > 0 && ri < x.list.length) cand.push({ at: [pi, ri], w: acc, mid: true }); acc += 1; });
    });
    const total = acc;
    const cuts: [number, number][] = [];
    for (let k = 1; k < n; k++) {
      const target = (total * k) / n;
      const free = cand.filter((c) => !cuts.some((q) => q[0] === c.at[0] && q[1] === c.at[1]));
      const byDist = (list: typeof free) => list.sort((p, q) => Math.abs(p.w - target) - Math.abs(q.w - target))[0];
      const gb = byDist(free.filter((c) => !c.mid));
      const any = byDist(free.slice());
      // cortar un grupo solo si mejora de verdad el reparto
      const pick = gb && any && Math.abs(gb.w - target) <= Math.abs(any.w - target) + 4 ? gb : any || gb;
      if (pick) cuts.push(pick.at);
    }
    cuts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cols: { p: T; ghost: boolean }[][] = Array.from({ length: cuts.length + 1 }, () => []);
    parts.forEach((x, pi) => {
      const start = cuts.filter((c) => c[0] < pi || (c[0] === pi && c[1] === 0)).length;
      const edges = [0, ...cuts.filter((c) => c[0] === pi && c[1] > 0).map((c) => c[1]), x.list.length];
      for (let e = 0; e < edges.length - 1; e++) cols[start + e].push({ p: { ...x, list: x.list.slice(edges[e], edges[e + 1]), key: x.key + '-' + e, ...(e ? { first: false } : {}) }, ghost: e > 0 });
    });
    return <div className="pc-flow" style={{ gridTemplateColumns: 'repeat(' + cols.length + ', minmax(0, 1fr))' }}>{cols.map((col, ci) => <div key={ci} className="pc-flow-col">{col.map(({ p, ghost }) => (ghost ? <div key={p.key} className="pc-cont">{render(p)}</div> : render(p)))}</div>)}</div>;
  };
  const spellFlow = (parts: (typeof spParts)[number][]) => flow(parts, spellBlock, true);
  const spellsPanel = hasSpells ? (
        <section className="panel" aria-label="Conjuros" data-sec="conjuros">
          <div className="panel-head">
            <h3 className="eyebrow">Conjuros</h3>
            {d.spell && <span className="rollrow">
              {castLines.map((x) => (
                <span key={x.key} className="rollrow">
                  <span className="muted small">CD {x.dc} · {ABIL_N[x.abil]}{castNamed ? ' (' + x.names.join(', ') + ')' : ''}</span>
                  <button className="rollbtn" onClick={() => r('ataque de conjuro' + (castNamed ? ' de ' + x.names.join(', ').toLowerCase() : ''), 'attack', d20b(x.atk))}>Ataque de conjuro {fmt(x.atk)}</button>
                </span>
              ))}
            </span>}
          </div>
          {(d.slots.some((n) => n > 0) || d.pact) && (() => {
            // tabla de espacios: columnas de 3 niveles (1-3, 4-6, 7-9), con la etiqueta, el total y los rombos alineados
            const cells = [
              ...d.slots.map((n, i) => ({ k: 'n' + i, label: 'N' + (i + 1), title: 'Espacios de nivel ' + (i + 1), max: n, used: Math.min(n, c.slotsUsed[i] || 0), set: (v: number) => { const u = c.slotsUsed.slice(); u[i] = Math.max(0, Math.min(n, v)); set({ slotsUsed: u }); } })).filter((x) => x.max > 0),
              ...(d.pact ? [{ k: 'pact', label: 'Pacto ' + d.pact.lv, title: 'Espacios de magia de pacto (nivel ' + d.pact.lv + ')', max: d.pact.n, used: Math.min(d.pact.n, c.pactUsed), set: (v: number) => set({ pactUsed: Math.max(0, Math.min(d.pact!.n, v)) }) }] : []),
            ];
            const rows = Math.min(3, cells.length);
            return (
              <div className="pc-slots" role="group" aria-label="Espacios de conjuro" style={{ gridTemplateRows: 'repeat(' + rows + ', auto)' }}>
                {cells.map((x, i) => (
                  <span key={x.k} className={i >= rows ? 'res sep' : 'res'} title={x.title}>
                    <span className="pc-slot-k">{x.label}</span>
                    <Pips max={x.max} used={x.used} label={x.title} onSet={x.set} />
                  </span>
                ))}
              </div>
            );
          })()}
          {spellList.length > 12 && (
            <div className="sp-tools">
              <input className="input" type="search" aria-label="Buscar conjuro" placeholder="Buscar conjuro…" value={spQ} onChange={(e) => setSpQ(e.target.value)} />
              {!spQn && spBlocks.length > 2 && <button className="btn small" onClick={() => setSpFold(spFold.length ? [] : spBlocks.map((b) => b.l))}>{spFold.length ? 'Desplegar todo' : 'Plegar todo'}</button>}
            </div>
          )}
          {spQn && !spellShown.length && <p className="muted small" style={{ margin: 0 }}>Ningún conjuro con «{spQ.trim()}».</p>}
          {spClasses.length > 1 && (
            <div className="sp-tabs" role="tablist" aria-label="Conjuros por clase">
              {['all', ...spClasses].map((k) => <button key={k} role="tab" aria-selected={clsTab === k} className={clsTab === k ? 'sp-tab on' : 'sp-tab'} onClick={() => setSpCls(k)}>{k === 'all' ? 'Todas las clases' : data?.classes.find((x) => x.id === k)?.n || k}</button>)}
            </div>
          )}
          {!spellList.length && <p className="muted small" style={{ margin: 0 }}>Añade tus conjuros en «Editar hoja».</p>}
          {spPieces[0].length > 0 && spellFlow(spPieces[0])}
          {smitePending && (
            <InfoDialog title={'Daño: ' + smitePending.label.replace(/:.*$/, '')} onClose={() => setSmitePending(null)}>
              {smiteSpells.length > 1 && (
                <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>Castigo
                  <select className="input pc-slot-pick" aria-label="Castigo" value={smiteSpell!.id} onChange={(e) => { setSmiteSel(e.target.value); setSmitePick(''); }}>{smiteSpells.map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}</select>
                </label>
              )}
              {smitePending.armKey !== 'ua' && eldDice && (
                <label className="check small" style={{ marginBottom: 8 }}><input type="checkbox" checked={eldPick} onChange={(e) => setEldPick(e.target.checked)} />Castigo arcano (+{eldDice} de fuerza, gasta un espacio de pacto)</label>
              )}
              <div className="rollrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <button className="btn" onClick={() => { const q = smitePending; setSmitePending(null); doDamage(q.label, q.parts, q.hit, { eld: eldPick && !!eldDice && q.armKey !== 'ua' }); }}>Solo el arma{eldPick && eldDice ? ' y el Castigo arcano' : ''}</button>
                {smiteOpts.map((o) => {
                  const clash = o.key === 'p' && eldPick && !!eldDice && pactLeft < 2;
                  return (
                    <button key={o.key} className="btn gold" disabled={clash} title={clash ? 'Te queda un solo espacio de pacto' : undefined} onClick={() => { const q = smitePending; setSmitePending(null); doDamage(q.label, q.parts, q.hit, { smite: true, opt: o.key, eld: eldPick && !!eldDice && q.armKey !== 'ua' }); }}>{smiteSpell!.n} · {o.label} · {o.dice} {o.type}</button>
                  );
                })}
                {!smiteOpts.length && hasSmite && <span className="muted small">{smiteSpell!.n}: sin espacios</span>}
              </div>
            </InfoDialog>
          )}
          {spTextOf && (
            <InfoDialog title={spTextOf.s!.n} onClose={() => setSpText(null)}>
              <p className="muted small" style={{ margin: 0 }}>{spTextOf.s!.l ? 'Nivel ' + spTextOf.s!.l : 'Truco'}{spTextOf.s!.c ? ' · concentración' : ''}{spTextOf.s!.rit ? ' · ritual' : ''}{spTextOf.sub ? ' · ' + spTextOf.sub : ''}</p>
              <p className="muted small" style={{ margin: '4px 0' }}>{[spTextOf.s!.ct, spTextOf.s!.r, spTextOf.s!.cmp, spTextOf.s!.du].filter(Boolean).join(' · ')}</p>
              <p className="pc-text">{plainText(spTextOf.s!.t)}</p>
              <SpellRolls c={c} d={d} s={spTextOf.s!} set={set} grant={spTextOf.grant} />
            </InfoDialog>
          )}
        </section>
  ) : null;
  // PX para el siguiente nivel; al alcanzarlos se resalta «Subir de nivel» (subir es a mano: hay que elegir)
  const xpNext = d.level < 20 ? XP_LEVELS[d.level] : null;
  const xpReady = xpNext != null && (c.xp || 0) >= xpNext;
  const hpPct = Math.max(0, Math.min(100, Math.round((c.hp / Math.max(1, d.hpMax)) * 100)));
  // conjuros activos: al perder la concentración se acaban (y se quita el estado que ponían)
  const stale = staleEffects(c.active, c.conds);
  useEffect(() => {
    if (!stale.length) return;
    update(c.id, { active: (c.active || []).filter((e) => !stale.includes(e)), conds: c.conds.filter((k) => !stale.some((e) => fxCond(e.k) === k)) });
  }, [stale.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const endEffect = (k: string) => {
    const e = d.effects.find((x) => x.k === k);
    if (!e) return;
    const bonus = e.fx.hpMax ? e.fx.hpMax(e.lv) : 0;
    if (bonus) noDamage.current = true;
    set({
      active: (c.active || []).filter((x) => x.k !== k),
      conds: (e.conc && conc === e.n ? withoutConc(c.conds) : c.conds).filter((x) => x !== e.fx.cond),
      ...(bonus ? { hp: Math.min(c.hp, d.hpMax - bonus) } : {}),
    });
  };
  const spellMod = d.spell ? d.mods[d.spell.abil] : 0;
  // trucos que atacan con tu arma usando tu característica de conjuros: Impacto certero (y su radiante extra en los
  // niveles 5, 11 y 17) y Shillelagh (garrote o bastón, con un dado mayor según el nivel)
  const knowsSpell = (en: string, es: RegExp) => spellList.some((x) => x.s!.en === en || es.test(norm(x.s!.n)));
  const trueStrike = knowsSpell('True Strike', /^impacto certero$/);
  const shillelagh = knowsSpell('Shillelagh', /^shillelagh$/);
  const cantripTier = d.level >= 17 ? 3 : d.level >= 11 ? 2 : d.level >= 5 ? 1 : 0;
  // conjuros que se usan como un ataque: trucos con tirada de ataque y los que atacan cada turno mientras duran
  const REPEAT = ['Spiritual Weapon', 'Flame Blade', 'Arcane Sword', 'Vampiric Touch'];
  const spellAttacks = spellList.filter((x) => {
    const rr = x.s!.sr ?? spellRoll(x.s!.t);
    return !!rr?.attack && (!(x.s!.l || 0) || REPEAT.includes(x.s!.en || ''));
  }).map((x) => ({ k: x.k, s: x.s!, grant: x.grant }));
  const shillDie = ['1d8', '1d10', '1d12', '2d6'][cantripTier];

  // móvil: la pestaña de conjuros solo si los lanza; arriba, una barra fija con PG y CA al dejar de ver la franja
  const phone = useMobileTabs((s) => s.phone);
  const mtab = useMobileTabs((s) => s.tab);
  useEffect(() => { if (!readOnly) useMobileTabs.setState({ spells: hasSpells }); }, [hasSpells]); // eslint-disable-line react-hooks/exhaustive-deps
  const headRef = useRef<HTMLDivElement>(null);
  const [headSeen, setHeadSeen] = useState(true);
  useEffect(() => {
    const el = headRef.current;
    if (!phone || !el || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(([e]) => setHeadSeen(e.isIntersecting), { rootMargin: '-40px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [phone]);
  // en las otras pestañas, al bajar un poco (arriba se ve la cabecera de la app)
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!phone) return;
    const on = () => setScrolled(window.scrollY > 120);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [phone]);
  const showMini = phone && (mtab === 'combate' ? !headSeen : scrolled);

  // tarjetas que se reparten entre las dos columnas: cada una a la más corta (se mide al cambiar de tamaño)
  const rasgosPanel = (
      <section className="panel" aria-label="Rasgos y dotes" data-tour="traits" data-sec="rasgos">
        <h3 className="eyebrow">Rasgos y dotes</h3>
        {/* subclase de la biblioteca que no está en este dispositivo (la biblioteca no va a la nube): sin ella no hay sus rasgos ni sus conjuros */}
        {lib.loaded && missingClass && <p className="warn small" role="status" style={{ margin: 0 }}>La clase de este personaje no está en la biblioteca de este dispositivo, así que faltan sus rasgos y sus conjuros. Vuelve a cargar la biblioteca donde la creaste («Exportar biblioteca») o inicia sesión para traer tus creaciones.</p>}
        {lib.loaded && missingSubs.map((n) => <p key={n} className="warn small" role="status" style={{ margin: 0 }}>«{n}» no está en la biblioteca de este dispositivo: si la importaste de tu Manual del Jugador, vuelve a importarlo en «Biblioteca» (o carga una copia que incluya tu biblioteca) para tener sus rasgos y sus conjuros.</p>)}
        {views.map(({ v }, i) => <SubclassChoices key={i} c={v} data={data} lib={lib} set={set} restOnly />)}
        {!features.length && <p className="muted small" style={{ margin: 0 }}>Elige especie, clase y dotes en «Editar hoja» para ver aquí sus rasgos.</p>}
        {ftPieces[0].length > 0 && flow(ftParts, featBlock)}
      </section>
  );
  const fillers: { key: string; node: JSX.Element }[] = [
    ...(hasSpells && spellsPanel ? [{ key: 'sp0', node: spellsPanel }] : []),
    { key: 'ft0', node: rasgosPanel },
    { key: 'bio', node: <CharacterBioCard c={c} set={set} readOnly={readOnly} /> },
    // las notas rellenan el hueco: van a la columna más corta, al final, y crecen hasta igualar el fondo
    ...(wide ? [{ key: 'nt', node: notesPanel }] : []),
  ];
  const fillersAt = (col: 0 | 1) => fillers.filter((x) => (wide ? (side[x.key] ?? 1) : 1) === col).map((x) => <div key={x.key} className="pc-fill" data-fk={x.key}>{x.node}</div>);

  return (
    <div className={phone ? 'pc pc-phone' : 'pc'}>
      {showMini && (
        <button className="pc-mini" aria-label={'PG ' + c.hp + ' de ' + d.hpMax + ', CA ' + d.ac + ': ir al combate'} onClick={() => { useMobileTabs.getState().setTab('combate'); }}>
          <b className="pc-mini-n">{c.name || 'Sin nombre'}</b>
          <span className="pc-mini-hp"><span>PG <b>{c.hp}</b>/{d.hpMax}{c.temp > 0 && <span className="stat-tmp"> +{c.temp}</span>}</span><span className="hpbar"><span className={'hpfill ' + (hpPct <= 25 ? 'low' : hpPct <= 50 ? 'mid' : '')} style={{ width: hpPct + '%' }} /></span></span>
          <span className="pc-mini-ac">CA <b>{d.ac}</b></span>
        </button>
      )}
      <div className="panel pc-head" data-sec="combate" ref={headRef}>
        <div className="panel-head">
          <div className="pc-head-id">
          {c.portrait && <img className="pc-portrait" src={c.portrait} alt={'Retrato de ' + (c.name || 'personaje')} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <h2>{c.name || 'Sin nombre'}</h2>
            <span className="pc-id-k">Nombre del personaje</span>
            <dl className="pc-id-grid">
              {[
                [bg?.n || c.backgroundName, 'Trasfondo'],
                [classEntries(c).map((e) => (data?.classes.find((x) => x.id === e.classId)?.n || e.className || 'Sin clase') + ' ' + e.level).join(' / '), 'Clase'],
                [sp?.n || c.speciesName, 'Especie'],
                [classEntries(c).map((e) => e.subclass).filter(Boolean).join(' / '), 'Subclase'],
              ].map(([v, k]) => <div key={k}><dd>{v || '—'}</dd><dt>{k}</dt></div>)}
            </dl>
            {d.resist.length > 0 && <span className="small pc-resist">Resistencias: {d.resist.map((x) => x.type + ' (' + x.why + ')').join(' · ')}</span>}
          </div>
          </div>
          <div className="pc-head-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          <div className={c.hp === 0 ? 'stat stat-death on' : 'stat stat-death'}><span className="stat-k">Salv. contra la muerte{c.death.f >= 3 ? ' · muerto' : c.hp === 0 && c.death.s >= 3 ? ' · estable' : ''}</span>
            {/* se marcan a mano: un golpe estando a 0 PG es un fallo (dos si es crítico) */}
            <span className="death-row"><span className="stat-note">Éxitos</span><span className="pips">{[0, 1, 2].map((j) => <button key={j} className={j < c.death.s ? 'pip ok' : 'pip off'} aria-label={'Éxitos: ' + (j + 1)} aria-pressed={j < c.death.s} onClick={() => markDeath('s', j)} />)}</span></span>
            <span className="death-row"><span className="stat-note">Fallos</span><span className="pips">{[0, 1, 2].map((j) => <button key={j} className={j < c.death.f ? 'pip bad' : 'pip off'} aria-label={'Fallos: ' + (j + 1)} aria-pressed={j < c.death.f} onClick={() => markDeath('f', j)} />)}</span></span>
            <button className="btn small gold" disabled={c.hp > 0 || c.death.f >= 3 || c.death.s >= 3} title={c.hp > 0 ? 'Solo a 0 PG' : c.death.f >= 3 ? 'El personaje ha muerto' : c.death.s >= 3 ? 'Estable: no tira más salvaciones (recupera 1 PG tras 1d4 horas si nadie lo cura)' : 'Tirar una salvación contra la muerte'} onClick={deathSave}>Tirar</button>
          </div>
          {/* la iniciativa se tira pulsándola: botón dorado con su d20, como los de ataque */}
          <button className="stat stat-init" onClick={() => r('iniciativa', 'init', d20(d.init), d.initAdv ? { adv: d.initAdv } : {})} title={'Tirar iniciativa' + (d.initAdv ? ' con ventaja (' + d.initAdv + ')' : '')}>
            <svg className="init-die" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7z" /><path d="M12 2 6.5 12 12 22M12 2l5.5 10L12 22M3 7l3.5 5L3 17M21 7l-3.5 5 3.5 5M6.5 12h11" fill="none" /></svg>
            <span className="init-txt"><span className="stat-k">Iniciativa{d.initAdv && <span className="adv-mark">V</span>}</span><span className="stat-v">{fmt(d.init)}</span><span className="init-hint">Tirar</span></span>
          </button>
          <div className="stat stat-sm"><span className="stat-k">Velocidad</span><span className="stat-v">{d.speed}<span className="stat-of"> pies</span></span></div>
        </div>
        {/* conjuros lanzados sobre ti que siguen en vigor (con su efecto ya en la CA, la velocidad o los PG) */}
        {d.effects.length > 0 && (
          <div className="pc-active" aria-label="Conjuros activos">
            {d.effects.map((e) => (
              <span key={e.k} className="pc-active-fx" title={e.fx.note}>
                <b>{e.n}</b><span className="muted small">{e.fx.hpMax ? '+' + e.fx.hpMax(e.lv) + ' ' : ''}{e.fx.note}{e.conc ? ' · concentración' : ''}{e.by ? ' · de ' + e.by : ''}</span>
                {e.k === 'Heroism' && spellMod > 0 && <button className="btn small" onClick={() => set({ temp: Math.max(c.temp, spellMod) })}>PG temporales ({spellMod})</button>}
                <button className="btn small ghost" aria-label={'Terminar ' + e.n} onClick={() => endEffect(e.k)}>Terminar</button>
              </span>
            ))}
          </div>
        )}
        <div className="pc-hp-row" data-tour="hp">
          <input className="input" type="number" min={0} inputMode="numeric" aria-label="Cantidad de PG" placeholder="PG" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') damage(); }} />
          <select className="input pc-dmg-type" aria-label="Tipo de daño recibido" value={dmgType} onChange={(e) => setDmgType(e.target.value)}>
            <option value="">sin tipo</option>
            {DMG_TYPES.map((t) => <option key={t} value={t}>{t}{d.resist.some((x) => x.type === t) ? ' (resistes)' : ''}</option>)}
          </select>
          <button className="btn primary" onClick={damage} title={resisted ? 'Resistencia (' + resisted.why + '): recibes la mitad' : undefined}>Daño{resisted ? ' (mitad)' : ''}</button>
          <button className="btn heal" onClick={heal}>Curación</button>
          <button className="btn temp" onClick={giveTemp}>PG temporales</button>
          {readOnly && (c.conds.length > 0 || c.exh > 0) && <span className="chip on pc-conc" title="Estados del personaje">{[...c.conds, c.exh ? 'Agotamiento ' + c.exh : ''].filter(Boolean).join(' · ')}</span>}
          <div className="pc-rest pc-state">
            <Picker pop title="Estados" summary={[...c.conds, c.exh ? 'Agotamiento ' + c.exh : ''].filter(Boolean).join(', ')}>
              {conc && <button className="chip on pc-conc" title="Te concentras en este conjuro. Pulsa para dejar de concentrarte." onClick={() => set({ conds: withoutConc(c.conds) })}>Concentración: {conc} ✕</button>}
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
            <button className="btn small" onClick={() => setResting(!resting)} aria-expanded={resting}>Descanso corto</button>
            <button className="btn small" onClick={() => { if (confirmLong) { replace(longRest(c, d)); setConfirmLong(false); if (data && restSwapClasses(c).length && c.spells.length) setRestSpells(true); } else setConfirmLong(true); }}>{confirmLong ? '¿Seguro? Descanso largo' : 'Descanso largo'}</button>
          </div>
        </div>
        {withoutConc(c.conds).length > 0 && <ul className="rem">{withoutConc(c.conds).map((k) => <li key={k}><span><strong>{k}:</strong> {k === 'Furia' ? 'resistencia a daño contundente, cortante y perforante, ventaja en pruebas y salvaciones de Fuerza y +' + rageDmg + ' al daño con Fuerza. Quítala con el botón «Furia» de Ataques.' : CONDITIONS.find((x) => x[0] === k)?.[1]}</span></li>)}</ul>}
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
                const all = [RELENTLESS, ...(c.magicItems || []).filter((i) => i.charges?.per === 'sr').map(itemKey), ...features.filter((f) => f.per === 'sr').map((f) => f.key), ...res.filter((r) => r.now === 'sr').map((r) => r.key)].filter((k) => !one.has(k));
                const rested = shortRest(c, all);
                // los que recuperan uno en descanso corto (dados psiónicos, Canalizar divinidad)
                one.forEach((k) => { if (rested.uses[k]) rested.uses[k] -= 1; });
                replace(rested); setResting(false);
              }}>Terminar descanso corto</button>
            </div>
          </div>
        )}
        {deathHit && (
          <p className="warn small pc-death-hit" role="status" style={{ margin: 0 }}>
            {deathHit.msg}
            {deathHit.crit && <button className="btn small" title="Inconsciente: todo ataque que te impacte desde 5 pies o menos es crítico" onClick={critHit}>Crítico o cuerpo a cuerpo a 5 pies: otro fallo</button>}
            <button className="btn small ghost" onClick={() => setDeathHit(null)}>Vale</button>
          </p>
        )}
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
      <div className="pc-mosaic" ref={lowRef}>
      <div className="pc-mcol">
      <div className="pc-split-in" data-sec="tiradas">
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
                  <button className="pc-skill pc-save" aria-label={'Salvación de ' + ABIL_N[a] + ' ' + fmt(d.saves[a].bonus) + (d.saves[a].prof ? ' (competente)' : '') + (d.saves[a].adv ? ' V' : '')} title={'Salvación de ' + ABIL_N[a] + (d.saves[a].prof ? ' (competente)' : '') + (d.saves[a].why ? ' · ' + d.saves[a].why : '') + (d.saves[a].adv ? ' · ventaja (' + d.saves[a].adv + ')' : '')} onClick={() => r('salvación de ' + ABIL_N[a], 'save', d20b(d.saves[a].bonus), d.saves[a].adv ? { adv: d.saves[a].adv } : {})}>
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
                <dt>Herramientas</dt><dd>{readOnly ? (c.tools || '—') : <TagPicker label="Herramientas" value={c.tools} options={toolOpts} placeholder="—" onChange={(v) => set({ tools: v })} />}</dd>
                <dt>Idiomas</dt><dd>{readOnly ? (c.langs || '—') : <TagPicker label="Idiomas" value={c.langs} options={LANGUAGES} placeholder="—" onChange={(v) => set({ langs: v })} />}</dd>
              </dl>
            </div>
            )}
          </div>)}
        </div>
      </section>

      {/* ataques y paneles de rasgos con pocas tarjetas, uno al lado del otro (con muchas tarjetas, a todo el ancho) */}
      </div>
      {!wide && notesPanel}
      {fillersAt(0)}
      </div>
      <div className="pc-mcol">
      <div className="pc-duo pc-split-in" data-sec="combate">
      <section className="panel" aria-label="Ataques">
        <div className="panel-head">
          <h3 className="eyebrow">Ataques</h3>
          {(d.fx.savage || d.fx.charge || d.fx.piercer || rageDmg > 0 || !!sneakDice || !!strikeDice || hitBuffs.length > 0) && (
            <span className="rollrow">
              {d.fx.savage && <button className={savage ? 'chip on' : 'chip'} aria-pressed={savage} title="Una vez por turno: el próximo daño con arma tira sus dados dos veces y usa el mejor" onClick={() => setSavage(!savage)}>Atacante salvaje</button>}
              {rageDmg > 0 && <button className={rage ? 'chip on' : 'chip'} aria-pressed={rage} title={'Mientras dure: +' + rageDmg + ' al daño de los ataques con Fuerza; resistencia a contundente, cortante y perforante. Entrar gasta un uso de Furia.'} onClick={toggleRage}>Furia +{rageDmg}</button>}
              {rageDmg > 0 && rageMax > 0 && <Pips max={rageMax} used={Math.min(rageMax, c.uses['Furia'] || 0)} label="Furias" onSet={(v) => set({ uses: { ...c.uses, Furia: Math.max(0, Math.min(rageMax, v)) } })} />}
              {classLevel(c, 'barbarian') >= 2 && <button className={reckless ? 'chip on' : 'chip'} aria-pressed={reckless} title={'Este turno: ventaja en tus ataques con Fuerza (y los ataques contra ti también la tienen)' + (frenzy ? '. Con Furia: Frenesí, ' + rageDmg + 'd6 más al primer objetivo que aciertes' : '')} onClick={() => setReckless(!reckless)}>Ataque temerario</button>}
              {brutalDice && <button className={brutal ? 'chip on' : 'chip'} aria-pressed={brutal} title="Renuncias a la ventaja en un ataque con Fuerza: si acierta, este daño extra" onClick={() => setBrutal(!brutal)}>Golpe brutal +{brutalDice}</button>}
              {sneakDice && <button className={sneak ? 'chip on' : 'chip'} aria-pressed={sneak} title="Una vez por turno, con un arma sutil o a distancia, si tienes ventaja o un aliado junto al objetivo" onClick={() => setSneak(!sneak)}>Ataque furtivo +{sneakDice}</button>}
              {hitBuffs.map((b) => { const on = buffs.includes(b.key); return <button key={b.key} className={on ? 'chip on' : 'chip'} aria-pressed={on} title={'Mientras dure: ' + b.why} onClick={() => toggleBuff(b)}>{b.n} +{b.atk && !/d/.test(b.dmg) ? b.atk : b.dmg}</button>; })}
              {castBuff && (() => {
                const { b, s: sp } = castBuff;
                const base = sp.l || 1;
                const opts: { key: string; label: string; spend: () => Partial<Character> }[] = [
                  ...d.slots.map((n, i) => ({ n, lv: i + 1, used: c.slotsUsed[i] || 0 })).filter((o) => o.lv >= base && o.n - o.used > 0).map((o) => ({ key: 'n' + o.lv, label: 'Espacio de nivel ' + o.lv + ' (quedan ' + (o.n - o.used) + ')', spend: () => { const u = c.slotsUsed.slice(); u[o.lv - 1] = (u[o.lv - 1] || 0) + 1; return { slotsUsed: u }; } })),
                  ...(d.pact && d.pact.lv >= base && d.pact.n - Math.min(d.pact.n, c.pactUsed) > 0 ? [{ key: 'p', label: 'Espacio de pacto de nivel ' + d.pact.lv + ' (quedan ' + (d.pact.n - Math.min(d.pact.n, c.pactUsed)) + ')', spend: () => ({ pactUsed: c.pactUsed + 1 }) }] : []),
                ];
                const go = (patch: Partial<Character>) => { setCastBuff(null); switchBuff(b, patch); };
                return (
                  <InfoDialog title={'Lanzar ' + sp.n} onClose={() => setCastBuff(null)}>
                    <p className="muted small" style={{ marginTop: 0 }}>{b.why}{sp.c ? ' · concentración' : ''}</p>
                    <div className="rollrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                      {opts.map((o) => <button key={o.key} className="btn gold" onClick={() => go(o.spend())}>Lanzar con {o.label.charAt(0).toLowerCase() + o.label.slice(1)}</button>)}
                      {!opts.length && <span className="muted small">No te quedan espacios de nivel {base} o superior.</span>}
                      <button className="btn" onClick={() => go({})}>Solo activar (sin gastar espacio)</button>
                    </div>
                  </InfoDialog>
                );
              })()}
              {strikeDice && <button className={strike ? 'chip on' : 'chip'} aria-pressed={strike} title={'Una vez por turno al impactar con un arma: ' + (blessed ? 'radiante o necrótico' : 'frío, fuego, relámpago o trueno')} onClick={() => setStrike(!strike)}>{strikeName} +{strikeDice}</button>}
              {d.fx.piercer && <button className={pierce ? 'chip on' : 'chip'} aria-pressed={pierce} title="Una vez por turno: el próximo daño perforante repite su dado más bajo si no llega a la mitad" onClick={() => setPierce(!pierce)}>Perforador</button>}
              {d.fx.charge && <button className={charge ? 'chip on' : 'chip'} aria-pressed={charge} title={'Tras moverte 3 m en línea recta: el próximo daño cuerpo a cuerpo suma ' + d.fx.charge} onClick={() => setCharge(!charge)}>Carga +{d.fx.charge}</button>}
            </span>
          )}
        </div>
        {!d.attacks.length && !d.unarmed && <p className="muted small" style={{ margin: 0 }}>Añade tus armas en «Editar hoja».</p>}
        <div className="pc-attacks">
        <div className="pc-att-head" aria-hidden="true"><span>Arma o truco</span><span>Ataque</span><span>Daño y tipo</span></div>
        {d.attacks.map(({ w, atk, abil, parts, verParts, throwParts, offParts, poleParts, notes }) => (
          <div key={w.id} className="pc-attack">
            <span className="pc-attack-n">{w.name}
              <InfoPop label={(w.props || []).length || w.mastery ? 'Propiedades' + (w.mastery ? ' y maestría' : '') : (w.kind === 'ranged' ? 'A distancia' : 'Cuerpo a cuerpo')} title={w.name}>
                <p className="muted">{[w.kind === 'ranged' ? 'A distancia' : 'Cuerpo a cuerpo', w.range].filter(Boolean).join(' · ')}</p>
                {(w.props || []).map((pr) => <p key={pr}><b>{pr}.</b> {weaponPropText(pr)}</p>)}
                {w.mastery && <p><b>Maestría: {w.mastery}.</b> {masteryText(w.mastery)}</p>}
              </InfoPop>{notes.length > 0 && <span className="pc-attack-feat small" title={notes.join(' · ')}>{notes.join(' · ')}</span>}
              {d.fx.dmgOneHand != null && w.kind === 'melee' && !(w.props || []).some((p) => norm(p) === 'a dos manos') && (
                <label className="check small pc-duel"><input type="checkbox" checked={w.duel !== false} onChange={(e) => set({ weapons: c.weapons.map((x) => (x.id === w.id ? { ...x, duel: e.target.checked } : x)) })} />A una mano, sin nada en la otra (Duelo)</label>
              )}
            </span>
            <span className="rollrow">
              <button className="rollbtn" onClick={() => r(w.name + ': ataque', 'attack', d20b(atk + buffAtk), { critOn: d.critOn, ...(reckless && abil === 'str' ? { adv: 'Ataque temerario' } : {}) })}>Ataque {fmt(atk + buffAtk)}{reckless && abil === 'str' && <span className="adv-mark">V</span>}</button>
              <button className="rollbtn dmg" title={partsLabel(parts)} onClick={() => dmgRoll(w.name + ': daño', parts, { melee: w.kind === 'melee', str: abil === 'str', finesse: w.finesse || w.kind === 'ranged', thrownMelee: (w.props || []).some((p) => norm(p) === 'arrojadiza') }, w.id)}>{partsShort(parts)}</button>
              {verParts.length > 0 && <button className="rollbtn dmg" onClick={() => dmgRoll(w.name + ': daño a dos manos', verParts, { melee: true, str: abil === 'str', finesse: w.finesse }, w.id)}>A dos manos {partsShort(verParts)}</button>}
              {throwParts.length > 0 && <button className="rollbtn dmg" onClick={() => dmgRoll(w.name + ': daño lanzada', throwParts, { melee: false, str: abil === 'str', finesse: true })}>Lanzada {partsLabel(throwParts)}</button>}
              {offParts.length > 0 && <button className="rollbtn dmg" title="Ataque extra de la propiedad «ligera» (acción adicional); el ataque se tira con «Ataque»" onClick={() => dmgRoll(w.name + ': ataque extra', offParts, { melee: w.kind === 'melee', str: abil === 'str', finesse: w.finesse || w.kind === 'ranged' })}>Acción adicional {partsLabel(offParts)}</button>}
              {poleParts.length > 0 && <button className="rollbtn dmg" title="Maestro en armas de asta: ataque con el otro extremo (acción adicional)" onClick={() => dmgRoll(w.name + ': otro extremo', poleParts, { melee: true, str: abil === 'str', finesse: false }, w.id)}>Otro extremo {partsLabel(poleParts)}</button>}
            </span>
            {(() => {
              // con tu característica de conjuros en lugar de Fuerza o Destreza
              const spAtk = atk - d.mods[abil] + spellMod;
              const extra = parts.slice(1);
              const rows: JSX.Element[] = [];
              if (trueStrike) {
                const p: { expr: string; type: string; min?: number }[] = [{ expr: w.dmg + sgn(spellMod + (w.bonus || 0)), type: 'radiante' }, ...(cantripTier ? [{ expr: cantripTier + 'd6', type: 'radiante' }] : []), ...extra];
                rows.push(
                  <span key="ts" className="rollrow pc-cantrip-atk">
                    <span className="chip-tag" title="Truco: el ataque y el daño usan tu característica de conjuros; el daño puede ser radiante o el del arma">Impacto certero</span>
                    <button className="rollbtn" onClick={() => r(w.name + ': Impacto certero', 'attack', d20b(spAtk + buffAtk), { critOn: d.critOn })}>Ataque {fmt(spAtk + buffAtk)}</button>
                    <button className="rollbtn dmg" onClick={() => dmgRoll(w.name + ': Impacto certero', p, { melee: w.kind === 'melee', str: false, finesse: true }, w.id)}>{partsShort(p)}</button>
                  </span>,
                );
              }
              if (shillelagh && w.kind === 'melee' && /^(garrote|baston)/.test(norm(w.name))) {
                const p: { expr: string; type: string; min?: number }[] = [{ expr: shillDie + sgn(spellMod + (w.bonus || 0)), type: 'fuerza' }, ...extra];
                rows.push(
                  <span key="sh" className="rollrow pc-cantrip-atk">
                    <span className="chip-tag" title="Truco: con el garrote o el bastón usas tu característica de conjuros y un dado mayor; el daño puede ser de fuerza o el del arma">Shillelagh</span>
                    <button className="rollbtn" onClick={() => r(w.name + ': Shillelagh', 'attack', d20b(spAtk + buffAtk), { critOn: d.critOn })}>Ataque {fmt(spAtk + buffAtk)}</button>
                    <button className="rollbtn dmg" onClick={() => dmgRoll(w.name + ': Shillelagh', p, { melee: true, str: false, finesse: true }, w.id)}>{partsShort(p)}</button>
                  </span>,
                );
              }
              return rows;
            })()}
          </div>
        ))}
        {d.unarmed && (
          <div className="pc-attack">
            <span className="pc-attack-n">Ataque sin armas<span className="muted small">cuerpo a cuerpo</span><span className="pc-attack-feat small">{d.unarmed.notes.join(', ')}{d.unarmed.parts[0].reroll1 ? ' · repite los 1' : ''}</span></span>
            <span className="rollrow">
              <button className="rollbtn" onClick={() => r('ataque sin armas', 'attack', d20b(d.unarmed!.atk), { critOn: d.critOn, ...(reckless && uaHit.str ? { adv: 'Ataque temerario' } : {}) })}>Ataque {fmt(d.unarmed.atk)}{reckless && uaHit.str && <span className="adv-mark">V</span>}</button>
              <button className="rollbtn dmg" onClick={() => dmgRoll('ataque sin armas: daño', d.unarmed!.parts, uaHit, 'ua')} title={partsLabel(d.unarmed.parts)}>{partsShort(d.unarmed.parts)}</button>
              {d.unarmed.free.length > 0 && <button className="rollbtn dmg" title="Sin empuñar armas ni embrazar escudo" onClick={() => dmgRoll('ataque sin armas: daño', d.unarmed!.free, uaHit, 'ua')}>Sin armas ni escudo {partsLabel(d.unarmed.free)}</button>}
              {d.unarmed.grapple && <button className="rollbtn dmg" title="Al principio de tu turno, a una criatura que tengas agarrada" onClick={() => roll({ label: who + ' · daño a la criatura agarrada', kind: 'damage', who, by: null, parts: [{ expr: d.unarmed!.grapple, type: 'contundente' }] })}>Agarrada {d.unarmed.grapple} contundente</button>}
            </span>
          </div>
        )}
        {/* conjuros con tirada de ataque que se usan como un ataque: los trucos y los que atacan turno a turno */}
        {spellAttacks.map(({ k, s: sp, grant }) => {
          const { caster, cast } = spellCastFor(c, d, sp, sp.l || 0, data, grant);
          if (!caster) return null;
          const atk = caster.atk;
          return (
            <div key={'sp' + k} className="pc-attack sp">
              <span className="pc-attack-n"><button type="button" className="pc-name-link" aria-haspopup="dialog" title="Ver el texto del conjuro" onClick={() => setSpText(k)}>{sp.n}</button><span className="muted small">{sp.l ? 'conjuro de nivel ' + sp.l + ' · ataque cada turno mientras dura' : 'truco'}{sp.r ? ' · ' + sp.r : ''}</span></span>
              <span className="rollrow">
                <button className="rollbtn" onClick={() => r(sp.n + ': ataque', 'attack', d20b(atk + buffAtk), { critOn: d.critOn, ...(cast.count > 1 ? { shots: cast.count } : {}) })}>Ataque {fmt(atk + buffAtk)}{cast.count > 1 ? ' ×' + cast.count : ''}</button>
                {cast.dmg && (cast.count > 1
                  ? <button className="rollbtn dmg" onClick={() => roll({ label: who + ' · ' + sp.n + ': ' + cast.count + ' impactos', kind: 'damage', who, by: null, parts: shotParts(cast.dmg!, cast.count, useStore.getState().critFor, who), impacts: cast.count })}>{cast.count} × {cast.dmg.expr}{cast.dmg.type ? ' ' + shortType(cast.dmg.type) : ''}</button>
                  : <button className="rollbtn dmg" onClick={() => roll({ label: who + ' · ' + sp.n + ': daño', kind: 'damage', who, by: null, parts: [cast.dmg!] })} title={cast.dmg.expr + (cast.dmg.type ? ' ' + cast.dmg.type : '')}>{cast.dmg.expr}{cast.dmg.type ? ' ' + shortType(cast.dmg.type) : ''}</button>)}
              </span>
            </div>
          );
        })}
        </div>
      </section>

      <ReactionPanel counted={rxCounted} c={c} d={d} set={set} spells={spellList.map((x) => ({ ...x.s!, k: x.k }))} extra={quick} onSpell={setSpText} rows={views.flatMap(({ v, dv }) => activeKits(v).map((k) => <KitPanel key={k.kit.id + v.classId} react c={v} d={dv} lib={lib} set={set} kit={k.kit} actions={k.actions} off={!!c.uses[REACTION]} onUse={() => update(c.id, (cur) => ({ uses: { ...cur.uses, [REACTION]: 1 } }))} />))} onHit={(a) => (a ? dmgRoll(a.w.name + ': daño', a.parts, { melee: true, str: a.abil === 'str', finesse: a.w.finesse, thrownMelee: (a.w.props || []).some((p) => norm(p) === 'arrojadiza') }, a.w.id) : d.unarmed && dmgRoll('ataque sin armas: daño', d.unarmed.parts, uaHit, 'ua'))} />
      <QuickActions rows={quick} c={c} d={d} set={set} data={data} views={views} />

      {views.map(({ v, dv }, i) => (
        <Fragment key={i}>
          <SubclassActions c={v} d={dv} data={data} lib={lib} set={set} />
          <DeathKnightPanel c={v} d={dv} set={set} />
          <ClassPanel c={v} d={dv} data={data} set={set} lay={!quick.some((r) => r.n === 'Imposición de manos' && classLevel(c, 'paladin') > 0) && !libReplaces(classEntries(c), 'Imposición de manos')} />
        </Fragment>
      ))}
      <FeatPanel c={c} d={d} set={set} />
      <MetamagicPanel c={c} data={data} set={set} />
      <MagicItemsPanel c={c} set={set} spells={spellIdx.list} readOnly={readOnly} />
      {usableCards.length > 0 && (
        <section className="panel" aria-label="Rasgos con usos">
          <h3 className="eyebrow">Rasgos con usos</h3>
          <ul className="pc-features grid acts">
            {usableCards.map((f) => {
              const used = f.max ? Math.min(f.max, c.uses[f.key] || 0) : 0;
              const spend = (patch: Partial<Character> = {}) => set({ ...patch, uses: { ...c.uses, [f.key]: used + 1 } });
              // Astucia mágica (brujo): recupera la mitad de los espacios de pacto (redondeando arriba); con Maestro arcano, todos
              const cunning = f.key === 'Astucia mágica' && d.pact ? Math.min(c.pactUsed, classLevel(c, 'warlock') >= 20 ? d.pact.n : Math.ceil(d.pact.n / 2)) : null;
              return (
                <li key={f.key}>
                  <Card name={f.n} head={<>
                    <span className="muted small">{f.src}{f.max ? ' · ' + (f.per === 'sr' ? 'descanso corto o largo' : 'descanso largo') : ''}</span>
                    <span className="rollrow">
                      {f.max ? <Pips max={f.max} used={used} label={'Usos de ' + f.n} onSet={(v) => set({ uses: { ...c.uses, [f.key]: Math.max(0, Math.min(f.max!, v)) } })} /> : null}
                      {f.fx && hbButtons(f, () => spend(), !f.max || used < f.max)}
                      {f.fx ? null : cunning != null
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
      </div>
      {fillersAt(1)}
      </div>
      </div>
    </div>
  );
}
