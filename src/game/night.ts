/**
 * منطق الليل: من يستيقظ متى، من كان وحده، ومن يحق له فحص جاره.
 * راجع GAME_RULES.md §6 و §7.
 */

import { rulesFor } from './rules';
import { neighboursOf } from './seating';
import type { SecretMap } from './deal';
import type { Inspection, PlayerPublic, PlayerSecret, WakeSlot } from './types';

/** من يستيقظ في هذه المرحلة. */
export function playersAwakeAt(secrets: SecretMap, slot: WakeSlot): string[] {
  return Object.values(secrets)
    .filter((secret) => secret.effectiveSlots.includes(slot))
    .map((secret) => secret.playerId)
    .sort();
}

/**
 * يحسب `soloSlots` لكل لاعب: المواعيد التي لم يشاركه فيها أحد.
 * يُستدعى **بعد** أن يستقر النرد لكل اللاعبين (وبعد اختيارات وضع الأربعة).
 */
export function computeSoloSlots(secrets: SecretMap): SecretMap {
  const occupancy = new Map<WakeSlot, number>();
  for (const secret of Object.values(secrets)) {
    for (const slot of secret.effectiveSlots) {
      occupancy.set(slot, (occupancy.get(slot) ?? 0) + 1);
    }
  }

  const next: SecretMap = {};
  for (const [playerId, secret] of Object.entries(secrets)) {
    next[playerId] = {
      ...secret,
      soloSlots: secret.effectiveSlots.filter((slot) => occupancy.get(slot) === 1),
    };
  }
  return next;
}

/** من استيقظ مع هذا اللاعب في أي من مواعيده — يُستخدم في شاشة النتائج فقط. */
export function wokeWith(secrets: SecretMap, playerId: string): string[] {
  const self = secrets[playerId];
  if (!self) return [];
  const companions = new Set<string>();
  for (const other of Object.values(secrets)) {
    if (other.playerId === playerId) continue;
    if (other.effectiveSlots.some((slot) => self.effectiveSlots.includes(slot))) {
      companions.add(other.playerId);
    }
  }
  return [...companions].sort();
}

/**
 * من استيقظ في نفس موعد المُخفي — أساس قاعدة المتعاون بالمشاهدة (5 لاعبين).
 * المُخفي نفسه غير محسوب.
 */
export function witnessesOfHider(secrets: SecretMap): string[] {
  const hider = Object.values(secrets).find((secret) => secret.role === 'hider');
  if (!hider) return [];
  return wokeWith(secrets, hider.playerId);
}

/**
 * هل يحق لهذا اللاعب فحص جاره؟
 *
 * الشروط مجتمعة: القاعدة تسمح بالفحص لهذا العدد، اللاعب ليس المُخفي،
 * استيقظ وحده في موعد واحد على الأقل، ولم يفحص من قبل.
 */
export function canInspect(secret: PlayerSecret, playerCount: number): boolean {
  const rules = rulesFor(playerCount);
  if (!rules.inspectionEnabled) return false;
  if (secret.role === 'hider') return false;
  if (secret.soloSlots.length === 0) return false;
  if (secret.inspection?.revealedSlot != null) return false;
  return true;
}

/**
 * ماذا تعرض شاشة اللاعب في مرحلة ليلية بعينها.
 *
 * القرار منطق لا عرض، فمكانه هنا لا داخل JSX: الفرق بين «إعتام» و«مُنتقٍ»
 * يحكمه أربعة شروط متداخلة (النمط، الاستيقاظ، الانفراد، الأحقية)، وخطأ في
 * أيّها يُظهر شاشة مضيئة لنائم — أو يمنع مستيقظًا من معلومته.
 *
 * - `blackout` — لا شيء. الجهاز لا يُلمس.
 * - `pick`     — اختر أحد جاريك (النمط الرقمي وحده).
 * - `waiting`  — أُرسل الطلب وينتظر المضيف أن يكشف الموعد.
 * - `revealed` — الموعد ظاهر، احفظه وأغلق عينيك.
 *
 * في نمط النرد والأكواب النتيجة `blackout` دائمًا: المعلومة تحت كوب الجار لا
 * في الجهاز، وإضاءة الشاشة هناك تفضح المستيقظ.
 */
export type NightView = 'blackout' | 'pick' | 'waiting' | 'revealed';

export function nightViewFor(
  secret: PlayerSecret | null,
  slot: WakeSlot | null,
  playerCount: number,
  diceMode: 'digital' | 'physical',
): NightView {
  if (diceMode !== 'digital') return 'blackout';
  if (!secret || slot == null) return 'blackout';
  if (!secret.soloSlots.includes(slot)) return 'blackout';

  if (secret.inspection?.revealedSlot != null) return 'revealed';
  if (secret.inspection) return 'waiting';
  return canInspect(secret, playerCount) ? 'pick' : 'blackout';
}

/** الجاران المسموح فحصهما — لا أحد غيرهما. */
export function inspectTargets(
  playerId: string,
  players: PlayerPublic[],
): { right: string; left: string } {
  return neighboursOf(playerId, players);
}

export class InspectionError extends Error {}

/**
 * ينفّذ الفحص ويعيد السر محدَّثًا بالمعلومة المكشوفة.
 *
 * يكشف **موعد الاستيقاظ فقط**: لا دور، لا فريق، ولا هل استيقظ فعلًا.
 */
export function performInspection(
  secret: PlayerSecret,
  side: 'right' | 'left',
  players: PlayerPublic[],
  secrets: SecretMap,
): PlayerSecret {
  if (!canInspect(secret, players.length)) {
    throw new InspectionError('هذا اللاعب لا يحق له فحص أي جار في هذه الجولة.');
  }
  const targets = inspectTargets(secret.playerId, players);
  const targetId = targets[side];
  const target = secrets[targetId];
  if (!target) throw new InspectionError(`الجار ${targetId} غير موجود.`);

  const inspection: Inspection = {
    targetId,
    side,
    // الموعد المعروض هو أول مواعيده الفعّالة — وهو الوحيد في 5..8 لاعبين
    revealedSlot: target.effectiveSlots[0] ?? null,
  };
  return { ...secret, inspection };
}

/** هل مرّت نافذة يستطيع فيها المُخفي أخذ الملف حتى هذه المرحلة؟ */
export function hideWindowPassed(secrets: SecretMap, currentSlot: WakeSlot): boolean {
  const hider = Object.values(secrets).find((secret) => secret.role === 'hider');
  if (!hider) return false;
  return hider.effectiveSlots.some((slot) => slot <= currentSlot);
}

/** من عليه أن يفتح عينيه الآن — للاهتزاز الصامت على جهازه. */
export function shouldWake(secret: PlayerSecret, slot: WakeSlot): boolean {
  return secret.effectiveSlots.includes(slot);
}

/** هل ينتظر هذا اللاعب معلومة بعد الليل (لاهتزازة «لديك معلومة»)؟ */
export function hasPendingSecretInfo(secret: PlayerSecret, playerCount: number): boolean {
  return (
    canInspect(secret, playerCount) ||
    secret.accompliceQuota > 0 ||
    secret.becameAccomplice ||
    secret.knownAllies.length > 0
  );
}
