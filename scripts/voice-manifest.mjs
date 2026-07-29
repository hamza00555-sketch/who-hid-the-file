/**
 * قائمة كل جملة ينطقها الراوي، بمعرّفها ونصّها — جاهزة للتسجيل.
 *
 *   node scripts/voice-manifest.mjs            → جدول للقراءة
 *   node scripts/voice-manifest.mjs --json     → JSON للتغذية الآلية
 *   node scripts/voice-manifest.mjs --csv      → CSV لاستيراده في أي أداة
 *
 * كل سطر يصير ملفًّا واحدًا اسمه `{id}.mp3` تحت:
 *
 *   public/audio/male/{id}.mp3
 *   public/audio/female/{id}.mp3
 *
 * ثم يُقلب `hasRecordedVoice` إلى `true` في `src/config/game.config.ts`.
 *
 * القائمة تشمل **كل تركيبات الإعدادات**: مصطلح المواعيد (ليالٍ/ساعات) وطريقة
 * اللعب (رقمي/نرد). الجمل التي لا يتغيّر نصّها بتغيّر الإعداد تظهر مرّة واحدة،
 * لأن معرّفها واحد — وهذا مضمون باختبار في `src/audio/__tests__/`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

/*
  النصّ مكتوب بـTypeScript ويستورد `game.config`. تشغيله هنا يحتاج مترجمًا،
  فنستخرج الجمل عبر `tsx` إن وُجد، وإلا نطبع تعليمة واضحة بدل الفشل الصامت.
*/
const { buildScript } = await import(
  path.join(root, 'src/audio/script.ar.ts')
).catch(() => {
  console.error(
    'تعذّر تحميل النصّ مباشرة. شغّل الأمر عبر:\n' +
      '  npx tsx scripts/voice-manifest.mjs\n',
  );
  process.exit(1);
});

const NAMINGS = ['nights', 'hours'];
const DICE_MODES = ['digital', 'physical'];
const SLOTS = [1, 2, 3, 4, 5, 6];

const lines = new Map(); // id → { id, text }

function add(list) {
  for (const line of list) {
    if (!lines.has(line.id)) lines.set(line.id, { id: line.id, text: line.text });
  }
}

for (const naming of NAMINGS) {
  const script = buildScript(naming);
  for (const value of Object.values(script)) {
    if (Array.isArray(value)) add(value);
  }
  for (const slot of SLOTS) {
    for (const mode of DICE_MODES) add(script.slotOpen(slot, mode));
    add(script.slotClose(slot));
  }
  for (const n of [3, 2, 1]) add([script.countdownTick(n)]);
}

const rows = [...lines.values()].sort((a, b) => a.id.localeCompare(b.id));
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
