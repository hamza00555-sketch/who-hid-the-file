/** الأنواع الأساسية للعبة — مشتركة بين المنطق والشاشات وطبقة النقل. */

/**
 * `spotlight` محجوز لدور مستقبلي يسعى لجمع أكبر عدد من الأصوات.
 * غير مفعّل في النسخة الأولى ولا يوزَّع إطلاقًا.
 */
export type RoleId = 'hider' | 'member' | 'accomplice' | 'spotlight';

export type WakeSlot = 1 | 2 | 3 | 4 | 5 | 6;

export const ALL_SLOTS: readonly WakeSlot[] = [1, 2, 3, 4, 5, 6];

export type DiceMode = 'digital' | 'physical';

export type Phase =
  | 'home'
  | 'create-room'
  | 'join-room'
  | 'lobby'
  | 'seating-order'
  | 'settings'
  | 'role-distribution'
  | 'dice-mode'
  | 'dice-roll'
  | 'ready-check'
  | 'night-intro'
  | 'night-phase-1'
  | 'night-phase-2'
  | 'night-phase-3'
  | 'night-phase-4'
  | 'night-phase-5'
  | 'night-phase-6'
  | 'secret-actions'
  | 'discussion'
  | 'voting'
  | 'reveal'
  | 'results'
  | 'paused';

export const NIGHT_PHASES = [
  'night-phase-1',
  'night-phase-2',
  'night-phase-3',
  'night-phase-4',
  'night-phase-5',
  'night-phase-6',
] as const satisfies readonly Phase[];

export function nightPhaseFor(slot: WakeSlot): Phase {
  return NIGHT_PHASES[slot - 1]!;
}

export function slotOfNightPhase(phase: Phase): WakeSlot | null {
  const index = (NIGHT_PHASES as readonly string[]).indexOf(phase);
  return index === -1 ? null : ((index + 1) as WakeSlot);
}

/** بيانات عامة يراها كل الأجهزة. */
export interface PlayerPublic {
  id: string;
  name: string;
  avatarId: string;
  /** 0..n-1 باتجاه عقارب الساعة حول الطاولة */
  seat: number;
  ready: boolean;
  connected: boolean;
  lastSeen: number;
  joinedAt: number;
  isHost: boolean;
}

/** أعلام تقدّم — بلا أي محتوى سري، يقرؤها المضيف ليعرف متى ينتقل. */
export interface PlayerProgress {
  roleAck: boolean;
  diceAck: boolean;
  secretAck: boolean;
  voted: boolean;
}

export interface Inspection {
  targetId: string;
  side: 'right' | 'left';
  /** الموعد المكشوف — يُكتب عند تنفيذ الفحص */
  revealedSlot: WakeSlot | null;
}

/** 🔒 مسار سري لكل لاعب — لا يقرؤه أحد غيره. */
export interface PlayerSecret {
  playerId: string;
  role: RoleId;
  /** نتيجة أو نتيجتا النرد كما وُلِّدت أو أُدخلت */
  dice: WakeSlot[];
  /** وضع الأربعة فقط: الموعد الذي اختاره عضو الفريق من نتيجتيه */
  chosenSlot: WakeSlot | null;
  /** المواعيد التي يستيقظ فيها فعليًا، بعد إزالة التكرار */
  effectiveSlots: WakeSlot[];
  /** المواعيد التي كان فيها وحده */
  soloSlots: WakeSlot[];
  /** فحص الجار — واحد فقط لكل جولة */
  inspection: Inspection | null;
  /** من يعرفهم هذا اللاعب من فريق المُخفي */
  knownAllies: string[];
  /** كم متعاونًا يجب أن يختار (للمُخفي فقط) */
  accompliceQuota: number;
  /** المرشحون المسموح اختيارهم (5 لاعبين: الشهود فقط) */
  accompliceCandidates: string[];
  /**
   * اختيار المُخفي المُرسل من جهازه.
   * المضيف هو من يطبّقه لأن التطبيق يعدّل أسرار لاعبين آخرين.
   */
  accompliceChoice: string[] | null;
  /** صار متعاونًا بعد أن بدأ عضو فريق */
  becameAccomplice: boolean;
}

