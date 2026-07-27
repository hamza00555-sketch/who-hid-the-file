/**
 * تقطيع ورقة نماذج 3×3 إلى تسع حالات منفصلة.
 *
 *   node scripts/slice-sheet.mjs <sheet.png> <characterId>
 *
 * الورقة تُولَّد على خلفية رمادية مسطحة وبشبكة أثلاث متساوية، فالتقطيع على
 * الأثلاث ثم القص التلقائي على حدود الشكل يعطي تسع صور نظيفة.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { cutout } from './process-art.mjs';

/** ترتيب القراءة: يسار إلى يمين، الصف العلوي أولًا — مطابق لترتيب الموجّه. */
export const SHEET_ORDER = [
  'idle',
  'asleep',
  'startled',
  'suspicious',
  'hiding',
  'victory',
  'defeat',
  'look-right',
  'look-left',
];

const PUBLIC = new URL('../public/', import.meta.url).pathname;

export async function sliceSheet(sheetPath, characterId, { height = 640 } = {}) {
  const { width, height: sheetHeight } = await sharp(sheetPath).metadata();
  const cellW = Math.floor(width / 3);
  const cellH = Math.floor(sheetHeight / 3);
  const outDir = path.join(PUBLIC, 'characters', characterId);
  fs.mkdirSync(outDir, { recursive: true });

  const tmpDir = fs.mkdtempSync('/tmp/sheet-');
  const results = [];

  for (let index = 0; index < SHEET_ORDER.length; index++) {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const cellPath = path.join(tmpDir, `${index}.png`);

    await sharp(sheetPath)
      .extract({ left: col * cellW, top: row * cellH, width: cellW, height: cellH })
      .png()
      .toFile(cellPath);

    const dest = path.join(outDir, `${SHEET_ORDER[index]}.png`);
    const size = await cutout(cellPath, dest, { height });
    results.push({ state: SHEET_ORDER[index], ...size });
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [sheetPath, characterId] = process.argv.slice(2);
  if (!sheetPath || !characterId) {
    console.error('الاستخدام: node scripts/slice-sheet.mjs <sheet.png> <characterId>');
    process.exit(1);
  }
  const results = await sliceSheet(sheetPath, characterId);
  for (const r of results) console.log(`✓ ${characterId}/${r.state}.png  ${r.width}x${r.height}`);
}
