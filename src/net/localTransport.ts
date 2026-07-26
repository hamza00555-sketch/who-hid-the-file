/**
 * نقل محلي للتطوير والاختبار: `localStorage` + `BroadcastChannel`.
 *
 * يسمح بتشغيل جلسة كاملة على عدة تبويبات في متصفح واحد بلا أي إعداد خارجي،
 * وهو الوضع الافتراضي عندما لا توجد متغيرات `VITE_FIREBASE_*`.
 *
 * ⚠️ هذا ليس حدًّا أمنيًا: كل التبويبات تشترك في نفس التخزين وتستطيع نظريًا
 * قراءة كل شيء. عزل الأسرار الحقيقي مسؤولية قواعد Firebase.
 * الهوية مربوطة بـ `sessionStorage` ليكون كل تبويب لاعبًا مستقلًا.
 */

import { GAME_CONFIG } from '../config/game.config';
import { EMPTY_PROGRESS } from '../game/types';
import type {
  Phase,
  PlayerPublic,
  PlayerSecret,
  RoomSettings,
  RoomState,
  RoundResults,
} from '../game/types';
import type { ConnectionStatus, JoinRequest, RoomTransport } from './transport';
import { TransportError } from './transport';

const CHANNEL = 'mafqood-room';
const KEY_PREFIX = 'mafqood:room:';
const IDENTITY_KEY = 'mafqood:device';

interface LocalDoc {
  meta: RoomState['meta'];
  settings: RoomSettings;
  players: Record<string, PlayerPublic>;
  progress: RoomState['progress'];
  secrets: Record<string, PlayerSecret>;
  votes: Record<string, string>;
  results: RoundResults | null;
}

function key(code: string) {
  return `${KEY_PREFIX}${code.toUpperCase()}`;
}

function readDoc(code: string): LocalDoc | null {
  const raw = localStorage.getItem(key(code));
  return raw ? (JSON.parse(raw) as LocalDoc) : null;
}

function writeDoc(code: string, doc: LocalDoc, channel: BroadcastChannel) {
  doc.meta.updatedAt = Date.now();
  localStorage.setItem(key(code), JSON.stringify(doc));
  channel.postMessage({ code: code.toUpperCase() });
}

function toState(doc: LocalDoc): RoomState {
  return {
    meta: doc.meta,
    settings: doc.settings,
    players: doc.players,
    progress: doc.progress,
    results: doc.results,
    votesSubmitted: Object.keys(doc.votes).length,
  };
}

function generateCode(): string {
  const { length, alphabet } = GAME_CONFIG.roomCode;
  let code = '';
  const buffer = new Uint32Array(length);
  crypto.getRandomValues(buffer);
  for (let i = 0; i < length; i++) code += alphabet[buffer[i]! % alphabet.length];
  return code;
}

export class LocalTransport implements RoomTransport {
  readonly kind = 'local' as const;
  private channel = new BroadcastChannel(CHANNEL);
  private listeners = new Map<string, Set<() => void>>();

  constructor() {
    this.channel.onmessage = (event: MessageEvent<{ code: string }>) => {
      this.listeners.get(event.data.code)?.forEach((fn) => fn());
    };
    // تغييرات من تبويب آخر عبر localStorage مباشرة
    window.addEventListener('storage', (event) => {
      if (event.key?.startsWith(KEY_PREFIX)) {
        const code = event.key.slice(KEY_PREFIX.length);
        this.listeners.get(code)?.forEach((fn) => fn());
      }
    });
  }

  private subscribe(code: string, fn: () => void): () => void {
    const upper = code.toUpperCase();
    if (!this.listeners.has(upper)) this.listeners.set(upper, new Set());
    this.listeners.get(upper)!.add(fn);
    fn();
    return () => this.listeners.get(upper)?.delete(fn);
  }

  /**
   * يبلّغ مستمعي هذه الصفحة — لا BroadcastChannel ولا حدث storage يصل إلى مُصدِر التغيير.
   *
   * التبليغ مؤجَّل إلى microtask عمدًا: مستمع يكتب ردًّا على تغيير (مثل المضيف
   * وهو يحلّ الإجراءات السرية) سيُنتج استدعاءً متداخلًا يفجّر المكدّس لو كان التبليغ متزامنًا.
   */
  private notifyLocal(code: string) {
    const upper = code.toUpperCase();
    queueMicrotask(() => this.listeners.get(upper)?.forEach((fn) => fn()));
  }

  private mutate(code: string, fn: (doc: LocalDoc) => void): LocalDoc {
    const doc = readDoc(code);
    if (!doc) throw new TransportError('الجلسة غير موجودة.', 'room-not-found');
    fn(doc);
    writeDoc(code, doc, this.channel);
    this.notifyLocal(code);
    return doc;
  }

  async identify(): Promise<string> {
    let id = sessionStorage.getItem(IDENTITY_KEY);
    if (!id) {
      id = `dev-${crypto.randomUUID().slice(0, 8)}`;
      sessionStorage.setItem(IDENTITY_KEY, id);
    }
    return id;
  }

  async createRoom(hostId: string, settings: RoomSettings): Promise<string> {
    let code = generateCode();
    while (readDoc(code)) code = generateCode();
    const now = Date.now();
    const doc: LocalDoc = {
      meta: {
        code,
        hostUid: hostId,
        phase: 'lobby',
        resumePhase: null,
        roundId: `r${now}`,
        createdAt: now,
        updatedAt: now,
        status: 'open',
      },
      settings,
      players: {},
      progress: {},
      secrets: {},
      votes: {},
      results: null,
    };
    writeDoc(code, doc, this.channel);
    this.notifyLocal(code);
    return code;
  }

