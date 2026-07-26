import { describe, expect, it } from 'vitest';
import { chooseSlot, dealRound, diceSettled, submitPhysicalDice, uniqueSlots } from '../deal';
import { seededRng } from '../rng';
import { rulesFor, isSupportedPlayerCount } from '../rules';
import { dice, ids } from './helpers';

describe('عدد اللاعبين المدعوم', () => {
  it('يقبل من 4 إلى 8 فقط', () => {
    for (let n = 4; n <= 8; n++) expect(isSupportedPlayerCount(n)).toBe(true);
    for (const n of [0, 1, 2, 3, 9, 12]) expect(isSupportedPlayerCount(n)).toBe(false);
    expect(() => rulesFor(3)).toThrow();
    expect(() => rulesFor(9)).toThrow();
  });

  it('ينشئ جلسة صالحة لكل عدد من 4 إلى 8', () => {
    for (let n = 4; n <= 8; n++) {
      const secrets = dealRound({ playerIds: ids(n), rng: seededRng(n * 17) });
      expect(Object.keys(secrets)).toHaveLength(n);
    }
  });
});

describe('توزيع الأدوار', () => {
  it('يوزّع مُخفي ملف واحدًا فقط مهما كان العدد', () => {
    for (let n = 4; n <= 8; n++) {
      for (let seed = 0; seed < 40; seed++) {
        const secrets = dealRound({ playerIds: ids(n), rng: seededRng(seed) });
        const hiders = Object.values(secrets).filter((s) => s.role === 'hider');
        expect(hiders).toHaveLength(1);
        const members = Object.values(secrets).filter((s) => s.role === 'member');
        expect(members).toHaveLength(n - 1);
      }
    }
  });

  it('لا يوزّع دور المتعاون في البداية إطلاقًا', () => {
    for (let n = 4; n <= 8; n++) {
      const secrets = dealRound({ playerIds: ids(n), rng: seededRng(n) });
      expect(Object.values(secrets).some((s) => s.role === 'accomplice')).toBe(false);
    }
  });

  it('يعطي كل لاعب فرصة أن يكون المُخفي عبر جولات متعددة', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const secrets = dealRound({ playerIds: ids(5), rng: seededRng(seed) });
      seen.add(Object.values(secrets).find((s) => s.role === 'hider')!.playerId);
    }
    expect(seen.size).toBe(5);
  });
});

describe('النرد الرقمي', () => {
  it('ينتج نتائج من 1 إلى 6 فقط', () => {
    for (let seed = 0; seed < 100; seed++) {
      const secrets = dealRound({ playerIds: ids(6), rng: seededRng(seed) });
      for (const secret of Object.values(secrets)) {
        for (const value of secret.dice) {
          expect(value).toBeGreaterThanOrEqual(1);
          expect(value).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it('يعطي نتيجة واحدة من 5 إلى 8 لاعبين ونتيجتين في وضع الأربعة', () => {
    for (let n = 5; n <= 8; n++) {
      const secrets = dealRound({ playerIds: ids(n), rng: seededRng(n) });
      for (const secret of Object.values(secrets)) expect(secret.dice).toHaveLength(1);
    }
    const four = dealRound({ playerIds: ids(4), rng: seededRng(3) });
    for (const secret of Object.values(four)) expect(secret.dice).toHaveLength(2);
  });

  it('يجعل الموعد الفعّال هو نتيجة النرد مباشرة في 5 لاعبين فأكثر', () => {
    const secrets = dealRound({
      playerIds: ids(5),
      rng: seededRng(1),
      forceDice: dice({ p1: [2], p2: [4], p3: [4], p4: [6], p5: [1] }),
    });
    expect(secrets.p1!.effectiveSlots).toEqual([2]);
    expect(secrets.p3!.effectiveSlots).toEqual([4]);
    expect(Object.values(secrets).every(diceSettled)).toBe(true);
  });
});

describe('النرد الحقيقي', () => {
  it('يقبل الأرقام الصحيحة من 1 إلى 6', () => {
    const secrets = dealRound({ playerIds: ids(6), rng: seededRng(9) });
    const updated = submitPhysicalDice(secrets.p2!, [3], 6);
    expect(updated.dice).toEqual([3]);
    expect(updated.effectiveSlots).toEqual([3]);
  });

  it('يرفض الأرقام خارج النطاق أو غير الصحيحة', () => {
    const secrets = dealRound({ playerIds: ids(6), rng: seededRng(9) });
    expect(() => submitPhysicalDice(secrets.p2!, [0], 6)).toThrow();
    expect(() => submitPhysicalDice(secrets.p2!, [7], 6)).toThrow();
    expect(() => submitPhysicalDice(secrets.p2!, [2.5], 6)).toThrow();
  });

  it('يطلب رقمين في وضع الأربعة ورقمًا واحدًا في غيره', () => {
    const four = dealRound({ playerIds: ids(4), rng: seededRng(2) });
    expect(() => submitPhysicalDice(four.p1!, [3], 4)).toThrow();
    expect(() => submitPhysicalDice(four.p1!, [3, 5], 4)).not.toThrow();

    const six = dealRound({ playerIds: ids(6), rng: seededRng(2) });
    expect(() => submitPhysicalDice(six.p1!, [3, 5], 6)).toThrow();
  });

  it('يطبّق قاعدة المُخفي في وضع الأربعة على النرد الحقيقي أيضًا', () => {
    const secrets = dealRound({ playerIds: ids(4), rng: seededRng(2), forceHiderId: 'p1' });
    const hider = submitPhysicalDice(secrets.p1!, [2, 5], 4);
    expect(hider.effectiveSlots).toEqual([2, 5]);

    const member = submitPhysicalDice(secrets.p2!, [1, 4], 4);
    expect(member.effectiveSlots).toEqual([]);
    expect(chooseSlot(member, 4).effectiveSlots).toEqual([4]);
  });
});

describe('أدوات المواعيد', () => {
  it('يزيل التكرار ويرتّب', () => {
    expect(uniqueSlots([5, 2, 5, 1])).toEqual([1, 2, 5]);
  });
});
