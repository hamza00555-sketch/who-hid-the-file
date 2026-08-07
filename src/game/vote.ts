/**
 * التصويت والفوز — راجع GAME_RULES.md §9 و §10.
 */

import { accompliceIds } from './accomplice';
import { wokeWith } from './night';
import type { SecretMap } from './deal';
import type { PlayerPublic, RoundResults, VoteTally } from './types';

export class VoteError extends Error {}

/**
 * يُعيد بناء نتيجة جولة قادمة من الشبكة إلى شكلها الكامل.
 *
 * نفس فخّ `hydrateSecret`: Firebase تحذف كل `null` وكل مصفوفة فارغة. ومن لم
 * يستيقظ معه أحد يعود صفّه بلا `wokeWith` إطلاقًا، فتنهار شاشة النتائج على
 * `row.wokeWith.length` — وتُقفل الجولة على شاشة عطل لا مخرج منها.
 *
 * وهذا يقع في **نهاية** الجولة تحديدًا: بعد الليل كلّه والنقاش والتصويت.
 */
export function hydrateResults(raw: unknown): RoundResults | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<RoundResults> & Record<string, unknown>;

  const list = <T,>(input: unknown): T[] => {
    if (Array.isArray(input)) return input.filter((item) => item != null) as T[];
    if (input && typeof input === 'object') return Object.values(input) as T[];
    return [];
  };

  const tally = (value.tally ?? {}) as Partial<VoteTally>;

  return {
    tally: {
      counts: (tally.counts ?? {}) as Record<string, number>,
      topVoted: list<string>(tally.topVoted),
      totalVotes: tally.totalVotes ?? 0,
    },
    winner: value.winner === 'team' ? 'team' : 'hiders',
    hiderId: typeof value.hiderId === 'string' ? value.hiderId : '',
    accompliceIds: list<string>(value.accompliceIds),
    reveal: list<RoundResults['reveal'][number]>(value.reveal).map((row) => ({
      playerId: row.playerId,
      role: row.role ?? 'member',
      effectiveSlots: list(row.effectiveSlots),
      soloSlots: list(row.soloSlots),
      wokeWith: list(row.wokeWith),
      inspected: row.inspected
        ? {
            targetId: row.inspected.targetId,
            revealedSlot: row.inspected.revealedSlot ?? null,
          }
        : null,
      votedFor: row.votedFor ?? null,
    })),
  };
}

/** يتحقق من صلاحية صوت واحد قبل إرساله. */
export function validateVote(
  voterId: string,
  targetId: string,
  players: PlayerPublic[],
  alreadyVoted: boolean,
): void {
  if (alreadyVoted) throw new VoteError('لقد سجّلت صوتك بالفعل ولا يمكن تغييره.');
  if (voterId === targetId) throw new VoteError('لا يمكنك التصويت لنفسك.');
  if (!players.some((p) => p.id === voterId)) throw new VoteError('المصوّت ليس في الجلسة.');
  if (!players.some((p) => p.id === targetId)) throw new VoteError('اللاعب المختار ليس في الجلسة.');
}

/** من يستطيع هذا اللاعب التصويت له. */
export function voteOptions(voterId: string, players: PlayerPublic[]): PlayerPublic[] {
  return players.filter((p) => p.id !== voterId);
}

/** يجمع الأصوات ويحدد أصحاب أعلى عدد — كل المتعادلين. */
export function tallyVotes(votes: Record<string, string>): VoteTally {
  const counts: Record<string, number> = {};
  let totalVotes = 0;
  for (const targetId of Object.values(votes)) {
    if (!targetId) continue;
    counts[targetId] = (counts[targetId] ?? 0) + 1;
    totalVotes += 1;
  }

  const max = Math.max(0, ...Object.values(counts));
  const topVoted =
    max === 0
      ? []
      : Object.entries(counts)
          .filter(([, count]) => count === max)
          .map(([playerId]) => playerId)
          .sort();

  return { counts, topVoted, totalVotes };
}

/**
 * الفريق يفوز إذا كان مُخفي الملف ضمن أصحاب أعلى عدد أصوات — ولو بالتعادل.
 * كشف متعاون وحده لا يكفي.
 */
export function decideWinner(topVoted: string[], secrets: SecretMap): 'team' | 'hiders' {
  const hider = Object.values(secrets).find((secret) => secret.role === 'hider');
  if (!hider) return 'hiders';
  return topVoted.includes(hider.playerId) ? 'team' : 'hiders';
}

/** يبني نتيجة الجولة الكاملة التي تُعرض في شاشة النتائج. */
export function buildResults(
  secrets: SecretMap,
  votes: Record<string, string>,
  players: PlayerPublic[],
): RoundResults {
  const tally = tallyVotes(votes);
  const winner = decideWinner(tally.topVoted, secrets);
  const hider = Object.values(secrets).find((secret) => secret.role === 'hider');

  return {
    tally,
    winner,
    hiderId: hider?.playerId ?? '',
    accompliceIds: accompliceIds(secrets),
    reveal: players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((player) => {
        const secret = secrets[player.id];
        return {
          playerId: player.id,
          role: secret?.role ?? 'member',
          effectiveSlots: secret?.effectiveSlots ?? [],
          soloSlots: secret?.soloSlots ?? [],
          wokeWith: wokeWith(secrets, player.id),
          /*
            `?? null` لا زخرفة: فحصٌ طُلب ولم يُكشف يعود من Firebase بلا حقل
            `revealedSlot` إطلاقًا (الـ‏null محذوف)، فتُكتب النتيجة وفيها
            `undefined` — وترفضها قاعدة البيانات كاملةً. الجولة كانت تقف عند
            التصويت بعد وصول كل الأصوات بلا رسالة واحدة.
          */
          inspected: secret?.inspection
            ? {
                targetId: secret.inspection.targetId,
                revealedSlot: secret.inspection.revealedSlot ?? null,
              }
            : null,
          votedFor: votes[player.id] ?? null,
        };
      }),
  };
}
