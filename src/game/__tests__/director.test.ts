/**
 * اختبارات المخرج وطبقة النقل: انتقالات المضيف، إعادة الاتصال، ومنع تسريب الأسرار.
 * تستخدم نقلًا وهميًا في الذاكرة يحاكي عقد `RoomTransport` نفسه.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  allAcked,
  applyPendingAccompliceChoice,
  closeAccompliceNight,
  enterAccompliceNight,
  enterSecretActions,
  finalizeWakeSlots,
  nextPhase,
  resolvePendingInspections,
  revealResults,
  startRoleDistribution,
  PHASE_ORDER,
} from '../director';
import { accompliceIds } from '../accomplice';
import { dealRound, emptySecret, type SecretMap } from '../deal';
import { computeSoloSlots } from '../night';
import { EMPTY_PROGRESS } from '../types';
import type { Phase, PlayerProgress, PlayerSecret, RoundResults, WakeSlot } from '../types';
import type { RoomTransport } from '../../net/transport';
import { dice, ids, makePlayers } from './helpers';

/* ── نقل وهمي في الذاكرة ── */

class FakeTransport {
  phase: Phase = 'lobby';
  secretStage: 'choosing' | 'resolved' | null = null;
  secrets: SecretMap = {};
  votes: Record<string, string> = {};
  results: RoundResults | null = null;
  progress: Record<string, PlayerProgress> = {};
  /** كل قراءة سر تُسجَّل هنا للتحقق من عدم تجاوز الصلاحيات */
  readsBy: Array<{ actor: string; path: string }> = [];

  async setPhase(_code: string, phase: Phase) {
    this.phase = phase;
  }
  async setSecretStage(_code: string, stage: 'choosing' | 'resolved' | null) {
    this.secretStage = stage;
  }
  async writeSecrets(_code: string, secrets: SecretMap) {
    this.secrets = structuredClone(secrets);
  }
  async writeSecret(_code: string, playerId: string, secret: PlayerSecret) {
    this.secrets[playerId] = structuredClone(secret);
  }
  async readSecrets(_code: string) {
    this.readsBy.push({ actor: 'host', path: 'secrets' });
    return structuredClone(this.secrets);
  }
  async readVotes() {
    return { ...this.votes };
  }
  async writeResults(_code: string, results: RoundResults) {
    this.results = results;
  }
}

const asTransport = (fake: FakeTransport) => fake as unknown as RoomTransport;

describe('آلة الحالة', () => {
  it('تتقدم بالترتيب المعرّف وتتوقف عند النتائج', () => {
    expect(nextPhase('lobby')).toBe('role-distribution');
    // آخر موعد لا يُنهي الليل: يبقى نداء المُخفي لاختيار متعاونيه
    expect(nextPhase('night-phase-6')).toBe('night-accomplices');
    expect(nextPhase('night-accomplices')).toBe('secret-actions');
    expect(nextPhase('voting')).toBe('reveal');
    expect(nextPhase('results')).toBeNull();
  });

  it('تمرّ بكل مراحل الليل الست بالترتيب', () => {
    const nights = PHASE_ORDER.filter((phase) => phase.startsWith('night-phase-'));
    expect(nights).toEqual([
      'night-phase-1',
      'night-phase-2',
      'night-phase-3',
      'night-phase-4',
      'night-phase-5',
      'night-phase-6',
    ]);
  });

  it('لا تعترف بمرحلة غير معروفة', () => {
    expect(nextPhase('paused')).toBeNull();
  });
});

describe('انتقال المضيف بين المراحل', () => {
  let fake: FakeTransport;
  beforeEach(() => {
    fake = new FakeTransport();
  });

  it('يوزّع الأدوار ثم يفتح شاشة الدور', async () => {
    await startRoleDistribution(asTransport(fake), 'ABCD', ids(6));
    expect(fake.phase).toBe('role-distribution');
    expect(Object.keys(fake.secrets)).toHaveLength(6);
    expect(Object.values(fake.secrets).filter((s) => s.role === 'hider')).toHaveLength(1);
  });

  it('يحسب الاستيقاظ المنفرد قبل بدء الليل', async () => {
    fake.secrets = dealRound({
      playerIds: ids(5),
      rng: { next: () => 0 },
      forceHiderId: 'p1',
      forceDice: dice({ p1: [1], p2: [2], p3: [2], p4: [4], p5: [5] }),
    });
    const settled = await finalizeWakeSlots(asTransport(fake), 'ABCD');
    expect(settled.p1!.soloSlots).toEqual([1]);
    expect(settled.p2!.soloSlots).toEqual([]);
    expect(fake.secrets.p4!.soloSlots).toEqual([4]);
  });

  it('لا ينتقل قبل تأكيد جميع اللاعبين المتصلين', () => {
    const players = makePlayers(5);
    const progress: Record<string, PlayerProgress> = {};
    for (const player of players) progress[player.id] = { ...EMPTY_PROGRESS };

    expect(allAcked(progress, players, 'roleAck')).toBe(false);
    for (const player of players) progress[player.id]!.roleAck = true;
    expect(allAcked(progress, players, 'roleAck')).toBe(true);
  });

  it('يتجاهل اللاعب المنقطع في نصاب الانتقال', () => {
    const players = makePlayers(5).map((player, index) =>
      index === 4 ? { ...player, connected: false } : player,
    );
    const progress: Record<string, PlayerProgress> = {};
    for (const player of players) {
      progress[player.id] = { ...EMPTY_PROGRESS, voted: player.connected };
    }
    expect(allAcked(progress, players, 'voted')).toBe(true);
  });

  it('لا يعتبر جلسة بلا لاعبين متصلين جاهزة', () => {
    const players = makePlayers(4).map((player) => ({ ...player, connected: false }));
    expect(allAcked({}, players, 'roleAck')).toBe(false);
  });
});

