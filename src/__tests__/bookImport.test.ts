import { describe, expect, it } from 'vitest';
import { attachTables, fixDice, fixOcr, classifyPage, isCaps, isTitle, nameBackgrounds, pageLines, parseBackgrounds, levelTable, parseClassTable, parseClasses, parseFeats, parseFeatsEn, parseSpeciesEn, parseSpells, parseSubclasses, parseSubclassesEn, resolveSubSpells, titleCaseEn, repairCounts, subclassNamesIn, type Line } from '../engine/bookImport';

// Libro inventado: misma estructura que el Manual del Jugador 2024 en español (títulos en mayúsculas, línea de
// tipo debajo, campos con dos puntos), con nombres y textos de ejemplo.
const L = (...t: string[]): Line[] => t.map((s, i) => ({ t: s, col: 0, y: 1000 - i * 20 }));

describe('importar el libro del usuario (OCR)', () => {
  it('corrige otros fallos frecuentes del OCR (ceros, la o, metros pegados, iconos sueltos)', () => {
    expect(fixOcr('su velocidad pasará a ser O para el resto; velocidad de O hasta el final; se reduzcan a O o que el familiar se retire')).toBe('su velocidad pasará a ser 0 para el resto; velocidad de 0 hasta el final; se reduzcan a 0 o que el familiar se retire');
    expect(fixOcr('lobos, serpientes O aves; termine O hasta que')).toBe('lobos, serpientes o aves; termine o hasta que');
    expect(fixOcr("a 9 mo menos de ti; 3'm; un objetivo l no voluntario; el 420; Adgquieres; gastar de la 5 puntos")).toBe('a 9 m o menos de ti; 3 m; un objetivo no voluntario; el d20; Adquieres; gastar de 1 a 5 puntos');
    expect(fixOcr('mide 30 m y 1 mochila o 2 l de agua')).toBe('mide 30 m y 1 mochila o 2 de agua'.replace('2 de', '2 l de'));
  });

  it('corrige los dados que el OCR lee con un 4 en lugar de la d', () => {
    expect(fixDice('tira 2420 y anota; 1410 + 3 de daño; 1412 (Enorme); 1420 y 3410')).toBe('tira 2d20 y anota; 1d10 + 3 de daño; 1d12 (Enorme); 1d20 y 3d10');
    expect(fixDice('dl0 y dI2 de daño')).toBe('d10 y d12 de daño');
    // números sueltos, años y precios no se tocan
    expect(fixDice('146 criaturas, el año 1420 po, 5420 y 14200')).toBe('146 criaturas, el año 1420 po, 5d20 y 14200');
  });

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

  it('apartado de opciones tras los rasgos, nombres partidos en dos líneas y fin en la tabla de la clase siguiente', async () => {
    const { parseSubclasses } = await import('../engine/bookImport');
    const s = parseSubclasses(L(
      'SUBCLASES DE BÁRBARO', 'SENDA DEL VIENTO', 'NIVEL 3: CONJUROS DEL', 'DE LA BRISA', 'Siempre preparados.', 'NIVEL 6: RÁFAGA', 'MEJORADA', 'Más.',
      'OPCIONES DE SOPLIDOS', 'Van en orden alfabético.', 'Alfa. Uno.', 'Beta. Dos.',
      'ATRIBUTOS BÁSICOS DE BARDO', 'Esto ya es del bardo.',
    ));
    expect(s[0].f.map((f) => f.n)).toEqual(['Conjuros del de la brisa', 'Ráfaga mejorada']);
    expect(s[0].x).toEqual([{ n: 'Opciones de soplidos', d: 'Van en orden alfabético.\n\nAlfa. Uno.\n\nBeta. Dos.' }]);
    expect(s[0].f[1].d).toBe('Más.');
  });

  it('las páginas sin nada reconocible entre dos de clases también son de clases', async () => {
    const { fillClassGaps } = await import('../engine/bookImport');
    expect(fillClassGaps([[], ['classes'], [], ['classes'], [], ['spells']])).toEqual([[], ['classes'], ['classes'], ['classes'], [], ['spells']]);
  });
});

