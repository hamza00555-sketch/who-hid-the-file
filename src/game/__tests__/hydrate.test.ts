/**
 * ما يعود من Firebase ليس ما كُتب إليه.
 *
 * قاعدة Realtime تحذف كل حقل قيمته `null` وتحذف المصفوفة الفارغة كاملةً. وهذا
 * الفرق **لا يظهر في التطوير المحلّي إطلاقًا**: النقل المحلّي يمرّ عبر JSON
 * فيحفظ القيم كما هي، وكل اختبارات المنطق تُبنى بكائنات كاملة. فالعطل يبقى
 * مخبوءًا حتى تُلعب جولة حقيقية على الشبكة:
 *
 * - `secret.effectiveSlots.includes(...)` ترمي TypeError فتُفرَّغ شاشة اللاعب
 *   حتى يُحدِّث الصفحة.
 * - `buildResults` تكتب `undefined` فترفض القاعدة النتيجة كاملةً، وتقف الجولة
 *   عند التصويت بعد وصول كل الأصوات بلا رسالة واحدة.
 *
 * هذه الاختبارات تحاكي شكل Firebase لا شكل الكود.
 */

import { describe, expect, it } from 'vitest';
import { emptySecret, hydrateSecret, hydrateSecrets } from '../deal';
import { canInspect, computeSoloSlots, nightViewFor } from '../night';
import { buildResults, hydrateResults } from '../vote';
import { makePlayers } from './helpers';

/** يحاكي ما تفعله Firebase بالكائن قبل تخزينه. */
function asFirebaseStores<T>(value: T): unknown {
  const strip = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.length === 0 ? undefined : input.map(strip);
    }
    if (input && typeof input === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(input)) {
        const kept = strip(child);
        if (kept !== null && kept !== undefined) out[key] = kept;
      }
      return Object.keys(out).length === 0 ? undefined : out;
    }
    return input === null ? undefined : input;
  };
  return strip(value);
}

describe('سرّ عائد من الشبكة', () => {
  it('يفقد فعلًا حقوله الفارغة — تثبيت للسلوك الذي نعالجه', () => {
    const stored = asFirebaseStores(emptySecret('p1')) as Record<string, unknown>;
    expect(stored.effectiveSlots).toBeUndefined();
    expect(stored.soloSlots).toBeUndefined();
    expect(stored.inspection).toBeUndefined();
    expect(stored.knownAllies).toBeUndefined();
    expect(stored.chosenSlot).toBeUndefined();
  });

  it('يعود كاملًا بعد الترميم', () => {
    const raw = asFirebaseStores(emptySecret('p1'));
    const secret = hydrateSecret(raw, 'p1');

    expect(secret).toEqual(emptySecret('p1'));
    // والمهم: كل مصفوفة قابلة للاستدعاء بلا حارس
    expect(secret.effectiveSlots.includes(3)).toBe(false);
    expect(secret.soloSlots.length).toBe(0);
    expect(secret.knownAllies.length).toBe(0);
  });

  it('لا يُفرّغ شاشة الليل لمن لم يختر موعده بعد', () => {
    const secret = hydrateSecret(asFirebaseStores(emptySecret('p1')), 'p1');
    // هذا السطر بعينه كان يرمي TypeError فتختفي الشاشة
    expect(() => secret.effectiveSlots.includes(4)).not.toThrow();
    expect(nightViewFor(secret, 4, 6, 'digital')).toBe('blackout');
    expect(canInspect(secret, 6)).toBe(false);
  });

  it('يقرأ المصفوفة حين تعود كائنًا بمفاتيح رقمية', () => {
    const secret = hydrateSecret({ dice: { 0: 2, 1: 5 }, effectiveSlots: { 0: 5 } }, 'p1');
    expect(secret.dice).toEqual([2, 5]);
    expect(secret.effectiveSlots).toEqual([5]);
  });

  it('يعيد `revealedSlot` المحذوف إلى null لا undefined', () => {
    const requested = {
      ...emptySecret('p1'),
      inspection: { targetId: 'p2', side: 'left' as const, revealedSlot: null },
    };
    const secret = hydrateSecret(asFirebaseStores(requested), 'p1');
    expect(secret.inspection).toEqual({ targetId: 'p2', side: 'left', revealedSlot: null });
  });

  it('سرّ غائب تمامًا يعطي سرًّا فارغًا لا انهيارًا', () => {
    expect(hydrateSecret(undefined, 'p1')).toEqual(emptySecret('p1'));
    expect(hydrateSecrets(undefined)).toEqual({});
  });
});

