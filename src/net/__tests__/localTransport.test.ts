// @vitest-environment jsdom

/**
 * اختبارات طبقة النقل: التحقق عند الانضمام، إعادة الاتصال، وكتابة الصوت مرة واحدة.
 * تُشغَّل على `LocalTransport` لأنها تنفّذ نفس عقد `RoomTransport` وقابلة للاختبار بلا شبكة.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../config/game.config';
import type { RoomSettings, RoomState } from '../../game/types';
import { LocalTransport } from '../localTransport';
import { TransportError } from '../transport';

const SETTINGS: RoomSettings = {
  gameName: GAME_CONFIG.name,
  diceMode: 'digital',
  slotNaming: 'nights',
  nightCountdownSeconds: 10,
  discussionSeconds: 180,
  voiceEnabled: true,
  hostPlays: false,
  narratorVoice: 'male',
  ttsRate: 0.82,
};

/** `watchRoom` يستدعي المستمع فورًا، فلا يمكن الاعتماد على `stop` داخل الاستدعاء الأول. */
function snapshot(transport: LocalTransport, code: string): Promise<RoomState> {
  return new Promise((resolve) => {
    let captured: RoomState | null = null;
    const stop = transport.watchRoom(code, (state) => {
      captured ??= state;
    });
    stop();
    if (!captured) throw new Error(`لا توجد غرفة بالرمز ${code}`);
    resolve(captured);
  });
}

let transport: LocalTransport;
let code: string;

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  transport = new LocalTransport();
  code = await transport.createRoom('host-1', SETTINGS);
});

describe('إنشاء الجلسة', () => {
  it('ينشئ رمزًا بالطول المحدد وبالأحرف المسموحة فقط', () => {
    expect(code).toHaveLength(GAME_CONFIG.roomCode.length);
    for (const character of code) {
      expect(GAME_CONFIG.roomCode.alphabet).toContain(character);
    }
  });

  it('يبدأ في الردهة بلا لاعبين', async () => {
    const state = await snapshot(transport, code);
    expect(state.meta.phase).toBe('lobby');
    expect(state.meta.hostUid).toBe('host-1');
    expect(Object.keys(state.players)).toHaveLength(0);
  });

  it('يرفض العمل على رمز غير موجود', async () => {
    await expect(
      transport.joinRoom({ code: 'ZZZZ', playerId: 'x', name: 'س', avatarId: 'faisal' }),
    ).rejects.toThrow(TransportError);
  });
});

describe('الانضمام', () => {
  const join = (playerId: string, name: string, avatarId: string) =>
    transport.joinRoom({ code, playerId, name, avatarId });

  it('يقبل من 4 إلى 8 لاعبين ويرفض التاسع', async () => {
    for (let i = 0; i < GAME_CONFIG.players.max; i++) {
      await join(`p${i}`, `لاعب ${i}`, `char${i}`);
    }
    const state = await snapshot(transport, code);
    expect(Object.keys(state.players)).toHaveLength(GAME_CONFIG.players.max);

    await expect(join('p9', 'لاعب زائد', 'char9')).rejects.toThrow(/مكتملة/);
  });

  it('يرفض الاسم المكرر بعد تطبيع المسافات', async () => {
    await join('p1', 'ريم', 'faisal');
    await expect(join('p2', '  ريم  ', 'noura')).rejects.toThrow(/مستخدم/);
    await expect(join('p2', 'ريم النور', 'noura')).resolves.toBeUndefined();
  });

  it('يرفض حجز شخصية محجوزة', async () => {
    await join('p1', 'ريم', 'faisal');
    await expect(join('p2', 'سعود', 'faisal')).rejects.toThrow(/الشخصية/);
  });

  it('يرفض الانضمام بعد بدء الجولة', async () => {
    await join('p1', 'ريم', 'faisal');
    await transport.setPhase(code, 'role-distribution');
    await expect(join('p2', 'سعود', 'noura')).rejects.toThrow(/بدأت الجولة/);
  });

  it('يوزّع المقاعد بالتسلسل من صفر', async () => {
    await join('p1', 'أ', 'faisal');
    await join('p2', 'ب', 'noura');
    await join('p3', 'ج', 'majed');
    const state = await snapshot(transport, code);
    expect(state.players.p1!.seat).toBe(0);
    expect(state.players.p2!.seat).toBe(1);
    expect(state.players.p3!.seat).toBe(2);
  });
});

