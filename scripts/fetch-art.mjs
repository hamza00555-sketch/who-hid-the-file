/**
 * جلب الأصول المولّدة ومعالجتها ووضعها في `public/`.
 *
 *   node scripts/fetch-art.mjs <manifest.json> <urls.tsv>
 *
 * manifest.json: { group: { name: jobId } }
 * urls.tsv:      jobId<TAB>rawUrl  (يُستخرج من نتيجة show_generations)
 *
 * الشخصيات والعناصر تُقصّ خلفياتها؛ المشاهد تُترك كما هي لأنها خلفيات كاملة.
 */

import fs from 'node:fs';
import path from 'node:path';
import { cutout } from './process-art.mjs';

const PUBLIC = new URL('../public/', import.meta.url).pathname;
const RAW = '/tmp/claude-0/-home-user-who-hid-the-file/74ff30e6-3a30-58d1-aa20-4937436099e8/scratchpad/art/raw';

/** كل مجموعة: أين تُحفظ، وهل تُقص خلفيتها، وبأي ارتفاع */
const GROUPS = {
  characters: { dir: 'characters', cut: true, height: 640 },
  props: { dir: 'props', cut: true, height: 520 },
  dice: { dir: 'props/dice', cut: true, height: 320 },
  ui: { dir: 'ui', cut: true, height: 520 },
  scenes: { dir: 'scenes', cut: false, width: 1600 },
};

async function download(url, dest) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  fs.writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
}

const [manifestPath, urlsPath] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const urls = Object.fromEntries(
  fs
    .readFileSync(urlsPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => line.split('\t')),
);

fs.mkdirSync(RAW, { recursive: true });

let done = 0;
const pending = [];

for (const [group, items] of Object.entries(manifest)) {
  const config = GROUPS[group];
  if (!config) throw new Error(`مجموعة غير معروفة: ${group}`);
  const outDir = path.join(PUBLIC, config.dir);

  for (const [name, jobId] of Object.entries(items)) {
    const url = urls[jobId];
    if (!url) {
      pending.push(`${group}/${name}`);
      continue;
    }

    const rawPath = path.join(RAW, `${jobId}.png`);
    if (!fs.existsSync(rawPath)) await download(url, rawPath);

    const dest = path.join(outDir, `${name}.png`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    if (config.cut) {
      const size = await cutout(rawPath, dest, { height: config.height });
      console.log(`✓ ${config.dir}/${name}.png  ${size.width}x${size.height}`);
    } else {
      const sharp = (await import('sharp')).default;
      const info = await sharp(rawPath)
        .resize({ width: config.width, withoutEnlargement: true })
        .webp({ quality: 86 })
        .toFile(dest.replace(/\.png$/, '.webp'));
      console.log(`✓ ${config.dir}/${name}.webp  ${info.width}x${info.height}`);
    }
    done++;
  }
}

console.log(`\nتم: ${done}`);
if (pending.length) console.log(`لم تجهز بعد: ${pending.join(', ')}`);
