import { describe, expect, it } from 'vitest';
import { applyAccomplices, prepareAccompliceStage } from '../accomplice';
import { dealRound } from '../deal';
import { computeSoloSlots } from '../night';
import { buildResults, decideWinner, tallyVotes, validateVote, voteOptions } from '../vote';
import { dice, ids, makePlayers } from './helpers';

function build(n: number, hiderId: string, values: Record<string, number[]>) {
  return computeSoloSlots(
    dealRound({
      playerIds: ids(n),
      rng: { next: () => 0 },
      forceHiderId: hiderId,
      forceDice: dice(values),
    }),
  );
}

const SIX = () => build(6, 'p1', { p1: [1], p2: [2], p3: [3], p4: [4], p5: [5], p6: [6] });

describe('صلاحية التصويت', () => {
  const players = makePlayers(6);

  it('يمنع التصويت للنفس', () => {
    expect(() => validateVote('p2', 'p2', players, false)).toThrow('لا يمكنك التصويت لنفسك.');
    expect(voteOptions('p2', players).map((p) => p.id)).not.toContain('p2');
    expect(voteOptions('p2', players)).toHaveLength(5);
  });

  it('يمنع التصويت مرتين', () => {
    expect(() => validateVote('p2', 'p3', players, true)).toThrow();
  });

  it('يمنع التصويت للاعب خارج الجلسة', () => {
    expect(() => validateVote('p2', 'ghost', players, false)).toThrow();
    expect(() => validateVote('ghost', 'p2', players, false)).toThrow();
  });

  it('يقبل صوتًا صالحًا', () => {
    expect(() => validateVote('p2', 'p3', players, false)).not.toThrow();
  });
});

describe('جمع الأصوات', () => {
  it('يحسب الأصوات ويحدد الأعلى', () => {
    const tally = tallyVotes({ p1: 'p3', p2: 'p3', p3: 'p1', p4: 'p3', p5: 'p2', p6: 'p1' });
    expect(tally.counts).toEqual({ p3: 3, p1: 2, p2: 1 });
    expect(tally.topVoted).toEqual(['p3']);
    expect(tally.totalVotes).toBe(6);
  });

  it('يعيد كل المتعادلين عند التعادل', () => {
    const tally = tallyVotes({ p1: 'p3', p2: 'p4', p3: 'p4', p4: 'p3', p5: 'p6', p6: 'p5' });
    expect(tally.topVoted).toEqual(['p3', 'p4']);
  });

  it('يعيد تعادلًا ثلاثيًا كاملًا', () => {
    const tally = tallyVotes({ p1: 'p2', p2: 'p3', p3: 'p4', p4: 'p2', p5: 'p3', p6: 'p4' });
    expect(tally.topVoted).toEqual(['p2', 'p3', 'p4']);
  });

  it('يتجاهل اللاعبين المنقطعين الذين لم يصوّتوا', () => {
    const tally = tallyVotes({ p1: 'p3', p2: 'p3' });
    expect(tally.totalVotes).toBe(2);
    expect(tally.topVoted).toEqual(['p3']);
  });

  it('يعيد قائمة فارغة إن لم يصوّت أحد', () => {
    expect(tallyVotes({}).topVoted).toEqual([]);
  });
});

describe('شروط الفوز', () => {
  it('يفوز الفريق إذا كُشف المُخفي', () => {
    const secrets = SIX();
    expect(decideWinner(['p1'], secrets)).toBe('team');
  });

  it('يفوز الفريق إذا كان المُخفي أحد المتعادلين', () => {
    const secrets = SIX();
    expect(decideWinner(['p1', 'p4'], secrets)).toBe('team');
  });

  it('يفوز المُخفي إذا لم يُكشف', () => {
    const secrets = SIX();
    expect(decideWinner(['p4'], secrets)).toBe('hiders');
    expect(decideWinner([], secrets)).toBe('hiders');
  });

  it('كشف متعاون وحده لا يكفي لفوز الفريق', () => {
    const secrets = applyAccomplices(prepareAccompliceStage(SIX(), 6), ['p5'], 6);
    expect(secrets.p5!.role).toBe('accomplice');
    expect(decideWinner(['p5'], secrets)).toBe('hiders');
    expect(decideWinner(['p5', 'p1'], secrets)).toBe('team');
  });

  it('في وضع الأربعة المعادلة كشف المُخفي أم لا', () => {
    const secrets = build(4, 'p2', { p1: [1, 2], p2: [3, 4], p3: [5, 6], p4: [2, 5] });
    expect(decideWinner(['p2'], secrets)).toBe('team');
    expect(decideWinner(['p3'], secrets)).toBe('hiders');
  });
});

describe('نتيجة الجولة الكاملة', () => {
  it('تجمع الأدوار والمواعيد والأصوات', () => {
    const players = makePlayers(6);
    const secrets = applyAccomplices(
      prepareAccompliceStage(
        build(6, 'p1', { p1: [3], p2: [3], p3: [2], p4: [4], p5: [5], p6: [6] }),
        6,
      ),
      ['p6'],
      6,
    );
    const votes = { p1: 'p4', p2: 'p4', p3: 'p1', p4: 'p1', p5: 'p1', p6: 'p3' };
    const results = buildResults(secrets, votes, players);

    expect(results.hiderId).toBe('p1');
    expect(results.accompliceIds).toEqual(['p6']);
    expect(results.tally.topVoted).toEqual(['p1']);
    expect(results.winner).toBe('team');
    expect(results.reveal).toHaveLength(6);

    const p1 = results.reveal.find((r) => r.playerId === 'p1')!;
    expect(p1.role).toBe('hider');
    expect(p1.effectiveSlots).toEqual([3]);
    expect(p1.wokeWith).toEqual(['p2']);
    expect(p1.votedFor).toBe('p4');

    const p3 = results.reveal.find((r) => r.playerId === 'p3')!;
    expect(p3.soloSlots).toEqual([2]);
  });
});
