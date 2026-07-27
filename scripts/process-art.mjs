/**
 * معالجة أصول الفن المولّدة: إزالة الخلفية الرمادية المسطحة، القص، والتصدير.
 *
 * الأصول تُولَّد على خلفية رمادية مسطحة (#808080) عمدًا، فيمكن إزالتها محليًا
 * بدقة وبلا تكلفة بدل استدعاء خدمة إزالة خلفية لكل صورة.
 *
 *   node scripts/process-art.mjs <input.png> <output.png> [--height=600]
 */

import sharp from 'sharp';

/** لون الخلفية المتفق عليه في كل موجّهات التوليد */
const BG = { r: 128, g: 128, b: 128 };
/** مدى التسامح: يغطي ضغط PNG وحواف التنعيم الخفيفة */
const TOLERANCE = 42;
/** حزام التلاشي حول الحافة ليبقى الخط الخارجي نظيفًا بلا هالة رمادية */
const FEATHER = 26;

/**
 * يُبقي أكبر شكل متصل ويمحو ما عداه.
 *
 * ضروري عند تقطيع ورقة نماذج: قدمُ الشخصية المجاورة قد تعبر حدّ الخلية،
 * فتظهر كقصاصة عائمة بجانب الشخصية. الشخصية دائمًا أكبر شكل في خليتها.
 */
function keepLargestBlob(mask, width, height) {
  const labels = new Int32Array(width * height).fill(-1);
  const stack = new Int32Array(width * height);
  let best = { label: -1, size: 0 };
  let label = 0;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    let size = 0;

    while (top > 0) {
      const pixel = stack[--top];
      size++;
      const x = pixel % width;
      const y = (pixel - x) / width;

      // جوار رباعي يكفي: الأشكال هنا مصمتة بخط خارجي سميك
      if (x > 0) pushNeighbour(pixel - 1);
      if (x < width - 1) pushNeighbour(pixel + 1);
      if (y > 0) pushNeighbour(pixel - width);
      if (y < height - 1) pushNeighbour(pixel + width);
    }

    if (size > best.size) best = { label, size };
    label++;

    function pushNeighbour(next) {
      if (mask[next] && labels[next] === -1) {
        labels[next] = label;
        stack[top++] = next;
      }
    }
  }

  if (best.label === -1) return mask;
  const kept = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) if (labels[i] === best.label) kept[i] = 1;
  return kept;
}

export async function cutout(inputPath, outputPath, { height = 600, largestOnly = true } = {}) {
  const image = sharp(inputPath).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height: srcHeight, channels } = info;

  const pixelCount = width * srcHeight;
  const mask = new Uint8Array(pixelCount);

  for (let i = 0; i < data.length; i += channels) {
    const dr = data[i] - BG.r;
    const dg = data[i + 1] - BG.g;
    const db = data[i + 2] - BG.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);

    let alpha;
    if (distance <= TOLERANCE) {
      alpha = 0;
    } else if (distance <= TOLERANCE + FEATHER) {
      alpha = Math.round(((distance - TOLERANCE) / FEATHER) * 255);
    } else {
      alpha = 255;
    }
    data[i + 3] = alpha;
    if (alpha > 24) mask[i / channels] = 1;
  }

  const keep = largestOnly ? keepLargestBlob(mask, width, srcHeight) : mask;

  let minX = width;
  let minY = srcHeight;
  let maxX = -1;
  let maxY = -1;

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    if (!keep[pixel]) {
      // قصاصة من خلية مجاورة: تُمحى بالكامل
      if (mask[pixel]) data[pixel * channels + 3] = 0;
      continue;
    }
    const x = pixel % width;
    const y = (pixel - x) / width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  if (maxX < 0) throw new Error(`لم يُعثر على أي عنصر غير الخلفية في ${inputPath}`);

  // هامش صغير يمنع قص الخط الخارجي
  const pad = 6;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const cropWidth = Math.min(width - left, maxX - minX + 1 + pad * 2);
  const cropHeight = Math.min(srcHeight - top, maxY - minY + 1 + pad * 2);

  await sharp(data, { raw: { width, height: srcHeight, channels } })
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize({ height, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 92 })
    .toFile(outputPath);

  const out = await sharp(outputPath).metadata();
  return { width: out.width, height: out.height };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output, ...flags] = process.argv.slice(2);
  if (!input || !output) {
    console.error('الاستخدام: node scripts/process-art.mjs <input.png> <output.png> [--height=600]');
    process.exit(1);
  }
  const heightFlag = flags.find((flag) => flag.startsWith('--height='));
  const height = heightFlag ? Number(heightFlag.split('=')[1]) : 600;
  const result = await cutout(input, output, { height });
  console.log(`${output} — ${result.width}x${result.height}`);
}
