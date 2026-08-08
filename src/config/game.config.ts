/**
 * الإعدادات المركزية للعبة.
 *
 * كل اسم أو مصطلح أو رقم قابل للتغيير من هنا. الشاشات والصوت والقواعد
 * كلها تقرأ من هذا الملف — لا تكتب اسم اللعبة أو مصطلحاتها في أي مكان آخر.
 */

export type SlotNaming = 'nights' | 'hours';

export const GAME_CONFIG = {
  /** الاسم مؤقت وقابل للتعديل */
  name: 'الملف المفقود',
  tagline: 'الملف كان هنا قبل قليل… فمن أخفاه؟',
  /** الجهة المالكة — يُعرض كنص فقط، لا يوجد شعار مخترع */
  owner: 'قوسي — التأمينات الاجتماعية السعودية',

  players: {
    min: 4,
    max: 8,
  },

  /** العنصر الفيزيائي في منتصف الطاولة */
  prop: {
    name: 'الملف',
    nameWithArticle: 'الملف',
    placeInstruction: 'ضعوا الملف في منتصف الطاولة',
  },

  roles: {
    hider: { label: 'مُخفي الملف', short: 'المُخفي' },
    member: { label: 'عضو الفريق', short: 'عضو' },
    accomplice: { label: 'المتعاون', short: 'متعاون' },
  },

  /** مصطلح مواعيد الاستيقاظ — موحّد في كل النصوص والصوت */
  slotNaming: 'nights' as SlotNaming,

  /**
   * التسجيلات موجودة في `public/audio/{male|female}/` — صوتان معتمدان بعد
   * الاستماع: Hugo للرجل وElena للمرأة، من ElevenLabs multilingual v2.
   *
   * `true` تعني أن المدير يجلب الملف أولًا ويعود إلى TTS إن تعذّر — فمن يفتح
   * اللعبة بلا شبكة أو بملف ناقص يسمع صوتًا آليًا، لا صمتًا.
   *
   * النوع `boolean` صراحةً لا `true`: الملف كلّه `as const`، فبدون التصريح
   * يستنتج TypeScript النوع الحرفي — ويصير قلب العلم في أي اتجاه خطأ ترجمة،
   * ومقارنته في أي اختبار مستحيلة.
   */
  hasRecordedVoice: true as boolean,

  defaults: {
    diceMode: 'digital' as 'digital' | 'physical',
    nightCountdownSeconds: 14,
    nightStageLeadInSeconds: 4,
    discussionSeconds: 180,
    voiceEnabled: true,
    musicEnabled: true,
    hostPlays: false,
    narratorVoice: 'male' as 'male' | 'female',
    narratorSource: 'recorded' as 'recorded' | 'tts',
    ttsRate: 0.82,
  },

  /**
   * نافذة القراءة بعد كشف موعد الجار.
   *
   * تبدأ من لحظة وصول المعلومة لا من فتح الموعد: ثوانيه صُرفت في الانتباه
   * والقراءة والضغط ورحلة اللمسة. من دون هذه النافذة يظهر الموعد والعدّ في
   * آخره، فيُغلق الليل قبل أن يُقرأ.
   */
  nightReadSeconds: 9,

  /** موسيقى ما قبل الجولة — تدور في الردهة على جهاز المضيف وحده */
  lobbyMusicSrc: '/audio/music/lobby.mp3',

  /** رمز الجلسة: حروف واضحة بلا التباس بصري */
  roomCode: {
    length: 4,
    alphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  },
} as const;

const NIGHT_LABELS = [
  'الليلة الأولى',
  'الليلة الثانية',
  'الليلة الثالثة',
  'الليلة الرابعة',
  'الليلة الخامسة',
  'الليلة السادسة',
] as const;

const HOUR_LABELS = [
  'الساعة الواحدة',
  'الساعة الثانية',
  'الساعة الثالثة',
  'الساعة الرابعة',
  'الساعة الخامسة',
  'الساعة السادسة',
] as const;

/** اسم موعد الاستيقاظ رقم slot (1..6) حسب المصطلح المختار */
export function slotLabel(slot: number, naming: SlotNaming = GAME_CONFIG.slotNaming): string {
  const labels = naming === 'hours' ? HOUR_LABELS : NIGHT_LABELS;
  return labels[slot - 1] ?? `الموعد ${slot}`;
}

/** «أصحاب الليلة الأولى» / «أصحاب الساعة الواحدة» */
export function slotCallLabel(slot: number, naming: SlotNaming = GAME_CONFIG.slotNaming): string {
  return `أصحاب ${slotLabel(slot, naming)}`;
}
