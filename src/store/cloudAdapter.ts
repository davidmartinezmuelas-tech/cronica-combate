import type { Character } from '../engine/character';
import { toCloud } from '../engine/sync';

/** Usuario de la cuenta (anónimo: invitado en una sala, sin personajes en la nube). */
export interface CloudUser { uid: string; email: string | null; name: string | null; anon: boolean }

/**
 * Lo que la app usa de Firebase. La implementación real carga el SDK solo cuando hace falta; las pruebas usan una
 * falsa con la misma forma.
 */
export interface CloudAdapter {
  onAuth: (cb: (u: CloudUser | null) => void) => () => void;
  google: () => Promise<void>;
  emailIn: (email: string, pass: string) => Promise<void>;
  emailUp: (email: string, pass: string) => Promise<void>;
  reset: (email: string) => Promise<void>;
  out: () => Promise<void>;
  /** Personajes de la cuenta: primero todos y luego cada cambio (los modificados y los ids borrados). */
  watchCharacters: (uid: string, cb: (changed: Character[], removed: string[], first: boolean) => void, onError: (e: Error) => void) => () => void;
  putCharacter: (uid: string, c: Character) => Promise<void>;
  deleteCharacter: (uid: string, id: string) => Promise<void>;
}

/** Adaptador con el SDK de Firebase (cargado bajo demanda: quien no inicia sesión no lo descarga). */
export async function firebaseAdapter(): Promise<CloudAdapter> {
  const [{ initializeApp, getApps }, A, F, { firebaseConfig }] = await Promise.all([
    import('firebase/app'), import('firebase/auth'), import('firebase/firestore'), import('../app/firebaseConfig'),
  ]);
  const app = getApps()[0] || initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  auth.languageCode = 'es';
  const db = F.getFirestore(app);
  const col = (uid: string) => F.collection(db, 'users', uid, 'characters');
  return {
    onAuth: (cb) => A.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email, name: u.displayName, anon: u.isAnonymous } : null)),
    google: async () => { await A.signInWithPopup(auth, new A.GoogleAuthProvider()); },
    emailIn: async (e, p) => { await A.signInWithEmailAndPassword(auth, e, p); },
    emailUp: async (e, p) => { await A.createUserWithEmailAndPassword(auth, e, p); },
    reset: (e) => A.sendPasswordResetEmail(auth, e),
    out: () => A.signOut(auth),
    watchCharacters: (uid, cb, onError) => {
      let first = true;
      return F.onSnapshot(col(uid), (snap) => {
        const changed: Character[] = [];
        const removed: string[] = [];
        snap.docChanges().forEach((ch) => {
          if (ch.type === 'removed') removed.push(ch.doc.id);
          else changed.push(ch.doc.data() as Character);
        });
        cb(changed, removed, first);
        first = false;
      }, onError);
    },
    putCharacter: (uid, c) => F.setDoc(F.doc(col(uid), c.id), toCloud(c)),
    deleteCharacter: (uid, id) => F.deleteDoc(F.doc(col(uid), id)),
  };
}

/** Mensaje en español para los errores de Firebase que puede ver el usuario. */
export function cloudError(e: unknown): string {
  const code = (e as { code?: string })?.code || '';
  const M: Record<string, string> = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'No hay ninguna cuenta con ese correo.',
    'auth/email-already-in-use': 'Ya hay una cuenta con ese correo: inicia sesión.',
    'auth/weak-password': 'La contraseña tiene que tener al menos 6 caracteres.',
    'auth/invalid-email': 'Ese correo no es válido.',
    'auth/missing-password': 'Escribe la contraseña.',
    'auth/popup-closed-by-user': 'Se cerró la ventana de Google antes de terminar.',
    'auth/cancelled-popup-request': 'Se cerró la ventana de Google antes de terminar.',
    'auth/popup-blocked': 'El navegador bloqueó la ventana de Google: permite las ventanas emergentes para esta página.',
    'auth/network-request-failed': 'Sin conexión con el servidor. Comprueba tu conexión.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un poco y vuelve a probar.',
    'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase (Authentication > Dominios autorizados).',
    'auth/operation-not-allowed': 'Ese método de inicio de sesión no está activado en Firebase.',
    'permission-denied': 'Sin permiso en la base de datos: revisa que las reglas de Firestore estén publicadas.',
    unavailable: 'Sin conexión con la base de datos. Se sincronizará al volver la conexión.',
  };
  return M[code] || 'No se pudo completar (' + (code || (e as Error)?.message || 'error') + ').';
}
