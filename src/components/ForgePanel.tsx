import { useMemo, useState } from 'react';
import { ABIL, ABIL_LONG, CONDITION_IMMUNITIES, CR_LIST, DMG_TYPES, SIZES, XP_BY_CR } from '../data/constants';
import type { SectionKey } from '../data/types';
import { fmt, modOf, parseExpr } from '../engine/dice';
import { forgeToMonster, newFeat, type ForgeFeat, type ForgeState } from '../engine/forge';
import { nfmt, pbOf } from '../engine/util';
import { useStore } from '../store/useStore';
import { ChevronUp } from './Icons';
import Picker from './Picker';

const NEXT = { none: 'resist', resist: 'immune', immune: 'vuln', vuln: 'none' } as const;
const TAG = { none: '', resist: 'R', immune: 'I', vuln: 'V' };
const WORD = { none: 'sin efecto', resist: 'resistencia', immune: 'inmunidad', vuln: 'vulnerabilidad' };
const SEC_LABEL: Record<SectionKey, string> = { tr: 'Rasgo', ac_: 'Acción', ba: 'Acción adicional', re: 'Reacción', lg: 'Legendaria' };
const KIND_LABEL: Record<string, string> = { melee: 'cuerpo a cuerpo', ranged: 'a distancia', save: 'salvación', spells: 'conjuros', text: 'texto' };

/** Aviso bajo un campo de daño que la app no sabe tirar (p. ej. «2d6 + 4 cortante»). */
function BadExpr({ v }: { v: string }) {
  if (!v.trim() || parseExpr(v)) return null;
  return <span className="warn small" role="status">No se entiende «{v}». Escribe solo los dados, como 2d6+4; el tipo va al lado.</span>;
}

