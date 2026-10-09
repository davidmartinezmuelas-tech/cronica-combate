import { describe, expect, it } from 'vitest';
import type { Line } from '../engine/bookImport';
import { abilityRow, cleanOcr, damageIn, fixDice, parseMonsters, parseTypeLine } from '../engine/monsterImport';

// Criaturas inventadas con el formato de las fichas 2024 en español (y errores típicos de OCR)
const lines = (col: number, ts: string[], y0 = 800): Line[] => ts.map((t, i) => ({ t, col, y: y0 - i * 12 }));

const GOLEM = [
  'GÓLEM DE QUESO',
  'Autómata Grande, sin alineamiento',
  'CA: 14 Iniciativa: +1 (11)',
  'PC: 45 (6d10 + 12)',
  'Velocidad: 9 m',
  'MOD. SALV. MOO. SALV. MOD SALV',
  'FUE 18 +4 +4 DES 12 +1 +1 CON 15 +2 +5',
  'INT 3 -4 -4 SAB 10 +0 +0 CAR 1 -5 -5',
  'Inmunidades: veneno, psíquico; envenenado, hechizado',
  'Sentidos: visión en la oscuridad 18 m; Percepción pasiva 10',
  'Idiomas: entiende común, pero no puede hablar',
  'VD: 3 (700 px; BC +2)',
  'ATRIBUTOS',
  'Forma pegajosa. EI gólem se adhiere a lo que toca.',
  'ACCIONES',
  'Ataque múltiple. EI gólem realiza dos ataques de puñetazo.',
  'Puñetazo. Tirada de ataque cuerpo a cuerpo: +6, alcance 1,5 m.',
  'Acierto: 11 (Id 12 + 4) de daño contundente más 3 (Id6) de',
  'daño contundente si el objetivo está derribado.',
  'Lluvia de migas (recarga 5—6). Tirada de salvación de Destreza:',
  'CD 1 3, todas las criaturas en un cono de 4,5 m. Fallo: 14',
  '(4d6) de daño de ácido. Éxito: la mitad del daño.',
];

