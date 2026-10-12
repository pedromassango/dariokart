import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator, type Database } from 'firebase/database';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';

/**
 * Firebase config comes from Vite env vars (see .env.example).
 * The API key is intentionally not committed; online mode is disabled until it is provided.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

/** Set VITE_FIREBASE_EMULATOR=1 to run against `firebase emulators:start` (no real keys needed). */
const useEmulator = import.meta.env.VITE_FIREBASE_EMULATOR === '1';

export function firebaseConfigured(): boolean {
  return useEmulator || !!(config.apiKey && config.databaseURL && config.projectId);
}

let app: FirebaseApp | null = null;
let ready: Promise<{ db: Database; uid: string }> | null = null;

export function connect(): Promise<{ db: Database; uid: string }> {
  if (!firebaseConfigured()) return Promise.reject(new Error('Firebase is not configured. Add your keys to .env.local (see .env.example).'));
  if (!ready) {
    ready = (async () => {
      const cfg = useEmulator
        ? { apiKey: 'demo-key', projectId: 'demo-dariokart', databaseURL: 'http://127.0.0.1:9000?ns=demo-dariokart' }
        : (config as Record<string, string>);
      app = initializeApp(cfg);
      const db = getDatabase(app);
      const auth = getAuth(app);
      if (useEmulator) {
        connectDatabaseEmulator(db, '127.0.0.1', 9000);
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      }
      let uid: string;
      try {
        const cred = await signInAnonymously(auth);
        uid = cred.user.uid;
      } catch (e) {
        console.warn('[dariokart] anonymous auth failed, using a local id (enable Anonymous sign-in in Firebase console)', e);
        uid = localId();
      }
      return { db, uid };
    })();
    ready.catch(() => { ready = null; });
  }
  return ready;
}

function localId(): string {
  try {
    const k = 'dariokart.uid';
    let v = localStorage.getItem(k);
    if (!v) { v = 'u' + Math.random().toString(36).slice(2, 12); localStorage.setItem(k, v); }
    return v;
  } catch {
    return 'u' + Math.random().toString(36).slice(2, 12);
  }
}