function Feat({ ft, i }: { ft: ForgeFeat; i: number }) {
  const { setFeat, setForge, confirm } = useStore.getState();
  const confirmKey = useStore((s) => s.confirmKey);
  const on = (k: keyof ForgeFeat) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setFeat(i, k, e.target instanceof HTMLInputElement && e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  const feats = () => useStore.getState().forge.feats;
  const id = (p: string) => p + '-' + ft.k;
  const isAtk = ft.kind === 'melee' || ft.kind === 'ranged';
  const [open, setOpen] = useState(!ft.name);
  return (
    <details className="sub feat" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="feat-sum">
        <span className="feat-name">{ft.name || 'Sin nombre'}</span>
        <span className="muted small">{SEC_LABEL[ft.sec]} · {KIND_LABEL[ft.kind]}</span>
      </summary>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}><label htmlFor={id('n')}>Nombre</label><input id={id('n')} className="input" value={ft.name} onChange={on('name')} /></div>
        <button className="btn small ghost icon" aria-label="Subir" disabled={i === 0} onClick={() => { const a = feats().slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; setForge({ feats: a }); }}><ChevronUp /></button>
        <button className="btn small ghost" onClick={() => confirm('feat-' + ft.k, () => setForge({ feats: feats().filter((x) => x.k !== ft.k) }))}>{confirmKey === 'feat-' + ft.k ? '¿Seguro? Quitar' : 'Quitar'}</button>
      </div>
      <div className="row2">
        <div className="field"><label htmlFor={id('s')}>Sección</label>
          <select id={id('s')} className="input" value={ft.sec} onChange={on('sec')}>
            <option value="tr">Rasgo</option><option value="ac_">Acción</option><option value="ba">Acción adicional</option><option value="re">Reacción</option><option value="lg">Acción legendaria</option>
          </select></div>
        <div className="field"><label htmlFor={id('k')}>Tipo</label>
          <select id={id('k')} className="input" value={ft.kind} onChange={on('kind')}>
            <option value="melee">Ataque cuerpo a cuerpo</option><option value="ranged">Ataque a distancia</option><option value="save">Tirada de salvación</option><option value="spells">Lanzamiento de conjuros</option><option value="text">Solo texto</option>
          </select></div>
      </div>
      {isAtk && (
        <div className="row2">
          <div className="field"><label htmlFor={id('b')}>Bonif. ataque</label><input id={id('b')} type="number" className="input" value={ft.atk} onChange={on('atk')} /></div>
          <div className="field"><label htmlFor={id('r')}>Alcance</label><input id={id('r')} className="input" value={ft.reach} onChange={on('reach')} /></div>
        </div>
      )}
      {ft.kind === 'save' && (
        <>
          <div className="row3">
            <div className="field"><label htmlFor={id('sa')}>Salvación</label>
              <select id={id('sa')} className="input" value={ft.sab} onChange={on('sab')}>{ABIL.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
            <div className="field"><label htmlFor={id('dc')}>CD</label><input id={id('dc')} type="number" className="input" value={ft.dc} onChange={on('dc')} /></div>
            <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={ft.half} onChange={on('half')} />Mitad si supera</label>
          </div>
          <div className="field"><label htmlFor={id('ar')}>Área / objetivos</label><input id={id('ar')} className="input" value={ft.area} onChange={on('area')} placeholder="cada criatura en un cono de 30 pies" /></div>
        </>
      )}
      {ft.kind !== 'spells' && (
        <>
          <div className="row2">
            <div className="field"><label htmlFor={id('d1')}>Daño</label><input id={id('d1')} className="input" value={ft.d1} onChange={on('d1')} placeholder="2d6+4" /></div>
            <div className="field"><label htmlFor={id('t1')}>Tipo</label><select id={id('t1')} className="input" value={ft.t1} onChange={on('t1')}>{DMG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          </div>
          <BadExpr v={ft.d1} />
          <div className="row2">
            <div className="field"><label htmlFor={id('d2')}>Daño extra (opcional)</label><input id={id('d2')} className="input" value={ft.d2} onChange={on('d2')} placeholder="2d6" /></div>
            <div className="field"><label htmlFor={id('t2')}>Tipo extra</label><select id={id('t2')} className="input" value={ft.t2} onChange={on('t2')}>{DMG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          </div>
          <BadExpr v={ft.d2} />
          <div className="field"><label htmlFor={id('al')}>Daño alternativo: cuándo (opcional)</label>
            <input id={id('al')} className="input" value={ft.altL} onChange={on('altL')} placeholder="con ventaja, si está Ensangrentado, tras cargar…" /></div>
          {ft.altL.trim() !== '' && (
            <>
              <div className="row2">
                <div className="field"><label htmlFor={id('a1')}>Daño en ese caso</label><input id={id('a1')} className="input" value={ft.altD1} onChange={on('altD1')} placeholder="2d6+4" /></div>
                <div className="field"><label htmlFor={id('at1')}>Tipo</label><select id={id('at1')} className="input" value={ft.altT1} onChange={on('altT1')}>{DMG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              </div>
              <BadExpr v={ft.altD1} />
              <div className="row2">
                <div className="field"><label htmlFor={id('a2')}>Daño extra en ese caso</label><input id={id('a2')} className="input" value={ft.altD2} onChange={on('altD2')} placeholder="1d4" /></div>
                <div className="field"><label htmlFor={id('at2')}>Tipo extra</label><select id={id('at2')} className="input" value={ft.altT2} onChange={on('altT2')}>{DMG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              </div>
              <BadExpr v={ft.altD2} />
              <span className="muted small">Es el daño completo de ese caso: en la hoja sale como un segundo botón de daño.</span>
            </>
          )}
        </>
      )}
      {ft.kind === 'spells' && (
        <>
          <div className="row3">
            <div className="field"><label htmlFor={id('sab')}>Característica</label><input id={id('sab')} className="input" value={ft.spAb} onChange={on('spAb')} /></div>
            <div className="field"><label htmlFor={id('sdc')}>CD</label><input id={id('sdc')} type="number" className="input" value={ft.spDc} onChange={on('spDc')} /></div>
            <div className="field"><label htmlFor={id('sat')}>Ataque</label><input id={id('sat')} type="number" className="input" value={ft.spAtk} onChange={on('spAtk')} /></div>
          </div>
          <div className="field"><label htmlFor={id('sw')}>A voluntad</label><input id={id('sw')} className="input" value={ft.spWill} onChange={on('spWill')} placeholder="Detectar magia, Mano de mago" /></div>
          <div className="field"><label htmlFor={id('s1')}>1/día cada uno</label><input id={id('s1')} className="input" value={ft.spDay1} onChange={on('spDay1')} placeholder="Bola de fuego" /></div>
          <div className="field"><label htmlFor={id('s2')}>2/día cada uno</label><input id={id('s2')} className="input" value={ft.spDay2} onChange={on('spDay2')} /></div>
          <div className="field"><label htmlFor={id('s3')}>3/día cada uno</label><input id={id('s3')} className="input" value={ft.spDay3} onChange={on('spDay3')} /></div>
          <span className="muted small">Si el nombre coincide con un conjuro del SRD, podrás abrir su descripción desde la hoja.</span>
        </>
      )}
      <div className="row2">
        <div className="field"><label htmlFor={id('u')}>Usos</label>
          <select id={id('u')} className="input" value={ft.usage} onChange={on('usage')}>
            <option value="none">Sin límite</option><option value="rc6">Recarga 6</option><option value="rc5">Recarga 5–6</option><option value="rc4">Recarga 4–6</option><option value="day1">1/día</option><option value="day2">2/día</option><option value="day3">3/día</option>
          </select></div>
        {ft.sec === 'lg' && <div className="field"><label htmlFor={id('c')}>Coste legendario</label><input id={id('c')} type="number" min={1} max={3} className="input" value={ft.cost} onChange={on('cost')} /></div>}
      </div>
      <div className="field"><label htmlFor={id('de')}>{ft.kind === 'text' ? 'Descripción' : ft.raw ? 'Descripción completa' : 'Efecto adicional (se añade al texto generado)'}</label>
        <textarea id={id('de')} className="input" rows={3} value={ft.desc} onChange={on('desc')} /></div>
      {ft.kind !== 'text' && <label className="check"><input type="checkbox" checked={ft.raw} onChange={on('raw')} />Usar este texto tal cual (no generar)</label>}
    </details>
  );
}

export default function ForgePanel() {
  const f = useStore((s) => s.forge);
  const editingId = useStore((s) => s.editingId);
  const forgeMsg = useStore((s) => s.forgeMsg);
  const spells = useStore((s) => s.spells);
  const { setForge, saveForge, newForge } = useStore.getState();
  const fm = useMemo(() => forgeToMonster(f, 'x', spells), [f, spells]);
  const on = (k: keyof ForgeState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForge({ [k]: e.target.value } as Partial<ForgeState>);
  const addFeat = (sec: SectionKey) => setForge({ feats: f.feats.concat([newFeat(sec)]) });
  const dmgSummary = (['resist', 'immune', 'vuln'] as const)
    .map((mode) => [mode, DMG_TYPES.filter((t) => f.dmg[t] === mode)] as const)
    .filter(([, ts]) => ts.length)
    .map(([mode, ts]) => ({ resist: 'Resiste ', immune: 'Inmune a ', vuln: 'Vulnerable a ' })[mode] + ts.join(', '))
    .join(' · ');
  return (
    <div className="panel forge-panel">
      <div className="panel-head"><h2>Forja</h2><span className="muted small">{editingId ? 'Editando: ' + (f.name || 'sin nombre') : 'Criatura nueva'}</span></div>

      <fieldset className="fs">
        <legend>Identidad</legend>
        <div className="row-name">
          <div className="field"><label htmlFor="f-name">Nombre</label><input id="f-name" className="input" value={f.name} onChange={on('name')} /></div>
          <div className="field"><label htmlFor="f-size">Tamaño</label><select id="f-size" className="input" value={f.size} onChange={on('size')}>{SIZES.map((z) => <option key={z}>{z}</option>)}</select></div>
        </div>
        <div className="row2">
          <div className="field"><label htmlFor="f-type">Tipo</label><input id="f-type" className="input" value={f.type} onChange={on('type')} /></div>
          <div className="field"><label htmlFor="f-align">Alineamiento</label><input id="f-align" className="input" value={f.align} onChange={on('align')} /></div>
        </div>
      </fieldset>

      <fieldset className="fs">
        <legend>Defensa y movimiento</legend>
        <div className="row4f">
          <div className="field"><label htmlFor="f-ac">CA</label><input id="f-ac" type="number" className="input" value={f.ac} onChange={on('ac')} /></div>
          <div className="field"><label htmlFor="f-hp">PG <span className="muted">· media {fm.hp}</span></label><input id="f-hp" className="input" value={f.hpDice} onChange={on('hpDice')} placeholder="4d8+4" /></div>
          <div className="field"><label htmlFor="f-ini">Iniciativa</label><input id="f-ini" type="number" className="input" value={f.ini} onChange={on('ini')} placeholder={fmt(modOf(f.abil[1]))} /></div>
          <div className="field"><label htmlFor="f-speed">Velocidad</label><input id="f-speed" className="input" value={f.speed} onChange={on('speed')} /></div>
        </div>
        <BadExpr v={f.hpDice} />
      </fieldset>

      <fieldset className="fs">
        <legend>Características</legend>
        <div className="row3 abil-grid">
          {ABIL.map((k, i) => (
            <div className="abil-edit" key={k}>
              <label htmlFor={'fa-' + i}>{k}</label>
              <input id={'fa-' + i} type="number" min={1} max={30} className="input" value={f.abil[i]} onChange={(e) => { const a = f.abil.slice(); a[i] = e.target.value; setForge({ abil: a }); }} />
              <span className="muted small">{fmt(modOf(f.abil[i]))} · salv. {fmt(fm.sv[i])}</span>
              <button className={f.saveProf[i] ? 'ts on' : 'ts'} aria-pressed={f.saveProf[i]} aria-label={'Competencia en salvación de ' + ABIL_LONG[i]}
                onClick={() => { const p = f.saveProf.slice(); p[i] = !p[i]; setForge({ saveProf: p }); }}>Comp. salv.</button>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="fs">
        <legend>Desafío y sentidos</legend>
        <div className="row2">
          <div className="field"><label htmlFor="f-cr">VD <span className="muted">· {nfmt(XP_BY_CR[f.cr] || 0)} PX · BC {fmt(pbOf(f.cr))}</span></label><select id="f-cr" className="input" value={f.cr} onChange={on('cr')}>{CR_LIST.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="f-pp">Percepción pasiva</label><input id="f-pp" type="number" className="input" value={f.pp} onChange={on('pp')} /></div>
        </div>
        <div className="field"><label htmlFor="f-skills">Habilidades</label><input id="f-skills" className="input" value={f.skills} onChange={on('skills')} placeholder="Percepción +4, Sigilo +5" /></div>
        <div className="field"><label htmlFor="f-senses">Sentidos</label><input id="f-senses" className="input" value={f.senses} onChange={on('senses')} placeholder="visión en la oscuridad 60 pies" /></div>
        <div className="field"><label htmlFor="f-langs">Idiomas</label><input id="f-langs" className="input" value={f.langs} onChange={on('langs')} /></div>
      </fieldset>

      <fieldset className="fs">
        <legend>Daño y estados</legend>
        <Picker title="Defensas contra daño" summary={dmgSummary}>
        <p className="muted small" style={{ margin: 0 }}>Pulsa un tipo para alternar: resistencia (R) → inmunidad (I) → vulnerabilidad (V) → nada.</p>
        <div className="chips">
          {DMG_TYPES.map((t) => {
            const mode = f.dmg[t] || 'none';
            return (
              <button key={t} className={mode === 'none' ? 'chip' : 'chip ' + mode} aria-label={t + ': ' + WORD[mode]} onClick={() => setForge({ dmg: { ...f.dmg, [t]: NEXT[mode] } })}>
                {t}{mode !== 'none' && <span className="chip-tag">{TAG[mode]}</span>}
              </button>
            );
          })}
        </div>
        </Picker>
        <Picker title="Inmune a estados" summary={CONDITION_IMMUNITIES.filter((c) => f.condImm[c]).join(', ')}>
        <div className="chips">
          {CONDITION_IMMUNITIES.map((c) => (
            <button key={c} className={f.condImm[c] ? 'chip on' : 'chip'} aria-pressed={!!f.condImm[c]} onClick={() => setForge({ condImm: { ...f.condImm, [c]: !f.condImm[c] } })}>{c}</button>
          ))}
        </div>
        </Picker>
      </fieldset>

      <fieldset className="fs">
        <legend>Legendario</legend>
        <Picker title="Resistencias, acciones legendarias y guarida" summary={[+f.lr ? f.lr + ' res. leg./día' : '', +f.la ? f.la + ' usos de acción leg.' : '', f.lair ? 'guarida' : ''].filter(Boolean).join(' · ')} empty="no es legendario">
        <div className="row2">
          <div className="field"><label htmlFor="f-lr">Resistencia legendaria / día</label><input id="f-lr" type="number" min={0} max={6} className="input" value={f.lr} onChange={on('lr')} /></div>
          <div className="field"><label htmlFor="f-la">Usos de acción legendaria</label><input id="f-la" type="number" min={0} max={6} className="input" value={f.la} onChange={on('la')} /></div>
        </div>
        <label className="check"><input type="checkbox" checked={f.lair} onChange={(e) => setForge({ lair: e.target.checked })} />Tiene guarida (+1 uso de cada en ella)</label>
        </Picker>
      </fieldset>

      <fieldset className="fs">
        <legend>Rasgos y acciones</legend>
        {f.feats.map((ft, i) => <Feat key={ft.k} ft={ft} i={i} />)}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn small" onClick={() => addFeat('tr')}>+ Rasgo</button>
          <button className="btn small" onClick={() => addFeat('ac_')}>+ Acción</button>
          <button className="btn small" onClick={() => addFeat('ba')}>+ Adicional</button>
          <button className="btn small" onClick={() => addFeat('re')}>+ Reacción</button>
          <button className="btn small" onClick={() => addFeat('lg')}>+ Legendaria</button>
        </div>
      </fieldset>

      {forgeMsg && <p className="warn" role="status">{forgeMsg}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button className="btn primary" onClick={() => saveForge(false)}>Guardar en el bestiario</button>
        <button className="btn" onClick={() => saveForge(true)}>Guardar y al combate</button>
        <button className="btn ghost" onClick={newForge}>Empezar de cero</button>
      </div>
    </div>
  );
}
