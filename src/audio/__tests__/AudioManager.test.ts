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

/**
 * عنصر صوت مزيّف يحاكي الحقيقي: يُنشأ فارغًا ويُبدَّل `src` فيه لكل جملة —
 * وهذا بالضبط ما يفعله المدير الآن، لأن ‏iOS يقفل كل عنصر جديد يُنشأ خارج
 * لمسة المستخدم.
 *
 * `blocked` يحاكي سياسة التشغيل التلقائي: `play()` تُرجع وعدًا **مرفوضًا**.
 */
function stubAudio(blocked = false): string[] {
  const played: string[] = [];
  class FakeAudio {
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    volume = 1;
    preload = '';
    src = '';
    pause() {}
    play() {
      if (blocked) return Promise.reject(new Error('NotAllowedError'));
      // الصمت الافتتاحي ليس جملة — لا يُحسب
      if (!this.src.startsWith('data:')) played.push(this.src);
      queueMicrotask(() => this.onended?.());
      return Promise.resolve();
    }
  }
  vi.stubGlobal('Audio', FakeAudio);
  return played;
}

/** يجعل مجموعة مسارات «موجودة» وما عداها مفقودًا. */
function stubFetch(present: string[]) {
  const spy = vi.fn(async (url: string) => ({
    ok: present.includes(url),
    headers: { get: () => (present.includes(url) ? 'audio/mpeg' : 'text/html') },
  }));
  vi.stubGlobal('fetch', spy);
  return spy;
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

const BASE = { enabled: true, rate: 1, volume: 1 } as const;

describe('اختيار مصدر النطق', () => {
  it('الصوت المختار يحدّد المجلّد، لا الجملة', async () => {
    vi.spyOn(GAME_CONFIG, 'hasRecordedVoice', 'get').mockReturnValue(true);
    const played = stubAudio();
    stubFetch(['/audio/female/night.start.1.mp3']);

    const manager = new AudioManager();
    manager.configure({ ...BASE, voice: 'female', source: 'recorded' });
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
    manager.configure({ ...BASE, voice: 'female', source: 'recorded' });
    await manager.play([LINE]);

    expect(played).toEqual([]);
    expect(spoken).toEqual(['بدأ الليل.']); // يسقط إلى TTS لا إلى صوت الرجل
  });

  it('بلا ملفات مسجّلة يبقى TTS — وهو وضع اللعبة اليوم', async () => {
    vi.spyOn(GAME_CONFIG, 'hasRecordedVoice', 'get').mockReturnValue(false);
    const played = stubAudio();
    stubFetch(['/audio/male/night.start.1.mp3']);

    const manager = new AudioManager();
    manager.configure({ ...BASE, voice: 'male', source: 'recorded' });
    await manager.play([LINE]);

    expect(played).toEqual([]);
    expect(spoken).toEqual(['بدأ الليل.']);
  });

  it('تبديل الصوت أثناء الجلسة يبدّل المجلّد فورًا', async () => {
    vi.spyOn(GAME_CONFIG, 'hasRecordedVoice', 'get').mockReturnValue(true);
    const played = stubAudio();
    stubFetch(['/audio/male/night.start.1.mp3', '/audio/female/night.start.1.mp3']);

    const manager = new AudioManager();
    manager.configure({ ...BASE, voice: 'male', source: 'recorded' });
    await manager.play([LINE]);
    manager.configure({ voice: 'female' });
    await manager.play([LINE]);

    expect(played).toEqual([
      '/audio/male/night.start.1.mp3',
      '/audio/female/night.start.1.mp3',
    ]);
  });
});

/*
  ── الحظر لا يعني الصمت ──

  سياسة التشغيل التلقائي ترفض `play()` بوعد مرفوض، وكان يُبتلع: تمرّ الجملة
  بلا صوت، والطاولة تنتظر أمرًا لم يُقَل. وهذا ما حدث فعلًا على الجوال — راوٍ
  ساكت في أغلب الجمل بلا خطأ يظهر لأحد.
*/
describe('حظر التشغيل التلقائي', () => {
  it('يسقط إلى صوت الجهاز بدل أن يمرّ صامتًا', async () => {
    vi.spyOn(GAME_CONFIG, 'hasRecordedVoice', 'get').mockReturnValue(true);
    const played = stubAudio(true);
    stubFetch(['/audio/male/night.start.1.mp3']);

    const manager = new AudioManager();
    manager.configure({ ...BASE, voice: 'male', source: 'recorded' });
    await manager.play([LINE]);

    expect(played).toEqual([]);
    expect(spoken).toEqual(['بدأ الليل.']);
  });

  it('لا يعيد المحاولة كل جملة بعد أول رفض', async () => {
    vi.spyOn(GAME_CONFIG, 'hasRecordedVoice', 'get').mockReturnValue(true);
    stubAudio(true);
    const fetchSpy = stubFetch(['/audio/male/night.start.1.mp3']);

    const manager = new AudioManager();
    manager.configure({ ...BASE, voice: 'male', source: 'recorded' });
    await manager.play([LINE, LINE, LINE]);

    expect(spoken).toEqual(['بدأ الليل.', 'بدأ الليل.', 'بدأ الليل.']);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // الجملتان التاليتان لم تسألا أصلًا
  });
});

/*
  ── جملة لا تنتهي توقف الجولة ──

  مراحل الليل تنتظر وعد النطق. وحدث `ended` قد لا يصل إطلاقًا: جهاز بلا مخرج
  صوت، أو ملف تعثّر فكّه، أو تبويب في الخلفية. بلا حارس زمني تتجمّد الجولة عند
  جملة واحدة — وهذا ما حدث حرفيًا في القيادة الآلية: الليل وقف عند أول جملة.
*/
describe('حارس زمني للملف الصامت', () => {
  it('يمضي بالجولة حين لا يصل حدث الانتهاء', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(GAME_CONFIG, 'hasRecordedVoice', 'get').mockReturnValue(true);
      // عنصر يبدأ التشغيل ولا يُنهيه أبدًا
      class DeafAudio {
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onloadedmetadata: (() => void) | null = null;
        duration = NaN;
        volume = 1;
        preload = '';
        src = '';
        pause() {}
        play() {
          return Promise.resolve();
        }
      }
      vi.stubGlobal('Audio', DeafAudio);
      stubFetch(['/audio/male/night.start.1.mp3']);

      const manager = new AudioManager();
      manager.configure({ ...BASE, voice: 'male', source: 'recorded' });

      let done = false;
      const playing = manager.play([LINE]).then(() => {
        done = true;
      });

      await vi.advanceTimersByTimeAsync(1000);
      expect(done).toBe(false); // ما زال ينتظر — لا يمرّ بلا سبب

      await vi.advanceTimersByTimeAsync(10000);
      await playing;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

/*
  وضع «بلا تعليق صوتي»: المضيف يقود الليل بلمسة، والراوي مُطفأ تمامًا. أي جملة
  تمرّ من الطابور هنا تعني سطرًا معروضًا لم يُقَل، ومهلةً تُنتظر بلا سبب.
*/
describe('راوٍ مُطفأ', () => {
  it('لا يُشغّل ملفًا ولا صوتًا ولا ينتظر مهلة', async () => {
    vi.spyOn(GAME_CONFIG, 'hasRecordedVoice', 'get').mockReturnValue(true);
    const played = stubAudio();
    stubFetch(['/audio/male/night.start.1.mp3']);

    const manager = new AudioManager();
    manager.configure({ ...BASE, enabled: false, voice: 'male', source: 'recorded' });

    const started = Date.now();
    await manager.play([
      { ...LINE, pauseAfter: 3000 },
      { ...LINE, pauseAfter: 3000 },
    ]);

    expect(played).toEqual([]);
    expect(spoken).toEqual([]);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('يمسح الجملة المعروضة بدل تركها معلّقة', async () => {
    const manager = new AudioManager();
    const captions: (string | null)[] = [];
    manager.onCaption((caption) => captions.push(caption));

    manager.configure({ ...BASE, voice: 'male', source: 'tts' });
    stubAudio();
    stubFetch([]);
    await manager.play([LINE]);
    expect(captions).toContain('بدأ الليل.');

    manager.configure({ enabled: false });
    await manager.play([LINE]);
    expect(captions.at(-1)).toBeNull();
  });
});

describe('مصدر النطق المختار في الإعدادات', () => {
  it('«صوت الجهاز» يتخطّى الملفات ولو كانت موجودة', async () => {
    vi.spyOn(GAME_CONFIG, 'hasRecordedVoice', 'get').mockReturnValue(true);
    const played = stubAudio();
    stubFetch(['/audio/male/night.start.1.mp3']);

    const manager = new AudioManager();
    manager.configure({ ...BASE, voice: 'male', source: 'tts' });
    await manager.play([LINE]);

    expect(played).toEqual([]);
    expect(spoken).toEqual(['بدأ الليل.']);
  });

  it('العودة إلى «التسجيلات» تُلغي أثر الحظر السابق', async () => {
    vi.spyOn(GAME_CONFIG, 'hasRecordedVoice', 'get').mockReturnValue(true);
    const played = stubAudio();
    stubFetch(['/audio/male/night.start.1.mp3']);

    const manager = new AudioManager();
    manager.configure({ ...BASE, voice: 'male', source: 'tts' });
    await manager.play([LINE]);
    manager.configure({ source: 'recorded' });
    await manager.play([LINE]);

    expect(played).toEqual(['/audio/male/night.start.1.mp3']);
  });
});
