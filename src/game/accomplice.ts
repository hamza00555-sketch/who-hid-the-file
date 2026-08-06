/**
 * المتعاونون — كل ما يحدث في آخر الليل حين يختار المُخفي من يساعده.
 * راجع GAME_RULES.md §8.
 */

import { rulesFor } from './rules';
import type { Rng } from './rng';
import { randomInt } from './rng';
import type { SecretMap } from './deal';

export interface AccomplicePlan {
  hiderId: string | null;
  /** المرشحون الذين يستطيع المُخفي الاختيار منهم */
  candidates: string[];
  /** كم يجب أن يختار المُخفي */
  quota: number;
}

export class AccompliceError extends Error {}

/**
 * يحسب ما الذي يجب أن يحدث في خطوة المتعاونين لهذه الجولة.
 *
 * المرشحون هم كل من على الطاولة عدا المُخفي. لا اشتراط أن يكونوا قد رأوه:
 * التعيين بالمشاهدة كان يترك جولات بلا متعاون إطلاقًا حين لا يستيقظ أحد مع
 * المُخفي، والقاعدة الآن أن لكل جولة متعاونًا واحدًا على الأقل.
 */
export function planAccomplices(secrets: SecretMap, playerCount: number): AccomplicePlan {
  const rules = rulesFor(playerCount);
  const hider = Object.values(secrets).find((secret) => secret.role === 'hider');
  const hiderId = hider?.playerId ?? null;

  if (!hiderId) return { hiderId: null, candidates: [], quota: 0 };

  const candidates = Object.keys(secrets)
    .filter((playerId) => playerId !== hiderId)
    .sort();

  return {
    hiderId,
    candidates,
    quota: Math.min(rules.accompliceCount, candidates.length),
  };
}

/**
 * يكتب في سر المُخفي ما يحتاجه لشاشة الاختيار.
 * يُستدعى مرة واحدة عند دخول مرحلة `night-accomplices`.
 */
export function prepareAccompliceStage(secrets: SecretMap, playerCount: number): SecretMap {
  const plan = planAccomplices(secrets, playerCount);
  if (!plan.hiderId) return secrets;

  const hider = secrets[plan.hiderId];
  if (!hider) return secrets;

  return {
    ...secrets,
    [plan.hiderId]: {
      ...hider,
      accompliceQuota: plan.quota,
      accompliceCandidates: plan.candidates,
    },
  };
}

/**
 * اختيار احتياطي حين ينتهي وقت الخطوة ولم يصل اختيار المُخفي.
 *
 * جهاز قد ينقطع أو يدٌ قد تتردّد، والجولة لا تحتمل أن تُلعب بلا متعاون بعد أن
 * وعد الراوي به. الاختيار عشوائي من المرشحين أنفسهم، وشكل الليل لا يتغيّر —
 * فلا أحد على الطاولة يعرف أن المُخفي لم يختر بنفسه.
 */
export function autoPickAccomplices(
  secrets: SecretMap,
  playerCount: number,
  rng: Rng,
): string[] {
  const plan = planAccomplices(secrets, playerCount);
  const pool = [...plan.candidates];
  const picked: string[] = [];
  while (picked.length < plan.quota && pool.length > 0) {
    picked.push(...pool.splice(randomInt(rng, 0, pool.length - 1), 1));
  }
  return picked.sort();
}

/**
 * يحوّل اللاعبين المختارين إلى متعاونين ويوزّع المعرفة المتبادلة حسب عدد اللاعبين.
 * راجع جدول «معرفة المتعاونين بعضهم ببعض» في GAME_RULES.md §4.
 */
export function applyAccomplices(
  secrets: SecretMap,
  chosenIds: string[],
  playerCount: number,
): SecretMap {
  const rules = rulesFor(playerCount);
  const plan = planAccomplices(secrets, playerCount);
  const hiderId = plan.hiderId;

  if (!hiderId) throw new AccompliceError('لا يوجد مُخفي ملف في هذه الجولة.');

  const unique = [...new Set(chosenIds)];
  if (unique.length !== chosenIds.length) {
    throw new AccompliceError('لا يمكن اختيار نفس اللاعب مرتين.');
  }
  if (unique.includes(hiderId)) {
    throw new AccompliceError('مُخفي الملف لا يستطيع اختيار نفسه متعاونًا.');
  }
  for (const playerId of unique) {
    if (!secrets[playerId]) throw new AccompliceError(`لاعب غير موجود: ${playerId}`);
    if (!plan.candidates.includes(playerId)) {
      throw new AccompliceError(`اللاعب ${playerId} ليس من المرشحين المسموح اختيارهم.`);
    }
  }

  if (unique.length !== plan.quota) {
    throw new AccompliceError(`مطلوب اختيار ${plan.quota} متعاونًا، وصل ${unique.length}.`);
  }

  const next: SecretMap = { ...secrets };

  for (const playerId of unique) {
    const allies: string[] = [];
    if (rules.accompliceKnowsHider) allies.push(hiderId);
    if (rules.accomplicesKnowEachOther) {
      allies.push(...unique.filter((other) => other !== playerId));
    }
    next[playerId] = {
      ...next[playerId]!,
      role: 'accomplice',
      becameAccomplice: true,
      knownAllies: allies,
    };
  }

  // المُخفي يعرف من اختارهم دائمًا.
  next[hiderId] = {
    ...next[hiderId]!,
    knownAllies: unique,
    accompliceQuota: 0,
    accompliceCandidates: [],
  };

  return next;
}

export function accompliceIds(secrets: SecretMap): string[] {
  return Object.values(secrets)
    .filter((secret) => secret.role === 'accomplice')
    .map((secret) => secret.playerId)
    .sort();
}