  async joinRoom({ code, playerId, name, avatarId }: JoinRequest): Promise<void> {
    const doc = readDoc(code);
    if (!doc) throw new TransportError('لا توجد جلسة بهذا الرمز.', 'room-not-found');

    const existing = doc.players[playerId];
    const others = Object.values(doc.players).filter((p) => p.id !== playerId);

    if (!existing) {
      if (doc.meta.phase !== 'lobby') {
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

    this.mutate(code, (d) => {
      d.players[playerId] = {
        id: playerId,
        name: normalized,
        avatarId,
        seat: existing?.seat ?? others.length,
        ready: existing?.ready ?? false,
        connected: true,
        lastSeen: Date.now(),
        joinedAt: existing?.joinedAt ?? Date.now(),
        isHost: d.meta.hostUid === playerId,
      };
      d.progress[playerId] ??= { ...EMPTY_PROGRESS };
    });
  }

  async leaveRoom(code: string, playerId: string): Promise<void> {
    this.mutate(code, (doc) => {
      const player = doc.players[playerId];
      if (player) player.connected = false;
    });
  }

  watchRoom(code: string, onChange: (state: RoomState | null) => void): () => void {
    return this.subscribe(code, () => {
      const doc = readDoc(code);
      onChange(doc ? toState(doc) : null);
    });
  }

  watchConnection(onChange: (status: ConnectionStatus) => void): () => void {
    const emit = () => onChange(navigator.onLine ? 'online' : 'offline');
    window.addEventListener('online', emit);
    window.addEventListener('offline', emit);
    emit();
    return () => {
      window.removeEventListener('online', emit);
      window.removeEventListener('offline', emit);
    };
  }

  watchSecret(
    code: string,
    playerId: string,
    onChange: (secret: PlayerSecret | null) => void,
  ): () => void {
    return this.subscribe(code, () => {
      onChange(readDoc(code)?.secrets[playerId] ?? null);
    });
  }

  async setPhase(code: string, phase: Phase): Promise<void> {
    this.mutate(code, (doc) => {
      if (phase === 'paused') doc.meta.resumePhase = doc.meta.phase;
      else doc.meta.resumePhase = null;
      doc.meta.phase = phase;
    });
  }

  async updateSettings(code: string, patch: Partial<RoomSettings>): Promise<void> {
    this.mutate(code, (doc) => {
      doc.settings = { ...doc.settings, ...patch };
    });
  }

  async updatePlayer(
    code: string,
    playerId: string,
    patch: Partial<PlayerPublic>,
  ): Promise<void> {
    this.mutate(code, (doc) => {
      const player = doc.players[playerId];
      if (player) doc.players[playerId] = { ...player, ...patch, lastSeen: Date.now() };
    });
  }

  async setSeats(code: string, seats: Record<string, number>): Promise<void> {
    this.mutate(code, (doc) => {
      for (const [playerId, seat] of Object.entries(seats)) {
        const player = doc.players[playerId];
        if (player) player.seat = seat;
      }
    });
  }

  async writeSecrets(code: string, secrets: Record<string, PlayerSecret>): Promise<void> {
    this.mutate(code, (doc) => {
      doc.secrets = secrets;
    });
  }

  async writeSecret(code: string, playerId: string, secret: PlayerSecret): Promise<void> {
    this.mutate(code, (doc) => {
      doc.secrets[playerId] = secret;
    });
  }

  async readSecrets(code: string): Promise<Record<string, PlayerSecret>> {
    return readDoc(code)?.secrets ?? {};
  }

  watchAllSecrets(
    code: string,
    onChange: (secrets: Record<string, PlayerSecret>) => void,
  ): () => void {
    return this.subscribe(code, () => onChange(readDoc(code)?.secrets ?? {}));
  }

  async ack(
    code: string,
    playerId: string,
    ackKey: 'roleAck' | 'diceAck' | 'secretAck',
  ): Promise<void> {
    this.mutate(code, (doc) => {
      doc.progress[playerId] = { ...(doc.progress[playerId] ?? EMPTY_PROGRESS), [ackKey]: true };
    });
  }

  async submitVote(code: string, playerId: string, targetId: string): Promise<void> {
    this.mutate(code, (doc) => {
      if (doc.votes[playerId]) return; // كتابة مرة واحدة
      doc.votes[playerId] = targetId;
      doc.progress[playerId] = { ...(doc.progress[playerId] ?? EMPTY_PROGRESS), voted: true };
    });
  }

  async readVotes(code: string): Promise<Record<string, string>> {
    return readDoc(code)?.votes ?? {};
  }

  async writeResults(code: string, results: RoundResults): Promise<void> {
    this.mutate(code, (doc) => {
      doc.results = results;
    });
  }

  async setSecretStage(code: string, stage: 'choosing' | 'resolved' | null): Promise<void> {
    this.mutate(code, (doc) => {
      doc.meta.secretStage = stage;
    });
  }

  async resetRound(code: string): Promise<void> {
    this.mutate(code, (doc) => {
      doc.meta.roundId = `r${Date.now()}`;
      doc.meta.phase = 'lobby';
      doc.meta.resumePhase = null;
      doc.secrets = {};
      doc.votes = {};
      doc.results = null;
      for (const playerId of Object.keys(doc.players)) {
        doc.progress[playerId] = { ...EMPTY_PROGRESS };
        doc.players[playerId]!.ready = false;
      }
    });
  }
}
