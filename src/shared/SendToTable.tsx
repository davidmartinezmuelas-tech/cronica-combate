import { useState } from 'react';
import { useRoom } from '../store/room';
import { useStore } from '../store/useStore';

const ABIL_N = ['Fuerza', 'Destreza', 'Constitución', 'Inteligencia', 'Sabiduría', 'Carisma'];

/**
 * Jugador en una sala: la última tirada (daño, curación o efecto con salvación) se manda a la mesa del máster sobre
 * los objetivos que elija de su lista de iniciativa; el máster la revisa y la aplica.
 */
export default function SendToTable() {
  const r = useStore((s) => s.result);
  const rolling = useStore((s) => s.rolling);
  const { code, role, table, lastAttack } = useRoom();
  const [sel, setSel] = useState<string[]>([]);
  const [sent, setSent] = useState('');
  const [withAtk, setWithAtk] = useState(true);
  if (!code || role !== 'player' || !r || rolling || r.applied || !(r.isDmg || r.effect || r.heal)) return null;
  // el ataque que va con este daño: el último, si es del mismo arma o conjuro y reciente
  const atk = lastAttack && Date.now() - lastAttack.at < 3 * 60 * 1000 && r.label.startsWith(lastAttack.label) ? lastAttack : null;
  const total = parseInt(r.total, 10);
  const send = async () => {
    const ok = await useRoom.getState().sendCast({
      label: r.label, targets: sel, crit: !!r.crit, parts: r.isDmg ? r.parts : [],
      attack: atk && withAtk ? atk.total : null, heal: r.heal && !Number.isNaN(total) ? total : null, effect: r.effect || null,
    });
    if (ok) { setSent('Enviado al máster: lo revisa y lo aplica.'); setSel([]); }
  };
  if (!table.length) return <p className="small muted" style={{ margin: 0 }}>El máster aún no ha compartido la lista de iniciativa.</p>;
  return (
    <div className="targets send-table">
      <span className="small muted">
        Mandar a la mesa del máster{r.effect ? ' (salvación de ' + ABIL_N[r.effect.abil] + ' CD ' + r.effect.dc + ')' : r.heal ? ' (curación)' : ''}. Objetivos:
      </span>
      <div className="chips" role="group" aria-label="Objetivos en la mesa">
        {table.map((t) => <button key={t.id} className={sel.includes(t.id) ? 'chip on' : 'chip'} aria-pressed={sel.includes(t.id)} onClick={() => { setSent(''); setSel(sel.includes(t.id) ? sel.filter((x) => x !== t.id) : [...sel, t.id]); }}>{t.name}</button>)}
      </div>
      {atk && r.isDmg && !r.effect && <label className="check small"><input type="checkbox" checked={withAtk} onChange={(e) => setWithAtk(e.target.checked)} />Con su ataque: {atk.total} (el máster lo compara con la CA)</label>}
      <button className="btn small primary" style={{ alignSelf: 'flex-start' }} disabled={!sel.length} onClick={() => void send()}>Enviar a la mesa</button>
      {sent && <span className="small muted" role="status">{sent}</span>}
    </div>
  );
}
