import type { Character } from '../engine/character';
import type { SaveEffect } from '../engine/saveEffect';
import { toCloud } from '../engine/sync';

/** Resumen de la hoja que un jugador comparte en la sala (lo que el máster necesita ver). */
export interface SheetSummary { name: string; cls: string; level: number; ac: number; hp: number; hpMax: number; temp: number; pp: number; init?: number; conds: string[]; charId?: string }
/** Aviso del máster a un jugador: sus PG tras lo que ha pasado en la mesa (daño, curación…). */
export interface RoomEvent {
  id: string; to: string; from: string; charId: string; hp: number; temp: number; note: string; at: number;
  kind?: 'hp' | 'save'; // 'save': el máster le pide una salvación
  dc?: number; abil?: number; label?: string; reqId?: string;
}
/** Entrada de la lista de iniciativa que el máster comparte (sin PG ni números de los monstruos). */
export interface TableEntry { id: string; name: string; kind: 'monster' | 'pc'; roomUid?: string }
/** Lanzamiento de un jugador sobre objetivos: llega al máster, que lo revisa y lo aplica. */
export interface RoomCast {
  id: string; uid: string; who: string; label: string; targets: string[]; at: number;
  parts: { type: string; amt: number }[]; crit: boolean; attack: number | null; heal: number | null; effect: SaveEffect | null;
}
/** Respuesta de un jugador a una petición de salvación. */
export interface SaveReply { id: string; uid: string; reqId: string; total: number; at: number }
/** Participante de una sala. */
export interface RoomMember { uid: string; name: string; role: 'dm' | 'player'; sheet: SheetSummary | null; at: number }
/** Tirada publicada en la sala. */
export interface SharedRoll { id: string; uid: string; who: string; label: string; total: string; detail: string; cls: '' | 'crit' | 'fumble'; at: number }
/** Sala: el id es su código. */
export interface RoomInfo { code: string; name: string; dmUid: string; dmName: string; createdAt: number }

