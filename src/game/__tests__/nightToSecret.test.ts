/**
 * ما يبقى من الليل حين تُفتح الأعين.
 *
 * الفحص يقع أثناء الليل، لكن اللاعب يراه لحظةً ثم يُغلق عينيه — فالمرحلة
 * السرية هي المكان الذي يقرأ فيه معلومته على مهل. وبينهما تمرّ كتابات كثيرة
 * على نفس الفرع: ترميز خطوة المتعاونين، وتطبيق اختيار المُخفي. أيّ منها إن
 * كتب الخريطة كاملةً من لقطة قديمة محا فحصًا وصل بعدها.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  closeAccompliceNight,
  enterAccompliceNight,
  resolvePendingInspections,
} from '../director';
import { accompliceIds } from '../accomplice';
import { dealRound, type SecretMap } from '../deal';
import { computeSoloSlots } from '../night';
import type { Phase, PlayerSecret, RoundResults } from '../types';
import type { RoomTransport } from '../../net/transport';
import { dice, ids, makePlayers } from './helpers';

/** نقل وهمي يحاكي حذف Firebase للقيم الفارغة عند كل كتابة. */
class FakeTransport {
  phase: Phase = 'night-phase-6';
  secretStage: 'choosing' | 'resolved' | null = null;
  secrets: SecretMap = {};
  results: RoundResults | null = null;

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
  async readSecrets() {
    return structuredClone(this.secrets);
  }
}

const asTransport = (fake: FakeTransport) => fake as unknown as RoomTransport;

describe('الفحص يصمد حتى المرحلة السرية', () => {
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

  /** p2 يطلب فحص جاره، والمضيف يحلّه — تمامًا كما يجري في الليل. */
  async function inspect() {
    fake.secrets.p2!.inspection = { targetId: 'p3', side: 'left', revealedSlot: null };
    await resolvePendingInspections(asTransport(fake), 'ABCD', players, fake.secrets);
    expect(fake.secrets.p2!.inspection!.revealedSlot).toBe(3);
  }

  it('يبقى بعد فتح خطوة المتعاونين', async () => {
    await inspect();
    await enterAccompliceNight(asTransport(fake), 'ABCD', 6);
    expect(fake.secrets.p2!.inspection).toEqual({
      targetId: 'p3',
      side: 'left',
      revealedSlot: 3,
    });
  });

  it('يبقى بعد أن يختار المُخفي متعاونيه', async () => {
    await inspect();
    await enterAccompliceNight(asTransport(fake), 'ABCD', 6);
    fake.secrets.p1!.accompliceChoice = ['p5'];
    await closeAccompliceNight(asTransport(fake), 'ABCD', 6);

    expect(accompliceIds(fake.secrets)).toEqual(['p5']);
    expect(fake.secrets.p2!.inspection!.revealedSlot).toBe(3);
  });

  it('يبقى بعد الاختيار الاحتياطي حين لا يختار المُخفي', async () => {
    await inspect();
    await enterAccompliceNight(asTransport(fake), 'ABCD', 6);
    await closeAccompliceNight(asTransport(fake), 'ABCD', 6);

    expect(accompliceIds(fake.secrets)).toHaveLength(1);
    expect(fake.secrets.p2!.inspection!.revealedSlot).toBe(3);
  });

  /*
    ── جهاز غائب لا يُلغي اختيارًا ──

    المُخفي يختار من يقف معه، وقد يكون جهاز المختار منقطعًا في تلك اللحظة —
    شبكة تعثّرت، أو خرج من التطبيق. التحويل يكتبه **المضيف** في سرّ المختار،
    فلا علاقة له بحضوره: يعود فيجد نفسه متعاونًا.
  */
  it('يبقى المختار متعاونًا ولو كان جهازه منقطعًا', async () => {
    await enterAccompliceNight(asTransport(fake), 'ABCD', 6);
    fake.secrets.p1!.accompliceChoice = ['p4'];
    // p4 غائب: لا كتابة منه ولا قراءة — الحالة تُبنى عند المضيف وحده
    await closeAccompliceNight(asTransport(fake), 'ABCD', 6);

    expect(fake.secrets.p4!.role).toBe('accomplice');
    expect(fake.secrets.p4!.becameAccomplice).toBe(true);
    expect(fake.secrets.p4!.knownAllies).toEqual(['p1']);
    expect(fake.secrets.p1!.knownAllies).toEqual(['p4']);
  });

  it('لا يُستبدل المختار الغائب باختيار احتياطي', async () => {
    await enterAccompliceNight(asTransport(fake), 'ABCD', 6);
    fake.secrets.p1!.accompliceChoice = ['p6'];
    await closeAccompliceNight(asTransport(fake), 'ABCD', 6);
    // الاحتياطي لا يعمل إلا حين لا يصل اختيار إطلاقًا
    expect(accompliceIds(fake.secrets)).toEqual(['p6']);
  });

  /*
    ── السباق الذي يمحو المعلومة ──

    خطوة المتعاونين تقرأ الأسرار ثم تكتبها **كاملةً**. وفحصٌ يُحلّ بين القراءة
    والكتابة يُمحى: يقرأ اللاعب موعد جاره في ليلته، ثم لا يجد شيئًا بعد الليل.
  */
  it('لا يُمحى فحصٌ وصل أثناء الكتابة الجماعية', async () => {
    const readSecrets = fake.readSecrets.bind(fake);
    let raced = false;
    // فحص يصل بعد القراءة مباشرة وقبل الكتابة
    fake.readSecrets = async () => {
      const snapshot = await readSecrets();
      if (!raced) {
        raced = true;
        await inspect();
      }
      return snapshot;
    };

    await enterAccompliceNight(asTransport(fake), 'ABCD', 6);
    expect(fake.secrets.p2!.inspection?.revealedSlot).toBe(3);
  });
});
