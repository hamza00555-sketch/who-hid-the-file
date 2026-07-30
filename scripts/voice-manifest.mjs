/**
 * قائمة كل جملة ينطقها الراوي، بمعرّفها ونصّها — جاهزة للتسجيل.
 *
 *   npx tsx scripts/voice-manifest.mjs            → جدول للقراءة
 *   npx tsx scripts/voice-manifest.mjs --json     → JSON للتغذية الآلية
 *   npx tsx scripts/voice-manifest.mjs --csv      → CSV لاستيراده في أي أداة
 *
 * كل سطر يصير ملفًّا واحدًا اسمه `{id}.mp3` تحت:
 *
 *   public/audio/male/{id}.mp3
 *   public/audio/female/{id}.mp3
 *
 * ثم يُقلب `hasRecordedVoice` إلى `true` في `src/config/game.config.ts`.
 *
 * القائمة تشمل **كل تركيبات الإعدادات**: مصطلح المواعيد (ليالٍ/ساعات) وطريقة
 * اللعب (رقمي/نرد) ووجود الفحص من عدمه. الجمل التي لا يتغيّر نصّها بتغيّر
 * الإعداد تظهر مرّة واحدة لأن معرّفها واحد — وهذا مضمون باختبار في
 * `src/audio/__tests__/script.test.ts`.
 *
 * تُستورَد `voiceLines()` أيضًا من `generate-voice.mjs`، فمصدر الجمل واحد ولا
 * يمكن أن تفترق قائمة التوليد عن قائمة التطبيق.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const NAMINGS = ['nights', 'hours'];
const DICE_MODES = ['digital', 'physical'];
const SLOTS = [1, 2, 3, 4, 5, 6];

/** كل جملة ممكنة مرّة واحدة، مرتّبة بالمعرّف. */
export async function voiceLines() {
  const { buildScript } = await import(path.join(root, 'src/audio/script.ar.ts')).catch(
    () => {
      console.error(
        'تعذّر تحميل النصّ (مكتوب بـTypeScript). شغّل الأمر عبر:\n' +
          '  npx tsx scripts/voice-manifest.mjs\n',
      );
      process.exit(1);
    },
  );

  const lines = new Map();
  const add = (list) => {
    for (const line of list) {
      if (!lines.has(line.id)) lines.set(line.id, { id: line.id, text: line.text });
    }
  };

  for (const naming of NAMINGS) {
    const script = buildScript(naming);
    for (const value of Object.values(script)) {
      if (Array.isArray(value)) add(value);
    }
    for (const slot of SLOTS) {
      for (const mode of DICE_MODES) {
        // النسختان: بفحص وبلا فحص (لعبة الأربعة)
        add(script.slotOpen(slot, mode, true));
        add(script.slotOpen(slot, mode, false));
      }
      add(script.slotClose(slot));
    }
    for (const n of [3, 2, 1]) add([script.countdownTick(n)]);
  }

  return [...lines.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/* ── واجهة سطر الأوامر ── */
if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await voiceLines();
  const flag = process.argv[2];

  if (flag === '--json') {
    console.log(JSON.stringify(rows, null, 2));
  } else if (flag === '--csv') {
    console.log('id,text');
    for (const row of rows) console.log(`${row.id},"${row.text.replace(/"/g, '""')}"`);
  } else {
    const width = Math.max(...rows.map((row) => row.id.length));
    for (const row of rows) console.log(`${row.id.padEnd(width)}  ${row.text}`);
    console.log(`\n${rows.length} جملة × صوتان = ${rows.length * 2} ملفًّا.`);
  }
}
