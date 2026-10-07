/**
 * Proyecto de Firebase de la app (salas y cuentas). Estos datos identifican el proyecto y son públicos por diseño:
 * la seguridad la dan las reglas de Firestore (firestore.rules) y los dominios autorizados de Authentication.
 * Sin Analytics: la app no hace seguimiento.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDfLA10GfhvpPB5mXImLWvqAzZmidhDiPI',
  authDomain: 'cronica-combate.firebaseapp.com',
  projectId: 'cronica-combate',
  storageBucket: 'cronica-combate.firebasestorage.app',
  messagingSenderId: '560889040650',
  appId: '1:560889040650:web:52bfde15648b9ea206f4f3',
};
