import { asClass, classEntries, classLevel, usesMax, type Character } from '../../engine/character';
import { METAMAGIC, MM_FEAT_KEY, MM_FEAT_POOL, MM_KEY, SORC_POOL, metamagicSlots } from '../../engine/metamagic';
import type { PlayerData } from '../../data/player';
import Card from '../../shared/Card';
import Pips from '../../shared/Pips';

/**
 * Metamagia: las opciones del hechicero y las de Adepto de metamagia, elegidas aquí, con su coste. Usar una gasta
 * los puntos (primero los de la dote, que vuelven en descanso largo; luego los de Fuente de magia).
 */
export default function MetamagicPanel({ c, data, set }: { c: Character; data: PlayerData | null; set: (patch: Partial<Character>) => void }) {
  const slots = metamagicSlots(c);
  if (!slots.sorc && !slots.feat) return null;
  const cls = data?.classes.find((x) => x.id === 'sorcerer');
  const font = cls?.f.find((f) => f.n === SORC_POOL);
  const entry = classEntries(c).find((e) => e.classId === 'sorcerer');
  const sorcMax = slots.sorc && entry ? usesMax(font?.u, asClass(c, entry), cls) || 0 : 0;
  const featMax = slots.feat ? 2 : 0;
  const used = (k: string) => c.uses[k] || 0;
  const left = { feat: featMax - Math.min(featMax, used(MM_FEAT_POOL)), sorc: sorcMax - Math.min(sorcMax, used(SORC_POOL)) };
  const picked = (k: string) => c.choices?.[k] || [];
  const toggle = (k: string, n: string, max: number) => {
    const cur = picked(k);
    set({ choices: { ...(c.choices || {}), [k]: cur.includes(n) ? cur.filter((x) => x !== n) : cur.length >= max ? cur : [...cur, n] } });
  };
  const mine = [...new Set([...picked(MM_KEY).slice(0, slots.sorc), ...picked(MM_FEAT_KEY).slice(0, slots.feat)])];
  // gastar: primero los puntos de la dote, luego los de hechicería
  const spend = (cost: number) => {
    const fromFeat = Math.min(cost, left.feat);
    const fromSorc = cost - fromFeat;
    set({ uses: { ...c.uses, ...(fromFeat ? { [MM_FEAT_POOL]: used(MM_FEAT_POOL) + fromFeat } : {}), ...(fromSorc ? { [SORC_POOL]: used(SORC_POOL) + fromSorc } : {}) } });
  };
  const chooser = (k: string, max: number, title: string) => (
    <div className="mm-pick">
      <span className="muted small">{title}: {Math.min(max, picked(k).length)} de {max}</span>
      <div className="chips">{METAMAGIC.map((m) => {
        const on = picked(k).includes(m.n);
        return <button key={m.n} className={on ? 'chip on' : 'chip'} aria-pressed={on} disabled={!on && picked(k).length >= max} title={m.what} onClick={() => toggle(k, m.n, max)}>{m.n}</button>;
      })}</div>
    </div>
  );
  return (
    <section className="panel" aria-label="Metamagia" data-sec="conjuros">
      <div className="panel-head">
        <h3 className="eyebrow">Metamagia</h3>
        <span className="rollrow">
          {featMax > 0 && <><span className="muted small">Adepto {left.feat}/{featMax}</span><Pips max={featMax} used={Math.min(featMax, used(MM_FEAT_POOL))} label={MM_FEAT_POOL} onSet={(v) => set({ uses: { ...c.uses, [MM_FEAT_POOL]: Math.max(0, Math.min(featMax, v)) } })} /></>}
          {sorcMax > 0 && <span className="muted small">Puntos de hechicería {left.sorc}/{sorcMax}</span>}
        </span>
      </div>
      {classLevel(c, 'sorcerer') >= 7 && sorcMax > 0 && (
        <div className="rollrow">
          <button className="btn small" disabled={left.sorc < 2} title="Hechicería encarnada (nivel 7): si no te quedan usos de Hechicería innata, la activas gastando 2 puntos de hechicería" onClick={() => set({ uses: { ...c.uses, [SORC_POOL]: used(SORC_POOL) + 2 } })}>Hechicería innata sin usos: gasta 2 puntos</button>
          <span className="muted small">Con ella activa, hasta dos opciones de Metamagia por conjuro.</span>
        </div>
      )}
      {slots.sorc > 0 && picked(MM_KEY).length < slots.sorc && chooser(MM_KEY, slots.sorc, 'Opciones de hechicero')}
      {slots.feat > 0 && picked(MM_FEAT_KEY).length < slots.feat && chooser(MM_FEAT_KEY, slots.feat, 'Adepto de metamagia')}
      {mine.length > 0 && (
        <ul className="pc-features grid acts">
          {mine.map((n) => {
            const m = METAMAGIC.find((x) => x.n === n);
            if (!m) return null;
            const cost = m.cost || 1;
            return (
              <li key={n}>
                <Card name={n} head={<>
                  <span className="chip-tag">{m.cost ? m.cost + (m.cost === 1 ? ' punto' : ' puntos') : 'nivel del conjuro en puntos'}</span>
                  <button className="btn small" disabled={left.feat + left.sorc < cost} onClick={() => spend(cost)}>Usar (gasta {cost})</button>
                </>}>
                  <p className="pc-text">{m.what}</p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {mine.length > 0 && (picked(MM_KEY).length >= slots.sorc && picked(MM_FEAT_KEY).length >= slots.feat) && (
        <button className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set({ choices: { ...(c.choices || {}), [MM_KEY]: [], [MM_FEAT_KEY]: [] } })}>Cambiar opciones</button>
      )}
    </section>
  );
}
