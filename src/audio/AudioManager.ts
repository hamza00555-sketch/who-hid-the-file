/**
 * مدير الصوت المركزي — يعمل على **جهاز المضيف وحده**.
 *
 * ترتيب مصادر النطق لكل جملة:
 *   1. ملف مسجّل في `public/audio/{id}.mp3` إن وُجد.
 *   2. Web Speech API بصوت عربي إن توفّر.
 *   3. لا شيء — يظل النص معروضًا كـ Caption ولا تتعطل اللعبة.
 *
 * التوقيت لا يعتمد على نجاح النطق: كل جملة لها `pauseAfter` يحترمه المدير
 * سواء نُطقت أم لا، فلا تنهار مراحل الليل إذا غاب TTS.
 */

import { GAME_CONFIG } from '../config/game.config';
import type { NarratorVoice } from '../game/types';
import type { VoiceLine } from './script.ar';

type CaptionListener = (caption: string | null) => void;

export interface AudioSettings {
  enabled: boolean;
  rate: number;
  volume: number;
  /** أي راوٍ مسجَّل يُستعمل — يحدّد المجلّد تحت `public/audio/` */
  voice: NarratorVoice;
  /** التسجيلات المعتمدة أم صوت الجهاز الآلي */
  source: NarratorSource;
}

export type NarratorSource = 'recorded' | 'tts';

/*
  ملف صوتي صامت صالح (WAV بلا عيّنات). يُشغَّل مرّة داخل لمسة المستخدم ليفتح
  الإذن — راجع `unlock`.
*/
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

export class AudioManager {
  private queue: VoiceLine[] = [];
  private speaking = false;
  private cancelled = false;
  private captionListeners = new Set<CaptionListener>();
  private availableFiles = new Map<string, boolean>();
  private settings: AudioSettings = {
    enabled: true,
    rate: 0.82,
    volume: 1,
    voice: 'male',
    source: 'recorded',
  };

  /*
    ── عنصر صوت واحد لكل الجمل ──

    كان لكل جملة `new Audio(src)` خاصّ بها، وهذا لا يعمل على iOS: المتصفح
    يسمح بالتشغيل لعنصرٍ **فُتح إذنه داخل لمسة مستخدم**، وكل عنصر جديد
    يُنشأ بعدها يبدأ مقفلًا. النتيجة راوٍ يسكت في أغلب الجمل بلا خطأ ظاهر —
    لأن `play()` تُرجع وعدًا مرفوضًا كنّا نبتلعه.

    فعنصر واحد يُفتح إذنه مرّة، ثم يُبدَّل `src` فيه لكل جملة.
  */
  private element: HTMLAudioElement | null = null;
  private unlocked = false;
  /** رُفض تشغيل التسجيلات فعليًا — لا تُعاد المحاولة كل جملة */
  private recordedBlocked = false;

