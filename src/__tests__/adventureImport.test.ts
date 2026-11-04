import { describe, expect, it } from 'vitest';
import type { Line } from '../engine/bookImport';
import { adventureToMarkdown, creaturesIn, unstar } from '../engine/adventureImport';
import { findDice } from '../engine/script';
import { extractBlocks, parseEncounter } from '../engine/scriptBlocks';

// Una página inventada: título (21), sala (14), subtítulo (9), texto corrido (6.5) y texto para leer en voz alta (7).
let y = 800;
const ln = (t: string, sz = 6.5, gap = 12): Line => ({ t, col: 0, y: (y -= gap), p: 1, sz });
const page = (): Line[] => {
  y = 800;
  return [
    ln('The Foundry', 21, 30),
    ln('Area 3: Mast Room', 14, 24),
    ln('When the characters enter, read or paraphrase the following:', 6.5, 20),
    ln('The ceiling of this chamber rises thirty feet and the air is thick with smoke and', 7, 16),
    ln('the smell of hot iron.', 7),
    ln('The Goblin Boss Sneed operates his invention. Eight Goblin Minions (G on the map) are on the', 6.5, 20),
    ln('ceiling mast, and four Bandits (B) watch the door.', 6.5),
    ln('Goblin Bombs', 9, 24),
    ln('Throw Bomb. Dexterity Saving Throw: DC 12. Failure: 10 (3d6) Fire damage. Success: Half damage only.', 6.5, 18),
    ln('The treasure includes the following:', 6.5, 20),
    ln('Ten +1 Arrows', 6.5, 14),
    ln('Cloak of Protection', 6.5, 14),
  ];
};
const monsters = [{ id: 'goblin-minion', n: 'Esbirro goblin', en: 'Goblin Minion' }, { id: 'bandit', n: 'Bandido', en: 'Bandit' }];

describe('importar una aventura en PDF como guion', () => {
  it('encuentra criaturas con cantidad (marcadas en el mapa o con asterisco)', () => {
    expect(creaturesIn('Eight Goblin Minions (G on the map) and four Bandits (B) and Gilnid (G).')).toEqual([{ name: 'Goblin Minions', qty: 8 }, { name: 'Bandits', qty: 4 }, { name: 'Gilnid', qty: 1 }]);
    expect(creaturesIn('Two of The Damned * stand sentry; Lord Marrowgar ,* waits.')).toEqual([{ name: 'The Damned', qty: 2 }, { name: 'Lord Marrowgar', qty: 1 }]);
    expect(unstar('Lord Marrowgar ,* the first boss of The Damned * who')).toBe('Lord Marrowgar, the first boss of The Damned who');
  });

  it('da títulos, cita, negritas, lista y un bloque de encuentro que la app entiende', () => {
    const r = adventureToMarkdown(page(), monsters);
    expect(r.text).toContain('# The Foundry');
    expect(r.text).toContain('## Area 3: Mast Room');
    expect(r.text).toContain('### Goblin Bombs');
    expect(r.text).toContain('> The ceiling of this chamber rises thirty feet and the air is thick with smoke and the smell of hot iron.');
    expect(r.text).toContain('**Throw Bomb.** Dexterity Saving Throw: DC 12.');
    expect(r.text).toContain('- Ten +1 Arrows\n- Cloak of Protection');
    expect(r.encounters).toEqual([{ name: 'Area 3: Mast Room', items: [{ n: 'Esbirro goblin', qty: 8 }, { n: 'Bandido', qty: 4 }] }]);
    expect(r.unresolved).toEqual([]);
    const blocks = extractBlocks(r.text);
    expect(blocks).toHaveLength(1);
    const e = parseEncounter(blocks[0].body);
    expect('error' in e ? e.error : e.items).toEqual([{ name: 'Esbirro goblin', qty: 8 }, { name: 'Bandido', qty: 4 }]);
  });

  it('avisa de las criaturas que no están en el bestiario', () => {
    const r = adventureToMarkdown(page(), [monsters[0]]);
    expect(r.encounters[0].items).toEqual([{ n: 'Esbirro goblin', qty: 8 }]);
    expect(r.unresolved).toEqual(['Bandits']);
  });

  it('las tiradas de daño en inglés son botones de daño', () => {
    const d = findDice('Failure: 10 (3d6) Fire damage. Success: Half.').filter((x) => x.t === 'dice');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ expr: '3d6', kind: 'damage', type: 'fuego' });
    expect(findDice('takes 2d6 fuego').find((x) => x.t === 'dice')).toMatchObject({ kind: 'damage', type: 'fuego' });
  });
});
