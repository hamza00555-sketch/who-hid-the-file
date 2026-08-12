/**
 * هل لكل جملة يمكن أن ينطقها الراوي ملفٌ مسجَّل فعلًا؟
 *
 * ── لماذا لا يكفي عدّ الملفات ──
 *
 * الملفات تُولَّد من قائمة، والقائمة تُبنى بتعداد تركيبات الإعدادات. فإن أُضيفت
 * جملة جديدة — أو صار لجملة قائمة بُعدٌ جديد — خرجت من القائمة بصمت. ولا يكشف
 * ذلك تشغيلُ اللعبة: `AudioManager` يسقط إلى الصوت الآلي حين لا يجد ملفًّا،
 * فتُنطق الجملة بصوت مختلف تمامًا ولا يظهر خطأ في أي مكان.
 *
 * فهذا الاختبار يمشي على **النصّ نفسه**، لا على القائمة: يعدّ كل مفتاح فيه،
 * ويُفشل نفسه إن ظهر مفتاح دالّة لا يعرف كيف يستدعيه. أي جملة جديدة تُضاف بلا
 * توليد صوتها تكسر الاختبار قبل أن تُلعب جولة واحدة.
 */

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildScript, type VoiceLine } from '../script.ar';
import { GAME_CONFIG } from '../../config/game.config';
import type { DiceMode } from '../../game/types';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const VOICES = ['male', 'female'] as const;
const NAMINGS = ['nights', 'hours'] as const;
const SLOTS = [1, 2, 3, 4, 5, 6] as const;
const MODES: DiceMode[] = ['digital', 'physical'];

/**
 * كل تركيبة وسائط لكل دالّة في النصّ.
 *
 * الغياب من هذا الجدول ليس تساهلًا: الاختبار يقارنه بمفاتيح النصّ ويفشل إن
 * افترقا. فدالّة جديدة توقف البناء حتى تُذكر هنا صراحةً.
 */
const FUNCTION_ARGS: Record<string, unknown[][]> = {
  slotOpen: SLOTS.flatMap((slot) =>
    MODES.flatMap((mode) => [true, false].map((inspection) => [slot, mode, inspection])),
  ),
  slotClose: SLOTS.map((slot) => [slot]),
  countdownTick: [[3], [2], [1]],
  accompliceCall: [[1], [2]],
};

/** كل جملة يمكن أن تُنطق، في كل تركيبة إعدادات. */
function everyLine(): VoiceLine[] {
  const out: VoiceLine[] = [];
  for (const naming of NAMINGS) {
    const script = buildScript(naming) as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(script)) {
      if (Array.isArray(value)) {
        out.push(...(value as VoiceLine[]));
        continue;
      }
      if (typeof value !== 'function') continue;
      for (const args of FUNCTION_ARGS[key] ?? []) {
        const result = (value as (...a: unknown[]) => VoiceLine | VoiceLine[])(...args);
        out.push(...(Array.isArray(result) ? result : [result]));
      }
    }
  }
  return out;
}

describe('تغطية أصوات الراوي', () => {
  /*
    الحارس الأهم: دالّة جديدة في النصّ بلا تعداد هنا تعني جملًا لا يمرّ عليها
    الاختبار — فيمرّ وهو أعمى عنها.
  */
  it('كل دالّة في النصّ معدودة في هذا الاختبار', () => {
    const script = buildScript('nights') as unknown as Record<string, unknown>;
    const inScript = Object.entries(script)
      .filter(([, value]) => typeof value === 'function')
      .map(([key]) => key)
      .sort();

    expect(inScript).toEqual(Object.keys(FUNCTION_ARGS).sort());
  });

  it('لكل جملة معرّف ومسار ملف', () => {
    for (const line of everyLine()) {
      expect(line.id.length, `جملة بلا معرّف: «${line.text}»`).toBeGreaterThan(0);
      expect(line.audioSrc, `جملة بلا ملف: ${line.id}`).toBe(`${line.id}.mp3`);
    }
  });

  it('لكل جملة ملف مسجَّل في الصوتين معًا', () => {
    // العلم مطفأ يعني أن اللعبة تعتمد الصوت الآلي عمدًا، فلا ملفات تُنتظر
    if (!GAME_CONFIG.hasRecordedVoice) return;

    const ids = [...new Set(everyLine().map((line) => line.id))].sort();
    const missing: string[] = [];
    const tiny: string[] = [];

    for (const voice of VOICES) {
      for (const id of ids) {
        const file = path.join(ROOT, 'public/audio', voice, `${id}.mp3`);
        if (!existsSync(file)) {
          missing.push(`${voice}/${id}.mp3`);
          continue;
        }
        // ملف مبتور يُشغَّل صامتًا ولا يُبلّغ عن نفسه
        if (statSync(file).size < 2000) tiny.push(`${voice}/${id}.mp3`);
      }
    }

    expect(missing, 'جمل بلا ملف صوتي').toEqual([]);
    expect(tiny, 'ملفات أصغر من أن تحمل جملة').toEqual([]);
    expect(ids.length).toBeGreaterThan(0);
  });
});
