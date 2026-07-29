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
}

export class AudioManager {
  private queue: VoiceLine[] = [];
  private speaking = false;
  private cancelled = false;
  private captionListeners = new Set<CaptionListener>();
  private currentAudio: HTMLAudioElement | null = null;
  private availableFiles = new Map<string, boolean>();
  private settings: AudioSettings = { enabled: true, rate: 0.82, volume: 1, voice: 'male' };

  /** هل يوجد أي محرك نطق أصلًا؟ تُستخدم لعرض تحذير للمضيف. */
  static ttsAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  configure(settings: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...settings };
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
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (AudioManager.ttsAvailable()) window.speechSynthesis.cancel();
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  private async speakLine(line: VoiceLine): Promise<void> {
    if (!this.settings.enabled) return;

    const src = this.srcFor(line);
    if (src && (await this.hasFile(src))) {
      await this.playFile(src);
      return;
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

  private playFile(src: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio(src);
      audio.volume = this.settings.volume;
      this.currentAudio = audio;
      const done = () => {
        this.currentAudio = null;
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.play().catch(done);
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
