import type { RollResult } from '../data/types';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import Die, { DieShape } from './Die';
import Dice3D, { hasWebGL } from './Dice3D';
import EffectTargets from './EffectTargets';
import SendToTable from './SendToTable';

const QUICK = [4, 6, 8, 10, 12, 20, 100];
export const THEMES: [string, string][] = [['ruby', 'Rubí'], ['bone', 'Hueso'], ['obsidian', 'Obsidiana'], ['gem', 'Gema'], ['metal', 'Metal'], ['wood', 'Madera']];

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** El total sube rápido hasta su valor en vez de aparecer de golpe. */
function CountUp({ value }: { value: string }) {
  const target = /^-?\d+$/.test(value) ? parseInt(value, 10) : null;
  const [shown, setShown] = useState(() => (target != null && Math.abs(target) >= 2 && !reducedMotion() ? '0' : value));
  useEffect(() => {
    if (target == null || reducedMotion() || Math.abs(target) < 2) { setShown(value); return; }
    const start = performance.now();
    const dur = Math.min(520, 220 + Math.abs(target) * 6);
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setShown(String(Math.round(target * (1 - Math.pow(1 - t, 3)))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, target]);
  return <>{shown}</>;
}

function Targets() {
  const r = useStore((s) => s.result);
  const combatants = useStore((s) => s.combatants);
  const targets = useStore((s) => s.dmgTargets);
  const { set, applyRolled } = useStore.getState();
  if (!r || !r.isDmg) return null;
  const list = combatants.filter((c) => c.kind !== 'lair' && c.id !== r.by);
  if (!list.length) return null;
  const cycle = (id: string) => {
    const cur = useStore.getState().dmgTargets[id];
    const next = !cur ? 'full' : cur === 'full' ? 'half' : null;
    const m = { ...useStore.getState().dmgTargets };
    if (next) m[id] = next; else delete m[id];
    set({ dmgTargets: m });
  };
  return (
    <div className="targets">
      <span className="small muted" id="tg-help">Aplicar este daño a (pulsa: completo → mitad → nada){r.half ? '. Quien supere la salvación recibe la mitad.' : ':'}</span>
      <div className="chips" role="group" aria-describedby="tg-help">
        {list.map((c) => {
          const st = targets[c.id];
          return (
            <button key={c.id} className={st === 'half' ? 'chip half' : st ? 'chip on' : 'chip'} aria-pressed={!!st} onClick={() => cycle(c.id)}>
              {c.name}{st && <span className="chip-tag">{st === 'half' ? 'mitad' : 'completo'}</span>}
            </button>
          );
        })}
      </div>
      <button className="btn small primary" style={{ alignSelf: 'flex-start' }} onClick={applyRolled}>Aplicar daño</button>
    </div>
  );
}

/** Mesa de dados. `targets`: ofrecer aplicar el daño a los combatientes (solo en la mesa del máster). */
/** Junta las partes del mismo origen y tipo (el arma y su modificador, por ejemplo). */
function mergeRows(rows: NonNullable<RollResult['rows']>) {
  const out: NonNullable<RollResult['rows']> = [];
  for (const r of rows) {
    const same = out.find((x) => x.src === r.src && x.type === r.type);
    if (same) { same.sub += r.sub; same.dice = [same.dice, r.dice].filter(Boolean).join(' · '); } else out.push({ ...r });
  }
  return out;
}

export default function DiceTable({ targets = true }: { targets?: boolean }) {
  const dice = useStore((s) => s.dice);
  const rolling = useStore((s) => s.rolling);
  const result = useStore((s) => s.result);
  const adv = useStore((s) => s.adv);
  const critFor = useStore((s) => s.critFor);
  const theme = useStore((s) => s.diceTheme);
  const dieSize = useStore((s) => s.dieSize);
  const moreDice = useStore((s) => s.moreDice);
  const expr = useStore((s) => s.expr);
  const exprError = useStore((s) => s.exprError);
  const log = useStore((s) => s.log);
  const confirmKey = useStore((s) => s.confirmKey);
  const dice3d = useStore((s) => s.dice3d);
  const { set, roll } = useStore.getState();
  const can3d = hasWebGL();
  const reduced = reducedMotion();
  const [ready3d, setReady3d] = useState(false);
  // automático: 3D salvo que el sistema pida reducir movimiento; lo que elija el usuario manda
  const use3d = can3d && (dice3d ?? !reduced);
  const rim = useRef<HTMLDivElement>(null);
  const done = !!result && !rolling;
  const fx = done ? result!.cls : '';
  const fxKey = log[0]?.id || '';
  // pifia: el tapete se sacude
  useEffect(() => {
    if (fx === 'fumble' && rim.current && typeof rim.current.animate === 'function' && !reducedMotion()) {
      rim.current.animate([{ transform: 'none' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'none' }], { duration: 380, easing: 'ease-out' });
    }
  }, [fx, fxKey]);
  const legend = done && result!.isDmg && (result!.parts.length > 1 || moreDice > 0) ? result!.parts : [];
  const rollFree = () => roll({ label: 'Tirada libre · ' + expr, kind: 'free', parts: [{ expr }] });
  const tagsShown = (result?.tags || []).filter((t) => !result?.rows?.some((r) => r.src === t));
  return (
    <div className={'panel dice-' + theme}>
      <div className="panel-head">
        <h2>Mesa de dados</h2>
        <div className="segbox" role="group" aria-label="Modo de la próxima tirada d20" title="Se aplica solo a la próxima tirada d20 (atajos V y X)">
          {([['dis', 'Desventaja'], ['normal', 'Normal'], ['adv', 'Ventaja']] as const).map(([k, l]) => (
            <button key={k} className={adv === k ? 'seg on' : 'seg'} aria-pressed={adv === k} onClick={() => set({ adv: k })}>{l}</button>
          ))}
        </div>
      </div>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <radialGradient id="die-shine" cx="0.32" cy="0.28" r="0.7">
            <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      <div className="rim" ref={rim}>
        <div className="felt" style={{ ['--ds' as string]: dieSize + 'px' }} aria-hidden="true">
          {use3d && <Dice3D theme={theme} onReady={setReady3d} />}
          {!dice.length && <div className="felt-hint">Los dados caerán aquí</div>}
          {!(use3d && ready3d) && dice.map((d) => <Die key={d.id} d={d} />)}
          {fx && <div key={fxKey} className={'felt-fx ' + fx} />}
          {(legend.length > 0 || (done && moreDice > 0)) && (
            <div className="felt-legend">
              {legend.map((p) => <span key={p.type || 'x'} data-dt={p.type || undefined}><i />{p.type || 'sin tipo'} {p.amt}</span>)}
              {moreDice > 0 && <span>+{moreDice} dados más</span>}
            </div>
          )}
        </div>
      </div>

      <div aria-live="polite">
        {result && !rolling && (
          <div className={'plaque plaque-in ' + result.cls}>
            <div className="plaque-top">
              <div className="plaque-total"><CountUp value={result.total} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span className="plaque-label">{result.label}</span>
                {/* etiquetas: lo que no tiene su propia fila (Atacante salvaje, Perforador…) y el crítico */}
                {(result.crit || tagsShown.length > 0) && (
                  <span className="plaque-tags">
                    {result.crit && <span className="chip-tag crit">Crítico</span>}
                    {tagsShown.map((t) => <span key={t} className="chip-tag">{t}</span>)}
                  </span>
                )}
                {!result.rows && <span className="plaque-detail">{result.detail}</span>}
                {result.note && <span className="plaque-note">{result.note}</span>}
              </div>
            </div>
            {/* daño por partes: de dónde sale cada uno, cuánto y de qué tipo; los dados, plegados */}
            {result.rows && (
              <>
                <ul className="plaque-rows">
                  {mergeRows(result.rows).map((r, i) => (
                    <li key={i}>
                      <span className="pr-src">{r.src || 'Daño'}<span className="pr-dice">{r.dice}</span></span>
                      <b className="pr-sub">{r.sub}</b>
                      <span className="pr-type" data-dt={r.type || undefined}><i />{r.type || 'sin tipo'}</span>
                    </li>
                  ))}
                </ul>
                <details className="plaque-more"><summary>Ver dados</summary><span className="plaque-detail">{result.detail}</span></details>
              </>
            )}
            {targets && (result.effect ? <EffectTargets key={result.label + '|' + result.total + '|' + (log[0]?.id || '')} /> : <Targets />)}
            {!targets && <SendToTable key={'s|' + result.label + '|' + result.total + '|' + (log[0]?.id || '')} />}
          </div>
        )}
        {rolling && <div className="plaque"><div className="plaque-top"><div className="plaque-total" style={{ color: '#80644d' }}>…</div><span className="plaque-label" style={{ color: '#b2a691' }}>Los dados ruedan…</span></div></div>}
        {!result && !rolling && <div className="plaque"><div className="plaque-top"><div className="plaque-total" style={{ color: '#65503d' }}>d20</div><span className="muted" style={{ fontSize: 14 }}>Pulsa un dado, una característica o un ataque de la hoja.</span></div></div>}
      </div>

      {critFor && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid #d4a94f', color: '#e8c062', fontWeight: 700, fontSize: 14 }}>
          <span>Crítico de {critFor.who}: su próxima tirada de daño dobla los dados.</span>
          <button className="btn small ghost" onClick={() => set({ critFor: null })}>Anular</button>
        </div>
      )}

      <div className="qgrid">
        {QUICK.map((sd, i) => (
          <button key={sd} className="qdie" onClick={() => roll({ label: 'd' + sd, kind: 'free', parts: [{ expr: '1d' + sd }] })} aria-label={'Tirar d' + sd} title={'Tirar d' + sd + ' (tecla ' + (i + 1) + ')'}>
            <span className="mini"><DieShape sides={sd} uidKey={'q' + sd} /></span>d{sd}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}><label htmlFor="expr">Tirada libre</label>
          <input id="expr" className="input" value={expr} onChange={(e) => set({ expr: e.target.value, exprError: false })} onKeyDown={(e) => { if (e.key === 'Enter') rollFree(); }} placeholder="2d6+3, 4d6, 1d20-1…" /></div>
        <button className="btn gold" onClick={rollFree}>Tirar</button>
      </div>
      {exprError && <p className="warn" role="alert" style={{ fontSize: 14 }}>Fórmula no válida. Usa algo como 3d8+2.</p>}

      <label className="check" title={!can3d ? 'Este navegador no puede mostrar gráficos 3D (WebGL desactivado o sin aceleración por hardware)' : reduced ? 'Tu sistema pide reducir las animaciones, por eso empiezan desactivados. Puedes activarlos igualmente.' : 'Dados con física real. Desactívalo si la tablet va lenta.'}>
        <input type="checkbox" checked={use3d} disabled={!can3d} onChange={(e) => set({ dice3d: e.target.checked })} />Dados 3D{!can3d && ' (este navegador no tiene gráficos 3D)'}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="muted small" style={{ fontWeight: 700 }}>Color</span>
        <div className="swatches">
          {THEMES.map(([k, l]) => <button key={k} className={'swatch sw-' + k + (theme === k ? ' on' : '')} aria-pressed={theme === k} aria-label={'Dados ' + l} title={l} onClick={() => set({ diceTheme: k })} />)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="panel-head"><span className="eyebrow">Historial</span>{log.length > 0 && <button className="btn small ghost" onClick={() => useStore.getState().confirm('clear-log', () => set({ log: [] }))}>{confirmKey === 'clear-log' ? '¿Seguro? Borrar todo' : 'Limpiar'}</button>}</div>
        <ol className="log">
          {log.map((l) => (
            <li key={l.id}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 700, color: '#efe3cb' }}>{l.label}</span>
                <span className="muted" style={{ fontSize: 13 }}>{l.detail}</span>
              </span>
              <span className="log-total">{l.total}</span>
            </li>
          ))}
        </ol>
        {!log.length && <span className="muted small">Aún no hay tiradas.</span>}
      </div>
    </div>
  );
}
