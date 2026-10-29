import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Monster, SrdData } from '../data/types';
import { extractBlocks, parseCreature, planBlocks } from '../engine/scriptBlocks';
import { normMonster } from '../store/persist';

const srd = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/srd52_es.json'), 'utf8')) as SrdData;
const F = '```';

const VIEJO = [
  F + 'criatura', 'formato: 1', 'nombre: El Viejo del Foso', 'tamaño: Enorme', 'tipo: monstruosidad', 'alineamiento: sin alineamiento', 'CA: 17', 'PG: 120 (12d12+42)', 'iniciativa: +0',
  'velocidad: 30 pies, nadar 40 pies', 'características: FUE 20, DES 10, CON 17, INT 2, SAB 12, CAR 5', 'salvaciones: -', 'habilidades: Sigilo +3', 'vulnerabilidades: radiante', 'resistencias: fuego', 'inmunidades: -',
  'inmunidades a estados: -', 'sentidos: visión en la oscuridad 60 pies', 'percepción pasiva: 11', 'idiomas: -', 'CR: 6', 'XP: 2300', 'competencia: +3', '',
  'rasgos:', '- **Anfibio.** Se mueve igual de rápido en agua que en tierra.', '- **Frío antinatural.** En 15 pies hace más frío. [inicio]', '',
  'acciones:', '- **Multiataque.** Realiza un Mordisco y un Coletazo.',
  '- **Mordisco.** Ataque cuerpo a cuerpo: +8. Impacto: 16 (2d10 + 5) de daño perforante. [atq +8; daño 2d10+5 perforante; cd 16 FUE]',
  '- **Aliento helado (recarga 5-6).** Exhala un cono de 30 pies.', '  Cada criatura hace una salvación de Constitución CD 15.', '  - Fallo: 36 (8d8) de daño de frío.',
  '  - Éxito: la mitad del daño. [recarga 5-6; daño 8d8 frío; cd 15 CON; mitad]', F,
].join('\n');

const LICH = [
  F + 'criatura', 'formato: 1', 'nombre: Lich menor', 'tamaño: Mediano', 'tipo: no muerto', 'CA: 17', 'PG: 135 (18d8+54)', 'velocidad: 30 pies',
  'características: FUE 11, DES 16, CON 16, INT 20, SAB 14, CAR 16', 'salvaciones: CON +10, INT +12, SAB +9', 'resistencias: frío, necrótico', 'CR: 10', 'XP: 5900', 'competencia: +4',
  'guarida: sí', 'XP en guarida: 7200', 'resistencia legendaria: 3 (4 en guarida)', 'acciones legendarias por turno: 3', '',
  'conjuros: INT; CD 20; ataque +12', '- a voluntad: rayo de escarcha, mano de mago', '- 3/día: bola de fuego, conjuro inventado', '- 1/día cada uno: dedo de la muerte', '',
  'acciones:', '- **Toque paralizante.** Ataque: +9. [atq +9; daño 3d6 frío; alt(si está Paralizado): 6d6 frío; cd 18 CON]', '',
  'acciones legendarias:', '- **Toque paralizante.** Usa Toque paralizante. [coste 2]', '',
  'acciones de guarida:', '- **Oleada de frío.** Salvación de Constitución CD 18 o sufre 2d8 de daño de frío. [daño 2d8 frío; cd 18 CON; mitad]', F,
].join('\n');

const ENC = [F + 'encuentro', 'formato: 1', 'nombre: Ronda de cobro', 'guarida: no', 'notas: sale a la ronda 2', '  si oye ruido', '- 2 x El Viejo del Foso', '- 3 x Guerrero goblin', '- 1 x Fantasma de la nada', F].join('\n');

const spells = srd.sp;
const ctx = { spells, custom: [] as Monster[], all: srd.m, encounters: [] };

