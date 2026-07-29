import { describe, expect, it } from 'vitest';
import { chooseSlot, dealRound } from '../deal';
import {
  canInspect,
  computeSoloSlots,
  hideWindowPassed,
  inspectTargets,
  performInspection,
  playersAwakeAt,
  shouldWake,
  nightViewFor,
  witnessesOfHider,
  wokeWith,
} from '../night';
import { ALL_SLOTS } from '../types';
import { neighboursOf, reorderSeats, seatedOrder } from '../seating';
import { dice, ids, makePlayers } from './helpers';

function build(n: number, hiderId: string, values: Record<string, number[]>) {
  const secrets = dealRound({
    playerIds: ids(n),
    rng: { next: () => 0 },
    forceHiderId: hiderId,
    forceDice: dice(values),
  });
  return computeSoloSlots(secrets);
}

describe('ترتيب الجلوس واليمين واليسار', () => {
  it('يحسب الجارين باتجاه عقارب الساعة', () => {
    const players = makePlayers(5);
    // المقاعد 0..4 مع عقارب الساعة: التالي يسارًا، السابق يمينًا.
    expect(neighboursOf('p1', players)).toEqual({ left: 'p2', right: 'p5' });
    expect(neighboursOf('p3', players)).toEqual({ left: 'p4', right: 'p2' });
    expect(neighboursOf('p5', players)).toEqual({ left: 'p1', right: 'p4' });
  });

  it('يلتف حول الطاولة في كل الأعداد المدعومة', () => {
    for (let n = 4; n <= 8; n++) {
      const players = makePlayers(n);
      const first = neighboursOf('p1', players);
      expect(first.right).toBe(`p${n}`);
      expect(first.left).toBe('p2');
    }
  });

  it('يعيد الترتيب بالسحب والإفلات ويحافظ على تسلسل المقاعد', () => {
    const players = makePlayers(5);
    const seats = reorderSeats(players, 0, 3);
    expect(seats).toEqual({ p2: 0, p3: 1, p4: 2, p1: 3, p5: 4 });
    const moved = players.map((p) => ({ ...p, seat: seats[p.id]! }));
    expect(seatedOrder(moved).map((p) => p.id)).toEqual(['p2', 'p3', 'p4', 'p1', 'p5']);
    expect(neighboursOf('p1', moved)).toEqual({ left: 'p5', right: 'p4' });
  });

  it('يرفض لاعبًا غير موجود أو موضعًا خارج النطاق', () => {
    const players = makePlayers(4);
    expect(() => neighboursOf('ghost', players)).toThrow();
    expect(() => reorderSeats(players, 0, 9)).toThrow();
  });
});

