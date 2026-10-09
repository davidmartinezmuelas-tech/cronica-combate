import type { Abil, PlayerData } from '../../data/player';
import type { Character, Derived } from '../../engine/character';
import { fmt, sgn } from '../../engine/dice';
import { activeKits, atLevel, optionAction, resourceMax, resourcePer, type DiceResource } from '../../engine/subclassActions';
import Card from '../../shared/Card';
import Pips from '../../shared/Pips';
import type { LibraryData } from '../../store/library';
import { useStore } from '../../store/useStore';
import KitPanel from './KitPanel';
import { resolveChoices } from './SubclassChoices';

const ABIL_N: Record<Abil, string> = { str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma' };

/** Recursos de las elecciones y rasgos de su clase y subclase, con cuándo se recuperan a su nivel (para los descansos). */
export function choiceResources(c: Character, data: PlayerData | null, lib: LibraryData): (DiceResource & { now: DiceResource['per'] })[] {
  const kits = activeKits(c).flatMap((k) => (k.kit.res ? [k.kit.res] : []));
  return [...resolveChoices(c, data, lib).flatMap((r) => (r.def.res ? [r.def.res] : [])), ...kits].map((r) => ({ ...r, now: resourcePer(r, c.level) }));
}

/** Usos que los paneles de acciones ya cuentan con sus círculos (canalización, inspiración, maniobras elegidas…). */
export function actionPanelKeys(c: Character, data: PlayerData | null, lib: LibraryData): string[] {
  return [
    ...activeKits(c).flatMap((k) => (k.kit.res ? [k.kit.res.key] : [])),
    // los rasgos que ya tienen su tarjeta con usos en el panel (Venganza ardiente, Pasos feéricos…)
    ...activeKits(c).flatMap((k) => k.actions.flatMap((a) => a.n)),
    ...resolveChoices(c, data, lib).filter((r) => r.def.res && r.picked.length).map((r) => r.def.res!.key),
  ];
}

/**
 * Opciones elegidas que se usan en la mesa (maniobras): cada una con sus tiradas, que gastan un dado del recurso.
 * Si suma el dado al daño, hay un botón por arma con el daño del arma más el dado.
 */
export default function SubclassActions({ c, d, data, lib, set }: { c: Character; d: Derived; data: PlayerData | null; lib: LibraryData; set: (patch: Partial<Character>) => void }) {
  const { roll } = useStore.getState();
  const who = c.name || 'Personaje';
  const groups = resolveChoices(c, data, lib).filter((r) => r.def.res && r.picked.length);
  const kits = activeKits(c);
  if (!groups.length && !kits.length) return null;

  return (
    <>
      {kits.map((k) => <KitPanel key={k.kit.id} c={c} d={d} lib={lib} set={set} kit={k.kit} actions={k.actions} />)}
      {groups.map(({ def, options, picked }) => {
        const res = def.res!;
        const max = resourceMax(res, c.level);
        const die = 'd' + atLevel(res.die, c.level);
        const used = Math.min(max, c.uses[res.key] || 0);
        const left = max - used;
        const best = res.dc.reduce((a, b) => (d.mods[b] > d.mods[a] ? b : a));
        const dc = 8 + d.pb + d.mods[best];
        // cada tirada gasta un dado
        const spend = () => set({ uses: { ...c.uses, [res.key]: Math.min(max, (c.uses[res.key] || 0) + 1) } });
        return (
          <section key={def.id} className="panel" aria-label={def.label}>
            <div className="panel-head">
              <h3 className="eyebrow">{def.label}</h3>
              <span className="rollrow">
                <span className="muted small">{res.n}: {left} de {max} ({die}) · CD {dc}</span>
                <Pips max={max} used={used} label={res.n} onSet={(v) => set({ uses: { ...c.uses, [res.key]: Math.max(0, Math.min(max, v)) } })} />
              </span>
            </div>
            <ul className="pc-features grid acts">
              {picked.map((name) => {
                const text = options.find((o) => o.n === name)?.d || '';
                const act = optionAction(text, data?.skills || {});
                const plus = act.plus === 'str-dex' ? Math.max(d.mods.str, d.mods.dex) : act.plus === 'half-level' ? Math.floor(c.level / 2) : 0;
                const label = (what: string) => who + ' · ' + name + (what ? ': ' + what : '');
                const buttons: { k: string; text: string; go: () => void }[] = [];
                if (act.damage) {
                  d.attacks.forEach(({ w, parts, verParts }) => {
                    buttons.push({
                      k: 'w' + w.id, text: 'Daño con ' + w.name + ' + ' + die,
                      go: () => roll({ label: label('daño con ' + w.name), kind: 'damage', who, by: null, parts: [...parts, { expr: '1' + die, type: w.type }] }),
                    });
                    // arma versátil: también empuñada a dos manos
                    if (verParts.length) buttons.push({
                      k: 'wv' + w.id, text: 'Daño con ' + w.name + ' a dos manos + ' + die,
                      go: () => roll({ label: label('daño con ' + w.name + ' a dos manos'), kind: 'damage', who, by: null, parts: [...verParts, { expr: '1' + die, type: w.type }] }),
                    });
                  });
                }
                act.checks.forEach((k) => {
                  const b = d.skills[k]?.bonus ?? 0;
                  buttons.push({ k: 's' + k, text: (data?.skills[k] || k) + ' ' + fmt(b) + ' + ' + die, go: () => roll({ label: label(data?.skills[k] || k), kind: 'check', parts: [{ expr: '1d20' + sgn(b) + '+1' + die }] }) });
                });
                if (act.init) buttons.push({ k: 'init', text: 'Iniciativa ' + fmt(d.init) + ' + ' + die, go: () => roll({ label: label('iniciativa'), kind: 'init', parts: [{ expr: '1d20' + sgn(d.init) + '+1' + die }] }) });
                // sin arma ni prueba: se tira el dado (más lo que sume) y se aplica a mano (CA, PG temporales, reducir daño…)
                if (!buttons.length || (act.damage && !d.attacks.length)) buttons.push({ k: 'die', text: 'Tirar ' + die + (plus ? ' ' + sgn(plus) : ''), go: () => roll({ label: label(''), kind: 'free', parts: [{ expr: '1' + die + (plus ? sgn(plus) : '') }] }) });
                return (
                  <li key={name}>
                    <Card name={name} head={<>
                        {act.save && <span className="chip-tag">CD {dc} {ABIL_N[act.save]}</span>}
                        <span className="rollrow">
                          {buttons.map((b) => <button key={b.k} className={act.damage && b.k.startsWith('w') ? 'rollbtn dmg' : 'rollbtn'} disabled={left <= 0} title={left <= 0 ? 'No te quedan ' + res.n.toLowerCase() : 'Gasta un dado'} onClick={() => { spend(); b.go(); }}>{b.text}</button>)}
                        </span>
                      </>}>
                      {text && <p className="pc-text">{text}</p>}
                    </Card>
                  </li>
                );
              })}
            </ul>
            {left <= 0 && <p className="muted small" style={{ margin: 0 }}>Sin {res.n.toLowerCase()}: se recuperan tras un descanso {res.per === 'sr' ? 'corto o largo' : 'largo'}.</p>}
          </section>
        );
      })}
    </>
  );
}
