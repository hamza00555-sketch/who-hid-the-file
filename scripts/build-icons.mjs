/**
 * يشتقّ أيقونات التطبيق كلها من أصل واحد: `art/app-icon-source.png`.
 *
 *   node scripts/build-icons.mjs
 *
 * المقاسات ليست اعتباطية:
 * - 32 و180 و192 و512: المتصفح، وشاشة iOS الرئيسية، وأندرويد، وواجهة التثبيت.
 * - `maskable`: أندرويد يقصّ الأيقونة إلى دائرة أو شكل آخر يختاره المُصنِّع،
 *   ويضمن ظهور 80% المركزية فقط.
 *
 * لماذا تُبنى الـ maskable بالقصّ لا بالحشو: جرّبت الحشو أولًا — تصغير الرسم
 * داخل إطار كحلي — فظهر حدّ مربّع واضح داخل الدائرة لأن كحلي الرسم لا يطابق
 * كحلي الحشوة تمامًا. وتكوين هذه الأيقونة مركزيّ أصلًا: الملف في القلب
 * والوجوه الأربعة حوله، فالقصّ الدائري لا يأكل إلا أطراف الرؤوس. تحقّقت
 * بصريًا من القصّ الدائري وقصّ الزوايا: الوجوه الأربعة والملف تبقى كاملة.
 */

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const SOURCE = path.join(root, 'art', 'app-icon-source.png');
const OUT = path.join(root, 'public', 'icons');

const PLAIN = [32, 180, 192, 512];
const MASKABLE = [192, 512];

mkdirSync(OUT, { recursive: true });

const source = sharp(SOURCE);
const meta = await source.metadata();
if (meta.width !== meta.height) {
  throw new Error(`الأصل يجب أن يكون مربّعًا — الحالي ${meta.width}×${meta.height}`);
}

for (const size of PLAIN) {
  await sharp(SOURCE)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `icon-${size}.png`));
}

for (const size of MASKABLE) {
  await sharp(SOURCE)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `icon-maskable-${size}.png`));
}

console.log(
  `✅ ${PLAIN.length + MASKABLE.length} أيقونة في public/icons من أصل ${meta.width}px`,
);
