/**
 * توليد جمل الراوي دفعةً واحدة عبر ElevenLabs.
 *
 *   ELEVENLABS_API_KEY=... npx tsx scripts/generate-voice.mjs \
 *     --voice=male --voice-id=<elevenlabs voice id>
 *
 * الخيارات:
 *   --voice=male|female   المجلّد الهدف تحت `public/audio/` (إلزامي)
 *   --voice-id=<id>       معرّف الصوت في ElevenLabs (إلزامي)
 *   --model=<id>          افتراضيًا `eleven_multilingual_v2` — وهو الذي ينطق العربية
 *   --force               يعيد توليد الملفات الموجودة بدل تخطّيها
 *   --dry                 يطبع ما سيفعله بلا نداء شبكة ولا كلفة
 *
 * **المفتاح من البيئة لا من الكود.** لو وُضع في التطبيق لقرأه أي أحد من حزمة
 * الواجهة؛ ولو كُتب في ملف داخل المستودع لدخل التاريخ ولا يخرج منه. هذا
 * السكربت يُشغَّل مرّة على جهازك، والناتج ملفات صوتية لا مفاتيح.
 *
 * التوليد **مرّة واحدة لا في كل جلسة**: الملفات تُشحن مع التطبيق، فلا كلفة
 * لكل لعبة ولا حاجة إلى إنترنت أثناء اللعب.
 */

import { mkdir, writeFile, access, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { voiceLines } from './voice-manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const voice = args.voice;
const voiceId = args['voice-id'];
const model = args.model ?? 'eleven_multilingual_v2';
const dry = Boolean(args.dry);
const force = Boolean(args.force);

if (!dry && (!voice || !voiceId)) {
  console.error('الاستخدام: npx tsx scripts/generate-voice.mjs --voice=male --voice-id=<id>');
  process.exit(1);
}
if (voice && !['male', 'female'].includes(voice)) {
  console.error(`--voice يجب أن يكون male أو female، لا «${voice}».`);
  process.exit(1);
}

const key = process.env.ELEVENLABS_API_KEY;
if (!dry && !key) {
  console.error(
    'ينقص ELEVENLABS_API_KEY في البيئة.\n' +
      '  ELEVENLABS_API_KEY=xxx npx tsx scripts/generate-voice.mjs --voice=male --voice-id=<id>',
  );
  process.exit(1);
}

const lines = await voiceLines();
const outDir = path.join(root, 'public/audio', voice ?? 'male');
await mkdir(outDir, { recursive: true });

/*
  ── التوليد بالنصّ لا بالمعرّف ──

  عشرون جملة من التسع والستّين مكرّرة نصًّا: «أغلقوا أعينكم الآن» وحدها ستّ
  مرّات، مرّة لكل مرحلة ليلية. توليدها ستًّا يدفع ستّ مرّات ثمن صوت واحد
  متطابق، ويضيف ستّة أضعاف الحجم إلى الحزمة.

  فيُولَّد النصّ الفريد مرّة، وتُنسخ بقيّة المعرّفات منه. المعرّفات تبقى كما هي
  — التطبيق ينادي `night.close.4` ويجدها — والفرق كلّه في كيفية إنتاجها.
*/
const byText = new Map();
for (const line of lines) {
  if (!byText.has(line.text)) byText.set(line.text, []);
  byText.get(line.text).push(line.id);
}
const unique = [...byText.entries()].map(([text, ids]) => ({ text, ids }));

const exists = async (file) =>
  access(file).then(
    () => true,
    () => false,
  );

console.log(
  `${lines.length} جملة، منها ${unique.length} نصًّا فريدًا ` +
    `(${lines.length - unique.length} تُنسخ) → ${path.relative(root, outDir)}/`,
);
if (dry) {
  for (const { text, ids } of unique) {
    console.log(`  ${ids[0]}.mp3  ${text}`);
    for (const id of ids.slice(1)) console.log(`    ↳ نسخة: ${id}.mp3`);
  }
  console.log('\n(تجربة جافّة — لم يُنادَ أي شيء)');
  process.exit(0);
}

let made = 0;
let copied = 0;
let skipped = 0;
const failed = [];

for (const [index, { text, ids }] of unique.entries()) {
  const [primary, ...aliases] = ids;
  const file = path.join(outDir, `${primary}.mp3`);
  const position = `[${String(index + 1).padStart(2)}/${unique.length}]`;

  // الاستئناف مجّاني: إعادة التشغيل بعد انقطاع لا تعيد الدفع عمّا وُلّد
  if (!force && (await exists(file))) {
    skipped++;
  } else {
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: { 'xi-api-key': key, 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            model_id: model,
            // ثبات عالٍ ومبالغة منخفضة: الراوي يقرأ تعليمات تُنفَّذ، لا يمثّل
            voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.25 },
          }),
        },
      );

      if (!response.ok) {
        failed.push({ id: primary, status: response.status, body: await response.text() });
        console.log(`${position} ✖ ${primary} — HTTP ${response.status}`);
        continue;
      }

      await writeFile(file, Buffer.from(await response.arrayBuffer()));
      made++;
      console.log(`${position} ✔ ${primary}`);
    } catch (cause) {
      failed.push({ id: primary, status: 'network', body: String(cause) });
      console.log(`${position} ✖ ${primary} — ${cause}`);
      continue;
    }

    // مهلة بسيطة بين النداءات: حدود المعدّل تُرجع 429 وتُفسد الدفعة
    await new Promise((r) => setTimeout(r, 350));
  }

  for (const alias of aliases) {
    const target = path.join(outDir, `${alias}.mp3`);
    if (force || !(await exists(target))) {
      await copyFile(file, target);
      copied++;
    }
  }
}

console.log(`\nوُلِّد ${made} · نُسخ ${copied} · تُخطّي ${skipped} · فشل ${failed.length}`);
if (failed.length) {
  for (const f of failed) console.log(`  ${f.id}: ${f.status} ${f.body.slice(0, 120)}`);
  console.log('\nأعد تشغيل الأمر نفسه — الموجود يُتخطّى والفاشل وحده يُعاد.');
  process.exit(1);
}
console.log('\nالخطوة الأخيرة: اقلب hasRecordedVoice إلى true في src/config/game.config.ts');
