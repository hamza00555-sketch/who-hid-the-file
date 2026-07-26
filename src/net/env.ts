/**
 * فحص إعداد Firebase **بلا** استيراد حزمة Firebase.
 * يبقى الاستيراد ديناميكيًا حتى لا تُحمَّل الحزمة على أجهزة اللاعبين بلا داعٍ.
 */

export function isFirebaseConfigured(): boolean {
  const env = import.meta.env;
  return Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_DATABASE_URL);
}
