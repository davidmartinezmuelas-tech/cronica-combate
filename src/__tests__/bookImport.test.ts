import { describe, expect, it } from 'vitest';
import { classifyPage, isCaps, isTitle, nameBackgrounds, pageLines, parseBackgrounds, parseFeats, parseSpells, type Line } from '../engine/bookImport';

// Libro inventado: misma estructura que el Manual del Jugador 2024 en español (títulos en mayúsculas, línea de
// tipo debajo, campos con dos puntos), con nombres y textos de ejemplo.
const L = (...t: string[]): Line[] => t.map((s, i) => ({ t: s, col: 0, y: 1000 - i * 20 }));

describe('importar el libro del usuario (OCR)', () => {
  it('reconstruye líneas por columna y descarta cabeceras, números y letras sueltas', () => {
    const items = [
      { str: 'TÍTULO', x: 80, y: 900 }, { str: 'de la izquierda', x: 160, y: 901 },
      { str: 'segunda línea', x: 80, y: 880 },
      { str: 'derecha uno', x: 576, y: 900 }, { str: 'derecha dos', x: 576, y: 880 }, { str: 'tres', x: 576, y: 860 },
      { str: 'continúa', x: 510, y: 880 }, // línea larga de la izquierda que pasa de la mitad
      { str: '248', x: 26, y: 48 }, { str: 'CAPÍTULO 7 | CONJUROS', x: 109, y: 51 }, { str: 'l', x: 300, y: 700 },
    ];
    expect(pageLines(items, 1073).map((l) => [l.col, l.t])).toEqual([
      [0, 'TÍTULO de la izquierda'], [0, 'segunda línea continúa'], [1, 'derecha uno'], [1, 'derecha dos'], [1, 'tres'],
    ]);
  });

  it('una palabra pegada a la izquierda que cruza la mitad sigue en la izquierda; las barras del margen se descartan', () => {
    const items = [
      { str: '|', x: 70, y: 900 }, { str: 'Campo: Fuerza, Destreza y', x: 80, y: 900, w: 470 }, { str: 'Sabiduría', x: 552, y: 900, w: 60 },
      { str: 'izquierda', x: 80, y: 880, w: 60 }, { str: ' ', x: 140, y: 880, w: 430 }, { str: 'DERECHA', x: 576, y: 880, w: 80 },
      { str: 'derecha uno', x: 576, y: 860 }, { str: 'derecha dos', x: 576, y: 840 },
    ];
    expect(pageLines(items, 1073).map((l) => [l.col, l.t])).toEqual([
      [0, 'Campo: Fuerza, Destreza y Sabiduría'], [0, 'izquierda'], [1, 'DERECHA'], [1, 'derecha uno'], [1, 'derecha dos'],
    ]);
  });

  it('títulos en mayúsculas, también con las mayúsculas estropeadas por el OCR', () => {
    expect(isCaps('BOLA DE ÁCIDO')).toBe(true);
    expect(isCaps('Una frase normal.')).toBe(false);
    expect(isTitle('MURO DE Hielo')).toBe(true);
    expect(isTitle('y el conjuro termina.')).toBe(false);
  });

  it('dotes con su tipo y requisitos (aunque ocupen dos líneas)', () => {
    const f = parseFeats(L(
      'SALTADOR VELOZ', 'Dote general (requisitos: nivel 4', 'o más, Destreza 13 o más)', 'Obtienes los siguientes beneficios.',
      'Mejora de característica. Aumenta tu Destreza en 1.', 'Salto. Saltas más lejos.',
      'VIGÍA', 'Dote de origen', 'Nunca te sorprenden.',
      'PUNTERÍA', 'Dote de estilo de combate (requisito: rasgo Estilo de combate)', 'Más precisión.',
    ));
    expect(f.map((x) => [x.n, x.cat, x.req])).toEqual([
      ['Saltador veloz', 'general', 'nivel 4 o más, Destreza 13 o más'], ['Vigía', 'origin', ''], ['Puntería', 'fighting-style', 'rasgo Estilo de combate'],
    ]);
    expect(f[0].d).toContain('Mejora de característica.');
  });

  it('conjuros: nivel, escuela (también «Ilusionismo»), clases, ficha y descripción; los pies de ilustración se descartan', () => {
    const s = parseSpells(L(
      'CHISPA AZUL', 'Truco de evocación (hechicero, mago)', 'Tiempo de lanzamiento: Acción', 'Alcance: 18 m', 'Componentes: V, S', 'Duración: Instantánea',
      'Lanzas una chispa.', 'UNA MAGA LANZA UNA CHISPA AZUL', 'Mejora del truco. Más daño.',
      'VELO DE NIEBLA', 'Ilusionismo de nivel 2 (bardo, brujo,', 'mago)', 'Tiempo de lanzamiento: Acción o ritual', 'Alcance: 9 m', 'Componentes: V, S, M (un poco de lana)',
      'Duración: Concentración, hasta 1 minuto', 'Una niebla te oculta.',
    ));
    expect(s.map((x) => [x.n, x.l, x.esc, x.classes, x.c, x.rit])).toEqual([
      ['Chispa azul', 0, 'Evocación', ['sorcerer', 'wizard'], 0, 0],
      ['Velo de niebla', 2, 'Ilusionismo', ['bard', 'warlock', 'wizard'], 1, 1],
    ]);
    expect(s[1].cmp).toBe('V, S, M (un poco de lana)');
    expect(s[0].t).not.toContain('UNA MAGA');
  });

  it('trasfondos: campos, y nombre deducido por el orden alfabético si el OCR no lo leyó', () => {
    const b = parseBackgrounds(L(
      'ANIMADOR', 'Puntuaciones de característica: Fuerza, Destreza, Carisma', 'Dote: Músico (consulta el capítulo 5)',
      'Competencias en habilidades: Acrobacias e Interpretación', 'Competencia con herramientas: un instrumento', 'Equipo: elige A o B: (A) laúd y 11 po, o (B) 50 po',
      'Te gusta el escenario.',
      'Puntuaciones de característica: Fuerza, Destreza, Inteligencia', 'Dote: Fabricante', 'Competencias en habilidades: Investigación y Persuasión', 'Equipo: 50 po',
      'CAMPESINO', 'Puntuaciones de característica: Fuerza, Constitución, Sabiduría', 'Dote: Duro', 'Competencias en habilidades: Trato con animales y Naturaleza', 'Equipo: 50 po',
    ));
    expect(b.map((x) => [x.n, x.abil, x.skills, x.feat])).toEqual([
      ['Animador', ['str', 'dex', 'cha'], ['acr', 'prf'], 'Músico'],
      ['Artesano', ['str', 'dex', 'int'], ['inv', 'per'], 'Fabricante'],
      ['Campesino', ['str', 'con', 'wis'], ['ani', 'nat'], 'Duro'],
    ]);
    expect(b[0].equip).toBe('elige A o B: (A) laúd y 11 po, o (B) 50 po');
    expect(b[0].d).toBe('Te gusta el escenario.');
    const cut = [{ n: 'Comercian' }];
    nameBackgrounds(cut);
    expect(cut[0].n).toBe('Comerciante');
  });

  it('reconoce qué páginas interesan', () => {
    expect(classifyPage('… Dote general (requisitos …')).toEqual(['feats']);
    expect(classifyPage('Puntuaciones de característica: …')).toEqual(['backgrounds']);
    expect(classifyPage('Tiempo de lanzamiento: Acción')).toEqual(['spells']);
    expect(classifyPage('Capítulo de combate')).toEqual([]);
  });
});

