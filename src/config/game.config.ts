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
   * اجعلها `true` بعد وضع التسجيلات البشرية في `public/audio/`.
   * ما دامت `false` لا يحاول المدير جلب الملفات إطلاقًا ويكتفي بـ TTS.
   */
  hasRecordedVoice: false,

  defaults: {
    diceMode: 'digital' as 'digital' | 'physical',
    nightCountdownSeconds: 10,
    nightStageLeadInSeconds: 4,
    discussionSeconds: 180,
    voiceEnabled: true,
    ttsRate: 0.82,
    tableMode: false,
  },

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
