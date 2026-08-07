/**
 * واجهة النقل — الشاشات لا تعرف Firebase.
 *
 * تنفيذان: `FirebaseTransport` للإنتاج و `LocalTransport` للتطوير والاختبار
 * على عدة تبويبات بلا أي إعداد خارجي.
 */

import type {
  Phase,
  PlayerPublic,
  PlayerSecret,
  RoomSettings,
  RoomState,
  RoundResults,
} from '../game/types';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface JoinRequest {
  code: string;
  playerId: string;
  name: string;
  avatarId: string;
}

export class TransportError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'room-not-found'
      | 'room-full'
      | 'name-taken'
      | 'room-locked'
      | 'avatar-taken'
      | 'not-host'
      | 'unknown',
  ) {
    super(message);
  }
}

export interface RoomTransport {
  readonly kind: 'firebase' | 'local';

  /** هوية هذا الجهاز — ثابتة عبر إعادة التحميل. */
  identify(): Promise<string>;

  createRoom(hostId: string, settings: RoomSettings): Promise<string>;
  joinRoom(request: JoinRequest): Promise<void>;
  leaveRoom(code: string, playerId: string): Promise<void>;

  watchRoom(code: string, onChange: (state: RoomState | null) => void): () => void;
  watchConnection(onChange: (status: ConnectionStatus) => void): () => void;

  /**
   * يُبقي حضور اللاعب حيًّا ما دام في الغرفة.
   *
   * يعمل ما دام الاشتراك قائمًا، لا مرّة واحدة عند الانضمام: حارس الانقطاع
   * على الخادم **يُستهلَك عند تنفيذه**، فبعد أول انقطاع لا يبقى حارس ولا أحد
   * يُعيد الحالة إلى «متصل» — ويظلّ اللاعب منقطعًا إلى الأبد وإن عاد.
   */
  watchPresence(code: string, playerId: string): () => void;

  /** 🔒 مسار سري: يُسمح بقراءته لصاحبه فقط. */
  watchSecret(
    code: string,
    playerId: string,
    onChange: (secret: PlayerSecret | null) => void,
  ): () => void;

  setPhase(code: string, phase: Phase): Promise<void>;
  /** لحظة انتهاء عدّ المرحلة، أو `null` لمسحه. */
  setPhaseDeadline(code: string, endsAt: number | null): Promise<void>;
  updateSettings(code: string, patch: Partial<RoomSettings>): Promise<void>;
  updatePlayer(code: string, playerId: string, patch: Partial<PlayerPublic>): Promise<void>;
  setSeats(code: string, seats: Record<string, number>): Promise<void>;

  /** يكتب كل المسارات السرية دفعة واحدة عند توزيع الأدوار. */
  writeSecrets(code: string, secrets: Record<string, PlayerSecret>): Promise<void>;
  writeSecret(code: string, playerId: string, secret: PlayerSecret): Promise<void>;
  /** يقرأ كل الأسرار — للمضيف عند حساب الانفراد والنتائج فقط. */
  readSecrets(code: string): Promise<Record<string, PlayerSecret>>;
  /** يراقب كل الأسرار — للمضيف فقط، ليطبّق اختيار المُخفي فور وصوله. */
  watchAllSecrets(
    code: string,
    onChange: (secrets: Record<string, PlayerSecret>) => void,
  ): () => void;

  ack(code: string, playerId: string, key: 'roleAck' | 'diceAck' | 'secretAck'): Promise<void>;
  submitVote(code: string, playerId: string, targetId: string): Promise<void>;
  readVotes(code: string): Promise<Record<string, string>>;
  writeResults(code: string, results: RoundResults): Promise<void>;

  /**
   * يضبط مرحلة الإجراءات السرية — المضيف فقط.
   * يمنع لاعبًا سيصبح متعاونًا من رؤية «لا توجد معلومة» ثم تغيّرها أمامه.
   */
  setSecretStage(code: string, stage: 'choosing' | 'resolved' | null): Promise<void>;

  /** جولة جديدة بنفس اللاعبين. */
  resetRound(code: string): Promise<void>;

  /**
   * إنهاء الجلسة كلّها — المضيف فقط.
   *
   * يُعلَن الإغلاق في `meta.status` لا بالمغادرة الصامتة: أجهزة اللاعبين
   * تتبع الحالة، فتقول لهم إن الجلسة انتهت بدل أن تنتظر مرحلةً لن تأتي.
   */
  closeRoom(code: string): Promise<void>;
}
