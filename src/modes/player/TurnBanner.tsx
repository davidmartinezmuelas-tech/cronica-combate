import { useEffect, useRef, useState } from 'react';
import { derive } from '../../engine/character';
import { sgn } from '../../engine/dice';
import { useAccount } from '../../store/account';
import { activeCharacter, usePlayer } from '../../store/player';
import { useRoom } from '../../store/room';
import { useStore } from '../../store/useStore';
import { REACTION } from './ReactionPanel';

/**
 * Avisos de turno en la pantalla del jugador (solo si el máster los activa en la sala): pedir la iniciativa, el
 * comienzo y el final del combate, y «es tu turno» con el botón para terminarlo. No enseña la lista ni el orden.
 */
export default function TurnBanner() {
  const role = useRoom((x) => x.role);
  const turn = useRoom((x) => x.turn);
  const uid = useAccount((x) => x.user?.uid);
  const c = usePlayer(activeCharacter);
  const data = usePlayer((s) => s.data);
  const [flash, setFlash] = useState('');
  const [askSeen, setAskSeen] = useState(0);
  const prev = useRef(turn);
  const on = role === 'player' && !!turn?.on;
  const mine = on && !!turn!.started && !!uid && turn!.uid === uid;

  // comienzo y final del combate: un aviso que se va solo; el turno propio, además, vibra (si el móvil puede)
  useEffect(() => {
    const was = prev.current;
    prev.current = turn;
    if (!on) return;
    if (turn!.started && !was?.started) setFlash(mine ? '' : '¡Empieza el combate!');
    else if (!turn!.started && was?.started) setFlash('Fin del combate');
    if (mine && was?.uid !== uid) {
      try { navigator.vibrate?.([120, 60, 120]); } catch { /* sin vibración */ }
      // empieza tu turno: recuperas la reacción
      if (c && c.uses[REACTION]) usePlayer.getState().update(c.id, { uses: { ...c.uses, [REACTION]: 0 } });
    }
  }, [turn]); // eslint-disable-line react-hooks/exhaustive-deps
  // el aviso se va solo (aunque el turno cambie mientras tanto)
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  if (!on) return null;
  const asking = !turn!.started && turn!.ask > askSeen;
  const rollInit = () => {
    setAskSeen(turn!.ask);
    if (!c) return;
    const d = derive(c, data);
    const who = c.name || 'Personaje';
    // la misma etiqueta que la de la hoja: así llega sola a la lista del máster
    useStore.getState().roll({ label: who + ' · iniciativa', kind: 'init', who, parts: [{ expr: '1d20' + sgn(d.init) }], self: { conds: c.conds, exh: c.exh }, ...(d.initAdv ? { adv: d.initAdv } : {}) });
  };

  return (
    <>
      {mine && (
        <div className="turn-banner mine" role="alert">
          <span className="turn-banner-t">Es tu turno</span>
          <span className="turn-banner-s">Ronda {turn!.round}</span>
          <button className="btn primary" onClick={() => useRoom.getState().endTurn()}>Terminar mi turno</button>
        </div>
      )}
      {!mine && asking && (
        <div className="turn-banner" role="alert">
          <span className="turn-banner-t">El máster pide la iniciativa</span>
          <span className="rollrow">
            <button className="btn gold" onClick={rollInit} disabled={!c}>Tirar iniciativa</button>
            <button className="btn ghost" onClick={() => setAskSeen(turn!.ask)}>Ya la he tirado</button>
          </span>
        </div>
      )}
      {!mine && !asking && flash && <div className="turn-banner" role="status"><span className="turn-banner-t">{flash}</span></div>}
    </>
  );
}