describe('إعادة الاتصال', () => {
  it('يستعيد نفس الهوية والمقعد بلا اعتباره لاعبًا جديدًا', async () => {
    await transport.joinRoom({ code, playerId: 'p1', name: 'أ', avatarId: 'faisal' });
    await transport.joinRoom({ code, playerId: 'p2', name: 'ب', avatarId: 'noura' });
    await transport.setSeats(code, { p1: 1, p2: 0 });
    await transport.leaveRoom(code, 'p2');

    let state = await snapshot(transport, code);
    expect(state.players.p2!.connected).toBe(false);

    // نفس الـ uid يعود بنفس الاسم والشخصية
    await transport.joinRoom({ code, playerId: 'p2', name: 'ب', avatarId: 'noura' });
    state = await snapshot(transport, code);

    expect(Object.keys(state.players)).toHaveLength(2);
    expect(state.players.p2!.connected).toBe(true);
    expect(state.players.p2!.seat).toBe(0); // المقعد محفوظ
  });

  it('يسمح بالعودة حتى بعد بدء الجولة', async () => {
    await transport.joinRoom({ code, playerId: 'p1', name: 'أ', avatarId: 'faisal' });
    await transport.setPhase(code, 'night-phase-2');
    await transport.leaveRoom(code, 'p1');
    await expect(
      transport.joinRoom({ code, playerId: 'p1', name: 'أ', avatarId: 'faisal' }),
    ).resolves.toBeUndefined();
  });

  it('لا يكشف الدور تلقائيًا عند العودة — السر يبقى في مساره', async () => {
    await transport.joinRoom({ code, playerId: 'p1', name: 'أ', avatarId: 'faisal' });
    await transport.writeSecret(code, 'p1', {
      playerId: 'p1',
      role: 'hider',
      dice: [3],
      chosenSlot: null,
      effectiveSlots: [3],
      soloSlots: [3],
      inspection: null,
      knownAllies: [],
      accompliceQuota: 0,
      accompliceCandidates: [],
      accompliceChoice: null,
      becameAccomplice: false,
    });

    const state = await snapshot(transport, code);
    // الحالة العامة لا تحمل أي أثر للدور
    expect(JSON.stringify(state)).not.toContain('hider');
  });
});

describe('إيقاف الجولة واستئنافها', () => {
  it('يحفظ المرحلة السابقة عند التوقف', async () => {
    await transport.setPhase(code, 'night-phase-3');
    await transport.setPhase(code, 'paused');
    const state = await snapshot(transport, code);
    expect(state.meta.phase).toBe('paused');
    expect(state.meta.resumePhase).toBe('night-phase-3');
  });
});

describe('التصويت', () => {
  beforeEach(async () => {
    await transport.joinRoom({ code, playerId: 'p1', name: 'أ', avatarId: 'faisal' });
    await transport.joinRoom({ code, playerId: 'p2', name: 'ب', avatarId: 'noura' });
  });

  it('يكتب الصوت مرة واحدة ويتجاهل المحاولة الثانية', async () => {
    await transport.submitVote(code, 'p1', 'p2');
    await transport.submitVote(code, 'p1', 'p1');
    expect(await transport.readVotes(code)).toEqual({ p1: 'p2' });
  });

  it('يرفع علم التصويت بلا كشف الوجهة في الحالة العامة', async () => {
    await transport.submitVote(code, 'p1', 'p2');
    const state = await snapshot(transport, code);
    expect(state.progress.p1!.voted).toBe(true);
    expect(state.votesSubmitted).toBe(1);
  });
});

