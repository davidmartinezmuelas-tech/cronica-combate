import { describe, expect, it } from 'vitest';
import data from '../../public/data/srd52_es.json';
import type { SrdData } from '../data/types';
import { blankForge, forgeToMonster, monsterToForge } from '../engine/forge';
import { buildExport, emptySaved, mergeImport, normalizeSaved } from '../store/persist';

const srd = data as unknown as SrdData;

describe('datos SRD', () => {
  it('trae las 341 criaturas en español y sin textos pendientes', () => {
    expect(srd.m).toHaveLength(341);
    const en = srd.m.flatMap((m) => (['tr', 'ac_', 'ba', 're', 'lg'] as const).flatMap((k) => (m[k] || []).filter((f) => f.en)));
    expect(en).toHaveLength(0);
    expect(Object.values(srd.sp).every((s) => s.d && s.n)).toBe(true);
  });
  it('el dragón rojo adulto tiene resistencias y acciones legendarias', () => {
    const d = srd.m.find((m) => m.id === 'adult-red-dragon')!;
    expect(d.n).toBe('Dragón rojo adulto');
    expect(d.lr).toBe(3);
    expect(d.lrl).toBe(4);
    expect(d.la).toBe(3);
    expect(d.ac_!.find((f) => f.n === 'Aliento de fuego')?.rc).toBe(5);
  });
  it('el botón de daño no suma tiradas condicionales ni alternativas', () => {
    const norm = (s: string) => s.replace(/\s/g, '').replace('−', '-');
    const conditional = (text: string, expr: string) => {
      for (const m of text.matchAll(/\((\d+d\d+(?: ?[+−-] ?\d+)?)\)/g)) {
        if (norm(m[1]) === norm(expr)) return /\bsi\b/.test(text.slice(m.index! + m[0].length).split(/[.,—]/)[0]);
      }
      return false;
    };
    const bad = srd.m.flatMap((m) => (['tr', 'ac_', 'ba', 're', 'lg'] as const).flatMap((k) =>
      (m[k] || []).filter((f) => f.dmg && f.dmg.slice(1).some(([e]) => conditional(f.d, e))).map((f) => m.id + ' · ' + f.n)));
    expect(bad).toEqual([]);
    const goblin = srd.m.find((m) => m.id === 'goblin-warrior')!.ac_![0];
    expect(goblin.dmg).toEqual([['1d6+2', 'cortante']]);
    expect(goblin.d.match(/2 \(1d4\)/g)).toHaveLength(1);
  });
  it('el daño condicional queda como botón alternativo con el daño completo', () => {
    const feat = (id: string) => srd.m.find((m) => m.id === id)!.ac_!.find((f) => f.alt)!;
    expect(feat('goblin-warrior').alt).toEqual([{ l: 'con ventaja', dmg: [['1d6+2', 'cortante'], ['1d4', 'cortante']] }]);
    expect(feat('chimera').alt).toEqual([{ l: 'con ventaja', dmg: [['4d6+4', 'perforante']] }]);
    expect(feat('mimic').alt).toEqual([{ l: 'si el objetivo está agarrado', dmg: [['2d8+3', 'perforante'], ['1d8', 'ácido']] }]);
    expect(feat('swarm-of-rats').alt![0].l).toBe('si está Ensangrentado');
    // embestidas: el daño de la carga solo cuenta tras moverse en línea recta
    expect(feat('boar').dmg).toEqual([['1d6+1', 'perforante']]);
    expect(feat('boar').alt).toEqual([{ l: 'tras moverse 20 pies', dmg: [['1d6+1', 'perforante'], ['1d6', 'perforante']] }]);
    expect(feat('giant-elk').dmg).toEqual([['2d6+4', 'contundente'], ['2d4', 'radiante']]);
    expect(srd.m.flatMap((m) => m.ac_ || []).filter((f) => f.alt)).toHaveLength(27);
  });
  it('el bestiario no tiene restos en inglés ni plantillas sin resolver', () => {
    const en = /\b(the|within|feet|that|with|which|creatures?|smaller|larger|Bloodied|Grappled|Charmed|Prone|DC|spending|Hit Points?|Reaction|Bonus)\b|un\(a\)|el\/la|del\/de la|un\/una/;
    const bad = srd.m.flatMap((m) => (['tr', 'ac_', 'ba', 're', 'lg'] as const).flatMap((k) => (m[k] || []).filter((f) => en.test(f.d)).map((f) => m.id + ' · ' + f.n)));
    expect(bad).toEqual([]);
    expect(srd.m.find((m) => m.id === 'tarrasque')!.ba![0].d).toContain('agarrada por la tarasca');
  });
});

