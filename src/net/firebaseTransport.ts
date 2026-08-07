/**
 * نقل الإنتاج عبر Firebase Realtime Database.
 *
 * التصميم: المسارات العامة (`meta`, `settings`, `players`, `round/progress`,
 * `round/results`) يقرؤها الجميع؛ `round/secrets/{uid}` يقرؤه صاحبه فقط،
 * و `round/votes/{uid}` يُكتب مرة واحدة ولا يقرؤه غير المضيف.
 * القواعد الفعلية في `firebase/database.rules.json`.
 */

import {
  get,
  goOffline,
  goOnline,
  onDisconnect,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import { GAME_CONFIG } from '../config/game.config';
import { hydrateSecret, hydrateSecrets } from '../game/deal';
import { hydrateResults } from '../game/vote';
import { EMPTY_PROGRESS, newRoundId } from '../game/types';
import type {
  Phase,
  PlayerPublic,
  PlayerSecret,
  RoomSettings,
  RoomState,
  RoundResults,
} from '../game/types';
import { db, signIn } from './firebase';
import type { ConnectionStatus, JoinRequest, RoomTransport } from './transport';
import { TransportError } from './transport';

const room = (code: string) => `rooms/${code.toUpperCase()}`;

function generateCode(): string {
  const { length, alphabet } = GAME_CONFIG.roomCode;
  const buffer = new Uint32Array(length);
  crypto.getRandomValues(buffer);
  let code = '';
  for (let i = 0; i < length; i++) code += alphabet[buffer[i]! % alphabet.length];
  return code;
}

export class FirebaseTransport implements RoomTransport {
  readonly kind = 'firebase' as const;

  async identify(): Promise<string> {
    return signIn();
  }

  async createRoom(hostId: string, settings: RoomSettings): Promise<string> {
    let code = generateCode();
    // تفادي التصادم مع جلسة قائمة
    for (let attempt = 0; attempt < 5; attempt++) {
      const snapshot = await get(ref(db(), `${room(code)}/meta`));
      if (!snapshot.exists()) break;
      code = generateCode();
    }

    /*
      كتابة `rooms/$code` كاملةً مرفوضة: لا توجد قاعدة `.write` عند جذر الغرفة،
      والقواعد لا تتوارث صعودًا. `meta` أولًا لأنها تُثبّت `hostUid`، وقاعدة
      `settings` تتحقّق منه. الفروع الفارغة لا تُكتب أصلًا — قيمها null في RTDB.
    */
    await set(ref(db(), `${room(code)}/meta`), {
      code,
      hostUid: hostId,
      phase: 'lobby',
      resumePhase: null,
      roundId: newRoundId(),
      phaseEndsAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: 'open',
    });
    await set(ref(db(), `${room(code)}/settings`), settings);
    return code;
  }

  async joinRoom({ code, playerId, name, avatarId }: JoinRequest): Promise<void> {
    // مساران منفصلان: قراءة `rooms/$code` كاملًا مرفوضة (لا `.read` عند الجذر)
    const [metaSnapshot, playersSnapshot] = await Promise.all([
      get(ref(db(), `${room(code)}/meta`)),
      get(ref(db(), `${room(code)}/players`)),
    ]);
    if (!metaSnapshot.exists()) {
      throw new TransportError('لا توجد جلسة بهذا الرمز.', 'room-not-found');
    }
    const value = { meta: metaSnapshot.val() as RoomState['meta'] };
    const players = (playersSnapshot.val() ?? {}) as Record<string, PlayerPublic>;
    const existing = players[playerId];
    const others = Object.values(players).filter((p) => p.id !== playerId);

    if (!existing) {
      if (value.meta.phase !== 'lobby') {
        throw new TransportError('بدأت الجولة — لا يمكن الانضمام الآن.', 'room-locked');
      }
      if (others.length >= GAME_CONFIG.players.max) {
        throw new TransportError(
          `الجلسة مكتملة (${GAME_CONFIG.players.max} لاعبين).`,
          'room-full',
        );
      }
    }

    const normalized = name.trim().replace(/\s+/g, ' ');
    if (others.some((p) => p.name === normalized)) {
      throw new TransportError('الاسم مستخدم — اختر اسمًا آخر.', 'name-taken');
    }
    if (others.some((p) => p.avatarId === avatarId)) {
      throw new TransportError('الشخصية محجوزة — اختر شخصية أخرى.', 'avatar-taken');
    }

    const playerRef = ref(db(), `${room(code)}/players/${playerId}`);
    await set(playerRef, {
      id: playerId,
      name: normalized,
      avatarId,
      seat: existing?.seat ?? others.length,
      ready: existing?.ready ?? false,
      connected: true,
      lastSeen: Date.now(),
      joinedAt: existing?.joinedAt ?? Date.now(),
      isHost: value.meta.hostUid === playerId,
    } satisfies PlayerPublic);

    if (!existing) {
      await set(ref(db(), `${room(code)}/round/progress/${playerId}`), EMPTY_PROGRESS);
    }

    /*
      الحضور لا يُسلَّح هنا: `watchPresence` يملكه ويُعيد تسليحه عند كل اتصال.
      تسليحه مرّة واحدة عند الانضمام كان العطل — الحارس يُستهلَك عند تنفيذه.
    */
  }

  async leaveRoom(code: string, playerId: string): Promise<void> {
    await update(ref(db(), `${room(code)}/players/${playerId}`), {
      connected: false,
      lastSeen: Date.now(),
    });
  }

  /*
    اشتراك على كل مسار عام وحده، لا على `rooms/$code` كاملًا.

    القراءة لا تتوارث صعودًا: لا توجد `.read` عند جذر الغرفة عمدًا، لأن منحها
    هناك يتسرّب إلى `secrets` و`votes` تحتها — وهو بالضبط ما تمنعه اللعبة.
    فالاشتراك الجامع كان يُرفض بـ Permission denied ويترك كل جهاز بلا حالة.
  */
  watchRoom(code: string, onChange: (state: RoomState | null) => void): () => void {
    const parts: {
      meta?: RoomState['meta'] | null;
      settings?: RoomSettings;
      players: Record<string, PlayerPublic>;
      progress: RoomState['progress'];
      results: RoundResults | null;
    } = { players: {}, progress: {}, results: null };

    /*
      لا تُبثّ حالة قبل أن يصل كل مسار مرة واحدة على الأقل. الاشتراك الجامع
      السابق كان يسلّم لقطة واحدة كاملة؛ التفريق يجعلها تصل قطعًا، وبثّ أول
      قطعة يعطي حالةً بلا `settings` — فتقرأ الشاشة `settings.diceMode`
      وتجدها undefined.
    */
    const paths = ['meta', 'settings', 'players', 'progress', 'results'] as const;
    const seen = new Set<(typeof paths)[number]>();
    const emit = (path: (typeof paths)[number]) => {
      seen.add(path);
      // غرفة غير موجودة: تُعلن فورًا ولا تنتظر بقية المسارات
      if (seen.has('meta') && !parts.meta) return onChange(null);
      if (seen.size < paths.length) return;
      if (!parts.meta) return onChange(null);
      onChange({
        meta: parts.meta,
        settings: parts.settings ?? ({} as RoomSettings),
        players: parts.players,
        progress: parts.progress,
        results: parts.results,
        // اللاعب لا يستطيع قراءة الأصوات، فيُشتق العدد من أعلام التقدم.
        votesSubmitted: Object.values(parts.progress).filter((p) => p.voted).length,
      });
    };

    /*
      كل اشتراك بمعالج خطأ. بلا معالج، رفضٌ من القواعد أو تعثّر شبكة يُنهي هذا
      المسار بصمت فلا يصل `emit` أبدًا — و`seen` لا تكتمل، فتبقى الشاشة على
      «جارٍ الاتصال بالجلسة» بلا نهاية. المسار الفاشل يُحسب مرئيًّا بقيمته
      الفارغة، فتُبثّ الحالة بما وصل بدل ألّا تُبثّ إطلاقًا.
    */
    const unsubs = [
      onValue(
        ref(db(), `${room(code)}/meta`),
        (s) => {
          parts.meta = s.exists() ? (s.val() as RoomState['meta']) : null;
          emit('meta');
        },
        () => {
          parts.meta = null;
          emit('meta');
        },
      ),
      onValue(
        ref(db(), `${room(code)}/settings`),
        (s) => {
          if (s.exists()) parts.settings = s.val() as RoomSettings;
          emit('settings');
        },
        () => emit('settings'),
      ),
      onValue(
        ref(db(), `${room(code)}/players`),
        (s) => {
          parts.players = s.exists() ? (s.val() as Record<string, PlayerPublic>) : {};
          emit('players');
        },
        () => emit('players'),
      ),
      onValue(
        ref(db(), `${room(code)}/round/progress`),
        (s) => {
          parts.progress = s.exists() ? (s.val() as RoomState['progress']) : {};
          emit('progress');
        },
        () => emit('progress'),
      ),
      onValue(
        ref(db(), `${room(code)}/round/results`),
        (s) => {
          parts.results = s.exists() ? hydrateResults(s.val()) : null;
          emit('results');
        },
        () => emit('results'),
      ),
    ];

    return () => unsubs.forEach((un) => un());
  }

  watchConnection(onChange: (status: ConnectionStatus) => void): () => void {
    return onValue(ref(db(), '.info/connected'), (snapshot) => {
      onChange(snapshot.val() === true ? 'online' : 'offline');
    });
  }

  /**
   * حضور يصمد عبر الانقطاعات.
   *
   * `onDisconnect` **يُستهلَك عند تنفيذه**: ينفّذه الخادم مرّة عند سقوط الاتصال
   * ثم يزول. فتسليحه مرّة واحدة عند الانضمام يعني أن أول خروج من التطبيق يترك
   * اللاعب «منقطعًا» إلى الأبد — لا حارس يُعاد، ولا أحد يُعيد الحالة إلى
   * «متصل» حين يرجع. وهذا ما كان يحدث.
   *
   * الحلّ هو النمط الذي توصي به Firebase: مراقبة `.info/connected`، وعند كل
   * اتصال يُعاد التسليح ثم يُعلَن الحضور.
   *
   * **الترتيب ليس تفصيلًا:** التسليح قبل الإعلان. لو أُعلن الحضور أولًا ثم
   * سقط الاتصال قبل أن يصل التسليح، لبقي اللاعب «متصلًا» شبحًا لا يُصحّحه شيء.
   */
  watchPresence(code: string, playerId: string): () => void {
    const connectedRef = ref(db(), `${room(code)}/players/${playerId}/connected`);
    const seenRef = ref(db(), `${room(code)}/players/${playerId}/lastSeen`);

    const stop = onValue(ref(db(), '.info/connected'), (snapshot) => {
      if (snapshot.val() !== true) return;
      void (async () => {
        try {
          await onDisconnect(connectedRef).set(false);
          await onDisconnect(seenRef).set(serverTimestamp());
          await set(connectedRef, true);
          await set(seenRef, serverTimestamp());
        } catch {
          /* المحاولة التالية تأتي مع حدث الاتصال التالي — لا داعي للضجيج */
        }
      })();
    });

    /*
      متصفحات الجوال تجمّد الصفحة في الخلفية بدل إغلاق المقبس، فقد يعود
      المستخدم قبل أن يلاحظ العميل أن الاتصال سقط أصلًا. الإيقاظ عند الظهور
      يجبر الحلقة أعلاه على العمل فورًا بدل انتظار مهلة المقبس.
    */
    const wake = () => {
      if (document.visibilityState !== 'visible') return;
      goOffline(db());
      goOnline(db());
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pageshow', wake);
    };
  }

  watchSecret(
    code: string,
    playerId: string,
    onChange: (secret: PlayerSecret | null) => void,
  ): () => void {
    return onValue(
      ref(db(), `${room(code)}/round/secrets/${playerId}`),
      // ‏Firebase يحذف الـ‏null والمصفوفة الفارغة — راجع hydrateSecret
      (snapshot) => onChange(snapshot.exists() ? hydrateSecret(snapshot.val(), playerId) : null),
      () => onChange(null),
    );
  }

  async setPhase(code: string, phase: Phase): Promise<void> {
    const currentSnapshot = await get(ref(db(), `${room(code)}/meta/phase`));
    await update(ref(db(), `${room(code)}/meta`), {
      phase,
      resumePhase: phase === 'paused' ? (currentSnapshot.val() as Phase) : null,
      updatedAt: serverTimestamp(),
    });
  }

  async setPhaseDeadline(code: string, endsAt: number | null): Promise<void> {
    await update(ref(db(), `${room(code)}/meta`), { phaseEndsAt: endsAt });
  }

  async updateSettings(code: string, patch: Partial<RoomSettings>): Promise<void> {
    await update(ref(db(), `${room(code)}/settings`), patch);
  }

  async updatePlayer(
    code: string,
    playerId: string,
    patch: Partial<PlayerPublic>,
  ): Promise<void> {
    await update(ref(db(), `${room(code)}/players/${playerId}`), {
      ...patch,
      lastSeen: Date.now(),
    });
  }

  async setSeats(code: string, seats: Record<string, number>): Promise<void> {
    const updates: Record<string, number> = {};
    for (const [playerId, seat] of Object.entries(seats)) {
      updates[`${playerId}/seat`] = seat;
    }
    await update(ref(db(), `${room(code)}/players`), updates);
  }

  async writeSecrets(code: string, secrets: Record<string, PlayerSecret>): Promise<void> {
    await set(ref(db(), `${room(code)}/round/secrets`), secrets);
  }

  async writeSecret(code: string, playerId: string, secret: PlayerSecret): Promise<void> {
    await set(ref(db(), `${room(code)}/round/secrets/${playerId}`), secret);
  }

  async readSecrets(code: string): Promise<Record<string, PlayerSecret>> {
    const snapshot = await get(ref(db(), `${room(code)}/round/secrets`));
    return snapshot.exists() ? hydrateSecrets(snapshot.val()) : {};
  }

  watchAllSecrets(
    code: string,
    onChange: (secrets: Record<string, PlayerSecret>) => void,
  ): () => void {
    return onValue(
      ref(db(), `${room(code)}/round/secrets`),
      (snapshot) => onChange(snapshot.exists() ? hydrateSecrets(snapshot.val()) : {}),
      () => onChange({}),
    );
  }

  async ack(
    code: string,
    playerId: string,
    ackKey: 'roleAck' | 'diceAck' | 'secretAck',
  ): Promise<void> {
    await update(ref(db(), `${room(code)}/round/progress/${playerId}`), { [ackKey]: true });
  }

  async submitVote(code: string, playerId: string, targetId: string): Promise<void> {
    // القواعد ترفض الكتابة الثانية، فلا حاجة لقراءة مسبقة.
    await set(ref(db(), `${room(code)}/round/votes/${playerId}`), targetId);
    await update(ref(db(), `${room(code)}/round/progress/${playerId}`), { voted: true });
  }

  async readVotes(code: string): Promise<Record<string, string>> {
    const snapshot = await get(ref(db(), `${room(code)}/round/votes`));
    return snapshot.exists() ? (snapshot.val() as Record<string, string>) : {};
  }

  async writeResults(code: string, results: RoundResults): Promise<void> {
    await set(ref(db(), `${room(code)}/round/results`), results);
  }

  async setSecretStage(code: string, stage: 'choosing' | 'resolved' | null): Promise<void> {
    await update(ref(db(), `${room(code)}/meta`), { secretStage: stage });
  }

  async resetRound(code: string): Promise<void> {
    const playersSnapshot = await get(ref(db(), `${room(code)}/players`));
    const players = (playersSnapshot.val() ?? {}) as Record<string, PlayerPublic>;

    /*
      لا قاعدة `.write` على `round` نفسه — يُمسح كل فرع على حدة. المضيف مسموح
      له بمسح الأصوات دون كتابتها: قاعدة `votes` تشترط `!newData.exists()`،
      فيستطيع تصفيرها لجولة جديدة ولا يستطيع تزوير صوت.
    */
    await Promise.all([
      remove(ref(db(), `${room(code)}/round/secrets`)),
      remove(ref(db(), `${room(code)}/round/votes`)),
      remove(ref(db(), `${room(code)}/round/results`)),
      remove(ref(db(), `${room(code)}/round/progress`)),
    ]);
    const progress: Record<string, typeof EMPTY_PROGRESS> = {};
    const readyUpdates: Record<string, boolean> = {};
    for (const playerId of Object.keys(players)) {
      progress[playerId] = { ...EMPTY_PROGRESS };
      readyUpdates[`${playerId}/ready`] = false;
    }
    await set(ref(db(), `${room(code)}/round/progress`), progress);
    await update(ref(db(), `${room(code)}/players`), readyUpdates);
    await update(ref(db(), `${room(code)}/meta`), {
      roundId: newRoundId(),
      phase: 'lobby',
      resumePhase: null,
      updatedAt: serverTimestamp(),
    });
  }
}
