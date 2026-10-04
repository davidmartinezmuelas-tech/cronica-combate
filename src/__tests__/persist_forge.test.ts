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
    expect(srd.m.flatMap((m) => m.ac_ || []).filter((f) => f.alt)).toHaveLength(15);
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