describe('جولة جديدة', () => {
  it('تمسح الأسرار والأصوات وتصفّر الجاهزية وتغيّر معرّف الجولة', async () => {
    await transport.joinRoom({ code, playerId: 'p1', name: 'أ', avatarId: 'faisal' });
    await transport.updatePlayer(code, 'p1', { ready: true });
    await transport.submitVote(code, 'p1', 'p2');
    await transport.ack(code, 'p1', 'roleAck');

    const before = await snapshot(transport, code);
    await transport.resetRound(code);
    const after = await snapshot(transport, code);

    expect(after.meta.roundId).not.toBe(before.meta.roundId);
    expect(after.meta.phase).toBe('lobby');
    expect(after.players.p1!.ready).toBe(false);
    expect(after.progress.p1!.roleAck).toBe(false);
    expect(await transport.readVotes(code)).toEqual({});
    expect(await transport.readSecrets(code)).toEqual({});
    // اللاعبون يبقون في الجلسة
    expect(Object.keys(after.players)).toEqual(['p1']);
  });
});

/*
  الخروج من التطبيق والعودة إليه لا يجوز أن يُخرج اللاعب من الجلسة.

  العطل الأصلي كان في مسار Firebase: `onDisconnect` يُستهلَك عند تنفيذه، وكان
  مُسلَّحًا مرّة واحدة عند الانضمام — فبعد أول انقطاع لا حارس يُعاد ولا أحد
  يُعيد الحالة إلى «متصل». العقد الذي يمنع عودته مشترك بين النقلتين:
  `watchPresence` يحيا ما دام اللاعب في الغرفة، ويُعيد إعلان الحضور عند كل عودة.
*/
describe('الحضور يصمد عبر الخروج والعودة', () => {
  it('يعيد اللاعب متصلًا بعد أن يُعلَّم منقطعًا', async () => {
    const transport = new LocalTransport();
    const id = await transport.identify();
    const code = await transport.createRoom(id, SETTINGS);
    await transport.joinRoom({ code, playerId: id, name: 'هزاع', avatarId: 'faisal' });

    const stop = transport.watchPresence(code, id);

    // انقطاع: ما يفعله الخادم عند سقوط المقبس
    await transport.leaveRoom(code, id);
    expect(readPlayer(transport, code, id).connected).toBe(false);

    // عودة إلى التطبيق
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(readPlayer(transport, code, id).connected).toBe(true);

    stop();
  });

  it('لا يعلن الحضور والصفحة مخفيّة — لا يكذب على بقية الطاولة', async () => {
    const transport = new LocalTransport();
    const id = await transport.identify();
    const code = await transport.createRoom(id, SETTINGS);
    await transport.joinRoom({ code, playerId: id, name: 'ريم', avatarId: 'noura' });
    const stop = transport.watchPresence(code, id);
    await transport.leaveRoom(code, id);

    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(readPlayer(transport, code, id).connected).toBe(false);

    if (original) Object.defineProperty(Document.prototype, 'visibilityState', original);
    else Reflect.deleteProperty(document, 'visibilityState');
    stop();
  });

  it('يتوقف عن التجديد بعد إلغاء الاشتراك', async () => {
    const transport = new LocalTransport();
    const id = await transport.identify();
    const code = await transport.createRoom(id, SETTINGS);
    await transport.joinRoom({ code, playerId: id, name: 'سعود', avatarId: 'saud' });
    transport.watchPresence(code, id)();

    await transport.leaveRoom(code, id);
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(readPlayer(transport, code, id).connected).toBe(false);
  });
});

function readPlayer(transport: LocalTransport, code: string, id: string) {
  let state: RoomState | null = null;
  transport.watchRoom(code, (next) => (state = next))();
  return (state as unknown as RoomState).players[id]!;
}
