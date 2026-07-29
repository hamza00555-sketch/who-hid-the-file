/**
 * اختبار حيّ لـ `FirebaseTransport` على قاعدة بيانات حقيقية — اختياري.
 *
 *   npm run test:live
 *
 * لماذا يلزم: بقية الاختبارات على النقل المحلي، وهو لا يعرف القواعد الأمنية.
 * أخطاء المسارات لا تظهر إلا أمام قواعد حقيقية — وقد أخفى ذلك عيبين كانا
 * يمنعان اللعبة من العمل أصلًا: كتابة الغرفة كاملةً في `createRoom`، وقراءتها
 * كاملةً في `joinRoom` و`watchRoom`. القواعد لا تتوارث لا صعودًا ولا نزولًا.
 *
 * **هوية واحدة فقط:** `src/net/firebase.ts` يحتفظ بـ app و auth مفردين على
 * مستوى الوحدة، فكل نسخ `FirebaseTransport` في نفس العملية تتشارك مستخدمًا
 * مجهولًا واحدًا. هذا صحيح للتطبيق (جهاز = متصفح = هوية)، لكنه يعني أن عزل
 * الأسرار بين لاعبَين **لا يُختبر هنا** — مكانه `scripts/verify-rules.mjs`
 * الذي يفتح ثلاث هويات حقيقية عبر REST.
 *
 * يحتاج `.env.production` وتفعيل Anonymous. ينظّف غرفه بعد كل حالة.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { ref, remove } from 'firebase/database';
import { FirebaseTransport } from '../../firebaseTransport';
import { db } from '../../firebase';
import { isFirebaseConfigured } from '../../env';
import type { PlayerSecret, RoomSettings, RoomState, RoundResults } from '../../../game/types';

/** لا يوجد حذف غرفة في الواجهة؛ إزالة الفروع تكفي لجعلها غير موجودة. */
async function dropRoom(code: string) {
  for (const path of ['round', 'players', 'settings', 'meta']) {
    await remove(ref(db(), `rooms/${code}/${path}`)).catch(() => {});
  }
}

const SETTINGS: RoomSettings = {
  gameName: 'الملف المفقود',
  diceMode: 'digital',
  slotNaming: 'nights',
  nightCountdownSeconds: 10,
  discussionSeconds: 180,
  voiceEnabled: true,
  narratorVoice: 'male',
  ttsRate: 1,
};

const secret = (playerId: string, over: Partial<PlayerSecret> = {}): PlayerSecret => ({
  playerId,
  role: 'member',
  dice: [1],
  chosenSlot: null,
  effectiveSlots: [1],
  soloSlots: [],
  inspection: null,
  knownAllies: [],
  accompliceQuota: 0,
  accompliceCandidates: [],
  accompliceChoice: null,
  becameAccomplice: false,
  ...over,
});

/** ينتظر أول حالة تحقّق الشرط، أو يفشل بمهلة واضحة. */
function until(
  transport: FirebaseTransport,
  code: string,
  predicate: (state: RoomState) => boolean,
  label: string,
): Promise<RoomState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error(`انتهت المهلة بانتظار: ${label}`));
    }, 15000);
    const stop = transport.watchRoom(code, (state) => {
      if (state && predicate(state)) {
        clearTimeout(timer);
        stop();
        resolve(state);
      }
    });
  });
}

const suite = isFirebaseConfigured() ? describe : describe.skip;

suite('FirebaseTransport على قاعدة حقيقية', () => {
  const codes: string[] = [];
  afterEach(async () => {
    while (codes.length) await dropRoom(codes.pop()!);
  });

  async function newRoom() {
    const t = new FirebaseTransport();
    const uid = await t.identify();
    const code = await t.createRoom(uid, SETTINGS);
    codes.push(code);
    return { t, uid, code };
  }

  it('ينشئ جلسة ويقرأها عبر watchRoom', async () => {
    const { t, uid, code } = await newRoom();
    expect(code).toHaveLength(4);

    const state = await until(t, code, (s) => s.meta.code === code, 'وصول الحالة');
    expect(state.meta.hostUid).toBe(uid);
    expect(state.meta.phase).toBe('lobby');
    expect(state.settings.diceMode).toBe('digital');
    expect(state.players).toEqual({});
  });

  it('يرفض الانضمام برمز لا وجود له', async () => {
    const t = new FirebaseTransport();
    const uid = await t.identify();
    await expect(
      t.joinRoom({ code: 'ZZZZ', playerId: uid, name: 'أحد', avatarId: 'saud' }),
    ).rejects.toThrow();
  });

  it('ينضم لاعب فتصل بياناته العامة إلى المشتركين', async () => {
    const { t, uid, code } = await newRoom();
    await t.joinRoom({ code, playerId: uid, name: 'هزاع', avatarId: 'saud' });

    const state = await until(t, code, (s) => Boolean(s.players[uid] && s.progress[uid]), 'ظهور اللاعب');
    expect(state.players[uid]!.name).toBe('هزاع');
    expect(state.players[uid]!.isHost).toBe(true);
    expect(state.progress[uid]).toBeDefined();
  });

  it('يمرّ بجولة كاملة: أدوار ثم صوت ثم نتيجة ثم تصفير', async () => {
    const { t, uid, code } = await newRoom();
    await t.joinRoom({ code, playerId: uid, name: 'هزاع', avatarId: 'saud' });
    await until(t, code, (s) => Boolean(s.players[uid] && s.progress[uid]), 'انضمام اللاعب');

    // كتابات على مسارات جماعية — هي التي كانت مرفوضة قبل ضبط القواعد
    await t.setSeats(code, { [uid]: 0 });
    await t.writeSecrets(code, { [uid]: secret(uid, { role: 'hider', soloSlots: [3] }) });

    const mine = await new Promise<PlayerSecret | null>((resolve) => {
      const un = t.watchSecret(code, uid, (s) => {
        if (s) { un(); resolve(s); }
      });
      setTimeout(() => { un(); resolve(null); }, 10000);
    });
    expect(mine?.role).toBe('hider');

    await t.ack(code, uid, 'roleAck');
    await until(t, code, (s) => s.progress[uid]?.roleAck === true, 'تسجيل roleAck');

    /*
      التصويت للنفس مرفوض بالقواعد عن حق، والعملية هنا بهوية واحدة — فيُقعِد
      المضيف لاعبًا ثانيًا (مسموح له بذلك) ليكون هدفًا صالحًا للصوت.
    */
    const otherId = `ghost-${Date.now()}`;
    await t.joinRoom({ code, playerId: otherId, name: 'ريما', avatarId: 'lama' });
    await t.setPhase(code, 'voting');
    await t.submitVote(code, uid, otherId);
    expect(await t.readVotes(code)).toEqual({ [uid]: otherId });

    const results: RoundResults = {
      winner: 'team',
      hiderId: uid,
      accompliceIds: [],
      tally: { counts: { [otherId]: 1 }, topVoted: [otherId], totalVotes: 1 },
      reveal: [],
    };
    await t.writeResults(code, results);
    const done = await until(t, code, (s) => s.results !== null, 'ظهور النتيجة');
    expect(done.results!.winner).toBe('team');
    expect(done.votesSubmitted).toBe(1);

    await t.resetRound(code);
    const fresh = await until(
      t, code,
      (s) => s.results === null && s.meta.phase === 'lobby',
      'تصفير الجولة',
    );
    expect(fresh.results).toBeNull();
    expect(await t.readVotes(code)).toEqual({});
    expect(await t.readSecrets(code)).toEqual({});
    expect(fresh.players[uid]!.ready).toBe(false);
  });
});
