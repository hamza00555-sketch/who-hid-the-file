// @vitest-environment jsdom

/**
 * أي مصدر ينطق كل جملة: ملف مسجَّل أم TTS المتصفح؟
 *
 * هذا الاختيار لا يظهر في شاشة ولا يكشفه تشغيل اللعبة: الجملة تُسمع في
 * الحالتين. لو انكسر مسار الملفات لظلّ TTS يعمل بهدوء، ولاكتُشف الأمر **بعد**
 * توليد 138 ملفًّا ودفع ثمنها. هذه الاختبارات هي ما يمسكه قبل ذلك.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../AudioManager';
import { GAME_CONFIG } from '../../config/game.config';

/** يسجّل كل ملف طُلب تشغيله، ويُنهيه فورًا حتى لا ينتظر الطابور. */
function stubAudio(): string[] {
  const played: string[] = [];
  class FakeAudio {
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    volume = 1;
    constructor(public src: string) {}
    play() {
      played.push(this.src);
      queueMicrotask(() => this.onended?.());
      return Promise.resolve();
    }
  }
  vi.stubGlobal('Audio', FakeAudio);
  return played;
}

/** يجعل مجموعة مسارات «موجودة» وما عداها مفقودًا. */
function stubFetch(present: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: present.includes(url),
      headers: { get: () => (present.includes(url) ? 'audio/mpeg' : 'text/html') },
    })),
  );
}

const spoken: string[] = [];

beforeEach(() => {
  spoken.length = 0;
  vi.stubGlobal('speechSynthesis', {
    cancel: () => {},
    getVoices: () => [],
    speak: (utterance: { text: string; onend?: () => void }) => {
      spoken.push(utterance.text);
      queueMicrotask(() => utterance.onend?.());
    },
  });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

const LINE = { id: 'night.start.1', text: 'بدأ الليل.', pauseAfter: 0, audioSrc: 'night.start.1.mp3' };

describe('اختيار مصدر النطق', () => {
  it('الصوت المختار يحدّد المجلّد، لا الجملة', async () => {
    vi.spyOn(GAME_CONFIG, 'hasRecordedVoice', 'get').mockReturnValue(true);
    const played = stubAudio();
    stubFetch(['/audio/female/night.start.1.mp3']);

    const manager = new AudioManager();
    manager.configure({ enabled: true, rate: 1, volume: 1, voice: 'female' });
    await manager.play([LINE]);

    expect(played).toEqual(['/audio/female/night.start.1.mp3']);
    expect(spoken).toEqual([]);
  });

  it('ملف مفقود لصوت واحد لا يُسحب من مجلّد الصوت الآخر', async () => {
    vi.spyOn(GAME_CONFIG, 'hasRecordedVoice', 'get').mockReturnValue(true);
    const played = stubAudio();
    // الرجالي موجود، والنسائي لا
    stubFetch(['/audio/male/night.start.1.mp3']);

    const manager = new AudioManager();
    manager.configure({ enabled: true, rate: 1, volume: 1, voice: 'female' });
    await manager.play([LINE]);

    expect(played).toEqual([]);
    expect(spoken).toEqual(['بدأ الليل.']); // يسقط إلى TTS لا إلى صوت الرجل
  });

  it('بلا ملفات مسجّلة يبقى TTS — وهو وضع اللعبة اليوم', async () => {
    vi.spyOn(GAME_CONFIG, 'hasRecordedVoice', 'get').mockReturnValue(false);
    const played = stubAudio();
    stubFetch(['/audio/male/night.start.1.mp3']);

    const manager = new AudioManager();
    manager.configure({ enabled: true, rate: 1, volume: 1, voice: 'male' });
    await manager.play([LINE]);

    expect(played).toEqual([]);
    expect(spoken).toEqual(['بدأ الليل.']);
  });

  it('تبديل الصوت أثناء الجلسة يبدّل المجلّد فورًا', async () => {
    vi.spyOn(GAME_CONFIG, 'hasRecordedVoice', 'get').mockReturnValue(true);
    const played = stubAudio();
    stubFetch(['/audio/male/night.start.1.mp3', '/audio/female/night.start.1.mp3']);

    const manager = new AudioManager();
    manager.configure({ enabled: true, rate: 1, volume: 1, voice: 'male' });
    await manager.play([LINE]);
    manager.configure({ voice: 'female' });
    await manager.play([LINE]);

    expect(played).toEqual([
      '/audio/male/night.start.1.mp3',
      '/audio/female/night.start.1.mp3',
    ]);
  });
});
