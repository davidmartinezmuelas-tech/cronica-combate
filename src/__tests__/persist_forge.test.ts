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
