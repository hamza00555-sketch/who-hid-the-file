import { describe, expect, it } from 'vitest';
import { accompliceIds, applyAccomplices, planAccomplices, prepareAccompliceStage } from '../accomplice';
import { chooseSlot, dealRound } from '../deal';
import { canInspect, computeSoloSlots } from '../night';
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

describe('أربعة لاعبين — بلا متعاونين', () => {
  it('لا يخطط لأي متعاون', () => {
    let secrets = build(4, 'p1', { p1: [2, 3], p2: [2, 5], p3: [1, 4], p4: [6, 6] });
    secrets = computeSoloSlots({
      ...secrets,
      p2: chooseSlot(secrets.p2!, 2),
      p3: chooseSlot(secrets.p3!, 4),
      p4: chooseSlot(secrets.p4!, 6),
    });
    const plan = planAccomplices(secrets, 4);
    expect(plan.mode).toBe('none');
    expect(plan.quota).toBe(0);
    expect(applyAccomplices(secrets, [], 4)).toBe(secrets);
    expect(() => applyAccomplices(secrets, ['p2'], 4)).toThrow();
  });
});

describe('خمسة لاعبين — المتعاون بالمشاهدة', () => {
  it('لا متعاون إذا لم يشاهد أحد المُخفي', () => {
    const secrets = build(5, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5] });
    const plan = planAccomplices(secrets, 5);
    expect(plan.autoAssigned).toEqual([]);
    expect(plan.quota).toBe(0);
    expect(accompliceIds(prepareAccompliceStage(secrets, 5))).toEqual([]);
  });

  it('يحوّل الشاهد الوحيد تلقائيًا إلى متعاون', () => {
    const secrets = build(5, 'p1', { p1: [3], p2: [3], p3: [4], p4: [5], p5: [6] });
    const plan = planAccomplices(secrets, 5);
    expect(plan.autoAssigned).toEqual(['p2']);

    const applied = prepareAccompliceStage(secrets, 5);
    expect(applied.p2!.role).toBe('accomplice');
    expect(applied.p2!.becameAccomplice).toBe(true);
    expect(applied.p2!.knownAllies).toEqual(['p1']); // يعرف المُخفي
    expect(applied.p1!.knownAllies).toEqual(['p2']); // والمُخفي يعرفه
  });

  it('يطلب من المُخفي اختيار واحد إذا شاهده أكثر من لاعب', () => {
    const secrets = build(5, 'p1', { p1: [3], p2: [3], p3: [3], p4: [5], p5: [6] });
    const plan = planAccomplices(secrets, 5);
    expect(plan.quota).toBe(1);
    expect(plan.candidates).toEqual(['p2', 'p3']);
    expect(plan.autoAssigned).toEqual([]);

    const staged = prepareAccompliceStage(secrets, 5);
    expect(staged.p1!.accompliceQuota).toBe(1);
    expect(staged.p1!.accompliceCandidates).toEqual(['p2', 'p3']);
    expect(accompliceIds(staged)).toEqual([]); // لم يُختر بعد

    const applied = applyAccomplices(staged, ['p3'], 5);
    expect(applied.p3!.role).toBe('accomplice');
    expect(applied.p2!.role).toBe('member');
    expect(applied.p1!.accompliceQuota).toBe(0);
  });

  it('يرفض اختيار لاعب لم يشاهد المُخفي', () => {
    const secrets = build(5, 'p1', { p1: [3], p2: [3], p3: [3], p4: [5], p5: [6] });
    expect(() => applyAccomplices(secrets, ['p4'], 5)).toThrow();
  });

  it('يحتفظ المتعاون بحقه في فحص جاره إن كان منفردًا', () => {
    // p2 شاهد المُخفي فهو ليس منفردًا؛ p4 منفرد ويبقى عضوًا
    const secrets = prepareAccompliceStage(
      build(5, 'p1', { p1: [3], p2: [3], p3: [2], p4: [5], p5: [6] }),
      5,
    );
    expect(secrets.p2!.role).toBe('accomplice');
    expect(canInspect(secrets.p2!, 5)).toBe(false);
    expect(canInspect(secrets.p4!, 5)).toBe(true);
  });
});

describe('ستة لاعبين — اختيار متعاون واحد', () => {
  const secrets = () =>
    build(6, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6] });

  it('يعرض كل اللاعبين عدا المُخفي ويطلب واحدًا', () => {
    const plan = planAccomplices(secrets(), 6);
    expect(plan.mode).toBe('chosen');
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
