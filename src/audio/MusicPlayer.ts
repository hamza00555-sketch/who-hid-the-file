/**
 * موسيقى الردهة — تعمل على **جهاز المضيف وحده**، كما الراوي.
 *
 * منفصلة عن `AudioManager` عمدًا: ذاك طابور جُمَل متتابعة ينتظرها الليل، وهذه
 * فراش يدور بلا نهاية تحت حديث الطاولة. دمجهما كان سيُعقّد الاثنين — إيقاف
 * جملة لا يشبه خفض موسيقى.
 */

const FADE_STEP_MS = 60;

export class MusicPlayer {
  private element: HTMLAudioElement | null = null;
  private fadeTimer: number | null = null;
  private wantedSrc: string | null = null;
  /** مستمع اللمسة المؤجَّل حين يرفض المتصفّح التشغيل التلقائي */
  private gestureCleanup: (() => void) | null = null;

  constructor(private volume = 0.32) {}

  setVolume(value: number) {
    this.volume = value;
    if (this.element && this.wantedSrc) this.element.volume = value;
  }

  /**
   * يبدأ التشغيل بتلاشٍ صاعد، ويكرّر بلا نهاية.
   *
   * الرفض هنا متوقَّع لا استثنائي: المتصفّح يمنع الصوت قبل لمسة من المستخدم،
   * وشاشة الردهة قد تُفتح من رابط محفوظ بلا لمسة سابقة. فيُنتظر أول لمسة ثم
   * يُعاد — بدل صمتٍ لا يفسّر نفسه.
   */
  play(src: string) {
    this.wantedSrc = src;
    const audio = this.ensure();

    if (audio.src !== new URL(src, window.location.href).href) {
      audio.src = src;
    }
    audio.loop = true;
    audio.volume = 0;

    audio.play().then(
      () => this.fadeTo(this.volume),
      () => this.retryOnGesture(),
    );
  }

  /** يخفت ثم يتوقف — القطع المفاجئ يُسمع كعطل. */
  stop() {
    this.wantedSrc = null;
    this.clearGesture();
    const audio = this.element;
    if (!audio) return;
    this.fadeTo(0, () => {
      audio.pause();
      audio.currentTime = 0;
    });
  }

  private ensure(): HTMLAudioElement {
    if (!this.element) {
      this.element = new Audio();
      this.element.preload = 'auto';
    }
    return this.element;
  }

  private fadeTo(target: number, done?: () => void) {
    const audio = this.element;
    if (!audio) return;
    if (this.fadeTimer != null) window.clearInterval(this.fadeTimer);

    // نحو ثمانمئة مللي ثانية للتلاشي الكامل مهما كان الفارق
    const step = Math.max(0.02, Math.abs(target - audio.volume) / 13);
    this.fadeTimer = window.setInterval(() => {
      const gap = target - audio.volume;
      if (Math.abs(gap) <= step) {
        audio.volume = target;
        if (this.fadeTimer != null) window.clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        done?.();
        return;
      }
      audio.volume = Math.min(1, Math.max(0, audio.volume + Math.sign(gap) * step));
    }, FADE_STEP_MS);
  }

  private retryOnGesture() {
    this.clearGesture();
    const retry = () => {
      // ألغى المستخدم الموسيقى بين الرفض واللمسة
      if (!this.wantedSrc) return this.clearGesture();
      this.clearGesture();
      this.play(this.wantedSrc);
    };
    const events = ['pointerdown', 'touchend', 'keydown'] as const;
    for (const event of events) window.addEventListener(event, retry, { once: true, passive: true });
    this.gestureCleanup = () => {
      for (const event of events) window.removeEventListener(event, retry);
      this.gestureCleanup = null;
    };
  }

  private clearGesture() {
    this.gestureCleanup?.();
  }
}

export const musicPlayer = new MusicPlayer();