describe('bloques de combate en el guion', () => {
  it('encuentra los bloques «encuentro» y «criatura»', () => {
    expect(extractBlocks('# Hola\n' + ENC + '\ntexto\n' + VIEJO).map((b) => b.kind)).toEqual(['encuentro', 'criatura']);
  });

  it('lee una ficha completa con el formato de la app', () => {
    const { monster: m, warnings } = parseCreature(extractBlocks(VIEJO)[0].body, spells);
    expect(warnings).toEqual([]);
    expect(m).toMatchObject({ n: 'El Viejo del Foso', sz: 'Enorme', t: 'monstruosidad', ac: 17, hp: 120, hd: '12d12+42', ini: 0, spd: '30 pies, nadar 40 pies', ab: [20, 10, 17, 2, 12, 5], vul: ['radiante'], res: ['fuego'], imm: [], ci: [], sk: 'Sigilo +3', pp: 11, cr: '6', xp: 2300, pb: 3, lang: '—' });
    expect(m!.sv).toEqual([5, 0, 3, -4, 1, -3]); // sin competencia: el modificador
    expect(m!.tr!.map((f) => f.n)).toEqual(['Anfibio', 'Frío antinatural']);
    expect(m!.tr![1].sot).toBe(1);
    expect(m!.ac_![1]).toMatchObject({ n: 'Mordisco', atk: 8, dmg: [['2d10+5', 'perforante']], dc: [16, 'FUE'] });
    // nombre con «(recarga 5-6)»: la recarga pasa a su campo y la descripción conserva sus líneas
    const aliento = m!.ac_![2];
    expect(aliento).toMatchObject({ n: 'Aliento helado', rc: 5, half: 1, dc: [15, 'CON'], dmg: [['8d8', 'frío']] });
    expect(aliento.d).toContain('\n- Fallo: 36 (8d8) de daño de frío.');
    // la ficha sobrevive a la normalización que se aplica al guardar y al importar copias
    expect(normMonster(m)!.ac_![2].rc).toBe(5);
  });

  it('conjuros, legendarias, guarida y datos de guarida', () => {
    const { monster: m, warnings } = parseCreature(extractBlocks(LICH)[0].body, spells);
    expect(m).toMatchObject({ lair: 1, xpl: 7200, lr: 3, lrl: 4, la: 3, pb: 4, sv: [0, 3, 10, 12, 9, 3] });
    expect(m!.ac_![0]).toMatchObject({ n: 'Lanzamiento de conjuros', sdc: 20, satk: 12 });
    expect(m!.ac_![0].sp!.map((s) => s[1])).toEqual(['a voluntad', 'a voluntad', '3/día', '3/día', '1/día']);
    expect(m!.ac_![0].sp![2][0]).toBe('fireball'); // resuelto por nombre en español
    expect(m!.ac_![1].alt).toEqual([{ l: 'si está Paralizado', dmg: [['6d6', 'frío']] }]);
    expect(m!.lg![0]).toMatchObject({ n: 'Toque paralizante', cost: 2 });
    expect(m!.lairActions![0]).toMatchObject({ n: 'Oleada de frío', half: 1, dc: [18, 'CON'] });
    expect(m!.tr!.find((f) => f.n === 'Resistencia legendaria')).toMatchObject({ day: 3, dayl: 4 });
    expect(warnings).toEqual(expect.arrayContaining([expect.stringContaining('conjuro no encontrado, se deja como texto: «conjuro inventado»')]));
    expect(normMonster(m)!.lairActions).toHaveLength(1); // el campo nuevo sobrevive a la normalización
  });

  it('un bloque sin lo imprescindible o de un formato nuevo no se carga y avisa', () => {
    expect(parseCreature('nombre: X\nCA: 10', spells).monster).toBeNull();
    expect(parseCreature('formato: 2\nnombre: X', spells)).toEqual({ monster: null, warnings: ['formato 2 no soportado (esta app entiende el 1)'] });
  });

  it('el plan crea criaturas y encuentros, resuelve nombres del SRD y avisa de los que no existen', () => {
    const plan = planBlocks([VIEJO, ENC].join('\n\n'), ctx);
    expect(plan.creatures.map((c) => [c.monster.id, c.action])).toEqual([['c-md-el-viejo-del-foso', 'crear']]);
    const e = plan.encounters[0];
    expect(e.enc).toMatchObject({ id: 'e-md-ronda-de-cobro', name: 'Ronda de cobro', lair: false });
    expect(e.enc.items).toEqual([{ monsterId: 'c-md-el-viejo-del-foso', qty: 2, inLair: false }, { monsterId: 'goblin-warrior', qty: 3, inLair: false }]);
    expect(e.warnings).toEqual(['criatura no encontrada: «Fantasma de la nada». Defínela con un bloque «criatura» o escribe su nombre como en el bestiario.']);
  });

  it('es idempotente: una criatura propia con el mismo nombre se actualiza con su id y el encuentro igual', () => {
    const first = planBlocks([VIEJO, ENC].join('\n\n'), ctx);
    const custom = [{ ...first.creatures[0].monster, id: 'c-vaer-viejo', n: 'el viejo del foso' }];
    const again = planBlocks([VIEJO, ENC].join('\n\n'), { ...ctx, custom, all: [...custom, ...srd.m], encounters: [{ ...first.encounters[0].enc, id: 'e-viejo' }] });
    expect(again.creatures[0]).toMatchObject({ action: 'actualizar', monster: { id: 'c-vaer-viejo' } });
    expect(again.encounters[0]).toMatchObject({ action: 'actualizar', enc: { id: 'e-viejo' } });
    expect(again.encounters[0].enc.items[0].monsterId).toBe('c-vaer-viejo');
  });

  it('tolerancia: un bloque roto no bloquea los demás', () => {
    const roto = [F + 'criatura', 'nombre: Roto', F].join('\n');
    const plan = planBlocks([roto, VIEJO].join('\n\n'), ctx);
    expect(plan.creatures).toHaveLength(1);
    expect(plan.warnings[0]).toContain('No se carga');
  });
});