describe('nombres', () => {
  it('mayúscula inicial y nombres propios', async () => {
    const { titleCase } = await import('../engine/bookImport');
    expect(titleCase('ARMADURA DE AGATHYS')).toBe('Armadura de Agathys');
    expect(titleCase('“TERROR')).toBe('Terror');
    expect(titleCase('CALDERO BURBUJEANTE DE TASHA')).toBe('Caldero burbujeante de Tasha');
  });
});

describe('subclases', () => {
  it('por clase, con sus rasgos; los pies de ilustración y los títulos cortados no abren otra; sin título si el OCR no lo leyó', async () => {
    const { parseSubclasses } = await import('../engine/bookImport');
    const lines = L(
      'NIVEL 3: RASGO DE LA CLASE BASE', 'Esto es de la clase, no de una subclase.',
      'SUBCLASES DE BÁRBARO',
      'SENDA DEL VIENTO', 'Corre como el viento.',
      'NIVEL 3: PASO LIGERO', 'Te mueves más.', 'SUBCLASE DE LA', 'SENDA DEL TRUENO', 'NIVEL 3: SALTO', 'Saltas más.',
      'NIvEL 6: RÁFAGA', 'Empujas.', 'NIVEL 10: TORNADO', 'Giras.',
      'SENDA DEL', // título cortado: no cuenta
      'SENDA DEL TRUENO', 'Retumba.', 'NIVEL 3: ESTRUENDO', 'Ruido.', 'Nrivel 14: TEMPESTAD', 'Mucho ruido.',
      'NIVEL 3: GARRAS', 'Sin título legible.', 'NIVEL 6: ZARPAZO', 'Más garras.',
      'RASGOS DE BARDO', 'NIVEL 3: OTRA COSA', 'De la clase bardo.',
    );
    const s = parseSubclasses(lines);
    expect(s.map((x) => [x.cls, x.n, x.f.map((f) => f.lv + ' ' + f.n)])).toEqual([
      ['barbarian', 'Senda del viento', ['3 Paso ligero', '3 Salto', '6 Ráfaga', '10 Tornado']],
      ['barbarian', 'Senda del trueno', ['3 Estruendo', '14 Tempestad']],
      ['barbarian', 'Subclase de barbaro sin título 1', ['3 Garras', '6 Zarpazo']],
    ]);
    expect(s[0].d).toBe('Corre como el viento.');
  });

  it('la que quedó sin título toma el nombre que enumeran los rasgos de la clase', async () => {
    const { parseSubclasses, introNames } = await import('../engine/bookImport');
    const core = 'Elige una subclase. Las opciones (Senda del viento, Senda de la roca y Senda del trueno) se detallan tras la tabla. Senda única aparte.';
    expect(introNames('barbarian', core)).toEqual(['Senda del viento', 'Senda de la roca', 'Senda del trueno']);
    const s = parseSubclasses(L(
      'RASGOS DE BÁRBARO', 'NIVEL 1: FURIA 2 +2 SENDA DE TABLA', 'Elige una subclase. Las opciones (Senda del viento,', 'Senda de la roca y Senda del trueno) se detallan después.',
      'SUBCLASES DE BÁRBARO', 'SENDA DEL VIENTO', 'NIVEL 3: PASO', 'Rápido.', 'NIVEL 6: RÁFAGA', 'Más.',
      'NIVEL 3: PIEDRA', 'Duro.', 'NIVEL 6: MURO', 'Más duro.',
    ));
    expect(s.map((x) => x.n)).toEqual(['Senda del viento', 'Senda de la roca']);
  });
});
