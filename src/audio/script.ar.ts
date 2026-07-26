/**
 * النص الصوتي العربي الكامل — المصدر الوحيد لكل جملة ينطقها الجهاز الرئيسي.
 *
 * قواعد الكتابة:
 * - جمل قصيرة وبطيئة وواضحة، تُقرأ بصوت مسموع حول طاولة.
 * - **لا كلمة واحدة تكشف دورًا**: لا «اللص»، لا «من أخذ»، لا «المذنب».
 * - المصطلح موحّد ويأتي من `slotLabel` في game.config.ts.
 *
 * لاستبدال TTS بتسجيلات بشرية: ضع الملفات في `public/audio/` بنفس الـ id
 * (مثلًا `public/audio/night.open.1.mp3`) وسيستخدمها المدير تلقائيًا.
 */

import { slotCallLabel, GAME_CONFIG, type SlotNaming } from '../config/game.config';

export interface VoiceLine {
  id: string;
  text: string;
  /** توقف بعد الجملة بالمللي ثانية — إيقاع التقديم */
  pauseAfter?: number;
  /** ملف مسجّل إن وُجد */
  audioSrc?: string;
}

function line(id: string, text: string, pauseAfter = 700): VoiceLine {
  return { id, text, pauseAfter, audioSrc: `/audio/${id}.mp3` };
}

export function buildScript(naming: SlotNaming = GAME_CONFIG.slotNaming) {
  const call = (slot: number) => slotCallLabel(slot, naming);

  return {
    /* ── الترحيب والاستعداد ── */
    welcome: [
      line('welcome.1', `أهلًا بكم في ${GAME_CONFIG.name}.`, 900),
      line('welcome.2', 'اجلسوا حول الطاولة، وتأكدوا أن كل واحد منكم يمسك جهازه.', 1000),
    ],

    readyCheck: [
      line('ready.1', `${GAME_CONFIG.prop.placeInstruction}.`, 1100),
      line('ready.2', 'ضعوا أجهزتكم أمامكم، ووجّهوا الشاشات إلى الأسفل.', 1100),
      line('ready.3', 'ارفعوا صوت هذا الجهاز حتى يسمعه الجميع.', 1100),
      line('ready.4', 'عند سماع موعدكم، افتحوا أعينكم ونفّذوا بصمت.', 1200),
    ],

    /* ── بداية الليل ── */
    nightStart: [
      line('night.start.1', 'بدأ الليل.', 800),
      line('night.start.2', 'الجميع يغلق عينيه الآن.', 2400),
    ],

    /* ── إعلان كل مرحلة ── */
    slotOpen: (slot: number): VoiceLine[] => [
      line(`night.open.${slot}`, `${call(slot)}، افتحوا أعينكم الآن.`, 1400),
      line(`night.hint.${slot}.a`, 'إذا كان معكم أحد مستيقظ، تعرّفوا عليه جيدًا.', 1200),
      line(
        `night.hint.${slot}.b`,
        'وإذا كنتم وحدكم، ستصلكم معلومة بعد انتهاء الليل.',
        1000,
      ),
    ],

    slotClose: (slot: number): VoiceLine[] => [
      line(`night.close.${slot}`, 'أغلقوا أعينكم الآن.', 1800),
    ],

    countdownTick: (seconds: number): VoiceLine =>
      line(`count.${seconds}`, String(seconds), 0),

    /* ── نهاية الليل ── */
    nightEnd: [
      line('night.end.1', 'انتهى الليل… افتحوا أعينكم.', 2000),
      line('night.end.2', `${GAME_CONFIG.prop.nameWithArticle} اختفى!`, 1600),
    ],

    /* ── المرحلة السرية ── */
    secretActions: [
      line('secret.1', 'انظروا إلى أجهزتكم الآن، كل واحد إلى جهازه وحده.', 1200),
      line('secret.2', 'من لديه معلومة سيراها، ومن ليس لديه سيرى ذلك أيضًا.', 1400),
    ],

    /* ── النقاش ── */
    discussion: [
      line('talk.1', 'ابدؤوا النقاش.', 900),
      line('talk.2', 'تحدثوا عمّا شاهدتموه، أو عمّا تريدون أن يصدّقه الآخرون.', 1200),
      line('talk.3', 'لا تعرضوا شاشاتكم على أحد.', 1000),
    ],

    discussionEnding: [line('talk.end', 'اقترب وقت التصويت. أنهوا كلامكم.', 900)],

    /* ── التصويت ── */
    voting: [
      line('vote.1', 'وقت التصويت.', 900),
      line('vote.2', 'اختاروا على أجهزتكم من تظنون أنه فعلها.', 1200),
      line('vote.3', 'التصويت سري، ولا يمكن تغييره بعد التأكيد.', 1000),
    ],

    votingComplete: [line('vote.done', 'وصلت كل الأصوات.', 800)],

    /* ── الكشف ── */
    revealCountdown: [
      line('reveal.3', 'ثلاثة', 700),
      line('reveal.2', 'اثنان', 700),
      line('reveal.1', 'واحد', 700),
    ],

    teamWin: [
      line('result.team.1', `وجدتم ${GAME_CONFIG.roles.hider.label}!`, 1400),
      line('result.team.2', `عاد ${GAME_CONFIG.prop.nameWithArticle} إلى مكانه.`, 1200),
    ],

    hiderWin: [
      line('result.hider.1', 'نجحت الخطة…', 1200),
      line('result.hider.2', `ولم تعرفوا من أخفى ${GAME_CONFIG.prop.nameWithArticle}.`, 1400),
    ],

    /* ── حالات استثنائية ── */
    paused: [line('pause.1', 'توقفت الجولة مؤقتًا. انتظروا إشارة المضيف.', 1000)],
    resumed: [line('resume.1', 'نكمل من حيث توقفنا. الجميع يغلق عينيه.', 1600)],
    disconnected: [
      line('offline.1', 'انقطع أحد الأجهزة. لا تفتحوا أعينكم حتى يعود.', 1400),
    ],
  };
}

export type VoiceScript = ReturnType<typeof buildScript>;