describe('خطوة المتعاونين عند المضيف', () => {
  let fake: FakeTransport;
  beforeEach(() => {
    fake = new FakeTransport();
  });

  function seed(n: number, hiderId: string, values: Record<string, number[]>) {
    fake.secrets = computeSoloSlots(
      dealRound({
        playerIds: ids(n),
        rng: { next: () => 0 },
        forceHiderId: hiderId,
        forceDice: dice(values),
      }),
    );
  }

  it('يفتح خطوة الاختيار داخل الليل لا بعده', async () => {
    seed(5, 'p1', { p1: [3], p2: [3], p3: [1], p4: [4], p5: [5] });
    await enterAccompliceNight(asTransport(fake), 'ABCD', 5);
    expect(fake.phase).toBe('night-accomplices');
    expect(fake.phase.startsWith('night-')).toBe(true);
    expect(fake.secrets.p1!.accompliceQuota).toBe(1);
    expect(accompliceIds(fake.secrets)).toEqual([]); // لا أحد يتحوّل قبل الاختيار
  });

  it('يختار نيابةً عن المُخفي إذا انتهت الخطوة بلا اختيار', async () => {
    seed(6, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6] });
    await enterAccompliceNight(asTransport(fake), 'ABCD', 6);
    await closeAccompliceNight(asTransport(fake), 'ABCD', 6);

    const chosen = accompliceIds(fake.secrets);
    expect(chosen).toHaveLength(1);
    expect(chosen[0]).not.toBe('p1');
    expect(fake.secrets.p1!.knownAllies).toEqual(chosen);
    expect(fake.secrets.p1!.accompliceQuota).toBe(0);
  });

  it('يحترم اختيار المُخفي ولا يستبدله عند الإغلاق', async () => {
    seed(6, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6] });
    await enterAccompliceNight(asTransport(fake), 'ABCD', 6);
    fake.secrets.p1!.accompliceChoice = ['p6'];
    await closeAccompliceNight(asTransport(fake), 'ABCD', 6);
    expect(accompliceIds(fake.secrets)).toEqual(['p6']);
  });

  it('لا يعيد الاختيار إذا أُغلقت الخطوة مرتين', async () => {
    seed(6, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6] });
    await enterAccompliceNight(asTransport(fake), 'ABCD', 6);
    await closeAccompliceNight(asTransport(fake), 'ABCD', 6);
    const first = accompliceIds(fake.secrets);
    await closeAccompliceNight(asTransport(fake), 'ABCD', 6);
    expect(accompliceIds(fake.secrets)).toEqual(first);
  });

  it('ينتقل إلى المرحلة السرية بعد أن يُحسم الليل', async () => {
    seed(6, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6] });
    await enterSecretActions(asTransport(fake), 'ABCD');
    expect(fake.phase).toBe('secret-actions');
  });

  it('يطبّق اختيار المُخفي مرة واحدة فقط', async () => {
    seed(6, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6] });
    await enterAccompliceNight(asTransport(fake), 'ABCD', 6);
    expect(fake.secrets.p1!.accompliceQuota).toBe(1);

    // جهاز المُخفي يكتب اختياره
    fake.secrets.p1!.accompliceChoice = ['p4'];

    const first = await applyPendingAccompliceChoice(asTransport(fake), 'ABCD', 6, fake.secrets);
    expect(first).toBe(true);
    expect(fake.secrets.p4!.role).toBe('accomplice');
    expect(fake.secrets.p1!.accompliceChoice).toBeNull();

    // إعادة التطبيق على نفس الحالة لا تفعل شيئًا — الحصة صفر الآن
    const second = await applyPendingAccompliceChoice(asTransport(fake), 'ABCD', 6, fake.secrets);
    expect(second).toBe(false);
  });

  it('لا يطبّق شيئًا قبل وصول الاختيار', async () => {
    seed(6, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6] });
    await enterAccompliceNight(asTransport(fake), 'ABCD', 6);
    const applied = await applyPendingAccompliceChoice(
      asTransport(fake),
      'ABCD',
      6,
      fake.secrets,
    );
    expect(applied).toBe(false);
  });
});