describe('اكتشاف الاستيقاظ المنفرد', () => {
  it('يعتبر اللاعب منفردًا إذا لم يشاركه أحد موعده', () => {
    const secrets = build(5, 'p1', { p1: [1], p2: [3], p3: [3], p4: [5], p5: [6] });
    expect(secrets.p1!.soloSlots).toEqual([1]);
    expect(secrets.p2!.soloSlots).toEqual([]);
    expect(secrets.p3!.soloSlots).toEqual([]);
    expect(secrets.p4!.soloSlots).toEqual([5]);
  });

  it('لا يعتبر أحدًا منفردًا إذا تطابقت كل المواعيد', () => {
    const secrets = build(5, 'p1', { p1: [4], p2: [4], p3: [4], p4: [4], p5: [4] });
    for (const secret of Object.values(secrets)) expect(secret.soloSlots).toEqual([]);
    expect(playersAwakeAt(secrets, 4)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('يعتبر الجميع منفردين إذا اختلفت كل المواعيد', () => {
    const secrets = build(6, 'p1', {
      p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6],
    });
    for (const secret of Object.values(secrets)) expect(secret.soloSlots).toHaveLength(1);
  });

  it('يتعامل مع المُخفي المنفرد في موعد والمصحوب في آخر (وضع الأربعة)', () => {
    let secrets = build(4, 'p1', { p1: [2, 5], p2: [5, 6], p3: [3, 4], p4: [1, 6] });
    secrets = computeSoloSlots({
      ...secrets,
      p2: chooseSlot(secrets.p2!, 5),
      p3: chooseSlot(secrets.p3!, 3),
      p4: chooseSlot(secrets.p4!, 1),
    });
    expect(secrets.p1!.effectiveSlots).toEqual([2, 5]);
    expect(secrets.p1!.soloSlots).toEqual([2]); // الموعد 5 يشاركه p2
    expect(secrets.p2!.soloSlots).toEqual([]);
    expect(secrets.p3!.soloSlots).toEqual([3]);
  });

  it('يستيقظ صاحب النتيجتين المتطابقتين مرة واحدة فقط', () => {
    const secrets = build(4, 'p1', { p1: [3, 3], p2: [1, 5], p3: [2, 6], p4: [4, 4] });
    expect(secrets.p1!.effectiveSlots).toEqual([3]);
    const member = chooseSlot(secrets.p4!, 4);
    expect(member.effectiveSlots).toEqual([4]);
  });

  it('يمنع عضو الفريق من اختيار موعد ليس من نتائجه', () => {
    const secrets = build(4, 'p1', { p1: [3, 3], p2: [1, 5], p3: [2, 6], p4: [4, 4] });
    expect(() => chooseSlot(secrets.p2!, 6)).toThrow();
    expect(() => chooseSlot(secrets.p1!, 3)).toThrow(); // المُخفي لا يختار
  });

  it('يحسب الانفراد في النرد الحقيقي بعد إدخال كل النتائج', () => {
    const secrets = build(6, 'p2', {
      p1: [1], p2: [2], p3: [2], p4: [4], p5: [4], p6: [6],
    });
    expect(secrets.p1!.soloSlots).toEqual([1]);
    expect(secrets.p6!.soloSlots).toEqual([6]);
    expect(secrets.p2!.soloSlots).toEqual([]);
  });
});

describe('من استيقظ مع من', () => {
  it('يعيد رفقاء الاستيقاظ فقط', () => {
    const secrets = build(6, 'p1', {
      p1: [3], p2: [3], p3: [3], p4: [1], p5: [5], p6: [6],
    });
    expect(wokeWith(secrets, 'p1')).toEqual(['p2', 'p3']);
    expect(wokeWith(secrets, 'p4')).toEqual([]);
    expect(witnessesOfHider(secrets)).toEqual(['p2', 'p3']);
  });

  it('يعرف من عليه أن يفتح عينيه في مرحلة محددة', () => {
    const secrets = build(5, 'p1', { p1: [2], p2: [2], p3: [4], p4: [5], p5: [6] });
    expect(shouldWake(secrets.p1!, 2)).toBe(true);
    expect(shouldWake(secrets.p1!, 3)).toBe(false);
    expect(playersAwakeAt(secrets, 2)).toEqual(['p1', 'p2']);
  });

  it('يسجّل مرور نافذة الإخفاء دون كشفها', () => {
    const secrets = build(5, 'p3', { p1: [1], p2: [2], p3: [4], p4: [5], p5: [6] });
    expect(hideWindowPassed(secrets, 3)).toBe(false);
    expect(hideWindowPassed(secrets, 4)).toBe(true);
    expect(hideWindowPassed(secrets, 6)).toBe(true);
  });
});

describe('فحص الجار', () => {
  it('يسمح لعضو الفريق المنفرد فقط', () => {
    const secrets = build(6, 'p1', {
      p1: [1], p2: [2], p3: [3], p4: [3], p5: [5], p6: [6],
    });
    expect(canInspect(secrets.p2!, 6)).toBe(true);
    expect(canInspect(secrets.p3!, 6)).toBe(false); // استيقظ مع p4
    expect(canInspect(secrets.p4!, 6)).toBe(false);
  });

  it('يمنع مُخفي الملف من الفحص حتى لو استيقظ وحده', () => {
    const secrets = build(6, 'p1', {
      p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6],
    });
    expect(secrets.p1!.soloSlots).toEqual([1]);
    expect(canInspect(secrets.p1!, 6)).toBe(false);
  });

  it('يمنع الفحص تمامًا في وضع الأربعة لاعبين', () => {
    let secrets = build(4, 'p1', { p1: [1, 2], p2: [3, 4], p3: [5, 6], p4: [1, 5] });
    secrets = computeSoloSlots({
      ...secrets,
      p2: chooseSlot(secrets.p2!, 3),
      p3: chooseSlot(secrets.p3!, 6),
      p4: chooseSlot(secrets.p4!, 5),
    });
    expect(secrets.p2!.soloSlots).toEqual([3]);
    expect(canInspect(secrets.p2!, 4)).toBe(false);
    expect(() =>
      performInspection(secrets.p2!, 'right', makePlayers(4), secrets),
    ).toThrow();
  });

  it('يكشف موعد الجار المختار فقط ولا شيء غيره', () => {
    const players = makePlayers(6);
    const secrets = build(6, 'p1', {
      p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6],
    });
    const inspected = performInspection(secrets.p2!, 'left', players, secrets);
    expect(inspected.inspection).toEqual({ targetId: 'p3', side: 'left', revealedSlot: 3 });
    // لا شيء آخر تسرّب
    expect(Object.keys(inspected.inspection!)).toEqual(['targetId', 'side', 'revealedSlot']);
  });

  it('يحصر الأهداف في الجارين فقط', () => {
    const players = makePlayers(7);
    expect(inspectTargets('p4', players)).toEqual({ right: 'p3', left: 'p5' });
  });

  it('يمنع فحص أكثر من لاعب واحد', () => {
    const players = makePlayers(6);
    const secrets = build(6, 'p1', {
      p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6],
    });
    const once = performInspection(secrets.p2!, 'left', players, secrets);
    expect(canInspect(once, 6)).toBe(false);
    expect(() => performInspection(once, 'right', players, secrets)).toThrow();
  });

  it('يسمح بالفحص يمينًا أو يسارًا لا غير', () => {
    const players = makePlayers(8);
    const secrets = build(8, 'p1', {
      p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6], p7: [1], p8: [2],
    });
    // p3 و p4 منفردان
    const right = performInspection(secrets.p3!, 'right', players, secrets);
    expect(right.inspection!.targetId).toBe('p2');
    const left = performInspection(secrets.p3!, 'left', players, secrets);
    expect(left.inspection!.targetId).toBe('p4');
  });
});