/** صوت الراوي — يختاره المضيف، ويحدّد مجلّد الجمل المسجّلة. */
export type NarratorVoice = 'male' | 'female';

export interface RoomSettings {
  gameName: string;
  diceMode: DiceMode;
  slotNaming: 'nights' | 'hours';
  nightCountdownSeconds: number;
  discussionSeconds: number;
  voiceEnabled: boolean;
  /**
   * هل يلعب صاحب الجهاز الرئيسي أيضًا؟
   *
   * مطفأ افتراضيًا. عند تشغيله ينضم المضيف لاعبًا كامل الحقوق: اسم وشخصية
   * ومقعد وسرّ، ويُحسب ضمن العدد الأدنى والأقصى.
   */
  hostPlays: boolean;
  narratorVoice: NarratorVoice;
  ttsRate: number;
}

export interface RoomMeta {
  code: string;
  hostUid: string;
  phase: Phase;
  /** المرحلة التي يُستأنف إليها بعد `paused` */
  resumePhase: Phase | null;
  roundId: string;
  /**
   * لحظة انتهاء العدّ التنازلي للمرحلة الحالية (ms منذ الحقبة)، أو `null`.
   *
   * موجود في `meta` لا في حالة المضيف المحلية لأن أجهزة اللاعبين تحتاجه:
   * من يستيقظ في موعده يجب أن يرى كم بقي له قبل «أغلقوا أعينكم». مزامنة
   * *اللحظة* لا *الثواني المتبقية* تجعل كل جهاز يحسب بساعته — فلا رسالة كل
   * ثانية، ولا انحراف يتراكم مع تأخّر الشبكة.
   */
  phaseEndsAt: number | null;
  createdAt: number;
  updatedAt: number;
  status: 'open' | 'closed';
  /**
   * داخل `secret-actions`: هل حُسم اختيار المتعاونين؟
   * يمنع لاعبًا سيصبح متعاونًا من رؤية «لا توجد معلومة» ثم تغيّرها أمامه.
   */
  secretStage?: 'choosing' | 'resolved' | null;
}

export interface VoteTally {
  counts: Record<string, number>;
  topVoted: string[];
  totalVotes: number;
}

export interface RoundResults {
  tally: VoteTally;
  winner: 'team' | 'hiders';
  hiderId: string;
  accompliceIds: string[];
  /** كشف كامل يُعرض في شاشة النتائج فقط */
  reveal: Array<{
    playerId: string;
    role: RoleId;
    effectiveSlots: WakeSlot[];
    soloSlots: WakeSlot[];
    wokeWith: string[];
    inspected: { targetId: string; revealedSlot: WakeSlot | null } | null;
    votedFor: string | null;
  }>;
}

export interface RoomState {
  meta: RoomMeta;
  settings: RoomSettings;
  players: Record<string, PlayerPublic>;
  progress: Record<string, PlayerProgress>;
  /** يظهر بعد الكشف فقط */
  results: RoundResults | null;
  /** عدد الأصوات المسجّلة — بلا كشف من صوّت لمن */
  votesSubmitted: number;
}

/**
 * معرّف جولة فريد.
 *
 * لا يكفي `Date.now()` وحده: جولة جديدة تبدأ في نفس المللي ثانية تُنتج نفس
 * المعرّف، والمضيف يستخدم `roundId` مفتاحًا لحارس «مرة واحدة لكل جولة» —
 * فتكراره يمنع الجولة الجديدة من التقدّم.
 */
export function newRoundId(): string {
  return `r${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const EMPTY_PROGRESS: PlayerProgress = {
  roleAck: false,
  diceAck: false,
  secretAck: false,
  voted: false,
};
