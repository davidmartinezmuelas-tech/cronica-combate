import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { reminders } from '../../engine/combat';
import { forgeToMonster } from '../../engine/forge';
import { fmt } from '../../engine/dice';
import { ChevronLeft, ChevronRight } from '../../shared/Icons';
import { useStore } from '../../store/useStore';
import CombatantCard from './CombatantCard';
import EncounterGenerator from './EncounterGenerator';
import StatBlock, { SpellCard } from './StatBlock';
import { RuleQuick, RuleView } from '../../shared/RulesPanel';
import PartySheets from './PartySheets';

function Onboarding() {
  const combatants = useStore((s) => s.combatants);
  const roster = useStore((s) => s.roster);
  const { set, rollInit, addAllPcs, startCombat } = useStore.getState();
  const mons = combatants.filter((c) => c.kind === 'monster');
  const monsNoInit = mons.filter((c) => c.init == null).length;
  const pcs = combatants.filter((c) => c.kind === 'pc');
  const pcsNoInit = pcs.filter((c) => c.init == null).length;
  const steps = [
    { title: 'Añade los monstruos', text: mons.length ? mons.length + ' en el encuentro.' : 'Búscalos en el Bestiario (todo el SRD 2024) o crea los tuyos en la Forja.', done: mons.length > 0, btn: 'Ir al bestiario', act: () => set({ tab: 'bestiary' }) },
    { title: 'Tira su iniciativa', text: !mons.length ? 'Cuando tengas monstruos.' : monsNoInit ? monsNoInit + ' sin iniciativa.' : 'Hecho. Se ordenan solos por número.', done: mons.length > 0 && monsNoInit === 0, btn: 'Tirar iniciativa', act: () => rollInit() },
    { title: 'Añade a los jugadores', text: !pcs.length ? (roster.length ? 'Tienes ' + roster.length + ' guardados en Grupo.' : 'Guárdalos en Grupo una vez y reutilízalos.') : pcsNoInit ? 'Escribe la iniciativa de ' + pcsNoInit + ' jugador' + (pcsNoInit > 1 ? 'es' : '') + ' en la lista.' : pcs.length + ' jugadores listos.', done: pcs.length > 0 && pcsNoInit === 0, btn: roster.length ? 'Añadir todo el grupo' : 'Ir a Grupo', act: () => (roster.length ? addAllPcs() : set({ tab: 'group' })) },
    { title: 'Empieza el combate', text: 'La app lleva rondas, turnos, recargas, legendarias y estados.', done: false, btn: 'Empezar combate', act: () => startCombat(), primary: true },
  ];
  return (
    <div className="panel">
      <h2>Prepara el encuentro</h2>
      <ol className="steps">
        {steps.map((st, i) => (
          <li key={st.title} className={st.done ? 'done' : ''}>
            <span className="step-n" aria-hidden="true">{st.done ? '✓' : i + 1}</span>
            <span style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 2 }}><strong style={{ color: '#f3e6c8' }}>{st.title}</strong><span className="muted small">{st.text}</span></span>
            {!st.done && <button className={'primary' in st ? 'btn small primary' : 'btn small'} onClick={st.act} title={'primary' in st ? 'Empezar combate (N)' : undefined}>{st.btn}</button>}
          </li>
        ))}
      </ol>
      <EncounterGenerator />
    </div>
  );
}

function TurnCard() {
  const active = useStore((s) => (s.started ? s.combatants.find((c) => c.id === s.activeId) : undefined));
  const m = useStore((s) => s.monById(active?.monsterId));
  const round = useStore((s) => s.round);
  const events = useStore((s) => s.turnEvents);
  const combatants = useStore((s) => s.combatants);
  const { step, heal, rollDeath } = useStore.getState();
  if (!active) return null;
  const rem = reminders(active, m || null, combatants);
  return (
    <div className="turncard" aria-live="polite">
      <div className="panel-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow" style={{ color: '#e8c062' }}>Ronda {round} · inicio de turno</span>
          <span className="display" style={{ fontSize: 30, color: '#f3e6c8', lineHeight: 1.05 }}>{active.name}</span>
        </div>
        <div className="turn-ctrls">
          <button className="btn icon" onClick={() => step(-1)} aria-label="Volver al turno anterior" title="Volver al turno anterior (B)"><ChevronLeft /></button>
          <button className="btn primary" onClick={() => step(1)} title="Siguiente turno (N)"><span>Siguiente turno</span><ChevronRight /></button>
        </div>
      </div>
      <ul className="rem">
        {events.map((e, i) => <li key={'e' + i} className="ev">{e.text}</li>)}
        {rem.map((r, i) => (
          <li key={'r' + i}>
            <span style={{ flex: 1, minWidth: 200 }}>{r.text}</span>
            {r.action && (
              <button className="btn small gold" onClick={() => {
                if (r.action!.type === 'regen') heal(active.id, r.action!.amt, r.action!.src);
                else rollDeath(active.id);
              }}>{r.label}</button>
            )}
          </li>
        ))}
      </ul>
      {!rem.length && !events.length && <span className="muted small">Nada pendiente al inicio de este turno.</span>}
    </div>
  );
}

