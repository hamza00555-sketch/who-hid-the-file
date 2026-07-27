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
  onDisconnect,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import { GAME_CONFIG } from '../config/game.config';
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

    await set(ref(db(), room(code)), {
      meta: {
        code,
        hostUid: hostId,
        phase: 'lobby',
        resumePhase: null,
        roundId: newRoundId(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: 'open',
      },
      settings,
      players: {},
      round: { progress: {}, secrets: {}, votes: {}, results: null },
    });
    return code;
  }

  async joinRoom({ code, playerId, name, avatarId }: JoinRequest): Promise<void> {
    const snapshot = await get(ref(db(), room(code)));
    if (!snapshot.exists()) {
      throw new TransportError('لا توجد جلسة بهذا الرمز.', 'room-not-found');
    }
    const value = snapshot.val() as {
      meta: RoomState['meta'];
      players?: Record<string, PlayerPublic>;
    };
    const players = value.players ?? {};
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

    // الحضور: عند انقطاع الجهاز تُقلب الحالة تلقائيًا على الخادم.
    await onDisconnect(ref(db(), `${room(code)}/players/${playerId}/connected`)).set(false);
    await onDisconnect(ref(db(), `${room(code)}/players/${playerId}/lastSeen`)).set(
      serverTimestamp(),
    );
  }

  async leaveRoom(code: string, playerId: string): Promise<void> {
    await update(ref(db(), `${room(code)}/players/${playerId}`), {
      connected: false,
      lastSeen: Date.now(),
    });
  }

  watchRoom(code: string, onChange: (state: RoomState | null) => void): () => void {
    return onValue(ref(db(), room(code)), (snapshot) => {
      if (!snapshot.exists()) return onChange(null);
      const value = snapshot.val() as {
        meta: RoomState['meta'];
        settings: RoomSettings;
        players?: Record<string, PlayerPublic>;
        round?: {
          progress?: RoomState['progress'];
          votes?: Record<string, string>;
          results?: RoundResults | null;
        };
      };
      onChange({
        meta: value.meta,
        settings: value.settings,
        players: value.players ?? {},
        progress: value.round?.progress ?? {},
        results: value.round?.results ?? null,
        // اللاعب لا يستطيع قراءة الأصوات، فيُشتق العدد من أعلام التقدم.
        votesSubmitted: Object.values(value.round?.progress ?? {}).filter((p) => p.voted).length,
      });
    });
  }

  watchConnection(onChange: (status: ConnectionStatus) => void): () => void {
    return onValue(ref(db(), '.info/connected'), (snapshot) => {
      onChange(snapshot.val() === true ? 'online' : 'offline');
    });
  }

  watchSecret(
    code: string,
    playerId: string,
    onChange: (secret: PlayerSecret | null) => void,
  ): () => void {
    return onValue(
      ref(db(), `${room(code)}/round/secrets/${playerId}`),
      (snapshot) => onChange(snapshot.exists() ? (snapshot.val() as PlayerSecret) : null),
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
    return snapshot.exists() ? (snapshot.val() as Record<string, PlayerSecret>) : {};
  }

  watchAllSecrets(
    code: string,
    onChange: (secrets: Record<string, PlayerSecret>) => void,
  ): () => void {
    return onValue(
      ref(db(), `${room(code)}/round/secrets`),
      (snapshot) => onChange(snapshot.exists() ? snapshot.val() : {}),
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

    await remove(ref(db(), `${room(code)}/round`));
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