describe('conjuros con errores de OCR y en inglés', () => {
  const body = (...extra: string[]) => ['Tiempo de lanzamiento: Acción', 'Alcance: 18 m', 'Componentes: V, S', 'Duración: Instantáneo', ...extra];
  it('lee «nivel1», una escuela con una letra cambiada y una etiqueta mal escrita', () => {
    const s = parseSpells(L('ROCIADA DE COLOR', 'Hlusionismo de nivel1 (bardo, hechicero, mago)', ...body('Emites una ráfaga de luces.'), 'CÍRCULO', 'Conjuración de nivel 5 (mago)', 'Tiempo de lanzamieñto: 1 minuto', 'Alcance: 3 m', 'Componentes: V', 'Duración: 1 asalto', 'Trazas un círculo.'));
    expect(s.map((x) => [x.n, x.l, x.esc])).toEqual([['Rociada de color', 1, 'Ilusionismo'], ['Círculo', 5, 'Conjuración']]);
    expect(s[1].ct).toBe('1 minuto');
  });
  it('junta un título largo partido en dos líneas', () => {
    const s = parseSpells(L('SANCTASANCTÓRUM PRIVADO', 'DE MORDENKAINEN', 'Abjuración de nivel 4 (mago)', ...body('Haces una zona segura.')));
    expect(s.map((x) => x.n)).toEqual(['Sanctasanctórum privado de Mordenkainen']);
  });
  it('corrige un título mal leído con el nombre de las listas del libro', () => {
    const names = Array.from({ length: 40 }, (_, i) => 'Conjuro número ' + String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26)));
    const list = L(...names.map((n) => n + ' Abjuración'), 'Escudo Abjuración  C');
    const s = parseSpells(L('ESCUPO', 'Abjuración de nivel 1 (mago)', ...body('Una barrera.')), list);
    expect(s[0].n).toBe('Escudo');
  });
  it('quita el pie de ilustración mal leído antes de la descripción', () => {
    const s = parseSpells(L('FLECHA DE RELÁMPAGO', 'Transmutación de nivel 3 (explorador)', ...body('Esuocano conil', 'Cuando tu ataque acierte, el arma se transforma.')));
    expect(s[0].t).toBe('Cuando tu ataque acierte, el arma se transforma.');
  });
  it('lee la cabecera en inglés y guarda la escuela en español', () => {
    const s = parseSpells(L('FIREBALL', 'Level 3 Evocation (Sorcerer, Wizard)', 'Casting Time: Action', 'Range: 150 feet', 'Components: V, S, M (a ball of bat guano)', 'Duration: Instantaneous', 'A bright streak flashes.', 'SHOCKING GRASP', 'Evocation Cantrip (Sorcerer, Wizard)', 'Casting Time: Action', 'Range: Touch', 'Components: V, S', 'Duration: Instantaneous', 'Lightning springs from your hand.'));
    expect(s.map((x) => [x.n, x.l, x.esc, x.classes.join(',')])).toEqual([['Fireball', 3, 'Evocación', 'sorcerer,wizard'], ['Shocking Grasp', 0, 'Evocación', 'sorcerer,wizard']]);
    expect(s[0].r).toBe('45 m');
  });
  it('las subclases de nombre fijo se escriben bien aunque el OCR cambie una letra', async () => {
    const { parseSubclasses } = await import('../engine/bookImport');
    const s = parseSubclasses(L('SUBCLASES DE MAGO', 'ÁDIVINO', 'NIVEL 3: PRESAGIO', 'Ves.', 'NIVEL 6: OTRO', 'Más.'));
    expect(s[0].n).toBe('Adivino');
  });
});

