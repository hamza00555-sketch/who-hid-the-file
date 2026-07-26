/**
 * المتعاونون — كل ما يحدث في المرحلة السرية بعد نهاية الليل.
 * راجع GAME_RULES.md §8.
 */

import { rulesFor } from './rules';
import { witnessesOfHider } from './night';
import type { SecretMap } from './deal';

export interface AccomplicePlan {
  mode: 'none' | 'witness' | 'chosen';
  hiderId: string | null;
  /** المرشحون الذين يستطيع المُخفي الاختيار منهم */
  candidates: string[];
  /** كم يجب أن يختار المُخفي بنفسه (0 = لا شاشة اختيار) */
  quota: number;
  /** متعاونون يُعيَّنون تلقائيًا بلا اختيار (5 لاعبين، شاهد واحد) */
  autoAssigned: string[];
}

export class AccompliceError extends Error {}

/** يحسب ما الذي يجب أن يحدث في مرحلة المتعاونين لهذه الجولة. */
export function planAccomplices(secrets: SecretMap, playerCount: number): AccomplicePlan {
  const rules = rulesFor(playerCount);
  const hider = Object.values(secrets).find((secret) => secret.role === 'hider');
  const hiderId = hider?.playerId ?? null;

  if (rules.accompliceMode === 'none' || !hiderId) {
    return { mode: 'none', hiderId, candidates: [], quota: 0, autoAssigned: [] };
  }

  if (rules.accompliceMode === 'witness') {
    const witnesses = witnessesOfHider(secrets);
    if (witnesses.length === 0) {
      // لا أحد شاهد المُخفي — جولة بلا متعاون، وهذا وضع صحيح.
      return { mode: 'witness', hiderId, candidates: [], quota: 0, autoAssigned: [] };
    }
    if (witnesses.length === 1) {
      return { mode: 'witness', hiderId, candidates: witnesses, quota: 0, autoAssigned: witnesses };
    }
    // أكثر من شاهد: المُخفي يختار واحدًا منهم فقط.
    return { mode: 'witness', hiderId, candidates: witnesses, quota: 1, autoAssigned: [] };
  }

  const candidates = Object.keys(secrets)
    .filter((playerId) => playerId !== hiderId)
    .sort();
  return {
    mode: 'chosen',
    hiderId,
    candidates,
    quota: Math.min(rules.accompliceCount, candidates.length),
    autoAssigned: [],
  };
}

/**
 * يكتب في سر المُخفي ما يحتاجه لشاشة الاختيار، ويطبّق التعيين التلقائي إن وُجد.
 * يُستدعى مرة واحدة عند دخول مرحلة `secret-actions`.
 */
export function prepareAccompliceStage(secrets: SecretMap, playerCount: number): SecretMap {
  const plan = planAccomplices(secrets, playerCount);
  if (!plan.hiderId) return secrets;

  const hider = secrets[plan.hiderId];
  if (!hider) return secrets;

  let next: SecretMap = {
    ...secrets,
    [plan.hiderId]: {
      ...hider,
      accompliceQuota: plan.quota,
      accompliceCandidates: plan.candidates,
    },
  };

  if (plan.autoAssigned.length > 0) {
    next = applyAccomplices(next, plan.autoAssigned, playerCount);
  }
  return next;
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
  if (rules.accompliceMode === 'none') {
    if (chosenIds.length > 0) {
      throw new AccompliceError('لا يوجد متعاونون في هذا العدد من اللاعبين.');
    }
    return secrets;
  }

  const unique = [...new Set(chosenIds)];
  if (unique.length !== chosenIds.length) {
    throw new AccompliceError('لا يمكن اختيار نفس اللاعب مرتين.');
  }
  if (unique.includes(hiderId)) {
    throw new AccompliceError('مُخفي الملف لا يستطيع اختيار نفسه متعاونًا.');
  }
  for (const playerId of unique) {
    if (!secrets[playerId]) throw new AccompliceError(`لاعب غير موجود: ${playerId}`);
    if (plan.candidates.length > 0 && !plan.candidates.includes(playerId)) {
      throw new AccompliceError(`اللاعب ${playerId} ليس من المرشحين المسموح اختيارهم.`);
    }
  }

  const expected = plan.autoAssigned.length > 0 ? plan.autoAssigned.length : plan.quota;
  if (unique.length !== expected) {
    throw new AccompliceError(`مطلوب اختيار ${expected} متعاونًا، وصل ${unique.length}.`);
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