describe('forja', () => {
  it('genera el texto y la mecánica de un ataque', () => {
    const f = blankForge();
    f.name = 'Bicho';
    f.feats[0] = { ...f.feats[0], name: 'Garra', atk: '5', d1: '2d6+3' };
    const m = forgeToMonster(f, 'c-1', srd.sp);
    expect(m.ac_![0].d).toBe('Tirada de ataque cuerpo a cuerpo: +5, alcance 5 pies. Impacto: 10 (2d6 + 3) de daño cortante.');
    expect(m.ac_![0].atk).toBe(5);
  });
  it('daño alternativo: genera el texto y el botón, y sobrevive a «Usar de base»', () => {
    const f = blankForge();
    f.name = 'Lobo';
    f.feats[0] = { ...f.feats[0], name: 'Mordisco', atk: '4', d1: '1d6+2', t1: 'perforante', altL: 'con ventaja', altD1: '1d6+2', altT1: 'perforante', altD2: '1d6', altT2: 'perforante' };
    const m = forgeToMonster(f, 'c-3', srd.sp);
    expect(m.ac_![0].alt).toEqual([{ l: 'con ventaja', dmg: [['1d6+2', 'perforante'], ['1d6', 'perforante']] }]);
    expect(m.ac_![0].d).toBe('Tirada de ataque cuerpo a cuerpo: +4, alcance 5 pies. Impacto: 5 (1d6 + 2) de daño perforante. Con ventaja: 5 (1d6 + 2) de daño perforante más 3 (1d6) de daño perforante.');
    const gob = srd.m.find((x) => x.id === 'goblin-warrior')!;
    const back = forgeToMonster(monsterToForge(gob, srd.sp), 'c-4', srd.sp);
    expect(back.ac_![0].alt).toEqual(gob.ac_![0].alt);
    expect(back.ac_![0].dmg).toEqual(gob.ac_![0].dmg);
    f.feats[0] = { ...f.feats[0], altL: '' };
    expect(forgeToMonster(f, 'c-5', srd.sp).ac_![0].alt).toBeUndefined();
  });
  it('ida y vuelta de un monstruo del SRD conserva su mecánica', () => {
    const lich = srd.m.find((m) => m.id === 'lich')!;
    const back = forgeToMonster(monsterToForge(lich, srd.sp), 'c-2', srd.sp);
    expect(back.lr).toBe(lich.lr);
    expect(back.sv).toEqual(lich.sv);
    expect(back.ac_!.map((f) => f.n)).toEqual(lich.ac_!.map((f) => f.n));
    expect(back.ac_!.find((f) => f.sp)?.sp?.length).toBe(lich.ac_!.find((f) => f.sp)?.sp?.length);
  });
});

describe('guardado e importación', () => {
  it('repara datos corruptos sin lanzar', () => {
    const s = normalizeSaved({ custom: [null, { n: 1 }, { n: 'Ok', ab: [1, 2, 3, 4, 5, 6] }], roster: 'x', combatants: [{ id: 'a', kind: 'pc', name: 'X', hp: '7', conds: ['Derribado'] }, { id: 'b' }], activeId: 'zzz' });
    expect(s.custom.map((m) => m.n)).toEqual(['Ok']);
    expect(s.roster).toEqual([]);
    expect(s.combatants).toHaveLength(1);
    expect(s.combatants[0].hp).toBe(7);
    expect(s.combatants[0].conds[0]).toEqual({ k: 'Derribado', r: null });
    expect(s.activeId).toBeNull();
  });
  it('importar fusiona por id y nombre y descarta registros dañados', () => {
    const cur = { ...emptySaved(), roster: [{ id: 'r1', name: 'Jimena', player: '', cls: '', level: '5', ac: '16', hp: '38', initb: '2', pp: '13', res: [] }] };
    const r = mergeImport(JSON.stringify({ roster: [{ id: 'r9', name: 'jimena', hp: '40' }, { name: 'Nube' }, { bad: 1 }], custom: [{ n: 'Roto' }] }), cur);
    expect(r.ok).toBe(true);
    expect(r.roster!.map((x) => x.name)).toEqual(['jimena', 'Nube']);
    expect(r.message).toMatch(/descartado 2/);
  });
  it('exportar e importar es reversible', () => {
    const cur = normalizeSaved({ roster: [{ id: 'r1', name: 'A' }], combatants: [{ id: 'p', kind: 'pc', name: 'A', hp: 5, maxHp: 5 }] });
    const r = mergeImport(JSON.stringify(buildExport(cur)), emptySaved());
    expect(r.roster).toHaveLength(1);
    expect(r.combat?.combatants).toHaveLength(1);
  });
  it('las criaturas del Manual van en la copia solo si se piden y sustituyen a las del mismo id', () => {
    const mk = (id: string, n: string) => ({ id, n, sz: 'Grande', t: 'autómata', al: 'neutral', ac: 14, hp: 45, hd: '6d10+12', ini: 1, spd: '9 m', ab: [18, 12, 15, 3, 10, 1], sv: [4, 1, 2, -4, 0, -5], vul: [], res: [], imm: [], ci: [], pp: 10, cr: '3', xp: 700, pb: 2 });
    const cur = emptySaved();
    expect(buildExport(cur).book).toBeUndefined();
    const file = buildExport(cur, undefined, [mk('mm-golem', 'Gólem revisado'), { bad: 1 } as never, mk('no-mm', 'Intruso')]);
    const r = mergeImport(JSON.stringify(file), { ...cur, book: [mk('mm-golem', 'Gólem sin revisar'), mk('mm-otro', 'Otro')] as never });
    expect(r.book!.map((m) => m.n)).toEqual(['Otro', 'Gólem revisado']);
    expect(r.custom).toEqual([]);
    expect(r.message).toMatch(/1 criaturas de tu Manual/);
    expect(mergeImport(JSON.stringify(buildExport(cur)), cur).book).toBeUndefined();
  });
  it('rechaza archivos que no son copias', () => {
    expect(mergeImport('no json', emptySaved()).ok).toBe(false);
    expect(mergeImport('{"a":1}', emptySaved()).ok).toBe(false);
  });
});