/** Datos del máster que se guardan en la cuenta: criaturas propias, encuentros y grupo. */
export type DmKind = 'monsters' | 'encounters' | 'roster';

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
  /** Datos del máster en la cuenta, igual que los personajes. */
  watchItems: <T extends { id: string }>(uid: string, kind: DmKind, cb: (changed: T[], removed: string[], first: boolean) => void, onError: (e: Error) => void) => () => void;
  putItem: (uid: string, kind: DmKind, item: { id: string }) => Promise<void>;
  deleteItem: (uid: string, kind: DmKind, id: string) => Promise<void>;
  anon: () => Promise<void>;
  getRoom: (code: string) => Promise<RoomInfo | null>;
  createRoom: (room: RoomInfo) => Promise<void>;
  closeRoom: (code: string) => Promise<void>; // borra tiradas, participantes y la sala
  setMember: (code: string, m: RoomMember) => Promise<void>;
  removeMember: (code: string, uid: string) => Promise<void>;
  watchMembers: (code: string, cb: (members: RoomMember[]) => void, onError: (e: Error) => void) => () => void;
  addRoll: (code: string, r: Omit<SharedRoll, 'id'>) => Promise<void>;
  watchRolls: (code: string, cb: (rolls: SharedRoll[]) => void, onError: (e: Error) => void) => () => void;
  sendEvent: (code: string, ev: Omit<RoomEvent, 'id'>) => Promise<void>;
  watchEvents: (code: string, uid: string, cb: (events: RoomEvent[]) => void, onError: (e: Error) => void) => () => void;
  deleteEvent: (code: string, id: string) => Promise<void>;
  publishTable: (code: string, list: TableEntry[]) => Promise<void>;
  watchTable: (code: string, cb: (list: TableEntry[]) => void, onError: (e: Error) => void) => () => void;
  sendCast: (code: string, cast: Omit<RoomCast, 'id'>) => Promise<void>;
  watchCasts: (code: string, cb: (casts: RoomCast[]) => void, onError: (e: Error) => void) => () => void;
  deleteCast: (code: string, id: string) => Promise<void>;
  sendReply: (code: string, r: Omit<SaveReply, 'id'>) => Promise<void>;
  watchReplies: (code: string, cb: (r: SaveReply[]) => void, onError: (e: Error) => void) => () => void;
  deleteReply: (code: string, id: string) => Promise<void>;
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
    watchItems: <T extends { id: string }>(uid: string, kind: DmKind, cb: (changed: T[], removed: string[], first: boolean) => void, onError: (e: Error) => void) => {
      let first = true;
      return F.onSnapshot(F.collection(db, 'users', uid, kind), (snap) => {
        const changed: T[] = [];
        const removed: string[] = [];
        snap.docChanges().forEach((ch) => {
          if (ch.type === 'removed') removed.push(ch.doc.id);
          else changed.push(ch.doc.data() as T);
        });
        cb(changed, removed, first);
        first = false;
      }, onError);
    },
    putItem: (uid, kind, item) => F.setDoc(F.doc(db, 'users', uid, kind, item.id), JSON.parse(JSON.stringify(item))),
    deleteItem: (uid, kind, id) => F.deleteDoc(F.doc(db, 'users', uid, kind, id)),
    putCharacter: (uid, c) => F.setDoc(F.doc(col(uid), c.id), toCloud(c)),
    deleteCharacter: (uid, id) => F.deleteDoc(F.doc(col(uid), id)),
    anon: async () => { await A.signInAnonymously(auth); },
    getRoom: async (code) => {
      const d = await F.getDoc(F.doc(db, 'rooms', code));
      return d.exists() ? (d.data() as RoomInfo) : null;
    },
    createRoom: (room) => F.setDoc(F.doc(db, 'rooms', room.code), room),
    closeRoom: async (code) => {
      // sin borrado en cascada: primero lo de dentro (en lotes de 400) y luego la sala
      for (const sub of ['rolls', 'events', 'casts', 'replies', 'table', 'members']) {
        const snap = await F.getDocs(F.collection(db, 'rooms', code, sub));
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = F.writeBatch(db);
          snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await F.deleteDoc(F.doc(db, 'rooms', code));
    },
    setMember: (code, m) => F.setDoc(F.doc(db, 'rooms', code, 'members', m.uid), JSON.parse(JSON.stringify(m))),
    removeMember: (code, uid) => F.deleteDoc(F.doc(db, 'rooms', code, 'members', uid)),
    watchMembers: (code, cb, onError) => F.onSnapshot(F.collection(db, 'rooms', code, 'members'), (snap) => cb(snap.docs.map((d) => d.data() as RoomMember)), onError),
    addRoll: async (code, r) => { await F.addDoc(F.collection(db, 'rooms', code, 'rolls'), r); },
    sendEvent: async (code, ev) => { await F.addDoc(F.collection(db, 'rooms', code, 'events'), ev); },
    watchEvents: (code, uid, cb, onError) => F.onSnapshot(
      F.query(F.collection(db, 'rooms', code, 'events'), F.where('to', '==', uid)),
      (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<RoomEvent, 'id'>), id: d.id })).sort((a, b) => a.at - b.at)),
      onError,
    ),
    deleteEvent: (code, id) => F.deleteDoc(F.doc(db, 'rooms', code, 'events', id)),
    publishTable: (code, list) => F.setDoc(F.doc(db, 'rooms', code, 'table', 'state'), { list: JSON.parse(JSON.stringify(list)), at: Date.now() }),
    watchTable: (code, cb, onError) => F.onSnapshot(F.doc(db, 'rooms', code, 'table', 'state'), (d) => cb(d.exists() ? ((d.data() as { list: TableEntry[] }).list || []) : []), onError),
    sendCast: async (code, cast) => { await F.addDoc(F.collection(db, 'rooms', code, 'casts'), JSON.parse(JSON.stringify(cast))); },
    watchCasts: (code, cb, onError) => F.onSnapshot(F.collection(db, 'rooms', code, 'casts'), (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<RoomCast, 'id'>), id: d.id })).sort((a, b) => a.at - b.at)), onError),
    deleteCast: (code, id) => F.deleteDoc(F.doc(db, 'rooms', code, 'casts', id)),
    sendReply: async (code, r) => { await F.addDoc(F.collection(db, 'rooms', code, 'replies'), r); },
    watchReplies: (code, cb, onError) => F.onSnapshot(F.collection(db, 'rooms', code, 'replies'), (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<SaveReply, 'id'>), id: d.id }))), onError),
    deleteReply: (code, id) => F.deleteDoc(F.doc(db, 'rooms', code, 'replies', id)),
    watchRolls: (code, cb, onError) => F.onSnapshot(
      F.query(F.collection(db, 'rooms', code, 'rolls'), F.orderBy('at', 'desc'), F.limit(40)),
      (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<SharedRoll, 'id'>), id: d.id }))),
      onError,
    ),
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
    'auth/admin-restricted-operation': 'Entrar como invitado no está activado en Firebase (Authentication > Anónimo).',
    unavailable: 'Sin conexión con la base de datos. Se sincronizará al volver la conexión.',
  };
  return M[code] || 'No se pudo completar (' + (code || (e as Error)?.message || 'error') + ').';
}