describe('limpiar el final del texto de un objeto', () => {
  it('quita pie de página y pestañas del margen mal leídas, pero no tablas ni frases cortadas', async () => {
    const { cleanItemTail } = await import('../engine/itemImport');
    expect(cleanItemTail('Haces algo. Esta armadura no se ensucia nunca. BaBucHas DE TREPAR')).toBe('Haces algo. Esta armadura no se ensucia nunca.');
    expect(cleanItemTail('Haces algo. Capa DE')).toBe('Haces algo.');
    expect(cleanItemTail('Haces algo. Manto')).toBe('Haces algo.');
    expect(cleanItemTail('Haces algo. Bastón DE Bastón DE BAsTÓóN DE Bastón Bastón DE 248 CAPÍTULO 7 TESOROS')).toBe('Haces algo.');
    expect(cleanItemTail('Una criatura. Y esto: OS Ml S 8078619697 Impreso en Bélgica/Printec D37101050 SP')).toBe('Una criatura. Y esto:');
    expect(cleanItemTail('Tiras en la tabla. 01-20 Perro 21-55 Gato 56-00 Tigre')).toBe('Tiras en la tabla. 01-20 Perro 21-55 Gato 56-00 Tigre');
    expect(cleanItemTail('No puede volver a usarse hasta el siguiente amanecer,')).toBe('No puede volver a usarse hasta el siguiente amanecer,');
  });
});

describe('descripciones de trasfondos que vienen juntas', () => {
  it('reparte las dos descripciones de una página entre sus dos trasfondos y quita restos de ilustración', () => {
    const stat = (n: string, feat: string): Line[] => [n, 'Puntuaciones de característica: Fuerza, Destreza, Carisma', 'Dote: ' + feat + ' (consulta el capítulo 5)', 'Competencias en habilidades: Atletismo y Percepción', 'Competencia con herramientas: útiles de herborista', 'Equipo: elige A o B: (A) bastón y 8 po, o (B) 50 po']
      .map((t, i) => ({ t, col: 0, y: 700 - i * 12 }));
    const text = (rows: [string, number][]): Line[] => rows.map(([t, y]) => ({ t, col: 1, y }));
    const lines: Line[] = [
      ...stat('ACÓLITO', 'Alerta'), ...stat('ANIMADOR', 'Músico'),
      ...text([['/ RAR «Ss', 700], ['Dedicabas tu vida al servicio de un templo en el bosque.', 688], ['Servías a un sacerdote durante años.', 676],
        ['Pasaste tu juventud en ferias y festivales', 652], ['con músicos y acróbatas.', 640]]),
    ];
    const bg = parseBackgrounds(lines);
    expect(bg.map((b) => b.n)).toEqual(['Acólito', 'Animador']);
    expect(bg[0].d).toBe('Dedicabas tu vida al servicio de un templo en el bosque. Servías a un sacerdote durante años.');
    expect(bg[1].d).toBe('Pasaste tu juventud en ferias y festivales con músicos y acróbatas.');
  });
});

describe('subclases: pies de ilustración y nombres en dos líneas', () => {
  it('el pie con el nombre de la siguiente subclase no se lleva el final del último rasgo; el nombre que acaba en «del» sigue en la línea siguiente', async () => {
    const { parseSubclasses } = await import('../engine/bookImport');
    const s = parseSubclasses(L(
      'SUBCLASES DE GUERRERO',
      'CAMPEÓN', 'Aspira a la excelencia.', 'NIVEL 3: ATLETA', 'Tienes ventaja.',
      'SUBCLASE DE', 'GUERRERO PSIÓNICO', // pie de la ilustración de la siguiente, en medio de los rasgos de esta
      'NIVEL 18: SUPERVIVIENTE', 'Alcanzas la cumbre de la resistencia en batalla.',
      'GUERRERO PSIÓNICO', 'Aumenta tu poderío físico.', 'NIVEL 3: PODER PSIÓNICO', 'Imbuyes tus ataques.',
    ));
    expect(s.map((x) => x.n)).toEqual(['Campeón', 'Guerrero psiónico']);
    expect(s[0].f[1].d).toBe('Alcanzas la cumbre de la resistencia en batalla.');
    expect(s[1].d).toBe('Aumenta tu poderío físico.');
    const p = parseSubclasses(L('SUBCLASES DE PALADÍN', 'JURAMENTO DE ENTREGA', 'Defiende la justicia.', 'NIVEL 3: CONJUROS DEL', 'JURAMENTO DE ENTREGA', 'Siempre preparados.'));
    expect(p[0].f[0].n).toBe('Conjuros del juramento de entrega');
  });
});