function ConcPrompts() {
  const prompts = useStore((s) => s.concPrompts);
  const { rollConc, resolveConc } = useStore.getState();
  return (
    <>
      {prompts.map((p) => (
        <div className="conc" role="alert" key={p.pid}>
          {p.save == null
            ? <span><strong>{p.name}</strong> ha recibido daño: tiene que sacar <strong>{p.dc}</strong> o más en la salvación de Constitución para mantener la concentración.</span>
            : <span><strong>{p.name}</strong> recibió daño mientras se concentraba: salvación de Constitución CD {p.dc}.</span>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {p.save != null && <button className="btn small gold" onClick={() => rollConc(p)}>Tirar (CON {fmt(p.save)})</button>}
            <button className="btn small" onClick={() => resolveConc(p, true)}>Mantiene</button>
            <button className="btn small ghost" onClick={() => resolveConc(p, false)}>La pierde</button>
          </div>
        </div>
      ))}
    </>
  );
}

function LegendaryBanner() {
  const list = useStore(useShallow((s) => (s.started ? s.combatants.filter((c) => c.laMax && c.hp > 0 && c.id !== s.activeId && c.laMax - c.laUsed > 0) : [])));
  const { set } = useStore.getState();
  if (!list.length) return null;
  return (
    <div className="banner">
      <span className="eyebrow" style={{ color: '#f0a090' }}>Acciones legendarias tras este turno</span>
      <div className="banner-row">
        {list.map((c) => (
          <button key={c.id} className="btn small" title="Abre su hoja en las acciones legendarias" onClick={() => {
            set({ selId: c.id, tab: 'combat' });
            // cuando ya se ha dibujado su hoja, bajar hasta sus acciones legendarias
            requestAnimationFrame(() => requestAnimationFrame(() => {
              const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
              document.querySelector('.sheet-col section[aria-label="Acciones legendarias"]')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
            }));
          }}>{c.name} · {c.laMax - c.laUsed}/{c.laMax}</button>
        ))}
      </div>
    </div>
  );
}

export default function CenterPanel() {
  const tab = useStore((s) => s.tab);
  const started = useStore((s) => s.started);
  const sel = useStore((s) => s.combatants.find((c) => c.id === s.selId) || null);
  const hasActive = useStore((s) => s.started && s.combatants.some((c) => c.id === s.activeId));
  const hasCombatants = useStore((s) => s.combatants.length > 0);
  const viewM = useStore((s) => s.monById(s.viewId || undefined));
  const selM = useStore((s) => s.monById(sel?.monsterId));
  const forge = useStore((s) => s.forge);
  const spells = useStore((s) => s.spells);
  const loaded = useStore((s) => s.loaded);
  const hasRule = useStore((s) => !!s.rules && !!s.ruleId && s.rules.some((x) => x.id === s.ruleId));
  const forgeM = useMemo(() => (tab === 'forge' ? forgeToMonster(forge, 'preview', spells) : null), [tab, forge, spells]);

  const isCombat = tab === 'combat';
  let sheet: { m: NonNullable<typeof viewM>; label: string; c: typeof sel } | null = null;
  if (isCombat && sel && sel.kind === 'monster' && selM) sheet = { m: selM, label: 'Hoja de ' + sel.name, c: sel };
  else if (tab === 'bestiary' && viewM) sheet = { m: viewM, label: viewM.custom ? 'Bestiario · creación propia' : viewM.id.startsWith('mm-') ? 'Bestiario · tu Manual de Monstruos' : 'Bestiario · SRD 5.2.1', c: null };
  else if (tab === 'forge' && forgeM) sheet = { m: forgeM, label: 'Vista previa en vivo', c: null };

  const hasCtrl = (isCombat && !started) || tab === 'group' || (isCombat && (hasActive || !!sel));
  const emptyCombat = isCombat && started && hasCombatants && !sel;

  return (
    <>
      <div className="center-grid">
        {hasCtrl && (
          <div className="ctrl-col" style={sheet ? undefined : { maxWidth: 'none' }}>
            {isCombat && !started && <Onboarding />}
            {tab === 'group' && <PartySheets />}
            {isCombat && (
              <>
                <ConcPrompts />
                <LegendaryBanner />
                <TurnCard />
                {sel && <CombatantCard c={sel} />}
              </>
            )}
          </div>
        )}
        {tab === 'rules' && hasRule && (
          <div className="sheet-col">
            <span className="eyebrow">Reglas · SRD 5.2.1</span>
            <RuleView />
          </div>
        )}
        {sheet && (
          <div className="sheet-col">
            <span className="eyebrow">{sheet.label}</span>
            <StatBlock m={sheet.m} c={sheet.c} />
            <SpellCard />
          </div>
        )}
      </div>
      {(emptyCombat || (tab === 'bestiary' && !viewM && loaded) || (tab === 'rules' && !hasRule)) && (
        <div className="panel" style={{ alignItems: 'center', textAlign: 'center', padding: '40px 24px' }}>
          <h2>{tab === 'bestiary' ? 'Elige una criatura' : tab === 'rules' ? 'Busca una regla' : 'Nadie seleccionado'}</h2>
          <p className="muted" style={{ margin: 0 }}>{tab === 'bestiary' ? 'Pulsa una criatura de la lista para ver su hoja.' : tab === 'rules' ? 'Escribe un término en español o en inglés (derribado, prone, cobertura, bola de fuego…) o elige una de las más consultadas. Las reglas son las del SRD 5.2.1 (2024) y los enlaces del texto abren la regla citada.' : 'Pulsa a alguien en la iniciativa para ver su hoja y llevar sus PG y estados.'}</p>
          {tab === 'rules' && <RuleQuick />}
        </div>
      )}
    </>
  );
}
