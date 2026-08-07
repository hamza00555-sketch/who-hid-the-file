/**
 * المخرج — المنطق الذي يشغّله **جهاز المضيف وحده** لتحريك الجولة.
 *
 * كل دالة هنا تجمع بين منطق نقي من `src/game/*` وكتابة عبر طبقة النقل.
 * لا تُستدعى من جهاز لاعب إطلاقًا.
 */

import type { RoomTransport } from '../net/transport';
import {
  applyAccomplices,
  autoPickAccomplices,
  planAccomplices,
  prepareAccompliceStage,
} from './accomplice';
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
  'night-accomplices',
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

/**
 * يكتب **من تغيّر فقط**، لا الخريطة كاملة.
 *
 * ── لماذا هذا التفصيل مهم ──
 *
 * كتابة الخريطة كاملة تُنفَّذ `set` على الفرع الأب: كل ما وصل بعد القراءة
 * وقبل الكتابة يُمحى. وفي هذه اللحظة بالذات يصل شيء: لاعبٌ فحص جاره في آخر
 * ليلة، والمضيف حلّ فحصه — فتُكتب خريطة قديمة فوقه ويضيع.
 *
 * وهذا ما يراه اللاعب: يقرأ موعد جاره في ليلته، ثم لا يجد شيئًا بعد الليل.
 */
async function writeChanged(
  transport: RoomTransport,
  code: string,
  before: SecretMap,
  after: SecretMap,
): Promise<void> {
  for (const [playerId, secret] of Object.entries(after)) {
    if (JSON.stringify(before[playerId]) === JSON.stringify(secret)) continue;
    await transport.writeSecret(code, playerId, secret);
  }
}

/**
 * يفتح خطوة المتعاونين الليلية: يكتب الحصّة والمرشحين في سر المُخفي ثم يدخل
 * المرحلة. الكتابة **قبل** تغيير المرحلة حتى لا تصل شاشة الاختيار إلى جهاز
 * المُخفي قبل ما تعرضه.
 */
export async function enterAccompliceNight(
  transport: RoomTransport,
  code: string,
  playerCount: number,
): Promise<void> {
  const secrets = await transport.readSecrets(code);
  await writeChanged(transport, code, secrets, prepareAccompliceStage(secrets, playerCount));
  await transport.setPhase(code, 'night-accomplices');
}

/** يدخل المرحلة السرية بعد أن انتهى الليل بكل خطواته. */
export async function enterSecretActions(
  transport: RoomTransport,
  code: string,
): Promise<void> {
  await transport.setPhase(code, 'secret-actions');
}

/**
 * يُغلق خطوة المتعاونين: يطبّق ما اختاره المُخفي، وإن لم يصل اختيار يختار
 * المخرج نيابةً عنه. راجع `autoPickAccomplices` — الجولة لا تُلعب بلا متعاون
 * بعد أن وعد الراوي به.
 */
export async function closeAccompliceNight(
  transport: RoomTransport,
  code: string,
  playerCount: number,
): Promise<void> {
  const secrets = await transport.readSecrets(code);
  if (await applyPendingAccompliceChoice(transport, code, playerCount, secrets)) return;

  const plan = planAccomplices(secrets, playerCount);
  const hider = plan.hiderId ? secrets[plan.hiderId] : null;
  if (!hider || hider.accompliceQuota === 0) return; // طُبِّق من قبل

  const picked = autoPickAccomplices(secrets, playerCount, cryptoRng);
  if (picked.length === 0) return;
  await writeChanged(transport, code, secrets, applyAccomplices(secrets, picked, playerCount));
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
  await writeChanged(transport, code, secrets, {
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