describe('importar clases nuevas del libro', () => {
  // clase inventada con la forma del recuadro y los rasgos del Manual del Jugador (etiquetas entremezcladas con los valores)
  const BOX = [
    'ATRIBUTOS BÁSICOS DE CHAMÁN', 'Característica principal Sabiduría', 'Dado de puntos de golpe 1d3 por nivel de chamán', 'Competencias en Sabiduría y Constitución', 'tiradas de salvación',
    'Competencias en Elige dos: Conocimiento', 'habilidades arcano, Medicina, Naturaleza, Percepción', 'o Supervivencia', 'Competencias con armas Armas sencillas', 'Entrenamiento con Armaduras ligeras y escudos', 'armaduras', 'Equipo inicial Elige A o B: (A) bastón', 'CONVERTIRSE EN CHAMÁN',
  ];
  const BODY = [
    'RASGOS DE CLASE DE CHAMÁN', 'NIVEL l: ESPÍRITUS GUÍA', 'Invocas a un espíritu.', 'NIVEL 1: LANZAMIENTO DE CONJUROS', 'Sabiduría es tu característica de lanzamiento de conjuros.',
    'NIVEL 3: SUBCLASE DE CHAMÁN', 'Eliges una subclase.', 'NIVEL 4: MEJORA DE CARACTERÍSTICA', 'Obtienes una dote. Vuelves a obtener este rasgo en los niveles 8, 12 y 16 de chamán.', 'NIVEL 19: DON ÉPICO', 'Un don.',
    'RASGOS DE CHAMÁN', '1 +2 Espíritus guía', 'NIVEL 5: PIEL DE ROCA', 'Tu piel se endurece.', 'SUBCLASES DE CHAMÁN',
  ];
  const lines = L(...BOX, ...BODY);

  it('lee los atributos básicos aunque las etiquetas vayan dentro de los valores y el OCR cambie el 8 por un 3', () => {
    const [k] = parseClasses(lines);
    expect(k).toMatchObject({ n: 'Chamán', hd: 8, saves: ['wis', 'con'], primary: ['wis'], weapons: ['sim'], armor: ['lgt', 'shl'], skills: { count: 2 } });
    expect([...k.skills.pool].sort()).toEqual(['arc', 'med', 'nat', 'prc', 'sur']);
  });

  it('lee los rasgos por nivel, sin la tabla ni los de mejora, subclase y don épico, y deduce el lanzamiento, los niveles de mejora y el de subclase', () => {
    const [k] = parseClasses(lines);
    expect(k.f.map((f) => f.lv + ' ' + f.n)).toEqual(['1 Espíritus guía', '1 Lanzamiento de conjuros', '5 Piel de roca']);
    expect(k.caster).toBe('full');
    expect(k.spellAb).toBe('wis');
    expect(k.asi).toEqual([4, 8, 12, 16, 19]);
    expect(k.subLv).toBe(3);
    expect(k.f[2].d).toBe('Tu piel se endurece.');
    expect(k.problems.join(' ')).toMatch(/tablas de trucos/);
  });

  it('las subclases de una clase nueva se reconocen con su id', () => {
    const sub = parseSubclasses(L('SUBCLASES DE CHAMÁN', 'NIVEL 3: VOZ DEL TRUENO', 'Truena.'), { chaman: 'lib-clase-chaman' });
    expect(sub[0].cls).toBe('lib-clase-chaman');
  });
});

