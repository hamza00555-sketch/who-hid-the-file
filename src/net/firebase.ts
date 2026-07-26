/**
 * تهيئة Firebase — تُقرأ من متغيرات البيئة، ولا يُثبَّت أي مفتاح في الكود.
 * إن غابت المتغيرات يعمل المشروع على النقل المحلي تلقائيًا.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

const env = import.meta.env;

export const FIREBASE_CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export { isFirebaseConfigured } from './env';

let app: FirebaseApp | null = null;
let database: Database | null = null;
let auth: Auth | null = null;

export function firebaseApp(): FirebaseApp {
  if (!app) app = initializeApp(FIREBASE_CONFIG as Record<string, string>);
  return app;
}

export function db(): Database {
  if (!database) database = getDatabase(firebaseApp());
  return database;
}

export function firebaseAuth(): Auth {
  if (!auth) auth = getAuth(firebaseApp());
  return auth;
}

export async function signIn(): Promise<string> {
  const instance = firebaseAuth();
  if (instance.currentUser) return instance.currentUser.uid;
  const credential = await signInAnonymously(instance);
  return credential.user.uid;
}
