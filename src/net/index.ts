import { isFirebaseConfigured } from './env';
import { LocalTransport } from './localTransport';
import type { RoomTransport } from './transport';

let pending: Promise<RoomTransport> | null = null;

/**
 * يختار طبقة النقل تلقائيًا: Firebase إن كانت مهيأة، وإلا النقل المحلي.
 * حزمة Firebase تُحمَّل ديناميكيًا فلا يدفع ثمنها من لا يستخدمها.
 */
export function getTransport(): Promise<RoomTransport> {
  if (!pending) {
    pending = isFirebaseConfigured()
      ? import('./firebaseTransport').then(({ FirebaseTransport }) => new FirebaseTransport())
      : Promise.resolve(new LocalTransport());
  }
  return pending;
}

export * from './transport';
export { isFirebaseConfigured } from './env';