describe('tablas de rasgos de una clase (por posición)', () => {
  // tabla inventada con la forma de la del libro: cabecera de dos líneas, niveles a la izquierda y columnas de cantidades
  const cell = (str: string, x: number, y: number, w = 40) => ({ str, x, y, w });
  const head = [cell('RASGOS DE CHAMÁN', 115, 1372, 190), cell('Bonificador por', 195, 1345, 100), cell('N. de', 752, 1345, 42), cell('Nivel', 133, 1326, 34), cell('competencia', 202, 1326, 80), cell('Rasgos de clase', 317, 1326, 100), cell('espíritus', 752, 1326, 60), cell('Trucos', 880, 1326, 50), cell('Conjuros preparados', 950, 1326, 90)];
  const row = (lv: number, y: number, spirits: string, cant: string, prep: string) => [cell(String(lv), 145, y, 8), cell('+2', 239, y, 16), cell('Algo', 316, y, 60), cell(spirits, 770, y, 8), cell(cant, 890, y, 8), cell(prep, 985, y, 8)];
  const items = [...head, ...Array.from({ length: 20 }, (_, k) => row(k + 1, 1299 - k * 27, k < 4 ? '2' : k < 10 ? '3' : '4', k < 3 ? '2' : '3', String(k < 8 ? 2 + k : 10 + (k - 8)))).flat()];

  it('lee las columnas por su cabecera y las pasa a tablas por nivel', () => {
    const t = parseClassTable(items)!;
    expect(t.name).toBe('CHAMÁN');
    expect(t.rows).toBe(20);
    const col = (h: string) => levelTable(repairCounts(t.columns.find((c) => c.head.includes(h))!.values));
    expect(col('espíritus')).toEqual({ 1: 2, 5: 3, 11: 4 });
    expect(col('Trucos')).toEqual({ 1: 2, 4: 3 });
  });

  it('un valor suelto mal leído por el OCR se iguala al anterior', () => {
    expect(repairCounts([2, 2, 3, 5, 3, 3, 4])).toEqual([2, 2, 3, 3, 3, 3, 4]);
    expect(levelTable([null, 2, 2, 3, null])).toEqual({ 2: 2, 4: 3 });
  });

  it('las tablas de la clase salen de las columnas: trucos y preparados con los valores absurdos descartados, y las demás como tablas propias', () => {
    const t = parseClassTable(items)!;
    // un 22 de conjuros preparados en el nivel 1 no es posible: es un error del OCR
    const bad = { ...t, columns: t.columns.map((c) => (c.head.includes('preparados') ? { ...c, values: c.values.map((v, i) => (i === 0 ? 22 : v)) } : c)) };
    const base = { id: 'lib-clase-chaman', n: 'Chamán', en: 'Chamán', hd: 8, saves: [], skills: { count: 2, pool: ['*'] }, armor: [], weapons: [], caster: 'full', spellAb: 'wis', primary: [], asi: [], f: [], sc: {}, sub: null, d: '', spells: [], problems: [] } as unknown as Parameters<typeof attachTables>[0][number];
    const [k] = attachTables([base], [bad]);
    expect(k.sc['lib-clase-chaman.cantrips-known']).toEqual({ 1: 2, 4: 3 });
    expect(k.sc['lib-clase-chaman.max-prepared']['1']).toBeUndefined();
    expect(k.sc['lib-clase-chaman.n-de-espiritus']).toEqual({ 1: 2, 5: 3, 11: 4 });
    expect(k.problems.join(' ')).toMatch(/Conjuros preparados: leídos 19 de 20/);
  });
});

