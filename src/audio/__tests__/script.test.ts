import { describe, expect, it } from 'vitest';
import { buildScript } from '../script.ar';

const script = buildScript('nights');

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
});
