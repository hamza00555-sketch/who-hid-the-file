/**
 * المخرج — المنطق الذي يشغّله **جهاز المضيف وحده** لتحريك الجولة.
 *
 * كل دالة هنا تجمع بين منطق نقي من `src/game/*` وكتابة عبر طبقة النقل.
 * لا تُستدعى من جهاز لاعب إطلاقًا.
 */

import type { RoomTransport } from '../net/transport';
import { applyAccomplices, prepareAccompliceStage } from './accomplice';
import { dealRound, type SecretMap } from './deal';
import { canInspect, computeSoloSlots, inspectTargets, performInspection } from './night';
import { cryptoRng } from './rng';
import { buildResults } from './vote';
import type { Phase, PlayerPublic } from './types';

/** ترتيب المراحل الذي يتحرك فيه المضيف للأمام. */
export const PHASE_ORDER: readonly Phase[] = [
  'lobby',
  'role-distribution',
  'dice-roll',
  'ready-check',
  'night-intro',
  'night-phase-1',
  'night-phase-2',
  'night-phase-3',
  'night-phase-4',
  'night-phase-5',
  'night-phase-6',
  'secret-actions',
  'discussion',
  'voting',
  'reveal',
  'results',
];

export function nextPhase(current: Phase): Phase | null {
  const index = PHASE_ORDER.indexOf(current);
  if (index === -1 || index === PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[index + 1]!;
}

/** توزيع الأدوار والنرد وكتابتها في المسارات السرية، ثم فتح شاشة الدور. */
export async function startRoleDistribution(
  transport: RoomTransport,
  code: string,
  playerIds: string[],
): Promise<void> {
  const secrets = dealRound({ playerIds, rng: cryptoRng });
  await transport.writeSecrets(code, secrets);
  await transport.setPhase(code, 'role-distribution');
}

/**
 * يُستدعى بعد أن يستقر النرد لكل اللاعبين: يحسب الاستيقاظ المنفرد
 * ويكتبه في الأسرار قبل بدء الليل.
 */
export async function finalizeWakeSlots(
  transport: RoomTransport,
  code: string,
): Promise<SecretMap> {
  const secrets = await transport.readSecrets(code);
  const withSolo = computeSoloSlots(secrets);
  await transport.writeSecrets(code, withSolo);
  return withSolo;
}

/** يدخل المرحلة السرية: يجهّز شاشة المتعاونين ويطبّق التعيين التلقائي. */
export async function enterSecretActions(
  transport: RoomTransport,
  code: string,
  playerCount: number,
): Promise<void> {
  const secrets = await transport.readSecrets(code);
  await transport.writeSecrets(code, prepareAccompliceStage(secrets, playerCount));
  await transport.setPhase(code, 'secret-actions');
}

/**
 * يطبّق اختيار المُخفي فور وصوله. يعمل على جهاز المضيف لأن التطبيق
 * يعدّل أسرار لاعبين آخرين، وهو ما لا يستطيعه جهاز اللاعب.
 *
 * يعيد `true` إذا طُبِّق شيء فعلًا.
 */
export async function applyPendingAccompliceChoice(
  transport: RoomTransport,
  code: string,
  playerCount: number,
  secrets: SecretMap,
): Promise<boolean> {
  const hider = Object.values(secrets).find((secret) => secret.role === 'hider');
  const choice = hider?.accompliceChoice;
  if (!hider || !choice || choice.length === 0) return false;
  if (hider.accompliceQuota === 0) return false; // طُبِّق من قبل

  const applied = applyAccomplices(secrets, choice, playerCount);
  await transport.writeSecrets(code, {
    ...applied,
    [hider.playerId]: { ...applied[hider.playerId]!, accompliceChoice: null },
  });
  return true;
}

/**
 * ينفّذ طلبات فحص الجيران.
 *
 * جهاز اللاعب يكتب الطلب فقط (`revealedSlot: null`) لأنه **لا يستطيع** قراءة سر
 * جاره؛ المضيف هو من يملأ الموعد المكشوف بعد التحقق من أحقية الفحص.
 * يعيد `true` إذا كُشف شيء.
 */
export async function resolvePendingInspections(
  transport: RoomTransport,
  code: string,
  players: PlayerPublic[],
  secrets: SecretMap,
): Promise<boolean> {
  let changed = false;

  for (const secret of Object.values(secrets)) {
    const request = secret.inspection;
    if (!request || request.revealedSlot !== null) continue;

    // إعادة التحقق عند المضيف: العميل لا يُوثَق به في أحقية الفحص.
    const eligible = { ...secret, inspection: null };
    if (!canInspect(eligible, players.length)) continue;

    const allowed = inspectTargets(secret.playerId, players);
    if (allowed[request.side] !== request.targetId) continue;

    const resolved = performInspection(eligible, request.side, players, secrets);
    await transport.writeSecret(code, secret.playerId, resolved);
    changed = true;
  }

  return changed;
}

/** يجمع الأصوات ويحسب النتيجة ويكتبها، ثم يفتح الكشف. */
export async function revealResults(
  transport: RoomTransport,
  code: string,
  players: PlayerPublic[],
): Promise<void> {
  const [secrets, votes] = await Promise.all([
    transport.readSecrets(code),
    transport.readVotes(code),
  ]);
  await transport.writeResults(code, buildResults(secrets, votes, players));
  await transport.setPhase(code, 'reveal');
}

/** هل أنهى كل اللاعبين المتصلين هذه الخطوة؟ */
export function allAcked(
  progress: Record<string, { roleAck: boolean; diceAck: boolean; secretAck: boolean; voted: boolean }>,
  players: PlayerPublic[],
  key: 'roleAck' | 'diceAck' | 'secretAck' | 'voted',
): boolean {
  const active = players.filter((player) => player.connected);
  if (active.length === 0) return false;
  return active.every((player) => progress[player.id]?.[key] === true);
}
