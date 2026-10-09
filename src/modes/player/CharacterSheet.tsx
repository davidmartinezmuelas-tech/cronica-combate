import { Fragment, useMemo, useState } from 'react';
import { CONDITIONS, DMG_TYPES } from '../../data/constants';
import { ABILS, type Abil, type ClassData, type ClassFeature, type PlayerData } from '../../data/player';
import { asClass, classEntries, classLevel, derive, expandCustomFeats, longRest, partsLabel, shortRest, usesMax, type Character, type Derived } from '../../engine/character';
import { fmt, sgn, type RollPart } from '../../engine/dice';
import { norm } from '../../engine/util';
import Card from '../../shared/Card';
import Picker from '../../shared/Picker';
import Pips from '../../shared/Pips';
import { useLibrary, type LibraryData } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useStore } from '../../store/useStore';
import type { RollSpec } from '../../store/state';
import { hasInvocation, subclassSpells, subclassText } from '../../engine/subclassChoices';
import { assignSpells, casterPreps } from '../../engine/spellPrep';
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
  // Marca del cazador y Maleficio duran: mientras estén activos, su daño va en cada tirada de daño con arma
  const [mark, setMark] = useState(false);
  const [hex, setHex] = useState(false);
  // pestañas de conjuros: por nivel y, con varias clases lanzadoras, por clase
  const [spLv, setSpLv] = useState('all');
  const [spCls, setSpCls] = useState('all');

  const sp = data?.species.find((x) => x.id === c.speciesId);
  const bg = data?.backgrounds.find((x) => x.id === c.backgroundId) || lib.backgrounds.find((x) => x.id === c.backgroundId);
  const who = c.name || 'Personaje';
  const r = (label: string, kind: RollSpec['kind'], expr: string, extra: Partial<RollSpec> = {}) =>
    roll({ label: who + ' · ' + label, kind, who, parts: [{ expr }], self: { conds: c.conds, exh: c.exh }, ...extra });
  const d20 = (b: number) => '1d20' + sgn(b);
  const set = (patch: Partial<Character>) => update(c.id, patch);

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
  const dmgRoll = (label: string, parts: RollPart[], hit: Hit, with_: { smite?: boolean; eld?: boolean } = {}) => {
    const melee = hit.melee;
    const piercing = parts[0]?.type === 'perforante';
    const ps: RollPart[] = parts.map((p, i) => (i === 0 ? { ...p, ...(savage ? { best2: true } : {}), ...(pierce && piercing ? { rerollLow: true } : {}) } : p));
    if (charge && melee && d.fx.charge) ps.push({ expr: d.fx.charge, type: parts[0]?.type });
    // solo si el daño es de un crítico: un dado más del arma (Perforador) y la puntuación aumentada (Don del ataque imparable)
    const critBonus: RollPart[] = [];
    const die = /\d*d(\d+)/.exec(parts[0]?.expr || '');
    if (d.fx.piercer && piercing && die) critBonus.push({ expr: '1d' + die[1], type: 'perforante', noDouble: true });
    if (d.fx.critScore && parts[0]) critBonus.push({ expr: String(c.abil[boonAbil]), type: parts[0].type, noDouble: true });
    const type = parts[0]?.type || '';
    if (rage && hit.str && rageDmg) ps.push({ expr: String(rageDmg), type });
    if (frenzy && hit.str && rageDmg) ps.push({ expr: rageDmg + 'd6', type });
    if (brutal && hit.str && brutalDice) ps.push({ expr: brutalDice, type });
    if (sneak && hit.finesse && sneakDice) ps.push({ expr: sneakDice, type });
    // Marca del cazador y Maleficio: su daño en cada impacto, en la misma tirada que el arma
    if (mark && markExpr) ps.push({ expr: markExpr, type: 'fuerza' });
    if (hex && hexExpr) ps.push({ expr: hexExpr, type: 'necrótico' });
    if (strike && strikeDice) ps.push({ expr: strikeDice, type: blessed ? 'radiante' : 'elemental' });
    // Castigo divino y Castigo arcano: con armas cuerpo a cuerpo (y ataques sin armas), gastan su espacio al tirar
    const useSmite = !!with_.smite && melee && !!smiteOpt;
    const useEld = !!with_.eld && melee && !!eldDice;
    if (useSmite) ps.push({ expr: smiteOpt!.dice, type: 'radiante' });
    if (useEld) ps.push({ expr: eldDice, type: 'fuerza' });
    const extra = [savage ? 'atacante salvaje' : '', charge && melee ? 'carga' : '', pierce && piercing ? 'perforador' : '',
      rage && hit.str && rageDmg ? 'furia' : '', frenzy && hit.str && rageDmg ? 'frenesí: solo al primer objetivo del turno' : '', brutal && hit.str && brutalDice ? 'golpe brutal' : '', sneak && hit.finesse && sneakDice ? 'ataque furtivo' : '',
      mark && markExpr ? 'marca del cazador' : '', hex && hexExpr ? 'maleficio' : '', strike && strikeDice ? strikeName.toLowerCase() : '',
      useSmite ? 'castigo divino' : '', useEld ? 'castigo arcano' : ''].filter(Boolean);
    roll({ label: who + ' · ' + label + (extra.length ? ' (' + extra.join(', ') + ')' : ''), kind: 'damage', who, by: null, parts: ps, critBonus });
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
        if (smiteOpt!.key === 'free') patch.uses = { ...cur.uses, 'Castigo del paladín': (cur.uses['Castigo del paladín'] || 0) + 1 };
        else if (smiteOpt!.key === 'p') pact += 1;
        else { const u = cur.slotsUsed.slice(); u[smiteOpt!.lv - 1] = (u[smiteOpt!.lv - 1] || 0) + 1; patch.slotsUsed = u; }
      }
      if (useEld) pact += 1;
      if (pact !== cur.pactUsed) patch.pactUsed = pact;
      update(c.id, patch);
    }
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
  // niveles de la clase elegida (o de todas)
  const spLevels = [...new Set(spellList.filter((x) => clsTab === 'all' || x.cls.includes(clsTab)).map((x) => x.s!.l || 0))].sort((a, b) => a - b);
  const lvTab = spLv !== 'all' && spLevels.includes(+spLv) ? spLv : 'all';
  const spellShown = spellList.filter((x) => (lvTab === 'all' || (x.s!.l || 0) === +lvTab) && (clsTab === 'all' || x.cls.includes(clsTab)));
  const freeSmite = features.find((f) => f.key === 'Castigo del paladín' && f.max);
  // Marca del cazador (explorador: su dado; si no, la del conjuro, 1d6) y Maleficio, si los tiene
  const markExpr = markDie || (spellList.some((x) => x.s!.en === "Hunter's Mark") ? '1d6' : '');
  const hexExpr = spellList.some((x) => x.s!.en === 'Hex') ? '1d6' : '';
  // Castigo divino en el arma: gratis (Castigo del paladín), con un espacio de cualquier nivel o con uno de pacto
  const hasSmite = spellList.some((x) => x.s!.en === 'Divine Smite');
  const pactLeft = d.pact ? d.pact.n - Math.min(d.pact.n, c.pactUsed) : 0;
  const smiteOpts = !hasSmite ? [] : [
    ...(freeSmite && (c.uses[freeSmite.key] || 0) < freeSmite.max! ? [{ key: 'free', lv: 1, label: 'Gratis' }] : []),
    ...d.slots.map((n, i) => ({ key: String(i + 1), lv: i + 1, label: 'Nivel ' + (i + 1), left: n - (c.slotsUsed[i] || 0) })).filter((o) => o.left > 0),
    ...(d.pact && pactLeft > 0 ? [{ key: 'p', lv: d.pact.lv, label: 'Pacto' }] : []),
  ].map((o) => ({ ...o, dice: o.lv + 1 + 'd8' }));
  const smiteOpt = smiteOpts.find((o) => o.key === smitePick) || smiteOpts[0];
  // Castigo arcano (invocación): 1d8 de fuerza más 1d8 por nivel del espacio de pacto
  const eldDice = hasInvocation(c, 'Castigo arcano') && d.pact && pactLeft > 0 ? d.pact.lv + 1 + 'd8' : '';
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
            <button className={c.inspiration ? 'chip on' : 'chip'} aria-pressed={c.inspiration} onClick={() => set({ inspiration: !c.inspiration })}>Inspiración heroica</button>
            {data && <button className="btn small primary" onClick={() => setLeveling(true)}>Subir de nivel</button>}
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
        <div className="pc-stats">
          <div className="stat" title={d.acNote}><span className="stat-k">CA</span><span className="stat-v">{d.ac}</span><span className="muted small">{d.acNote}</span>
            {/* embrazar o soltar el escudo en mitad del combate (+2, más su bonificador mágico) */}
            <button className={c.shield ? 'chip on stat-chip' : 'chip stat-chip'} aria-pressed={c.shield} title={c.shield ? 'Soltar el escudo' : 'Embrazar un escudo: +' + (2 + (c.shieldBonus || 0)) + ' a la CA'} onClick={() => set({ shield: !c.shield })}>Escudo +{2 + (c.shieldBonus || 0)}</button></div>
          <div className="stat"><span className="stat-k">PG</span><span className="stat-v">{c.hp}<span className="stat-of"> / {d.hpMax}</span></span>{c.temp > 0 && <span className="stat-tmp">+{c.temp} temporales</span>}
            <span className="hpbar"><span className={'hpfill ' + (hpPct <= 25 ? 'low' : hpPct <= 50 ? 'mid' : '')} style={{ width: hpPct + '%' }} /></span></div>
          <button className="stat stat-btn" onClick={() => r('iniciativa', 'init', d20(d.init), d.initAdv ? { adv: d.initAdv } : {})} title={'Tirar iniciativa' + (d.initAdv ? ' con ventaja (' + d.initAdv + ')' : '')}><span className="stat-k">Iniciativa{d.initAdv && <span className="adv-mark">V</span>}</span><span className="stat-v">{fmt(d.init)}</span></button>
          <div className="stat"><span className="stat-k">Velocidad</span><span className="stat-v">{d.speed}<span className="stat-of"> pies</span></span></div>
          <div className="stat"><span className="stat-k">Competencia</span><span className="stat-v">{fmt(d.pb)}</span></div>
          <div className="stat"><span className="stat-k">Percepción pasiva</span><span className="stat-v">{d.pp}</span></div>
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
          <span className="muted small">Dados de golpe: {hdText}</span>
        </div>
        {c.hp === 0 && (
          <div className="sub" style={{ borderColor: '#c0513c' }}>
            <div className="panel-head"><strong className="pc-death-t">Salvaciones contra la muerte</strong>
              <span className="res-row">
                <span className="res">Éxitos <span className="pips">{[0, 1, 2].map((j) => <span key={j} className={j < c.death.s ? 'pip ok' : 'pip off'} />)}</span></span>
                <span className="res">Fallos <span className="pips">{[0, 1, 2].map((j) => <span key={j} className={j < c.death.f ? 'pip bad' : 'pip off'} />)}</span></span>
              </span>
            </div>
            <button className="btn small gold" style={{ alignSelf: 'flex-start' }} onClick={deathSave}>Tirar salvación</button>
          </div>
        )}
      </div>

      <div className="pc-grid" data-tour="rolls">
        <section className="panel" aria-label="Características">
          <h3 className="eyebrow">Características y salvaciones</h3>
          <div className="pc-abils">
            {ABILS.map((a) => (
              <div key={a} className="pc-abil">
                <span className="pc-abil-k">{ABIL_S[a]} <b>{d.abil[a]}</b></span>
                <button className="btn small" title={'Prueba de ' + ABIL_N[a] + (d.checks[a].adv ? ' con ventaja (' + d.checks[a].adv + ')' : '')} onClick={() => r('prueba de ' + ABIL_N[a], 'check', d20(d.checks[a].bonus), d.checks[a].adv ? { adv: d.checks[a].adv } : {})}>Prueba {fmt(d.checks[a].bonus)}{d.checks[a].adv && <span className="adv-mark">V</span>}</button>
                <button className={d.saves[a].prof ? 'btn small prof' : 'btn small ghost'} title={'Salvación de ' + ABIL_N[a] + (d.saves[a].prof ? ' (competente)' : '') + (d.saves[a].why ? ' · ' + d.saves[a].why : '') + (d.saves[a].adv ? ' · ventaja (' + d.saves[a].adv + ')' : '')} onClick={() => r('salvación de ' + ABIL_N[a], 'save', d20(d.saves[a].bonus), d.saves[a].adv ? { adv: d.saves[a].adv } : {})}>Salv {fmt(d.saves[a].bonus)}{d.saves[a].adv && <span className="adv-mark">V</span>}</button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" aria-label="Habilidades">
          <h3 className="eyebrow">Habilidades</h3>
          <ul className="pc-skills">
            {skillsSorted.map(([k, s]) => (
              <li key={k}>
                <button className="pc-skill" onClick={() => r(data?.skills[k] || k, 'check', d20(s.bonus), { ...(s.adv ? { adv: s.adv } : {}), ...(s.min10 ? { parts: [{ expr: d20(s.bonus), minD20: 10 }] } : {}) })} title={'Tirar ' + (data?.skills[k] || k) + (s.adv ? ' con ventaja (' + s.adv + ')' : '') + (s.min10 ? ' · Talento fiable: el d20 cuenta como 10 como mínimo' : '')}>
                  <span className={s.exp ? 'dot exp' : s.prof ? 'dot on' : 'dot'} aria-label={s.exp ? 'Pericia' : s.prof ? 'Competente' : 'Sin competencia'} />
                  <span className="pc-skill-n">{data?.skills[k] || k} <span className="muted small">{ABIL_S[s.abil]}</span></span>
                  {s.adv && <span className="adv-mark" title={s.adv}>V</span>}
                  <b>{fmt(s.bonus)}</b>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ataques y paneles de rasgos con pocas tarjetas, uno al lado del otro (con muchas tarjetas, a todo el ancho) */}
      <div className="pc-duo">
      <section className="panel" aria-label="Ataques">
        <div className="panel-head">
          <h3 className="eyebrow">Ataques</h3>
          {(d.fx.savage || d.fx.charge || d.fx.piercer || rageDmg > 0 || !!sneakDice || !!strikeDice || hasSmite || !!markExpr || !!hexExpr) && (
            <span className="rollrow">
              {d.fx.savage && <button className={savage ? 'chip on' : 'chip'} aria-pressed={savage} title="Una vez por turno: el próximo daño con arma tira sus dados dos veces y usa el mejor" onClick={() => setSavage(!savage)}>Atacante salvaje</button>}
              {rageDmg > 0 && <button className={rage ? 'chip on' : 'chip'} aria-pressed={rage} title={'Mientras dure: +' + rageDmg + ' al daño de los ataques con Fuerza; resistencia a contundente, cortante y perforante. Entrar gasta un uso de Furia.'} onClick={toggleRage}>Furia +{rageDmg}</button>}
              {classLevel(c, 'barbarian') >= 2 && <button className={reckless ? 'chip on' : 'chip'} aria-pressed={reckless} title={'Este turno: ventaja en tus ataques con Fuerza (y los ataques contra ti también la tienen)' + (frenzy ? '. Con Furia: Frenesí, ' + rageDmg + 'd6 más al primer objetivo que aciertes' : '')} onClick={() => setReckless(!reckless)}>Ataque temerario</button>}
              {brutalDice && <button className={brutal ? 'chip on' : 'chip'} aria-pressed={brutal} title="Renuncias a la ventaja en un ataque con Fuerza: si acierta, este daño extra" onClick={() => setBrutal(!brutal)}>Golpe brutal +{brutalDice}</button>}
              {sneakDice && <button className={sneak ? 'chip on' : 'chip'} aria-pressed={sneak} title="Una vez por turno, con un arma sutil o a distancia, si tienes ventaja o un aliado junto al objetivo" onClick={() => setSneak(!sneak)}>Ataque furtivo +{sneakDice}</button>}
              {markExpr && <button className={mark ? 'chip on' : 'chip'} aria-pressed={mark} title="Mientras el objetivo tenga tu Marca del cazador: su daño de fuerza en cada tirada de daño con arma" onClick={() => setMark(!mark)}>Marca del cazador +{markExpr}</button>}
              {hexExpr && <button className={hex ? 'chip on' : 'chip'} aria-pressed={hex} title="Mientras el objetivo tenga tu Maleficio: 1d6 necrótico en cada tirada de daño con arma" onClick={() => setHex(!hex)}>Maleficio +{hexExpr}</button>}
              {strikeDice && <button className={strike ? 'chip on' : 'chip'} aria-pressed={strike} title={'Una vez por turno al impactar con un arma: ' + (blessed ? 'radiante o necrótico' : 'frío, fuego, relámpago o trueno')} onClick={() => setStrike(!strike)}>{strikeName} +{strikeDice}</button>}
              {hasSmite && (smiteOpt ? (
                <label className="smite-pick small" title="Espacio que gasta «+ Divino» en tus armas cuerpo a cuerpo">Castigo divino
                  <select className="input pc-slot-pick" aria-label="Espacio del castigo divino" value={smiteOpt.key} onChange={(e) => setSmitePick(e.target.value)}>{smiteOpts.map((o) => <option key={o.key} value={o.key}>{o.label} · {o.dice}</option>)}</select>
                </label>
              ) : <span className="muted small">Castigo divino: sin espacios</span>)}
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
              <button className="rollbtn" onClick={() => r(w.name + ': ataque', 'attack', d20(atk), { critOn: d.critOn, ...(reckless && abil === 'str' ? { adv: 'Ataque temerario' } : {}) })}>Ataque {fmt(atk)}{reckless && abil === 'str' && <span className="adv-mark">V</span>}</button>
              <button className="rollbtn dmg" onClick={() => dmgRoll(w.name + ': daño', parts, { melee: w.kind === 'melee', str: abil === 'str', finesse: w.finesse || w.kind === 'ranged' })}>Daño {partsLabel(parts)}</button>
              {w.kind === 'melee' && smiteOpt && <button className="rollbtn dmg smite" title="Castigo divino en el mismo golpe: su daño radiante va en la tirada del arma (en un crítico también se dobla) y gasta el espacio elegido arriba. +1d8 contra infernales y muertos vivientes." onClick={() => dmgRoll(w.name + ': daño', parts, { melee: true, str: abil === 'str', finesse: w.finesse }, { smite: true })}>+ Divino {smiteOpt.dice}</button>}
              {w.kind === 'melee' && smiteOpt && eldDice && (smiteOpt.key !== 'p' || pactLeft >= 2) && <button className="rollbtn dmg smite" title="Castigo divino y Castigo arcano en el mismo golpe: los dos daños en la tirada del arma (en un crítico se doblan todos); gasta el espacio elegido arriba y uno de pacto" onClick={() => dmgRoll(w.name + ': daño', parts, { melee: true, str: abil === 'str', finesse: w.finesse }, { smite: true, eld: true })}>+ Ambos castigos</button>}
              {w.kind === 'melee' && eldDice && <button className="rollbtn dmg smite" title="Castigo arcano (con tu arma de pacto, una vez por turno): 1d8 de fuerza más 1d8 por nivel del espacio de pacto, en la misma tirada; gasta un espacio de pacto. Si es Enorme o menor, puedes derribarlo." onClick={() => dmgRoll(w.name + ': daño', parts, { melee: true, str: abil === 'str', finesse: w.finesse }, { eld: true })}>+ Arcano {eldDice}</button>}
              {verParts.length > 0 && <button className="rollbtn dmg" onClick={() => dmgRoll(w.name + ': daño a dos manos', verParts, { melee: true, str: abil === 'str', finesse: w.finesse })}>A dos manos {partsLabel(verParts)}</button>}
              {throwParts.length > 0 && <button className="rollbtn dmg" onClick={() => dmgRoll(w.name + ': daño lanzada', throwParts, { melee: false, str: abil === 'str', finesse: true })}>Lanzada {partsLabel(throwParts)}</button>}
              {offParts.length > 0 && <button className="rollbtn dmg" title="Ataque extra de la propiedad «ligera» (acción adicional); el ataque se tira con «Ataque»" onClick={() => dmgRoll(w.name + ': ataque extra', offParts, { melee: w.kind === 'melee', str: abil === 'str', finesse: w.finesse || w.kind === 'ranged' })}>Acción adicional {partsLabel(offParts)}</button>}
              {poleParts.length > 0 && <button className="rollbtn dmg" title="Maestro en armas de asta: ataque con el otro extremo (acción adicional)" onClick={() => dmgRoll(w.name + ': otro extremo', poleParts, { melee: true, str: abil === 'str', finesse: false })}>Otro extremo {partsLabel(poleParts)}</button>}
            </span>
          </div>
        ))}
        {d.unarmed && (
          <div className="pc-attack">
            <span className="pc-attack-n">Ataque sin armas<span className="muted small">cuerpo a cuerpo</span><span className="pc-attack-feat small">{d.unarmed.notes.join(', ')}{d.unarmed.parts[0].reroll1 ? ' · repite los 1' : ''}</span></span>
            <span className="rollrow">
              <button className="rollbtn" onClick={() => r('ataque sin armas', 'attack', d20(d.unarmed!.atk), { critOn: d.critOn, ...(reckless && uaHit.str ? { adv: 'Ataque temerario' } : {}) })}>Ataque {fmt(d.unarmed.atk)}{reckless && uaHit.str && <span className="adv-mark">V</span>}</button>
              <button className="rollbtn dmg" onClick={() => dmgRoll('ataque sin armas: daño', d.unarmed!.parts, uaHit)}>Daño {partsLabel(d.unarmed.parts)}</button>
              {smiteOpt && <button className="rollbtn dmg smite" title="Castigo divino en el mismo golpe (también con ataques sin armas)" onClick={() => dmgRoll('ataque sin armas: daño', d.unarmed!.parts, uaHit, { smite: true })}>+ Divino {smiteOpt.dice}</button>}
              {d.unarmed.free.length > 0 && <button className="rollbtn dmg" title="Sin empuñar armas ni embrazar escudo" onClick={() => dmgRoll('ataque sin armas: daño', d.unarmed!.free, uaHit)}>Sin armas ni escudo {partsLabel(d.unarmed.free)}</button>}
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
      </div>

      {(d.spell || spellList.length > 0) && (
        <section className="panel" aria-label="Conjuros">
          <div className="panel-head">
            <h3 className="eyebrow">Conjuros</h3>
            {d.spell && <span className="rollrow">
              {(d.casters.length > 1 ? d.casters : [{ ...d.spell, classId: '', n: '' }]).map((x) => (
                <span key={x.classId} className="rollrow">
                  <span className="muted small">CD {x.dc} · {ABIL_N[x.abil]}{x.n ? ' (' + x.n + ')' : ''}</span>
                  <button className="rollbtn" onClick={() => r('ataque de conjuro' + (x.n ? ' de ' + x.n.toLowerCase() : ''), 'attack', d20(x.atk))}>Ataque de conjuro {fmt(x.atk)}</button>
                </span>
              ))}
            </span>}
          </div>
          {d.slots.length > 0 && (
            <div className="pc-slots">
              {d.slots.map((n, i) => (
                <span key={i} className="res">Nivel {i + 1}
                  <Pips max={n} used={Math.min(n, c.slotsUsed[i] || 0)} label={'Espacios de nivel ' + (i + 1)} onSet={(v) => { const u = c.slotsUsed.slice(); u[i] = Math.max(0, Math.min(n, v)); set({ slotsUsed: u }); }} />
                </span>
              ))}
            </div>
          )}
          {d.pact && <div className="pc-slots"><span className="res">Magia de pacto (nivel {d.pact.lv})<Pips max={d.pact.n} used={Math.min(d.pact.n, c.pactUsed)} label="Espacios de pacto" onSet={(v) => set({ pactUsed: Math.max(0, Math.min(d.pact!.n, v)) })} /></span></div>}
          {spellList.length > 0 && (spLevels.length > 1 || spClasses.length > 1) && (
            <div className="sp-tabs-wrap">
              {spClasses.length > 1 && (
                <div className="sp-tabs" role="tablist" aria-label="Conjuros por clase">
                  {['all', ...spClasses].map((k) => <button key={k} role="tab" aria-selected={clsTab === k} className={clsTab === k ? 'sp-tab on' : 'sp-tab'} onClick={() => setSpCls(k)}>{k === 'all' ? 'Todas las clases' : data?.classes.find((x) => x.id === k)?.n || k}</button>)}
                </div>
              )}
              {spLevels.length > 1 && (
                <div className="sp-tabs" role="tablist" aria-label="Conjuros por nivel">
                  {['all', ...spLevels.map(String)].map((l) => {
                    const inCls = spellList.filter((x) => clsTab === 'all' || x.cls.includes(clsTab));
                    const n = l === 'all' ? inCls.length : inCls.filter((x) => (x.s!.l || 0) === +l).length;
                    return <button key={l} role="tab" aria-selected={lvTab === l} className={lvTab === l ? 'sp-tab on' : 'sp-tab'} onClick={() => setSpLv(l)}>{l === 'all' ? 'Todos' : l === '0' ? 'Trucos' : 'Nivel ' + l}<span className="sp-tab-n">{n}</span></button>;
                  })}
                </div>
              )}
            </div>
          )}
          {!spellList.length ? <p className="muted small" style={{ margin: 0 }}>Añade tus conjuros en «Editar hoja».</p> : !spellShown.length ? <p className="muted small" style={{ margin: 0 }}>Ningún conjuro de este nivel en esta clase.</p> : (
            <ul className="pc-features grid acts">
              {spellShown.map(({ k, s, sub }) => (
                <li key={k}>
                  {/* el texto completo se abre en una ventana: en la tarjeta solo el nombre, sus datos y las tiradas */}
                  <Card name={s!.n}
                    head={<><span className="muted small">{s!.l ? 'nivel ' + s!.l : 'truco'}{s!.c ? ' · concentración' : ''}{s!.rit ? ' · ritual' : ''}</span>{sub && <span className="chip-tag">{sub}</span>}<SpellRolls c={c} d={d} s={s!} set={set} /></>}
                    dialog={<>
                      <p className="muted small" style={{ margin: 0 }}>{s!.l ? 'Nivel ' + s!.l : 'Truco'}{s!.c ? ' · concentración' : ''}{s!.rit ? ' · ritual' : ''}{sub ? ' · ' + sub : ''}</p>
                      <p className="muted small" style={{ margin: '4px 0' }}>{[s!.ct, s!.r, s!.cmp, s!.du].filter(Boolean).join(' · ')}</p>
                      <p className="pc-text">{plainText(s!.t)}</p>
                      <SpellRolls c={c} d={d} s={s!} set={set} />
                    </>} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="panel" aria-label="Rasgos y dotes" data-tour="traits">
        <h3 className="eyebrow">Rasgos y dotes</h3>
        {views.map(({ v }, i) => <SubclassChoices key={i} c={v} data={data} lib={lib} set={set} restOnly />)}
        {!features.length && <p className="muted small" style={{ margin: 0 }}>Elige especie, clase y dotes en «Editar hoja» para ver aquí sus rasgos.</p>}
        <ul className="pc-features grid">
          {features.filter((f) => !usableKeys.has(f.key)).map((f) => (
            <li key={f.src + f.key}>
              <Card name={f.n} head={<>
                <span className="muted small">{f.src}{f.per ? ' · se recupera en descanso ' + (f.per === 'sr' ? 'corto o largo' : 'largo') : ''}</span>
                {f.max != null && !panelKeys.has(f.key) && !panelKeys.has(f.n) && <Pips max={f.max} used={Math.min(f.max, c.uses[f.key] || 0)} label={'Usos de ' + f.n} onSet={(v) => set({ uses: { ...c.uses, [f.key]: Math.max(0, Math.min(f.max!, v)) } })} />}
              </>}>
                {f.d && <p className="pc-text">{f.d.split(/\*\*([^*]+)\*\*/).map((s, i) => (i % 2 ? <b key={i}>{s}</b> : plainText(s)))}</p>}
              </Card>
            </li>
          ))}
        </ul>
      </section>

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
        {c.conds.length > 0 && <ul className="rem">{c.conds.map((k) => <li key={k}><span><strong>{k}:</strong> {k === 'Furia' ? 'resistencia a daño contundente, cortante y perforante, ventaja en pruebas y salvaciones de Fuerza y +' + rageDmg + ' al daño con Fuerza. Quítala con el botón «Furia» de Ataques.' : CONDITIONS.find((x) => x[0] === k)?.[1]}</span></li>)}</ul>}
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

      <section className="panel" aria-label="Notas">
        <div className="row2">
          <div className="field"><label htmlFor="pc-langs">Idiomas</label><input id="pc-langs" className="input" value={c.langs} onChange={(e) => set({ langs: e.target.value })} /></div>
          <div className="field"><label htmlFor="pc-tools">Herramientas</label><input id="pc-tools" className="input" value={c.tools} onChange={(e) => set({ tools: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="pc-notes">Notas</label><textarea id="pc-notes" className="input" rows={4} value={c.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Equipo, objetivos, vínculos, lo que pasó la última sesión…" /></div>
      </section>
    </div>
  );
}
