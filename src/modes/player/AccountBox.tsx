import { useEffect, useState } from 'react';
import { hadSession, useAccount } from '../../store/account';

/**
 * Cuenta opcional: con ella tus personajes se guardan también en la nube y aparecen en tus otros dispositivos.
 * Sin cuenta, todo sigue solo en este dispositivo.
 */
export default function AccountBox() {
  const { status, user, error, sync, syncError } = useAccount();
  const { start, google, emailIn, emailUp, reset, out } = useAccount.getState();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // si ya había sesión, se recupera al abrir la app
  useEffect(() => { if (hadSession()) void start(); }, [start]);

  const run = async (f: () => Promise<unknown>) => { setBusy(true); setNote(''); try { await f(); } finally { setBusy(false); } };

  if (status === 'in' && user && !user.anon) {
    const syncText = sync === 'syncing' ? 'sincronizando…' : sync === 'error' ? 'no se pudo sincronizar' : 'personajes sincronizados';
    return (
      <div className="rollrow pc-account">
        <span className="muted small">Cuenta: <b>{user.email || user.name}</b> · <span className={sync === 'error' ? 'warn' : ''}>{syncText}</span></span>
        <button className="btn small ghost" onClick={() => void out()}>Cerrar sesión</button>
        {sync === 'error' && syncError && <span className="warn small" role="alert">{syncError}</span>}
      </div>
    );
  }

  return (
    <div className="pc-account">
      {!open ? (
        <div className="rollrow">
          <span className="muted small">{status === 'loading' ? 'Comprobando la sesión…' : 'Sin cuenta: tus personajes están solo en este dispositivo.'}</span>
          <button className="btn small ghost" disabled={status === 'loading'} onClick={() => { setOpen(true); void start(); }}>Iniciar sesión</button>
        </div>
      ) : (
        <form className="pc-login" onSubmit={(e) => { e.preventDefault(); void run(() => emailIn(email, pass)); }}>
          <p className="muted small" style={{ margin: 0 }}>Con una cuenta tus personajes se guardan también en la nube y los tienes en todos tus dispositivos. Tu biblioteca y los PDF siguen solo en el dispositivo.</p>
          <button type="button" className="btn small" disabled={busy || status === 'loading'} onClick={() => void run(google)}>Entrar con Google</button>
          <div className="row2">
            <div className="field"><label htmlFor="acc-email">Correo</label><input id="acc-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label htmlFor="acc-pass">Contraseña</label><input id="acc-pass" className="input" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} /></div>
          </div>
          <div className="rollrow">
            <button type="submit" className="btn small primary" disabled={busy || !email || !pass}>Entrar</button>
            <button type="button" className="btn small" disabled={busy || !email || pass.length < 6} title="La contraseña necesita al menos 6 caracteres" onClick={() => void run(() => emailUp(email, pass))}>Crear cuenta</button>
            <button type="button" className="btn small ghost" disabled={busy || !email} onClick={() => void run(async () => setNote(await reset(email)))}>He olvidado la contraseña</button>
            <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
          {(error || note) && <p className={error ? 'warn' : 'muted small'} role={error ? 'alert' : 'status'} style={{ margin: 0 }}>{error || note}</p>}
        </form>
      )}
    </div>
  );
}
