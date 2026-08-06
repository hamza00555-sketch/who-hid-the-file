import { describe, expect, it } from 'vitest';
import { buildScript, type VoiceLine } from '../script.ar';
import type { DiceMode } from '../../game/types';

const script = buildScript('nights');

/** كل جملة يمكن أن ينطقها الراوي، في كل تركيبة إعدادات ممكنة. */
function everyLine(): VoiceLine[] {
  const out: VoiceLine[] = [];
  for (const naming of ['nights', 'hours'] as const) {
    const s = buildScript(naming);
    for (const value of Object.values(s)) {
      if (Array.isArray(value)) out.push(...value);
    }
    for (const slot of [1, 2, 3, 4, 5, 6] as const) {
      for (const mode of ['digital', 'physical'] as DiceMode[]) {
        out.push(...s.slotOpen(slot, mode));
      }
      out.push(...s.slotClose(slot));
    }
    for (const quota of [1, 2]) out.push(...s.accompliceCall(quota));
    for (const n of [3, 2, 1]) out.push(s.countdownTick(n));
  }
  return out;
}

/**
 * التعليمة التي يسمعها المستيقظ وحده هي الفرق الوحيد بين نمطي اللعب في الليل،
 * وخطؤها يجعل نصف الطاولة يبحث عن كوب غير موجود — أو ينتظر شاشة لا تظهر.
 */
describe('تعليمة الاستيقاظ تتبع طريقة اللعب', () => {
  it('نمط النرد والأكواب: يطلب رفع كوب الجار', () => {
    const text = script.slotOpen(3, 'physical').map((line) => line.text).join(' ');
    expect(text).toContain('كوب');
    expect(text).not.toContain('جهازكم');
  });

  it('النمط الرقمي: يوجّه إلى الجهاز ولا يذكر كوبًا', () => {
    const text = script.slotOpen(3, 'digital').map((line) => line.text).join(' ');
    expect(text).toContain('جهازكم');
    expect(text).not.toContain('كوب');
  });

  it('لعبة الأربعة: لا يَعِد الراوي بفحص لا وجود له', () => {
    for (const mode of ['digital', 'physical'] as DiceMode[]) {
      const text = script.slotOpen(3, mode, false).map((line) => line.text).join(' ');
      expect(text).not.toContain('وحدكم');
      expect(text).not.toContain('كوب');
      expect(text).not.toContain('جاريكم');
      // الجملتان الأوليان تبقيان: الاستيقاظ والتعرّف على من معك
      expect(script.slotOpen(3, mode, false)).toHaveLength(2);
    }
  });

  it('الافتراضي رقمي — النمط الافتراضي في الإعدادات', () => {
    expect(script.slotOpen(3).map((line) => line.text)).toEqual(
      script.slotOpen(3, 'digital').map((line) => line.text),
    );
  });

  it('معرّفات الجمل تختلف بين النمطين فلا يتصادم ملفّا الصوت المسجَّلان', () => {
    const physical = script.slotOpen(3, 'physical').map((line) => line.id);
    const digital = script.slotOpen(3, 'digital').map((line) => line.id);
    expect(physical).not.toEqual(digital);
    expect(new Set([...physical, ...digital]).size).toBe(physical.length + 1);
  });

  /*
    الليل كله يُنطق بصوت مسموع حول الطاولة. أي كلمة تسمّي دورًا تُفسد الجولة،
    ولا يكشفها اختبار منطق — هذا هو المكان الوحيد الذي يمسكها.
  */
  it('لا جملة ليلية تسمّي دورًا', () => {
    const forbidden = ['المخفي', 'المُخفي', 'اللص', 'المتعاون', 'العضو', 'الجاني'];
    const lines = [
      ...script.nightStart,
      ...script.nightEnd,
      ...([1, 2, 3, 4, 5, 6] as const).flatMap((slot) => [
        ...script.slotOpen(slot, 'digital'),
        ...script.slotOpen(slot, 'physical'),
        ...script.slotClose(slot),
      ]),
    ];
    for (const line of lines) {
      for (const word of forbidden) {
        expect(line.text, `«${line.text}» في ${line.id}`).not.toContain(word);
      }
    }
  });

  /*
    ── الاستثناء الوحيد ──

    نداء المتعاونين يسمّي دورًا ولا مفرّ: لا يمكن أن يُطلب من المُخفي أن يفتح
    عينيه دون مناداته. وهو آمن لأن الأعين مغلقة ومن يسمع النداء غير من ينفّذه.
    المحظور الحقيقي أن يُذكر **لاعب**: اسم أو رقم مقعد أو صفة تدلّ عليه.
  */
  it('نداء المتعاونين ينادي دورًا ولا يدلّ على لاعب', () => {
    for (const quota of [1, 2]) {
      const text = script.accompliceCall(quota).map((line) => line.text).join(' ');
      expect(text).toContain('افتح عينيك');
      for (const word of ['اسم', 'مقعد', 'رقم', 'يمين', 'يسار']) {
        expect(text).not.toContain(word);
      }
    }
    // الحصّتان نصّان مختلفان — وملفّان مختلفان
    expect(script.accompliceCall(1).map((line) => line.id)).not.toEqual(
      script.accompliceCall(2).map((line) => line.id),
    );
  });
});

/*
  الجمل تُسجَّل ملفات باسم المعرّف (`/audio/{voice}/{id}.mp3`). فإن حمل معرّف
  واحد نصّين مختلفين — بحسب مصطلح المواعيد أو طريقة اللعب — فملف واحد سيخدم
  نطقين، وسيسمع نصف الطاولة الجملة الخطأ.

  هذا العيب **لا يظهر مع TTS إطلاقًا** لأنه يقرأ النصّ الحيّ لا الملف، فلا
  يكشفه تشغيل اللعبة قبل التسجيل. هذا الاختبار هو ما يكشفه.
*/
describe('معرّفات الجمل صالحة للتسجيل', () => {
  it('كل معرّف يقابل نصًّا واحدًا لا أكثر', () => {
    const byId = new Map<string, Set<string>>();
    for (const line of everyLine()) {
      if (!byId.has(line.id)) byId.set(line.id, new Set());
      byId.get(line.id)!.add(line.text);
    }
    const clashes = [...byId.entries()]
      .filter(([, texts]) => texts.size > 1)
      .map(([id, texts]) => `${id} → ${[...texts].join(' | ')}`);
    expect(clashes).toEqual([]);
  });

  it('لا معرّف فارغ ولا مسار مجلّد داخل اسم الملف', () => {
    for (const line of everyLine()) {
      expect(line.id.length, line.text).toBeGreaterThan(0);
      expect(line.audioSrc).toBe(`${line.id}.mp3`);
      expect(line.id).not.toContain('/');
    }
  });
});