describe('subclases de una clase nueva', () => {
  it('saca los nombres de las subclases del rasgo «Subclase de …»', () => {
    expect(subclassNamesIn('Consigues una subclase de chamán de tu elección. Las subclases de la senda del trueno, la senda del fuego y la senda del agua se detallan tras la descripción de esta clase.'))
      .toEqual(['senda del trueno', 'senda del fuego', 'senda del agua']);
    expect(subclassNamesIn('Las subclases del colegio de la luna y colegio del sol se detallan después.')).toEqual(['colegio de la luna', 'colegio del sol']);
    expect(subclassNamesIn('Sin lista.')).toEqual([]);
  });

  it('con esos nombres, los títulos de las subclases se reconocen aunque la clase no tenga prefijos conocidos', () => {
    const sub = parseSubclasses(L('SUBCLASES DE CHAMÁN', 'SENDA DEL TRUENO', 'Truena.', 'NIVEL 3: VOZ DEL TRUENO', 'Hablas.', 'NIVEL 6: RAYO', 'Fulmina.', 'SENDA DEL FUEGO', 'Arde.', 'NIVEL 3: CHISPA', 'Chispea.'), { chaman: 'lib-clase-chaman' }, { 'lib-clase-chaman': ['senda del trueno', 'senda del fuego'] });
    expect(sub.map((s) => s.n)).toEqual(['Senda del trueno', 'Senda del fuego']);
    expect(sub.every((s) => s.cls === 'lib-clase-chaman')).toBe(true);
  });
  it('libros en inglés: conjuros (campos pasados al español), dotes y subclases', () => {
    const sp = parseSpells(L('CHAINS OF ICE', 'Level 1 Evocation (Paladin [Death Knight])', 'Casting Time: Bonus Action', 'Range: 30 feet', 'Components: V, S', 'Duration: Concentration, up to 1 minute', 'You create chains of ice.', 'BONESTORM', 'Level 5 Abjuration (Paladin)', 'Casting Time: Action', 'Range: Self (10-foot Emanation)', 'Components: V', 'Duration: Instantaneous', 'Bones swirl.'));
    expect(sp.map((x) => [x.n, x.l, x.esc, x.classes.join(), x.ct, x.r, x.du, x.c])).toEqual([
      ['Chains of Ice', 1, 'Evocación', 'paladin', 'Acción adicional', '9 m', 'Concentración, hasta 1 minuto', 1],
      ['Bonestorm', 5, 'Abjuración', 'paladin', 'Acción', 'Personal (Emanación de 3 m)', 'Instantánea', 0],
    ]);
    expect(titleCaseEn('HAND OF GUL’DAN')).toBe('Hand of Gul’Dan');
    const ft = parseFeatsEn(L('Clearcasting', 'General Feat (Prerequisite: Level 4+, Dexterity and Wisdom 13+)', 'You gain the following benefits.', 'Ability Score Increase. Increase your Intelligence score by 1.', 'Mage Feats', 'Text after the section.'));
    expect(ft).toHaveLength(1);
    expect([ft[0].n, ft[0].cat, ft[0].req]).toEqual(['Clearcasting', 'general', 'Nivel 4 o más, Destreza y Sabiduría 13 o más']);
    expect(ft[0].d).toContain('Ability Score Increase');
    const sb = parseSubclassesEn(L('Oath of the Ebon Blade (Paladin Subclass)', 'Wield death', 'The Oath unites knights.', 'Level 1: Death Coil', 'Your type becomes Undead.', 'Level 3: Runeforging', 'You inscribe runes.', 'Level 20: Aspect', 'Final.', 'Level 3: Totems', 'Other thing.'));
    expect(sb).toHaveLength(1);
    expect([sb[0].n, sb[0].cls, sb[0].f.map((f) => f.lv + f.n).join()]).toEqual(['Oath of the Ebon Blade', 'paladin', '1Death Coil,3Runeforging,20Aspect']);
  });
  it('libros en inglés: la tabla de conjuros de una subclase pasa a conjuros siempre preparados', () => {
    const subs = parseSubclassesEn(L(
      'Oath of the Holy (Paladin Subclass)', 'Intro.', 'Level 3: Oath of the Holy Spells', 'Always prepared.', 'Oath of the Holy Spells', 'Paladin Level',
      '3 Cure Wounds , Healing Word', '5 Lesser Restoration , Prayer of Healing', 'Level 3: Beacon', 'Text.',
      'Oath of the Ebon Blade (Paladin Subclass)', 'Intro.', 'Level 3: Ebon Blade Spells', 'Oath Spells', 'Paladin Level Spells (All) Spells (Blood)', '3 Death Grip Vampiric Blood', '9 Summon Undead Leeching Strike',
    ));
    const known = [{ id: 'cure-wounds', n: 'Cure Wounds' }, { id: 'healing-word', n: 'Healing Word' }, { id: 'prayer-of-healing', n: 'Prayer of Healing' }, { id: 'death-grip', n: 'Death Grip' }, { id: 'leeching-strike', n: 'Leeching Strike' }];
    const r = resolveSubSpells(subs, known);
    // una sola columna: todos los de la fila; varias: el primero, y si no se conoce no se coge el segundo
    expect(r[0].f[0].sp).toEqual(['cure-wounds|3', 'healing-word|3', 'prayer-of-healing|5']);
    expect(r[1].f[0].sp).toEqual(['death-grip|3']);
    expect(r[0].f[1].sp).toBeUndefined();
    const f = parseFeatsEn(L('Arathi Heritage', 'Origin Feat (Prerequisite: World of Warcraft Campaign, Human Species)', 'Text.'));
    expect(f[0].req).toBe('World of Warcraft campaña, especie: Human');
  });
});

