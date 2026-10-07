import { useEffect, useState } from 'react';
import { derive } from '../engine/character';
import type { SheetSummary } from '../store/cloudAdapter';
import { activeCharacter, usePlayer } from '../store/player';
import { cleanCode, hadRoom, useRoom } from '../store/room';
import { applyInitiativeRolls, syncMembersToTable } from '../store/roomTable';

/** Resumen de la hoja activa del jugador para la sala. */
function useSheetSummary(enabled: boolean): SheetSummary | null {
  const c = usePlayer(activeCharacter);
  const data = usePlayer((s) => s.data);
  if (!enabled || !c) return null;
  const d = derive(c, data);
  return { name: c.name || 'Sin nombre', cls: d.cls?.n || c.className || '', level: c.level, ac: d.ac, hp: c.hp, hpMax: d.hpMax, temp: c.temp, pp: d.pp, init: d.init, conds: c.conds };
}

/**
 * Sala de juego: crear (máster) o entrar con el código (jugador), quién está con su hoja resumida y las tiradas que se
 * comparten en directo.
 */
export default function RoomPanel({ mode }: { mode: 'dm' | 'player' }) {
  const { code, role, room, members, rolls, share, busy, error } = useRoom();
  const { create, join, leave, close, setShare, publishSheet, resume } = useRoom.getState();
  const active = usePlayer(activeCharacter);
  const [codeIn, setCodeIn] = useState('');
  const [name, setName] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [open, setOpen] = useState(false);
  const sheet = useSheetSummary(mode === 'player' && role === 'player');

  // al abrir la app, volver a la sala en la que se estaba
  useEffect(() => { if (hadRoom()) void resume(); }, [resume]);
  useEffect(() => { if (sheet) publishSheet(sheet); }, [sheet, publishSheet]);
  // el máster: los jugadores de la sala pasan a su Grupo y al combate, con sus PG en directo
  useEffect(() => { if (mode === 'dm' && role === 'dm') syncMembersToTable(members); }, [mode, role, members]);
  useEffect(() => { if (mode === 'dm' && role === 'dm') applyInitiativeRolls(rolls, members); }, [mode, role, rolls, members]);

  const defaultName = mode === 'dm' ? 'Máster' : active?.name || '';

  if (!code) {
    return (
      <div className="panel room">
        <div className="panel-head">
          <h3 className="eyebrow">Sala</h3>
          {!open && <button className="btn small" onClick={() => setOpen(true)}>{mode === 'dm' ? 'Crear sala' : 'Entrar en una sala'}</button>}
        </div>
        {!open && <p className="muted small" style={{ margin: 0 }}>{mode === 'dm' ? 'Crea una sala y pasa el código a tus jugadores: verás sus tiradas y sus PG y CA en directo.' : 'Entra con el código que te dé el máster: tus tiradas y tu hoja resumida se verán en la mesa.'}</p>}
        {open && (
          <form className="room-form" onSubmit={(e) => { e.preventDefault(); void (mode === 'dm' ? create(name || defaultName) : join(codeIn, name || defaultName)).then((ok) => ok && setOpen(false)); }}>
            {mode === 'player' && <div className="field"><label htmlFor="room-code">Código de la sala</label><input id="room-code" className="input room-code-in" value={codeIn} autoComplete="off" placeholder="ABC123" onChange={(e) => setCodeIn(cleanCode(e.target.value))} /></div>}
            <div className="field"><label htmlFor="room-name">Tu nombre en la sala</label><input id="room-name" className="input" value={name} placeholder={defaultName || 'Tu nombre'} onChange={(e) => setName(e.target.value)} /></div>
            <div className="rollrow">
              <button type="submit" className="btn small primary" disabled={busy || (mode === 'player' && codeIn.length !== 6)}>{busy ? 'Conectando…' : mode === 'dm' ? 'Crear sala' : 'Entrar'}</button>
              <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>Cancelar</button>
            </div>
            <span className="muted small">Sin cuenta entras como invitado.</span>
          </form>
        )}
        {error && <p className="warn" role="alert" style={{ margin: 0 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="panel room" aria-label="Sala">
      <div className="panel-head">
        <h3 className="eyebrow">Sala <span className="room-code" aria-label={'Código ' + code}>{code}</span></h3>
        <span className="rollrow">
          {role === 'dm' && <button className="btn small ghost" title="Copiar el código" onClick={() => { try { void navigator.clipboard.writeText(code); } catch { /* sin portapapeles */ } }}>Copiar código</button>}
          <button className="btn small ghost" onClick={() => void leave()}>Salir</button>
          {role === 'dm' && <button className="btn small ghost" onClick={() => { if (confirmClose) void close(); else setConfirmClose(true); }}>{confirmClose ? '¿Seguro? Cerrar sala' : 'Cerrar sala'}</button>}
        </span>
      </div>
      <span className="muted small">{room?.name} · {members.length} en la sala</span>
      <label className="check small"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />Compartir mis tiradas{role === 'dm' ? ' (las de los monstruos también)' : ''}</label>
      <ul className="room-members">
        {members.map((m) => (
          <li key={m.uid}>
            <b>{m.name}</b>{m.role === 'dm' && <span className="chip-tag">Máster</span>}
            {m.sheet && (
              <span className="muted small">
                {m.sheet.name !== m.name ? m.sheet.name + ' · ' : ''}{[m.sheet.cls, m.sheet.level].filter(Boolean).join(' ')} · CA {m.sheet.ac} · PG {m.sheet.hp}/{m.sheet.hpMax}{m.sheet.temp ? ' (+' + m.sheet.temp + ')' : ''} · Perc. pasiva {m.sheet.pp}{m.sheet.conds.length ? ' · ' + m.sheet.conds.join(', ') : ''}
              </span>
            )}
          </li>
        ))}
      </ul>
      <h4 className="eyebrow">Tiradas</h4>
      {!rolls.length ? <p className="muted small" style={{ margin: 0 }}>Aún no hay tiradas en la sala.</p> : (
        <ul className="room-rolls" aria-live="polite">
          {rolls.slice(0, 15).map((r) => (
            <li key={r.id} className={r.cls}>
              <span className="room-roll-label">{r.label}</span>
              <b className="room-roll-total">{r.total}</b>
              <span className="muted small room-roll-detail">{r.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="warn" role="alert" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
