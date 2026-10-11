import { useState } from 'react';
import { useAccount } from '../store/account';

/**
 * Cuenta opcional: con ella tus personajes (jugador) y tus criaturas, encuentros y grupo (máster) se guardan también
 * en la nube y aparecen en tus otros dispositivos. Sin cuenta, todo sigue solo en este dispositivo.
 * `start`: en la pantalla de inicio el formulario se ve abierto.
 */
export default function AccountBox({ start: openAtStart = false }: { start?: boolean }) {
  const { status, user, error, sync, syncError } = useAccount();
  const { google, emailIn, emailUp, reset, out, deleteAccount } = useAccount.getState();
  const [del, setDel] = useState(false); // confirmar el borrado de la cuenta
  const [delPass, setDelPass] = useState('');
  const [open, setOpen] = useState(openAtStart);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [signup, setSignup] = useState(false); // false: entrar; true: crear una cuenta nueva

  const run = async (f: () => Promise<unknown>) => { setBusy(true); setNote(''); try { await f(); } finally { setBusy(false); } };

  if (status === 'in' && user && !user.anon) {
    const syncText = sync === 'syncing' ? 'sincronizando…' : sync === 'error' ? 'no se pudo sincronizar' : 'sincronizado';
    return (
      <div className="rollrow pc-account">
        <span className="muted small">Cuenta: <b>{user.email || user.name}</b> · <span className={sync === 'error' ? 'warn' : ''}>{syncText}</span></span>
        <button className="btn small" onClick={() => void out()}>Cerrar sesión</button>
        {!del && <button className="btn small ghost" onClick={() => setDel(true)}>Borrar mi cuenta</button>}
        {sync === 'error' && syncError && <span className="warn small" role="alert">{syncError}</span>}
        {del && (
          <form className="sub acct-delete" onSubmit={(e) => { e.preventDefault(); void run(async () => { if (await deleteAccount(delPass)) { setDel(false); setDelPass(''); setNote('Cuenta borrada. Lo guardado en este dispositivo sigue aquí.'); } }); }}>
            <p className="warn small" style={{ margin: 0 }}>Se borran de la nube tus personajes, tus criaturas, encuentros y grupo, y la cuenta. Lo guardado en este dispositivo se queda. No se puede deshacer.</p>
            <div className="field"><label htmlFor="acc-del-pass">Contraseña (si entras con correo; con Google se abre su ventana)</label><input id="acc-del-pass" className="input" type="password" autoComplete="current-password" value={delPass} onChange={(e) => setDelPass(e.target.value)} /></div>
            <div className="rollrow">
              <button type="submit" className="btn small primary" disabled={busy}>Borrar la cuenta definitivamente</button>
              <button type="button" className="btn small ghost" onClick={() => { setDel(false); setDelPass(''); }}>Cancelar</button>
            </div>
            {error && <p className="warn small" role="alert" style={{ margin: 0 }}>{error}</p>}
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="pc-account">
      {note && !open && <p className="muted small" role="status" style={{ margin: 0 }}>{note}</p>}
      {!open ? (
        <div className="rollrow">
          <span className="muted small">{status === 'loading' ? 'Comprobando la sesión…' : 'Sin cuenta: todo está solo en este dispositivo.'}</span>
          <button className="btn small" disabled={status === 'loading'} onClick={() => setOpen(true)}>Iniciar sesión</button>
        </div>
      ) : (
        <form className="pc-login" onSubmit={(e) => { e.preventDefault(); void run(() => (signup ? emailUp(email, pass) : emailIn(email, pass))); }}>
          <p className="muted small" style={{ margin: 0 }}>Con una cuenta, tus personajes y, como máster, tus criaturas, encuentros y grupo se guardan también en la nube y los tienes en todos tus dispositivos. Tu biblioteca y los PDF siguen solo en el dispositivo.</p>
          <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} disabled={busy || status === 'loading'} onClick={() => void run(google)}>Entrar con Google</button>
          <span className="muted small">{signup ? 'Crear una cuenta con tu correo:' : 'O con tu correo:'}</span>
          <div className="row2">
            <div className="field"><label htmlFor="acc-email">Correo</label><input id="acc-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label htmlFor="acc-pass">Contraseña</label><input id="acc-pass" className="input" type="password" autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'Al menos 6 caracteres' : ''} value={pass} onChange={(e) => setPass(e.target.value)} /></div>
          </div>
          <div className="rollrow">
            {signup ? (
              <button type="submit" className="btn small primary" disabled={busy || !email || pass.length < 6}>Crear cuenta</button>
            ) : (
              <>
                <button type="submit" className="btn small primary" disabled={busy || !email || !pass}>Entrar</button>
                <button type="button" className="btn small ghost" disabled={busy || !email} onClick={() => void run(async () => setNote(await reset(email)))}>He olvidado la contraseña</button>
              </>
            )}
            {!openAtStart && <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>Cancelar</button>}
          </div>
          <p className="small" style={{ margin: 0 }}>
            {signup ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
            <button type="button" className="linkbtn" onClick={() => { setSignup(!signup); setNote(''); }}>{signup ? 'Entrar' : 'Crear una con tu correo'}</button>
          </p>
          {(error || note) && <p className={error ? 'warn' : 'muted small'} role={error ? 'alert' : 'status'} style={{ margin: 0 }}>{error || note}</p>}
        </form>
      )}
    </div>
  );
}