describe('ماذا تعرض شاشة اللاعب في مرحلة ليلية', () => {
  // p2 وحده في الموعد 2؛ p3 وp4 معًا في الموعد 3.
  const secrets = build(6, 'p1', {
    p1: [1],
    p2: [2],
    p3: [3],
    p4: [3],
    p5: [5],
    p6: [6],
  });

  it('المستيقظ وحده يرى المُنتقي في النمط الرقمي', () => {
    expect(nightViewFor(secrets.p2!, 2, 6, 'digital')).toBe('pick');
  });

  it('نمط النرد والأكواب لا يضيء شاشة أحد أبدًا', () => {
    for (const slot of ALL_SLOTS) {
      for (const secret of Object.values(secrets)) {
        expect(nightViewFor(secret, slot, 6, 'physical')).toBe('blackout');
      }
    }
  });

  it('من استيقظ مع غيره لا يرى شيئًا — الانفراد شرط لا الاستيقاظ', () => {
    expect(nightViewFor(secrets.p3!, 3, 6, 'digital')).toBe('blackout');
    expect(nightViewFor(secrets.p4!, 3, 6, 'digital')).toBe('blackout');
  });

  it('النائم لا تضيء شاشته في موعد غيره', () => {
    expect(nightViewFor(secrets.p2!, 5, 6, 'digital')).toBe('blackout');
    expect(nightViewFor(secrets.p2!, null, 6, 'digital')).toBe('blackout');
  });

  it('المُخفي لا يفحص أحدًا ولو استيقظ وحده', () => {
    expect(secrets.p1!.soloSlots).toContain(1);
    expect(nightViewFor(secrets.p1!, 1, 6, 'digital')).toBe('blackout');
  });

  it('بعد إرسال الطلب ينتظر، وبعد وصول الموعد يراه', () => {
    const asked = { ...secrets.p2!, inspection: { targetId: 'p3', side: 'left' as const, revealedSlot: null } };
    expect(nightViewFor(asked, 2, 6, 'digital')).toBe('waiting');

    const answered = { ...asked, inspection: { ...asked.inspection, revealedSlot: 3 as const } };
    expect(nightViewFor(answered, 2, 6, 'digital')).toBe('revealed');
  });

  it('لا فحص ثانٍ: من كشف موعدًا لا يعود إلى المُنتقي', () => {
    const done = {
      ...secrets.p2!,
      inspection: { targetId: 'p3', side: 'left' as const, revealedSlot: 3 as const },
    };
    expect(nightViewFor(done, 2, 6, 'digital')).not.toBe('pick');
  });

  it('بلا سرّ بعد — إعتام لا شاشة فارغة', () => {
    expect(nightViewFor(null, 2, 6, 'digital')).toBe('blackout');
  });

  it('عند 4 لاعبين لا فحص إطلاقًا — القاعدة تُغلقه', () => {
    const four = build(4, 'p1', { p1: [1, 2], p2: [2, 3], p3: [4, 5], p4: [6, 1] });
    const p3 = chooseSlot(four.p3!, 4);
    const solo = computeSoloSlots({ ...four, p3 });
    expect(nightViewFor(solo.p3!, 4, 4, 'digital')).toBe('blackout');
  });
});