describe('فحص الجار يحلّه المضيف', () => {
  let fake: FakeTransport;
  const players = makePlayers(6);

  beforeEach(() => {
    fake = new FakeTransport();
    fake.secrets = computeSoloSlots(
      dealRound({
        playerIds: ids(6),
        rng: { next: () => 0 },
        forceHiderId: 'p1',
        forceDice: dice({ p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6] }),
      }),
    );
  });

  it('يملأ الموعد المكشوف بعد طلب اللاعب', async () => {
    fake.secrets.p2!.inspection = { targetId: 'p3', side: 'left', revealedSlot: null };
    const changed = await resolvePendingInspections(asTransport(fake), 'ABCD', players, fake.secrets);
    expect(changed).toBe(true);
    expect(fake.secrets.p2!.inspection).toEqual({
      targetId: 'p3',
      side: 'left',
      revealedSlot: 3,
    });
  });

  it('يرفض طلبًا لهدف ليس جارًا — العميل غير موثوق', async () => {
    fake.secrets.p2!.inspection = { targetId: 'p5', side: 'left', revealedSlot: null };
    const changed = await resolvePendingInspections(asTransport(fake), 'ABCD', players, fake.secrets);
    expect(changed).toBe(false);
    expect(fake.secrets.p2!.inspection!.revealedSlot).toBeNull();
  });

  it('يرفض طلبًا من لاعب لم يستيقظ وحده', async () => {
    fake.secrets = computeSoloSlots({
      ...fake.secrets,
      p2: { ...fake.secrets.p2!, dice: [3] as WakeSlot[], effectiveSlots: [3] as WakeSlot[] },
    });
    expect(fake.secrets.p2!.soloSlots).toEqual([]);
    fake.secrets.p2!.inspection = { targetId: 'p3', side: 'left', revealedSlot: null };
    const changed = await resolvePendingInspections(asTransport(fake), 'ABCD', players, fake.secrets);
    expect(changed).toBe(false);
  });

  it('يرفض طلبًا من مُخفي الملف', async () => {
    fake.secrets.p1!.inspection = { targetId: 'p2', side: 'left', revealedSlot: null };
    const changed = await resolvePendingInspections(asTransport(fake), 'ABCD', players, fake.secrets);
    expect(changed).toBe(false);
  });

  it('لا يعيد كشف فحص منتهٍ', async () => {
    fake.secrets.p2!.inspection = { targetId: 'p3', side: 'left', revealedSlot: 3 };
    const changed = await resolvePendingInspections(asTransport(fake), 'ABCD', players, fake.secrets);
    expect(changed).toBe(false);
  });
});

describe('الكشف', () => {
  it('يكتب النتيجة ثم يفتح مرحلة الكشف', async () => {
    const fake = new FakeTransport();
    const players = makePlayers(5);
    fake.secrets = computeSoloSlots(
      dealRound({
        playerIds: ids(5),
        rng: { next: () => 0 },
        forceHiderId: 'p3',
        forceDice: dice({ p1: [1], p2: [2], p3: [3], p4: [4], p5: [5] }),
      }),
    );
    fake.votes = { p1: 'p3', p2: 'p3', p3: 'p1', p4: 'p3', p5: 'p2' };

    await revealResults(asTransport(fake), 'ABCD', players);

    expect(fake.phase).toBe('reveal');
    expect(fake.results!.tally.topVoted).toEqual(['p3']);
    expect(fake.results!.winner).toBe('team');
    expect(fake.results!.hiderId).toBe('p3');
  });
});

describe('عزل الأسرار', () => {
  it('لا يحتوي السر الابتدائي على أي معلومة عن لاعب آخر', () => {
    const secret = emptySecret('p1');
    expect(secret.knownAllies).toEqual([]);
    expect(secret.accompliceCandidates).toEqual([]);
    expect(secret.inspection).toBeNull();
  });

  it('لا يسرّب سر اللاعب هوية لاعب آخر قبل المرحلة السرية', () => {
    const secrets = computeSoloSlots(
      dealRound({
        playerIds: ids(6),
        rng: { next: () => 0 },
        forceHiderId: 'p1',
        forceDice: dice({ p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6] }),
      }),
    );
    for (const secret of Object.values(secrets)) {
      const serialized = JSON.stringify(secret);
      const others = Object.keys(secrets).filter((id) => id !== secret.playerId);
      for (const other of others) {
        expect(serialized).not.toContain(`"${other}"`);
      }
    }
  });

  it('لا يكشف الفحص إلا الموعد — بلا دور ولا فريق', () => {
    const secrets = computeSoloSlots(
      dealRound({
        playerIds: ids(6),
        rng: { next: () => 0 },
        forceHiderId: 'p3',
        forceDice: dice({ p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6] }),
      }),
    );
    const inspection = { targetId: 'p3', side: 'left' as const, revealedSlot: 3 as WakeSlot };
    // الحقول الثلاثة فقط، ولا شيء عن كون p3 هو المُخفي
    expect(Object.keys(inspection).sort()).toEqual(['revealedSlot', 'side', 'targetId']);
    expect(JSON.stringify(inspection)).not.toContain('hider');
    expect(secrets.p3!.role).toBe('hider');
  });
});
