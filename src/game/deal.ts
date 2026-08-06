/**
 * توزيع الأدوار والنرد.
 *
 * دالة نقية بالكامل: تأخذ اللاعبين ومولّدًا عشوائيًا وتعيد المسارات السرية.
 * لا تلمس الشبكة ولا التخزين — لتنتقل لاحقًا إلى Cloud Function دون تعديل.
 */

import { rulesFor } from './rules';
import type { Rng } from './rng';
import { pickOne, randomInt } from './rng';
import type { PlayerSecret, WakeSlot } from './types';

export interface DealInput {
  playerIds: string[];
  rng: Rng;
  /** لفرض مُخفٍ محدد في الاختبارات فقط */
  forceHiderId?: string;
  /** لفرض نتائج نرد محددة في الاختبارات أو في النمط الهجين */
  forceDice?: Record<string, WakeSlot[]>;
}

export type SecretMap = Record<string, PlayerSecret>;

export function emptySecret(playerId: string): PlayerSecret {
  return {
    playerId,
    role: 'member',
    dice: [],
    chosenSlot: null,
    effectiveSlots: [],
    soloSlots: [],
    inspection: null,
    knownAllies: [],
    accompliceQuota: 0,
    accompliceCandidates: [],
    accompliceChoice: null,
    becameAccomplice: false,
  };
}

/**
 * يُعيد بناء سرٍّ قادم من الشبكة إلى شكله الكامل.
 *
 * ── لماذا يلزم هذا أصلًا ──
 *
 * قاعدة Firebase Realtime **تحذف كل حقل قيمته `null`، وتحذف المصفوفة الفارغة
 * كاملةً**. فالسرّ الذي يُكتب هكذا:
 *
 *   { dice: [3,5], effectiveSlots: [], soloSlots: [], inspection: null, … }
 *
 * يعود من الشبكة هكذا:
 *
 *   { dice: [3,5] }
 *
 * وكل ما يليه ينهار: `secret.effectiveSlots.includes(slot)` ترمي TypeError
 * فتُفرَّغ شاشة اللاعب حتى يُحدِّث الصفحة، و`buildResults` تكتب `undefined`
 * فيرفضها Firebase وتقف الجولة عند التصويت بلا كلمة.
 *
 * ولا يظهر شيء من هذا في التطوير المحلّي: النقل المحلّي يمرّ عبر JSON فيحفظ
 * القيم كما هي. الفرق كلّه في حدود الشبكة — فهنا مكان علاجه، مرّة واحدة عند
 * كل قراءة، لا عشرين حارسًا `?.` متفرّقة في الشاشات.
 */
export function hydrateSecret(raw: unknown, playerId: string): PlayerSecret {
  const base = emptySecret(playerId);
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Partial<PlayerSecret> & Record<string, unknown>;

  /* المصفوفة قد تعود كائنًا بمفاتيح رقمية إن كانت متقطّعة */
  const list = <T,>(input: unknown): T[] => {
    if (Array.isArray(input)) return input.filter((item) => item != null) as T[];
    if (input && typeof input === 'object') return Object.values(input) as T[];
    return [];
  };

  return {
    ...base,
    playerId: typeof value.playerId === 'string' ? value.playerId : playerId,
    role: value.role ?? base.role,
    dice: list<WakeSlot>(value.dice),
    chosenSlot: value.chosenSlot ?? null,
    effectiveSlots: list<WakeSlot>(value.effectiveSlots),
    soloSlots: list<WakeSlot>(value.soloSlots),
    inspection: value.inspection
      ? {
          targetId: value.inspection.targetId,
          side: value.inspection.side,
          revealedSlot: value.inspection.revealedSlot ?? null,
        }
      : null,
    knownAllies: list<string>(value.knownAllies),
    accompliceQuota: value.accompliceQuota ?? 0,
    accompliceCandidates: list<string>(value.accompliceCandidates),
    accompliceChoice: value.accompliceChoice ? list<string>(value.accompliceChoice) : null,
    becameAccomplice: value.becameAccomplice === true,
  };
}

/** يُعيد بناء خريطة أسرار كاملة قادمة من الشبكة. */
export function hydrateSecrets(raw: unknown): SecretMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: SecretMap = {};
  for (const [playerId, value] of Object.entries(raw as Record<string, unknown>)) {
    out[playerId] = hydrateSecret(value, playerId);
  }
  return out;
}