/*
  ── لماذا وقفت الجولة عند «٤ من ٤ صوّتوا» ──

  فحصٌ طُلب ولم يُكشف يعود بلا `revealedSlot`. فتُبنى النتيجة وفيها
  `undefined`، وترفض Firebase الكتابة كاملةً — بلا `catch` يلتقطها.
*/
describe('نتيجة الجولة صالحة للكتابة', () => {
  const players = makePlayers(4);

  function round() {
    const secrets = computeSoloSlots({
      p1: { ...emptySecret('p1'), role: 'hider', dice: [1], effectiveSlots: [1] },
      p2: { ...emptySecret('p2'), dice: [2], effectiveSlots: [2] },
      p3: { ...emptySecret('p3'), dice: [3], effectiveSlots: [3] },
      p4: { ...emptySecret('p4'), dice: [4], effectiveSlots: [4] },
    });
    return hydrateSecrets(asFirebaseStores(secrets));
  }

  function hasUndefined(value: unknown): boolean {
    if (value === undefined) return true;
    if (Array.isArray(value)) return value.some(hasUndefined);
    if (value && typeof value === 'object') return Object.values(value).some(hasUndefined);
    return false;
  }

  it('بلا أي undefined حتى مع فحص طُلب ولم يُكشف', () => {
    const secrets = round();
    secrets.p2!.inspection = { targetId: 'p3', side: 'left', revealedSlot: null };
    const results = buildResults(secrets, { p1: 'p2', p2: 'p1', p3: 'p1', p4: 'p1' }, players);

    expect(hasUndefined(results)).toBe(false);
    const row = results.reveal.find((entry) => entry.playerId === 'p2');
    expect(row!.inspected).toEqual({ targetId: 'p3', revealedSlot: null });
  });

  it('بلا أي undefined حين لا يصوّت أحد', () => {
    expect(hasUndefined(buildResults(round(), {}, players))).toBe(false);
  });

  /*
    حزام ثانٍ: الترميم هو الدفاع الأول، لكن `buildResults` تُستدعى بأسرار قد
    تأتي من مسار لم يمرّ به. فلا تعتمد على غيرها في ألّا تكتب `undefined`.
  */
  /*
    ── الانهيار الذي أقفل الجولة عند نهايتها ──

    من لم يستيقظ معه أحد يعود صفّه من الشبكة بلا `wokeWith` إطلاقًا، فتنهار
    شاشة النتائج على `row.wokeWith.length`. وهذا يقع بعد الليل والنقاش
    والتصويت — أي بعد كل شيء، وعلى شاشة لا مخرج منها.
  */
  it('نتيجة عائدة من الشبكة تُقرأ بلا انهيار', () => {
    const secrets = round();
    const written = buildResults(secrets, { p1: 'p2', p2: 'p1' }, players);
    const back = hydrateResults(asFirebaseStores(written))!;

    expect(back.reveal).toHaveLength(4);
    for (const row of back.reveal) {
      expect(() => row.wokeWith.length).not.toThrow();
      expect(Array.isArray(row.effectiveSlots)).toBe(true);
      expect(Array.isArray(row.soloSlots)).toBe(true);
    }
    expect(Array.isArray(back.accompliceIds)).toBe(true);
    expect(Array.isArray(back.tally.topVoted)).toBe(true);
    expect(back.tally.counts).toBeTypeOf('object');
  });

  it('نتيجة بلا أصوات إطلاقًا تُقرأ أيضًا', () => {
    const back = hydrateResults(asFirebaseStores(buildResults(round(), {}, players)))!;
    expect(back.tally.totalVotes).toBe(0);
    expect(back.tally.topVoted).toEqual([]);
    expect(back.reveal.every((row) => row.votedFor === null)).toBe(true);
  });

  it('تصمد أمام فحص غير مُرمَّم قادم من الشبكة مباشرة', () => {
    const secrets = round();
    // كما تعود من Firebase حرفيًا: بلا حقل `revealedSlot` إطلاقًا
    secrets.p2!.inspection = { targetId: 'p3', side: 'left' } as never;
    expect(hasUndefined(buildResults(secrets, { p2: 'p1' }, players))).toBe(false);
  });
});
