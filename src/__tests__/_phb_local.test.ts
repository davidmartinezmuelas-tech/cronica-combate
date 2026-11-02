import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { it } from 'vitest';
import { classifyPage, fillClassGaps, pageLines, parseBackgrounds, parseFeats, parseSpells, parseSubclasses, type Line, type TextItem } from '../engine/bookImport';
const DIR = 'C:/Users/muela/AppData/Local/Temp/claude/C--Users-muela-Projects-cronica-combate/a4abf780-da33-47a0-930a-f9bcd50af56f/scratchpad/';
it.skipIf(!existsSync(DIR + 'phb_items.json'))('phb', () => {
  const raw = JSON.parse(readFileSync(DIR + 'phb_items.json', 'utf8')) as { w: number; items: TextItem[] }[];
  const L: Record<'feats' | 'backgrounds' | 'spells' | 'classes', Line[]> = { feats: [], backgrounds: [], spells: [], classes: [] };
  const pages = raw.map((p, i) => ({ kinds: classifyPage(p.items.map((x) => x.str).join(' ')), lines: pageLines(p.items, p.w).map((l) => ({ ...l, p: i + 1 })) }));
  const kinds = fillClassGaps(pages.map((p) => p.kinds));
  pages.forEach((p, i) => { for (const k of kinds[i]) L[k].push(...p.lines); });
  const lib = { app: 'cronica-combate', tipo: 'biblioteca', v: 1, source: 'Manual del Jugador 2024', feats: parseFeats(L.feats), backgrounds: parseBackgrounds(L.backgrounds), spells: parseSpells(L.spells, pages.flatMap((p) => p.lines)), subclasses: parseSubclasses(L.classes) };
  writeFileSync(DIR + 'mj-lib.json', JSON.stringify(lib));
  console.log('LIB', lib.feats.length, lib.backgrounds.length, lib.spells.length, lib.subclasses.length);
});
