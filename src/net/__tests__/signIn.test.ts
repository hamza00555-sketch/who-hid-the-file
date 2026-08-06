// @vitest-environment jsdom

/**
 * فتح الهوية هو أول ما يحدث على جهاز اللاعب، وفشله كان يظهر كدوّامة أبدية:
 * «جارٍ الاتصال بالجلسة» بلا سبب ولا زر. ثلاثة أصدقاء يفتحون نفس الرابط فيدخل
 * واحد ويقف اثنان.
 *
 * ما يُختبر هنا هو ما لا يُرى في الاستعمال العادي: ماذا يحدث حين يرفض الخادم،
 * أو يتأخّر بلا نهاية، أو يمنع المتصفّح التخزين.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signInAnonymously = vi.fn();

vi.mock('firebase/app', () => ({
  initializeApp: () => ({}),
}));

vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
}));

vi.mock('firebase/auth', () => ({
  initializeAuth: () => ({ currentUser: null }),
  signInAnonymously: (...args: unknown[]) => signInAnonymously(...args),
  indexedDBLocalPersistence: 'idb',
  browserLocalPersistence: 'local',
  browserSessionPersistence: 'session',
  inMemoryPersistence: 'memory',
}));

let signIn: typeof import('../firebase').signIn;
let SignInError: typeof import('../firebase').SignInError;

beforeEach(async () => {
  vi.resetModules();
  signInAnonymously.mockReset();
  ({ signIn, SignInError } = await import('../firebase'));
});

afterEach(() => vi.useRealTimers());

const ok = { user: { uid: 'uid-1' } };

function firebaseError(code: string) {
  return Object.assign(new Error(code), { code });
}

describe('فتح الهوية', () => {
  it('ينجح من أول محاولة', async () => {
    signInAnonymously.mockResolvedValue(ok);
    await expect(signIn()).resolves.toBe('uid-1');
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  /*
    شبكة تتعثّر لحظة ثم تعود — وهذا يحدث كثيرًا على بيانات الجوال. محاولة واحدة
    كانت تكفي لإخراج اللاعب من الجلسة كلها.
  */
  it('يعيد المحاولة بعد تعثّر عابر', async () => {
    signInAnonymously
      .mockRejectedValueOnce(firebaseError('auth/network-request-failed'))
      .mockResolvedValueOnce(ok);

    await expect(signIn()).resolves.toBe('uid-1');
    expect(signInAnonymously).toHaveBeenCalledTimes(2);
  });

  it('يستسلم بعد استنفاد المحاولات ويشرح السبب', async () => {
    signInAnonymously.mockRejectedValue(firebaseError('auth/network-request-failed'));

    const failure = await signIn(2).catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(SignInError);
    expect((failure as InstanceType<typeof SignInError>).code).toBe(
      'auth/network-request-failed',
    );
    expect((failure as Error).message).toContain('الإنترنت');
    expect(signInAnonymously).toHaveBeenCalledTimes(2);
  });

  /*
    خطأ إعداد لا يُصلحه التكرار. إعادة المحاولة هنا تعني إبقاء اللاعب ينتظر
    ثوانيَ إضافية مقابل نفس النتيجة.
  */
  it('لا يكرّر محاولة يرفضها الإعداد أصلًا', async () => {
    signInAnonymously.mockRejectedValue(firebaseError('auth/admin-restricted-operation'));

    const failure = await signIn(3).catch((cause: unknown) => cause);
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect((failure as Error).message).toContain('الدخول المجهول غير مفعّل');
  });

  it('يشرح منع التخزين بما يفعله اللاعب فعلًا', async () => {
    signInAnonymously.mockRejectedValue(firebaseError('auth/web-storage-unsupported'));
    const failure = await signIn(1).catch((cause: unknown) => cause);
    expect((failure as Error).message).toContain('متصفّح عادي');
  });

  /*
    ── الحالة التي عطّلت الجولة ──

    `signInAnonymously` قد لا تعود إطلاقًا على متصفّح يمنع التخزين. بلا مهلة
    يبقى الوعد معلّقًا، ويبقى `ready` كاذبًا، وتبقى الشاشة تنتظر إلى الأبد.
  */
  it('يحوّل التعلّق إلى خطأ بدل انتظار لا ينتهي', async () => {
    vi.useFakeTimers();
    signInAnonymously.mockReturnValue(new Promise(() => {}));

    const attempt = signIn(1);
    const settled = attempt.then(
      () => 'resolved',
      (cause: Error) => cause.message,
    );

    await vi.advanceTimersByTimeAsync(11000);
    await Promise.resolve();
    // ما زال ينتظر داخل المهلة
    await vi.advanceTimersByTimeAsync(2000);

    await expect(settled).resolves.toContain('تعذّر الوصول إلى الخادم');
  });
});
