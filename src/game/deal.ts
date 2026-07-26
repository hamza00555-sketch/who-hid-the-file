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
  if (secret.role === 'hider') {
    throw new Error('مُخفي الملف يستيقظ عند كل مواعيده ولا يختار.');
  }
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