describe('esquema v4: encuentros y duración de estados', () => {
  it('migra datos v3 sin encuentros y conserva las duraciones nuevas', () => {
    const s = normalizeSaved({ v: 3, combatants: [{ id: 'a', kind: 'monster', name: 'G', conds: [{ k: 'Asustado', r: 2, at: 'end', by: 'j', sk: 1 }, { k: 'Cegado', r: 'x', at: 'raro' }] }] });
    expect(s.v).toBe(4);
    expect(s.encounters).toEqual([]);
    expect(s.combatants[0].conds).toEqual([{ k: 'Asustado', r: 2, at: 'end', by: 'j', sk: 1 }, { k: 'Cegado', r: 1 }]);
  });
  it('descarta encuentros dañados y limita cantidades', () => {
    const s = normalizeSaved({ encounters: [{ id: 'e1', name: 'Puente', items: [{ monsterId: 'goblin-warrior', qty: 99 }, { qty: 2 }] }, { name: '', items: [] }, { name: 'Vacío', items: [] }] });
    expect(s.encounters).toEqual([{ id: 'e1', name: 'Puente', items: [{ monsterId: 'goblin-warrior', qty: 20, inLair: false }], lair: false }]);
  });
  it('las copias llevan los encuentros y se fusionan por id', () => {
    const cur = { ...emptySaved(), encounters: [{ id: 'e1', name: 'Viejo', items: [{ monsterId: 'x', qty: 1, inLair: false }], lair: false }] };
    const file = JSON.stringify(buildExport({ ...emptySaved(), encounters: [{ id: 'e1', name: 'Nuevo', items: [{ monsterId: 'y', qty: 2, inLair: true }], lair: true }] }));
    const r = mergeImport(file, cur);
    expect(r.encounters!.map((e) => e.name)).toEqual(['Nuevo']);
    expect(r.message).toContain('1 encuentros');
  });
});

describe('fichas de jugador: notas y hoja en PDF', () => {
  const pc = { id: 'r1', name: 'Jimena', notes: 'Odia a los goblins', pdf: { id: 'pdf-1', name: 'jimena.pdf', size: 1234 } };
  it('conserva notas y referencia al PDF, y repara datos dañados', () => {
    const s = normalizeSaved({ roster: [pc, { id: 'r2', name: 'Nube', pdf: { name: 'x' } }] });
    expect(s.roster[0].notes).toBe('Odia a los goblins');
    expect(s.roster[0].pdf).toEqual({ id: 'pdf-1', name: 'jimena.pdf', size: 1234 });
    expect(s.roster[1].pdf).toBeNull();
    expect(s.roster[1].notes).toBe('');
  });
  it('las copias llevan los PDF y al importar solo se aceptan los de sus jugadores', () => {
    const file = buildExport({ ...emptySaved(), roster: normalizeSaved({ roster: [pc] }).roster }, { 'pdf-1': 'JVBERi0xLjQK', 'otro': 'JVBERi0xLjQK' });
    expect(Object.keys(file.pdfs!)).toEqual(['pdf-1', 'otro']);
    const r = mergeImport(JSON.stringify({ ...file, pdfs: { 'pdf-1': 'JVBERi0xLjQK', 'otro': 'JVBERi0xLjQK', 'malo': 'xxx' } }), emptySaved());
    expect(Object.keys(r.pdfs!)).toEqual(['pdf-1']);
    // si la copia no trae el PDF de un jugador, el jugador se importa sin hoja
    const r2 = mergeImport(JSON.stringify({ ...file, pdfs: {} }), emptySaved());
    expect(r2.roster![0].pdf).toBeNull();
  });
});
