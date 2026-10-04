import { useStore } from '../store/useStore';

const QUICK = [4, 6, 8, 10, 12, 20, 100];
const THEMES: [string, string][] = [['ruby', 'Rubí'], ['bone', 'Hueso'], ['obsidian', 'Obsidiana']];

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

export default function DiceTable() {
  const dice = useStore((s) => s.dice);
  const rolling = useStore((s) => s.rolling);
  const result = useStore((s) => s.result);
  const adv = useStore((s) => s.adv);
  const critFor = useStore((s) => s.critFor);
  const theme = useStore((s) => s.diceTheme);
  const manyDice = useStore((s) => s.manyDice);
  const moreDice = useStore((s) => s.moreDice);
  const expr = useStore((s) => s.expr);
  const exprError = useStore((s) => s.exprError);
  const log = useStore((s) => s.log);
  const { set, roll } = useStore.getState();
  const half = manyDice ? 25 : 32;
  const rollFree = () => roll({ label: 'Tirada libre · ' + expr, kind: 'free', parts: [{ expr }] });
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
      <div className="rim">
        <div className={manyDice ? 'felt many' : 'felt'} aria-hidden="true">
          {!dice.length && <div className="felt-hint">Los dados caerán aquí</div>}
          {!rolling && moreDice > 0 && dice.length > 0 && <span className="felt-more">+{moreDice} dados</span>}
          {dice.map((d) => (
            <div key={d.id}>
              <div className="die-shadow" style={{ left: `calc(${d.x}% - ${half - 3}px)`, top: `calc(${d.y}% + ${half - 8}px)`, animationDelay: d.delay + 'ms' }} />
              <div className={'die-wrap ' + d.tumble} style={{ left: `calc(${d.x}% - ${half}px)`, top: `calc(${d.y}% - ${half}px)`, animationDelay: d.delay + 'ms' }}>
                <div className={['shape die', d.cls, d.extra, d.done && d.dim ? 'dim' : ''].join(' ')}><span className="facet" /><span className="die-num">{d.face}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div aria-live="polite">
        {result && !rolling && (
          <div className={'plaque plaque-in ' + result.cls}>
            <div className="plaque-top">
              <div className="plaque-total">{result.total}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span className="plaque-label">{result.label}</span>
                <span className="plaque-detail">{result.detail}</span>
                {result.note && <span className="plaque-note">{result.note}</span>}
              </div>
            </div>
            <Targets />
          </div>
        )}
        {rolling && <div className="plaque"><div className="plaque-top"><div className="plaque-total" style={{ color: '#6b5238' }}>…</div><span className="plaque-label" style={{ color: '#b9a88a' }}>Los dados ruedan…</span></div></div>}
        {!result && !rolling && <div className="plaque"><div className="plaque-top"><div className="plaque-total" style={{ color: '#4a3a2a' }}>d20</div><span className="muted" style={{ fontSize: 14 }}>Pulsa un dado, una característica o un ataque de la hoja.</span></div></div>}
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
            <span className={'shape mini ' + ({ 4: 'd4', 6: 'd6', 8: 'd8', 10: 'd10', 12: 'd12', 20: 'd20', 100: 'd10' } as Record<number, string>)[sd]} />d{sd}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}><label htmlFor="expr">Tirada libre</label>
          <input id="expr" className="input" value={expr} onChange={(e) => set({ expr: e.target.value, exprError: false })} onKeyDown={(e) => { if (e.key === 'Enter') rollFree(); }} placeholder="2d6+3, 4d6, 1d20-1…" /></div>
        <button className="btn primary" onClick={rollFree}>Tirar</button>
      </div>
      {exprError && <p className="warn" role="alert" style={{ fontSize: 14 }}>Fórmula no válida. Usa algo como 3d8+2.</p>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="muted small" style={{ fontWeight: 700 }}>Color de los dados</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {THEMES.map(([k, l]) => <button key={k} className={'swatch sw-' + k + (theme === k ? ' on' : '')} aria-pressed={theme === k} aria-label={'Dados ' + l} title={l} onClick={() => set({ diceTheme: k })} />)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="panel-head"><span className="eyebrow">Historial</span>{log.length > 0 && <button className="btn small ghost" onClick={() => set({ log: [] })}>Limpiar</button>}</div>
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
