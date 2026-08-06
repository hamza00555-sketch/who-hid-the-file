/**
 * تهيئة Firebase — تُقرأ من متغيرات البيئة، ولا يُثبَّت أي مفتاح في الكود.
 * إن غابت المتغيرات يعمل المشروع على النقل المحلي تلقائيًا.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  initializeAuth,
  signInAnonymously,
  type Auth,
} from 'firebase/auth';
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

/**
 * ── لماذا `initializeAuth` لا `getAuth` ──
 *
 * `getAuth` تختار IndexedDB وحدها لحفظ الهوية. وحين تُفتح اللعبة من متصفّح
 * داخل تطبيق محادثة — وهو المسار الطبيعي: يُرسَل الرابط في محادثة فيُفتح فيها —
 * قد تكون IndexedDB محجوبة أو معطّلة، فيتعثّر تسجيل الدخول أو يتعلّق بلا خطأ.
 * والنتيجة على الشاشة: «جارٍ الاتصال بالجلسة» إلى الأبد.
 *
 * القائمة تُجرَّب بالترتيب حتى ينجح واحد، وآخرها الذاكرة: هوية تعيش ما دام
 * التبويب مفتوحًا. أضعف من الحفظ الدائم، لكنها تكفي لجولة كاملة — وهي أفضل
 * كثيرًا من لاعب لا يستطيع الدخول إطلاقًا.
 */
export function firebaseAuth(): Auth {
  if (!auth) {
    auth = initializeAuth(firebaseApp(), {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
        inMemoryPersistence,
      ],
    });
  }
  return auth;
}

export class SignInError extends Error {
  constructor(
    message: string,
    /** رمز Firebase إن وُجد — يُعرض للمضيف لا للاعب */
    readonly code: string | null,
  ) {
    super(message);
  }
}

/** رسالة عربية تقول ما العمل، لا ما اسم الخطأ. */
function explain(code: string | null): string {
  switch (code) {
    case 'auth/network-request-failed':
    case 'timeout':
      return 'تعذّر الوصول إلى الخادم. تأكد من الإنترنت ثم أعد المحاولة.';
    case 'auth/admin-restricted-operation':
    case 'auth/operation-not-allowed':
      return 'الدخول المجهول غير مفعّل في إعدادات المشروع. يفعّله صاحب اللعبة من لوحة Firebase.';
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      return 'محاولات كثيرة في وقت قصير. انتظر دقيقة ثم أعد المحاولة.';
    case 'auth/web-storage-unsupported':
      return 'المتصفح يمنع حفظ الجلسة. افتح الرابط في متصفّح عادي بدل المتصفّح الداخلي للتطبيق.';
    default:
      return 'تعذّر فتح الجلسة على هذا الجهاز. أعد المحاولة، وإن تكرّر فافتح الرابط في متصفّح عادي.';
  }
}

/**
 * تسجيل دخول مجهول بمهلة ومحاولات.
 *
 * المهلة ليست ترفًا: `signInAnonymously` قد **لا تعود إطلاقًا** على متصفّح
 * يمنع التخزين، فتبقى الشاشة تنتظر بلا خطأ ولا رسالة. تحويل التعلّق إلى خطأ
 * هو ما يجعله قابلًا للعرض وللإعادة.
 */
export async function signIn(attempts = 3): Promise<string> {
  let lastCode: string | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const instance = firebaseAuth();
      if (instance.currentUser) return instance.currentUser.uid;

      const credential = await withTimeout(signInAnonymously(instance), 12000);
      return credential.user.uid;
    } catch (cause) {
      lastCode =
        cause instanceof SignInError
          ? cause.code
          : ((cause as { code?: string } | null)?.code ?? null);

      // خطأ إعداد لا يُصلحه التكرار — لا فائدة من انتظار المستخدم
      if (lastCode === 'auth/admin-restricted-operation' || lastCode === 'auth/operation-not-allowed') {
        break;
      }
      if (attempt < attempts - 1) await wait(700 * 2 ** attempt);
    }
  }

  throw new SignInError(explain(lastCode), lastCode);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SignInError('تأخّر الخادم.', 'timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