/**
 * يوزّع مُخفيًا واحدًا وبقية اللاعبين أعضاء فريق، ويرمي النرد.
 * المتعاونون **لا يُوزَّعون هنا** — يُحدَّدون بعد الليل (راجع accomplice.ts).
 */
export function dealRound({ playerIds, rng, forceHiderId, forceDice }: DealInput): SecretMap {
  const rules = rulesFor(playerIds.length);
  const hiderId = forceHiderId ?? pickOne(rng, playerIds);
  if (!playerIds.includes(hiderId)) {
    throw new Error(`مُخفٍ مفروض غير موجود بين اللاعبين: ${hiderId}`);
  }

  const secrets: SecretMap = {};
  for (const playerId of playerIds) {
    const secret = emptySecret(playerId);
    secret.role = playerId === hiderId ? 'hider' : 'member';
    secret.dice =
      forceDice?.[playerId] ??
      Array.from(
        { length: rules.dicePerPlayer },
        () => randomInt(rng, 1, 6) as WakeSlot,
      );

    if (secret.dice.length !== rules.dicePerPlayer) {
      throw new Error(
        `عدد نتائج النرد للاعب ${playerId} يجب أن يكون ${rules.dicePerPlayer}.`,
      );
    }

    // وضع الأربعة: المُخفي يستيقظ عند كل نتائجه فورًا؛ عضو الفريق ينتظر اختياره.
    if (rules.hiderUsesAllDice && secret.role === 'hider') {
      secret.effectiveSlots = uniqueSlots(secret.dice);
    } else if (rules.memberChoosesSlot) {
      secret.effectiveSlots = [];
    } else {
      secret.effectiveSlots = uniqueSlots(secret.dice.slice(0, 1));
    }

    secrets[playerId] = secret;
  }

  return secrets;
}

export function uniqueSlots(slots: readonly WakeSlot[]): WakeSlot[] {
  return [...new Set(slots)].sort((a, b) => a - b);
}

/**
 * يسجّل اختيار عضو الفريق لأحد نتيجتيه (وضع الأربعة فقط).
 * يرمي خطأ إذا لم يكن الرقم ضمن نتائجه أو إذا كان اللاعب هو المُخفي.
 */
export function chooseSlot(secret: PlayerSecret, slot: WakeSlot): PlayerSecret {
  /*
    المُخفي يختار مثل الجميع.

    كان ممنوعًا من الاختيار لأنه كان يستيقظ عند نتيجتيه معًا في وضع الأربعة.
    وقد صار يستيقظ ليلةً واحدة كبقية اللاعبين، فبقاء المنع كان يتركه بلا موعد
    فعّال: لا يختار ولا يُختار له، فلا يستيقظ ولا يأخذ الملف — وتُلعب الجولة
    كلها بلا مُخفٍ.
  */
  if (!secret.dice.includes(slot)) {
    throw new Error(`الموعد ${slot} ليس من نتائج نرد هذا اللاعب.`);
  }
  return { ...secret, chosenSlot: slot, effectiveSlots: [slot] };
}

/**
 * يسجّل نتائج النرد الحقيقي المُدخلة يدويًا.
 * يتحقق من النطاق ومن العدد المطلوب حسب عدد اللاعبين.
 */
export function submitPhysicalDice(
  secret: PlayerSecret,
  values: number[],
  playerCount: number,
): PlayerSecret {
  const rules = rulesFor(playerCount);
  if (values.length !== rules.dicePerPlayer) {
    throw new Error(`مطلوب ${rules.dicePerPlayer} من نتائج النرد.`);
  }
  for (const value of values) {
    if (!Number.isInteger(value) || value < 1 || value > 6) {
      throw new Error(`نتيجة نرد غير صالحة: ${value}. المسموح من 1 إلى 6.`);
    }
  }
  const dice = values as WakeSlot[];
  const next: PlayerSecret = { ...secret, dice, chosenSlot: null };
  if (rules.hiderUsesAllDice && secret.role === 'hider') {
    next.effectiveSlots = uniqueSlots(dice);
  } else if (rules.memberChoosesSlot) {
    next.effectiveSlots = [];
  } else {
    next.effectiveSlots = uniqueSlots(dice.slice(0, 1));
  }
  return next;
}

/** هل أنهى هذا اللاعب كل ما يخص النرد ويمكن بدء الليل؟ */
export function diceSettled(secret: PlayerSecret): boolean {
  return secret.dice.length > 0 && secret.effectiveSlots.length > 0;
}
