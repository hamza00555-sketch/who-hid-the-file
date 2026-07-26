/**
 * جدول القواعد حسب عدد اللاعبين — المصدر الوحيد لكل فرق بين الأعداد.
 * أي سؤال «ماذا يحدث عند N لاعبين؟» يُجاب من هنا، لا من داخل الشاشات.
 *
 * راجع GAME_RULES.md §4 و §5.
 */

export type AccompliceMode = 'none' | 'witness' | 'chosen';

export interface CountRules {
  playerCount: number;
  /** كم نتيجة نرد يحصل عليها كل لاعب */
  dicePerPlayer: 1 | 2;
  /** هل يختار عضو الفريق واحدة من نتيجتيه (وضع الأربعة) */
  memberChoosesSlot: boolean;
  /** هل يستيقظ المُخفي عند كل نتائجه */
  hiderUsesAllDice: boolean;
  /** كم متعاونًا في الجولة كحد أقصى */
  accompliceCount: 0 | 1 | 2;
  accompliceMode: AccompliceMode;
  /** هل يُسمح بفحص الجار للمنفردين */
  inspectionEnabled: boolean;
  /** هل يعرف المتعاون هوية المُخفي */
  accompliceKnowsHider: boolean;
  /** هل يعرف المتعاونان بعضهما */
  accomplicesKnowEachOther: boolean;
}

const TABLE: Record<number, CountRules> = {
  4: {
    playerCount: 4,
    dicePerPlayer: 2,
    memberChoosesSlot: true,
    hiderUsesAllDice: true,
    accompliceCount: 0,
    accompliceMode: 'none',
    inspectionEnabled: false,
    accompliceKnowsHider: false,
    accomplicesKnowEachOther: false,
  },
  5: {
    playerCount: 5,
    dicePerPlayer: 1,
    memberChoosesSlot: false,
    hiderUsesAllDice: false,
    accompliceCount: 1,
    accompliceMode: 'witness',
    inspectionEnabled: true,
    accompliceKnowsHider: true,
    accomplicesKnowEachOther: false,
  },
  6: {
    playerCount: 6,
    dicePerPlayer: 1,
    memberChoosesSlot: false,
    hiderUsesAllDice: false,
    accompliceCount: 1,
    accompliceMode: 'chosen',
    inspectionEnabled: true,
    accompliceKnowsHider: true,
    accomplicesKnowEachOther: false,
  },
  7: {
    playerCount: 7,
    dicePerPlayer: 1,
    memberChoosesSlot: false,
    hiderUsesAllDice: false,
    accompliceCount: 2,
    accompliceMode: 'chosen',
    inspectionEnabled: true,
    accompliceKnowsHider: false,
    accomplicesKnowEachOther: true,
  },
  8: {
    playerCount: 8,
    dicePerPlayer: 1,
    memberChoosesSlot: false,
    hiderUsesAllDice: false,
    accompliceCount: 2,
    accompliceMode: 'chosen',
    inspectionEnabled: true,
    accompliceKnowsHider: true,
    accomplicesKnowEachOther: true,
  },
};

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 8;

export function rulesFor(playerCount: number): CountRules {
  const rules = TABLE[playerCount];
  if (!rules) {
    throw new Error(
      `عدد لاعبين غير مدعوم: ${playerCount}. المدعوم من ${MIN_PLAYERS} إلى ${MAX_PLAYERS}.`,
    );
  }
  return rules;
}

export function isSupportedPlayerCount(playerCount: number): boolean {
  return playerCount in TABLE;
}