describe('importar el Manual de Monstruos', () => {
  it('lee la línea de tipo, tamaño y alineamiento', () => {
    expect(parseTypeLine('Dragón Enorme (cromático), legal malvado')).toEqual({ t: 'dragón (cromático)', sz: 'Enorme', al: 'legal malvado' });
    expect(parseTypeLine('Humanoide Mediano o Pequeño (cualquier especie), neutral')?.sz).toBe('Mediano o Pequeño');
    expect(parseTypeLine('Los arbustos crecen, despacio')).toBeNull();
  });

  it('corrige los dados con la media que da el texto', () => {
    expect(fixDice(60, '1 Id 10')).toBe('11d10');
    expect(fixDice(9, 'Id 10 + 4')).toBe('1d10+4');
    expect(fixDice(4, 'Id4 +')).toBe('1d4+2');
    expect(fixDice(55, '10dg + 10')).toBe('10d8+10');
  });

  it('saca los daños y el condicional', () => {
    const r = damageIn('Acierto: 5 (Id6 + 2) de daño cortante más 2 (I d4) de daño cortante si la tirada de ataque tenía ventaja.');
    expect(r.parts).toEqual([{ expr: '1d6+2', type: 'cortante', cond: '' }, { expr: '1d4', type: 'cortante', cond: 'si la tirada de ataque tenía ventaja' }]);
    expect(r.text).toContain('5 (1d6 + 2) de daño cortante');
  });

  it('lee la tabla de características aunque falten números', () => {
    const ab: (number | null)[] = Array(6).fill(null), sv: (number | null)[] = Array(6).fill(null);
    abilityRow('FUE 21 +5 +5 DEs 9 CON 15', ab, sv);
    abilityRow('INT 10 +0 40 SAB -1 CAR 8', ab, sv);
    expect(ab).toEqual([21, 9, 15, 10, 8, 8]);
    expect(sv).toEqual([5, -1, 2, 0, -1, -1]);
  });

  it('arregla «EI» y las CD partidas', () => {
    expect(cleanOcr('EI dragón (3 Idía) CD 1 6')).toBe('El dragón (3/día) CD 16');
  });

  it('monta la ficha completa', () => {
    const [m] = parseMonsters(lines(0, GOLEM));
    expect(m).toMatchObject({ id: 'mm-golem-de-queso', n: 'Gólem de queso', t: 'autómata', sz: 'Grande', ac: 14, hp: 45, hd: '6d10+12', ini: 1, cr: '3', xp: 700, pb: 2, pp: 10 });
    expect(m.ab).toEqual([18, 12, 15, 3, 10, 1]);
    expect(m.sv[2]).toBe(5);
    expect(m.imm).toEqual(['veneno', 'psíquico']);
    expect(m.ci).toEqual(['envenenado', 'hechizado']);
    expect(m.tr?.map((f) => f.n)).toEqual(['Forma pegajosa']);
    const [multi, punch, breath] = m.ac_!;
    expect(multi.n).toBe('Ataque múltiple');
    expect(punch).toMatchObject({ n: 'Puñetazo', atk: 6, dmg: [['1d12+4', 'contundente']] });
    expect(punch.alt?.[0]).toEqual({ l: 'si el objetivo está derribado', dmg: [['1d12+4', 'contundente'], ['1d6', 'contundente']] });
    expect(breath).toMatchObject({ n: 'Lluvia de migas', rc: 5, dc: [13, 'DES'], half: 1, dmg: [['4d6', 'ácido']] });
    expect(breath.d).toContain('\nFallo: 14 (4d6) de daño de ácido.');
  });

  it('salta pies de ilustración, pies de página y la ambientación que sigue', () => {
    const block = [...GOLEM.slice(0, 16), 'UN GÓLEM DE QUESO', 'EN SU QUESERÍA', ...GOLEM.slice(16), '42 GÓLEMS', 'GÓLEM DE QUESO VIEJO', 'Los gólems viejos huelen fatal y nadie sabe por qué.'];
    const [m] = parseMonsters(lines(0, block));
    expect(m.ac_?.map((f) => f.n)).toEqual(['Ataque múltiple', 'Puñetazo', 'Lluvia de migas']);
    expect(m.ac_![2].d).not.toContain('huelen');
  });

  it('nombre en dos líneas, resistencia y acciones legendarias, conjuros y hábitat', () => {
    const ls = lines(0, [
      'Hábitat: colina, montaña Tesoro: reliquias',
      'DRAGÓN',
      'MORADO ADULTO',
      'Dragón Enorme (cromático), caótico neutral',
      'CA: 18 Iniciativa: +9 (19)',
      'PG: 200 (16d12 + 96)',
      'FUE 23 +6 +6 DES 10 +0 +5 CON 22 +6 +6',
      'VD: 15 (13 000 px 0 15 000 en la guarida; BC +5)',
      'ATRIBUTOS',
      'Resistencia legendaria (3/día 0 4/día en la guarida). El dra-',
      'gón puede elegir tener éxito en una tirada de salvación.',
      'ACCIONES',
      'Lanzamiento de conjuros. El dragón lanza uno de los siguien-',
      'tes conjuros (CD de salvación de conjuros 18):',
      'A voluntad: detectar magia, luz',
      '1/día cada uno: conjuro inventado',
      'ACCIONES LEGENDARIAS',
      'Usos de acciones legendarias: 3 (4 en la guarida). Justo después',
      'del turno de otra criatura, el dragón puede emplear un uso.',
      'Coletazo. El dragón realiza un ataque de desgarro.',
    ]);
    const [m] = parseMonsters(ls, { 'detect-magic': { n: 'Detectar magia' } as never });
    expect(m).toMatchObject({ n: 'Dragón morado adulto', lr: 3, lrl: 4, la: 3, lair: 1, xpl: 15000, hab: ['colina', 'montaña'] });
    expect(m.tr?.[0]).toMatchObject({ n: 'Resistencia legendaria', day: 3, dayl: 4, isLR: 1 });
    expect(m.tr?.[0].d).toContain('El dragón puede');
    expect(m.ac_?.[0]).toMatchObject({ sdc: 18, sp: [['detect-magic', 'a voluntad', 'Detectar magia'], ['x:luz', 'a voluntad', 'Luz'], ['x:conjuro inventado', '1/día', 'Conjuro inventado']] });
    expect(m.lg?.map((f) => f.n)).toEqual(['Coletazo']);
  });

  it('la ficha sigue en la otra columna tras la ambientación', () => {
    const ls = [
      ...lines(0, GOLEM.slice(0, 16)),
      ...lines(1, ['los gólems de queso suelen vivir en cuevas frescas.', 'Nadie sabe quién los fabricó.', 'ACCIONES ADICIONALES', 'Rodar. El gólem se mueve hasta su velocidad.']),
    ];
    const [m] = parseMonsters(ls);
    expect(m.ac_?.[0].d).not.toContain('cuevas');
    expect(m.ba?.map((f) => f.n)).toEqual(['Rodar']);
  });
});