describe('especies de un libro en inglés', () => {
  const L = (...t: string[]) => t.map((s, i) => ({ t: s, col: 0, y: 800 - i * 12, p: 1 }));
  it('lee tipo, tamaño, velocidad, vista en la oscuridad, resistencias y rasgos con usos', () => {
    const sp = parseSpeciesEn(L(
      'Forsaken Renown', 'Your Renown Score begins at 3.', 'Forsaken Traits', 'Creature Type: Undead', 'Size: Medium (about 4–7 feet tall) or Small (about 2–4 feet tall)', 'Speed: 30 feet',
      'As a Forsaken, you have these special traits.',
      'Darkvision. You have Darkvision with a range of 60 feet.',
      'Deathly Endurance. You have Resistance to Necrotic damage.',
      'Touch of the Grave. You can use this trait a number of times equal to your Proficiency Bonus, and you regain all', 'expended uses when you finish a Long Rest.',
      'Gnome',
    ));
    expect(sp).toHaveLength(1);
    expect(sp[0]).toMatchObject({ id: 'lib-especie-forsaken', n: 'Forsaken', type: 'No muerto', size: ['Mediano', 'Pequeño'], speed: 30, dv: 60, res: ['necrótico'] });
    expect(sp[0].t.map((x) => x.n)).toEqual(['Darkvision', 'Deathly Endurance', 'Touch of the Grave']);
    expect(sp[0].t[2].u).toEqual({ max: '@prof', per: 'lr' });
  });
  it('una línea que empieza como un rasgo pero continúa la frase anterior no es un rasgo, y las especies que remiten a otro libro no salen', () => {
    const sp = parseSpeciesEn(L(
      'Worgen Traits', 'Creature Type: Humanoid', 'Size: Medium', 'Speed: 30 feet', 'As a Worgen, you have these special traits.',
      'Darkflight. As a Bonus Action, you can shape-shift. You can do so only once per turn, using a Bonus', 'Action. When you enter your bestial form, you gain Temporary Hit Points.',
      'Orc Traits', 'You have the Orc species traits from the Player’s Handbook .',
    ));
    expect(sp.map((x) => x.n)).toEqual(['Worgen']);
    expect(sp[0].t.map((x) => x.n)).toEqual(['Darkflight']);
  });
});