  /** هل يوجد أي محرك نطق أصلًا؟ تُستخدم لعرض تحذير للمضيف. */
  static ttsAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  configure(settings: Partial<AudioSettings>) {
    // تبديل الراوي يستحق محاولة جديدة: القفل قد يكون خصّ الصوت السابق وحده
    if (settings.source && settings.source !== this.settings.source) {
      this.recordedBlocked = false;
    }
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * يفتح إذن الصوت. **يجب أن يُنادى من داخل معالج لمسة أو ضغطة**، وإلا رفضه
   * المتصفح بصمت. النداء المتكرر بلا كلفة.
   */
  unlock(): void {
    if (this.unlocked || typeof window === 'undefined') return;
    const element = this.ensureElement();
    element.src = SILENCE;
    element.play().then(
      () => {
        this.unlocked = true;
      },
      () => {
        /* لمسة أخرى ستأتي — الزر التالي في اللعبة */
      },
    );
  }

  get audioUnlocked(): boolean {
    return this.unlocked;
  }

  private ensureElement(): HTMLAudioElement {
    if (!this.element) {
      this.element = new Audio();
      this.element.preload = 'auto';
    }
    return this.element;
  }

  onCaption(listener: CaptionListener): () => void {
    this.captionListeners.add(listener);
    return () => this.captionListeners.delete(listener);
  }

  private emitCaption(caption: string | null) {
    this.captionListeners.forEach((listener) => listener(caption));
  }

  /** يشغّل تسلسل جمل بالترتيب. يلغي أي تسلسل جارٍ. */
  async play(lines: VoiceLine[]): Promise<void> {
    this.stop();

    /*
      ── راوٍ مُطفأ لا يمرّ من هنا إطلاقًا ──

      كان التسلسل يمشي كاملًا مع الصوت مُطفأ: لا نطق، لكن الجمل تُعرض واحدةً
      واحدة وتُنتظر مُهَلها. فيبقى على الشاشة سطرٌ لم يُقَل، وتتأخّر المرحلة
      بثوانٍ بلا سبب.
      وأسوأ من ذلك أن `stop()` من الخارج لا يُنقذ: أول سطر هنا كان يُصفّر
      الإلغاء، فأيّ إيقاف يسبق البدء يضيع.
    */
    if (!this.settings.enabled) {
      this.emitCaption(null);
      return;
    }

    this.cancelled = false;
    this.queue = [...lines];
    this.speaking = true;

    for (const line of this.queue) {
      if (this.cancelled) break;
      this.emitCaption(line.text);
      await this.speakLine(line);
      if (this.cancelled) break;
      await wait(line.pauseAfter ?? 600);
    }

    this.speaking = false;
    if (!this.cancelled) this.emitCaption(null);
  }

  /** يعيد نطق آخر جملة — زر «أعد الجملة» عند المضيف. */
  async repeat(line: VoiceLine): Promise<void> {
    await this.play([line]);
  }

  stop() {
    this.cancelled = true;
    this.queue = [];
    this.speaking = false;
    if (this.element) this.element.pause();
    if (AudioManager.ttsAvailable()) window.speechSynthesis.cancel();
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /**
   * جملة واحدة: التسجيل أولًا، والصوت الآلي احتياطًا **لهذه الجملة نفسها**.
   *
   * السقوط إلى الاحتياط لا إلى الصمت هو الفرق كلّه: راوٍ آليّ خشن أفضل من
   * جملة تمرّ بلا صوت والطاولة تنتظر أمرًا لم يُقَل.
   */
  private async speakLine(line: VoiceLine): Promise<void> {
    if (!this.settings.enabled) return;

    const src = this.srcFor(line);
    if (src && (await this.hasFile(src))) {
      if (await this.playFile(src)) return;
      this.recordedBlocked = true;
    }
    await this.speakTts(line.text);
  }

  /**
   * مسار الجملة المسجّلة للصوت المختار حاليًا.
   *
   * الصوت جزء من المسار لا من الجملة، فتبديل الراوي في الإعدادات يبدّل
   * المجلّد وحده. و`availableFiles` مفتاحه المسار الكامل، فلا يتسرّب فحص
   * صوت إلى صوت آخر.
   */
  private srcFor(line: VoiceLine): string | null {
    if (!GAME_CONFIG.hasRecordedVoice || !line.audioSrc) return null;
    if (this.settings.source !== 'recorded' || this.recordedBlocked) return null;
    return `/audio/${this.settings.voice}/${line.audioSrc}`;
  }

  private async hasFile(src: string): Promise<boolean> {
    const cached = this.availableFiles.get(src);
    if (cached !== undefined) return cached;
    try {
      const response = await fetch(src, { method: 'HEAD' });
      const ok = response.ok && (response.headers.get('content-type') ?? '').includes('audio');
      this.availableFiles.set(src, ok);
      return ok;
    } catch {
      this.availableFiles.set(src, false);
      return false;
    }
  }

  /**
   * يعيد `true` إن سُمع الملف فعلًا، و`false` إن مُنع أو تعذّر.
   *
   * ── الحارس الزمني ──
   *
   * مراحل الليل تنتظر هذا الوعد. وحدث `ended` قد لا يصل إطلاقًا: جهاز بلا
   * مَخرج صوت، أو ملف تعثّر فكّه، أو تبويب خُفض في الخلفية. بلا حارس تتجمّد
   * الجولة كلها عند جملة واحدة — والطاولة تنتظر أمرًا لن يأتي.
   *
   * المهلة من طول المقطع نفسه حين يُعرَف، وبسقف ثابت حين لا يُعرَف.
   */
  private playFile(src: string): Promise<boolean> {
    const audio = this.ensureElement();
    audio.volume = this.settings.volume;
    audio.src = src;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let guard = window.setTimeout(() => finish(true), 9000);

      function finish(ok: boolean) {
        if (settled) return;
        settled = true;
        window.clearTimeout(guard);
        audio.onended = null;
        audio.onerror = null;
        audio.onloadedmetadata = null;
        resolve(ok);
      }

      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      audio.onloadedmetadata = () => {
        if (settled || !Number.isFinite(audio.duration)) return;
        window.clearTimeout(guard);
        guard = window.setTimeout(() => finish(true), audio.duration * 1000 + 1500);
      };

      audio.play().then(
        () => {
          this.unlocked = true;
        },
        // الرفض هنا هو حظر التشغيل التلقائي — لا صمت بل عودة إلى الاحتياط
        () => finish(false),
      );
    });
  }

  private speakTts(text: string): Promise<void> {
    if (!AudioManager.ttsAvailable()) return Promise.resolve();

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ar-SA';
      utterance.rate = this.settings.rate;
      utterance.volume = this.settings.volume;
      utterance.pitch = 0.95;

      const arabicVoice = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.startsWith('ar'));
      if (arabicVoice) utterance.voice = arabicVoice;

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      utterance.onend = finish;
      utterance.onerror = finish;

      // حارس: بعض المتصفحات لا تُطلق onend إطلاقًا.
      const guardMs = Math.min(14000, 1400 + text.length * 110);
      window.setTimeout(finish, guardMs);

      window.speechSynthesis.speak(utterance);
    });
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export const audioManager = new AudioManager();
