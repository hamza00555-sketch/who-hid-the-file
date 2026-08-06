/**
 * جدول القواعد حسب عدد اللاعبين — المصدر الوحيد لكل فرق بين الأعداد.
 * أي سؤال «ماذا يحدث عند N لاعبين؟» يُجاب من هنا، لا من داخل الشاشات.
 *
 * راجع GAME_RULES.md §4 و §5.
 */

export interface CountRules {
  playerCount: number;
  /** كم نتيجة نرد يحصل عليها كل لاعب */
  dicePerPlayer: 1 | 2;
  /** هل يختار عضو الفريق واحدة من نتيجتيه (وضع الأربعة) */
  memberChoosesSlot: boolean;
  /** هل يستيقظ المُخفي عند كل نتائجه */
  hiderUsesAllDice: boolean;
  /** كم متعاونًا يختار المُخفي في آخر الليل — واحد على الأقل، اثنان على الأكثر */
  accompliceCount: 1 | 2;
  /** هل يُسمح بفحص الجار للمنفردين */
  inspectionEnabled: boolean;
  /** هل يعرف المتعاون هوية المُخفي */
  accompliceKnowsHider: boolean;
  /** هل يعرف المتعاونان بعضهما */
  accomplicesKnowEachOther: boolean;
}

/*
  ── عدد المتعاونين ──

  القاعدة المطلوبة: لكل جولة متعاون واحد على الأقل واثنان على الأكثر، والعدد
  يتبع عدد اللاعبين الكلي. فالمصفوفة كلها `chosen`: المُخفي هو من يختار، ولا
  تعيين تلقائي بالمشاهدة.

  4 لاعبين هو الطرف الحادّ: مُخفٍ ومتعاون في مواجهة عضوين. القاعدة صريحة
  («أقل شيء متعاون واحد») فتُطبَّق كما هي، ويبقى التوازن رهن التجربة.
*/
const TABLE: Record<number, CountRules> = {
  4: {
    playerCount: 4,
    dicePerPlayer: 2,
    memberChoosesSlot: true,
    hiderUsesAllDice: false,
    accompliceCount: 1,
    inspectionEnabled: true,
    accompliceKnowsHider: true,
    accomplicesKnowEachOther: false,
  },
  5: {
    playerCount: 5,
    dicePerPlayer: 1,
    memberChoosesSlot: false,
    hiderUsesAllDice: false,
    accompliceCount: 1,
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
