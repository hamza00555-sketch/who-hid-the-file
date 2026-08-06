import { describe, expect, it } from 'vitest';
import {
  accompliceIds,
  applyAccomplices,
  autoPickAccomplices,
  planAccomplices,
  prepareAccompliceStage,
} from '../accomplice';
import { chooseSlot, dealRound } from '../deal';
import { canInspect, computeSoloSlots } from '../night';
import { seededRng } from '../rng';
import { dice, ids } from './helpers';

function build(n: number, hiderId: string, values: Record<string, number[]>) {
  return computeSoloSlots(
    dealRound({
      playerIds: ids(n),
      rng: { next: () => 0 },
      forceHiderId: hiderId,
      forceDice: dice(values),
    }),
  );
}

describe('لكل جولة متعاون واحد على الأقل', () => {
  it('يطلب متعاونًا واحدًا في وضع الأربعة', () => {
    let secrets = build(4, 'p1', { p1: [2, 3], p2: [2, 5], p3: [1, 4], p4: [6, 6] });
    secrets = computeSoloSlots({
      ...secrets,
      p1: chooseSlot(secrets.p1!, 3),
      p2: chooseSlot(secrets.p2!, 2),
      p3: chooseSlot(secrets.p3!, 4),
      p4: chooseSlot(secrets.p4!, 6),
    });
    const plan = planAccomplices(secrets, 4);
    expect(plan.quota).toBe(1);
    expect(plan.candidates).toEqual(['p2', 'p3', 'p4']);

    const applied = applyAccomplices(prepareAccompliceStage(secrets, 4), ['p3'], 4);
    expect(applied.p3!.role).toBe('accomplice');
    expect(applied.p3!.knownAllies).toEqual(['p1']);
  });

  /*
    كانت خمسة لاعبين تُعيّن المتعاون بالمشاهدة: من استيقظ مع المُخفي. والجولة
    التي لا يستيقظ فيها أحد معه كانت تُلعب بلا متعاون إطلاقًا — وهو ما تمنعه
    القاعدة الآن.
  */
  it('يعطي متعاونًا حتى إن لم يشاهد أحدٌ المُخفي', () => {
    const secrets = build(5, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5] });
    const plan = planAccomplices(secrets, 5);
    expect(plan.quota).toBe(1);
    expect(plan.candidates).toEqual(['p2', 'p3', 'p4', 'p5']);
  });

  it('يرشّح كل من على الطاولة عدا المُخفي', () => {
    const secrets = build(5, 'p3', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5] });
    expect(planAccomplices(secrets, 5).candidates).toEqual(['p1', 'p2', 'p4', 'p5']);
  });

  it('لا يمسّ دور أحد قبل أن يصل الاختيار', () => {
    const staged = prepareAccompliceStage(
      build(5, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5] }),
      5,
    );
    expect(staged.p1!.accompliceQuota).toBe(1);
    expect(staged.p1!.accompliceCandidates).toEqual(['p2', 'p3', 'p4', 'p5']);
    expect(accompliceIds(staged)).toEqual([]);
  });

  it('يحتفظ المتعاون بحقه في فحص جاره إن كان منفردًا', () => {
    // الاختيار يقع في آخر الليل، بعد أن مرّت مواعيد الفحص كلها
    const applied = applyAccomplices(
      prepareAccompliceStage(build(5, 'p1', { p1: [3], p2: [2], p3: [3], p4: [4], p5: [5] }), 5),
      ['p2'],
      5,
    );
    expect(applied.p2!.role).toBe('accomplice');
    expect(canInspect(applied.p2!, 5)).toBe(true);
    expect(canInspect(applied.p1!, 5)).toBe(false); // المُخفي لا يفحص
  });
});

describe('ستة لاعبين — اختيار متعاون واحد', () => {
  const secrets = () =>
    build(6, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6] });

  it('يعرض كل اللاعبين عدا المُخفي ويطلب واحدًا', () => {
    const plan = planAccomplices(secrets(), 6);
    expect(plan.quota).toBe(1);
    expect(plan.candidates).toEqual(['p2', 'p3', 'p4', 'p5', 'p6']);
  });

  it('يعرف كل من المُخفي والمتعاون الآخر', () => {
    const applied = applyAccomplices(prepareAccompliceStage(secrets(), 6), ['p5'], 6);
    expect(applied.p5!.role).toBe('accomplice');
    expect(applied.p5!.knownAllies).toEqual(['p1']);
    expect(applied.p1!.knownAllies).toEqual(['p5']);
  });

  it('يمنع المُخفي من اختيار نفسه أو اختيار عدد خاطئ', () => {
    const staged = prepareAccompliceStage(secrets(), 6);
    expect(() => applyAccomplices(staged, ['p1'], 6)).toThrow();
    expect(() => applyAccomplices(staged, [], 6)).toThrow();
    expect(() => applyAccomplices(staged, ['p2', 'p3'], 6)).toThrow();
    expect(() => applyAccomplices(staged, ['p9'], 6)).toThrow();
  });
});

describe('سبعة لاعبين — متعاونان لا يعرفان المُخفي', () => {
  const secrets = () =>
    build(7, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6], p7: [1] });

  it('يطلب اثنين', () => {
    expect(planAccomplices(secrets(), 7).quota).toBe(2);
  });

  it('يعرف المتعاونان بعضهما ولا يعرفان المُخفي', () => {
    const applied = applyAccomplices(prepareAccompliceStage(secrets(), 7), ['p3', 'p6'], 7);
    expect(applied.p3!.knownAllies).toEqual(['p6']);
    expect(applied.p6!.knownAllies).toEqual(['p3']);
    expect(applied.p3!.knownAllies).not.toContain('p1');
    expect(applied.p1!.knownAllies).toEqual(['p3', 'p6']); // المُخفي يعرفهما
    expect(accompliceIds(applied)).toEqual(['p3', 'p6']);
  });

  it('يرفض تكرار نفس اللاعب مرتين', () => {
    const staged = prepareAccompliceStage(secrets(), 7);
    expect(() => applyAccomplices(staged, ['p3', 'p3'], 7)).toThrow();
  });
});

describe('ثمانية لاعبين — الثلاثة يعرفون بعضهم', () => {
  it('يوزّع المعرفة كاملة', () => {
    const secrets = build(8, 'p1', {
      p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6], p7: [2], p8: [4],
    });
    const applied = applyAccomplices(prepareAccompliceStage(secrets, 8), ['p2', 'p8'], 8);
    expect(applied.p2!.knownAllies.sort()).toEqual(['p1', 'p8']);
    expect(applied.p8!.knownAllies.sort()).toEqual(['p1', 'p2']);
    expect(applied.p1!.knownAllies).toEqual(['p2', 'p8']);
  });
});

describe('الاختيار الاحتياطي حين لا يصل اختيار المُخفي', () => {
  const secrets = () =>
    build(7, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6], p7: [1] });

  it('يختار العدد المطلوب من المرشحين بلا تكرار ولا مُخفٍ', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const picked = autoPickAccomplices(secrets(), 7, seededRng(seed));
      expect(picked).toHaveLength(2);
      expect(new Set(picked).size).toBe(2);
      expect(picked).not.toContain('p1');
    }
  });

  it('ينتج اختيارًا يقبله التطبيق', () => {
    const staged = prepareAccompliceStage(secrets(), 7);
    const picked = autoPickAccomplices(staged, 7, seededRng(7));
    expect(accompliceIds(applyAccomplices(staged, picked, 7))).toEqual(picked);
  });
});
