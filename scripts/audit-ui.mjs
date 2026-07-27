// تدقيق آلي: تباين، أهداف اللمس، تجاوز أفقي، طول السطر، نص مقطوع — عبر كل مرحلة.
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';

const BASE = 'http://localhost:5173';
const OUT = '/tmp/claude-0/-home-user-who-hid-the-file/74ff30e6-3a30-58d1-aa20-4937436099e8/scratchpad/audit';
fs.mkdirSync(OUT, { recursive: true });
const NAMES = ['هزاع', 'ريما', 'خالد', 'شهد', 'عمر'];
const findings = [];
const probeCounts = [];

// ── فحوصات تُحقن في الصفحة ──
const CHECKS = `(() => {
  // المشروع يستخدم OKLCH — تحليل النص كأرقام RGB خطأ فادح.
  // الحل: نترك المتصفح نفسه يحوّل أي فضاء لوني عبر canvas.
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  function toRGBA(css) {
    if (cache.has(css)) return cache.get(css);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#ff00ff';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const v = [d[0], d[1], d[2], d[3] / 255];
    cache.set(css, v);
    return v;
  }
  const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const ratio = (a, b) => { const s = [lum(a), lum(b)].sort((x, y) => y - x); return (s[0] + 0.05) / (s[1] + 0.05); };
  const over = (fg, bg) => fg.slice(0,3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]));

  // خلفية فعّالة: تركّب كل الطبقات الشفافة حتى أول طبقة معتمة
  function effectiveBg(el) {
    const layers = [];
    let node = el;
    while (node && node !== document.documentElement) {
      const c = toRGBA(getComputedStyle(node).backgroundColor);
      if (c[3] > 0.001) { layers.push(c); if (c[3] > 0.999) break; }
      node = node.parentElement;
    }
    let base = [11, 17, 34];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }

  const out = { contrast: [], touch: [], overflow: null, longLines: [], clipped: [] };
  out.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;

  const isLeaf = (el) => !Array.from(el.children).some((c) => (c.textContent || '').trim().length > 0);

  for (const el of document.querySelectorAll('h1,h2,h3,p,span,strong,small,label,button,td,th,li,output,legend,figcaption')) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const text = (el.textContent || '').trim();
    if (!text || !isLeaf(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity < 0.15) continue;
    // النص فوق صورة/مشهد: يتعذّر قياسه آليًا بدقة، يُراجع بصريًا
    const fg = toRGBA(cs.color);
    if (fg[3] < 0.05) continue;
    const bg = effectiveBg(el);
    const r = ratio(over(fg, bg), bg);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    if (r < need) {
      out.contrast.push({ tag: el.tagName, cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 40), text: text.slice(0, 32), ratio: +r.toFixed(2), need, size: Math.round(size) });
    }
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible' && cs.textOverflow !== 'ellipsis') {
      out.clipped.push({ tag: el.tagName, cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 40), text: text.slice(0, 32) });
    }
    if (el.tagName === 'P' && text.length > 40) {
      // قياس ch الحقيقي بعرض المحرف '0' في نفس الخط — التقدير بـ size*0.5
      // كان يبالغ بنحو 27% فيولّد إنذارات كاذبة.
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
      probe.style.font = cs.font;
      probe.textContent = '0';
      document.body.appendChild(probe);
      const chPx = probe.getBoundingClientRect().width || size * 0.5;
      probe.remove();
      const ch = rect.width / chPx;
      if (ch > 75) out.longLines.push({ text: text.slice(0, 32), ch: Math.round(ch) });
    }
  }

  for (const el of document.querySelectorAll('button,a,input,[role="button"],[role="tab"],[role="radio"]')) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || getComputedStyle(el).display === 'none') continue;
    if (rect.height < 44 || rect.width < 44) {
      out.touch.push({ tag: el.tagName, cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 40), w: Math.round(rect.width), h: Math.round(rect.height) });
    }
  }
  return out;
})()`;

/*
  ── قياس التباين على البكسل الحقيقي ──

  فحص `effectiveBg` أعلاه يصعد شجرة الآباء بحثًا عن خلفية معتمة، وإن لم يجد
  يفترض [11,17,34]. لكن خلفية هذا التطبيق مشهد مرسوم في طبقة `position: fixed`
  خارج شجرة الآباء — فكل نص يجلس فوق المشهد كان يُقاس على لون مسطّح مُتخيَّل
  بدل النافذة المضيئة أو المصباح خلفه فعلًا.

  الحل: نُخفي كل النصوص (`color: transparent`) ونلتقط الشاشة، فتبقى الخلفية
  وحدها. ثم نقصّ مستطيل كل نص ونقيس بكسلاته الحقيقية.
*/
const HIDE_TEXT = `*,*::before,*::after{color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important}`;

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lumOf = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrastOf = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

async function pixelContrast(page, label) {
  const texts = await page.evaluate(`(() => {
    // getComputedStyle يعيد oklch(...) كما هي في هذا المحرك، لا rgb().
    // تحليلها خارج الصفحة كان يُسقط كل عنصر بصمت ويطبع «صفر ملاحظات».
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const toRGB = (css) => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = '#000'; cx.fillRect(0, 0, 1, 1);
      cx.fillStyle = css; cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const alphaOf = (css) => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = css; cx.fillRect(0, 0, 1, 1);
      return cx.getImageData(0, 0, 1, 1).data[3] / 255;
    };
    const isLeaf = (el) => !Array.from(el.children).some((c) => (c.textContent || '').trim().length > 0);
    const out = [];
    for (const el of document.querySelectorAll('h1,h2,h3,p,span,strong,small,label,button,td,th,li,output,legend,figcaption,summary')) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;
      const text = (el.textContent || '').trim();
      if (!text || !isLeaf(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity < 0.15) continue;
      /*
        عناصر داخل <details> مغلق تُبلّغ عن مستطيل حقيقي لأن كروم يستخدم
        content-visibility لا display:none — لكنها غير مرسومة. قياسها كان
        يقرأ خلفية مكان فارغ ويولّد إنذارات كاذبة بـ 2.5:1.
      */
      if (!el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
      /*
        نمط «مخفي بصريًا لقارئ الشاشة»: موجود في الشجرة، غير مرسوم على الشاشة.
        القصّ يوضع على الأب عادةً (thead هنا) لا على العنصر، فيلزم صعود الشجرة.
      */
      let clipped = false;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const c = getComputedStyle(n).clipPath;
        if (c && c !== 'none') { clipped = true; break; }
      }
      if (clipped) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      if (alphaOf(cs.color) < 0.5) continue;
      /*
        مستطيل العنصر يشمل حاشيته وحدّه وخلفيته الخاصة — وحدّ الحبر هنا بلون
        النص نفسه تقريبًا، فكان «أسوأ بكسل» يلتقط الحدّ لا الخلفية ويبلّغ 1.1:1
        عن شارة سليمة. مستطيلات المدى (Range) تغطي أسطر النص وحدها.
      */
      const range = document.createRange();
      range.selectNodeContents(el);
      const lines = [];
      for (const lr of range.getClientRects()) {
        const left = Math.max(0, lr.left), top = Math.max(0, lr.top);
        const right = Math.min(innerWidth, lr.right), bottom = Math.min(innerHeight, lr.bottom);
        if (right - left < 4 || bottom - top < 4) continue;
        lines.push({ x: Math.round(left), y: Math.round(top), w: Math.round(right - left), h: Math.round(bottom - top) });
      }
      range.detach();
      if (!lines.length) continue;
      /*
        عنصر مغطّى بشريط ثابت أو لوحة فوقه يظهر «فاشل التباين» بينما هو ببساطة
        غير مرئي في موضع التمرير هذا. الاختبار: من يقع فعلًا تحت منتصف السطر؟
      */
      const mid = lines[0];
      const hit = document.elementFromPoint(mid.x + mid.w / 2, mid.y + mid.h / 2);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) continue;
      out.push({
        tag: el.tagName,
        cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 40),
        text: text.slice(0, 30),
        rgb: toRGB(cs.color),
        size: parseFloat(cs.fontSize),
        bold: parseInt(cs.fontWeight, 10) >= 700,
        disabled: !!(el.disabled || el.closest('button:disabled,input:disabled')),
        lines,
      });
    }
    return out;
  })()`);

  const style = await page.addStyleTag({ content: HIDE_TEXT });
  const shot = await page.screenshot();
  await style.evaluate((node) => node.remove());

  // فكّ ترميز الصورة مرة واحدة للشاشة كلها. القصّ لكل عنصر عبر sharp كان
  // يعيد فكّ ترميز الـ PNG كاملًا في كل مرة، فيبطئ التدقيق حتى تفوته المراحل
  // الموقوتة ويصبح متذبذبًا.
  const { data: px, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const issues = [];
  let measured = 0;

  for (const t of texts) {
    // الأزرار المعطّلة خارج نطاق WCAG عمدًا، وخفوتها إشارة قصدية لا خلل
    if (t.disabled) continue;
    const fgLum = lumOf(t.rgb[0], t.rgb[1], t.rgb[2]);

    const lums = [];
    for (const ln of t.lines) {
      if (ln.x + ln.w > info.width || ln.y + ln.h > info.height) continue;
      for (let row = ln.y; row < ln.y + ln.h; row++) {
        let i = (row * info.width + ln.x) * ch;
        for (let col = 0; col < ln.w; col++, i += ch) {
          lums.push(lumOf(px[i], px[i + 1], px[i + 2]));
        }
      }
    }
    if (!lums.length) continue;
    measured++;
    lums.sort((a, b) => a - b);
    const at = (p) => lums[Math.min(lums.length - 1, Math.floor(p * lums.length))];

    /*
      المئين 8 و92 لا 2 و98: حدّ الجدول وحلقة الانتظار ونقاطها تقع داخل سطر
      النص وتشغل نسبة ضئيلة منه، فكانت تُبلَّغ كأنها خلفية النص. ما يهم هو
      خلفية تشغل جزءًا معتبرًا من مساحة الحروف — نافذة مضيئة مثلًا.
    */
    const worst = Math.min(contrastOf(fgLum, at(0.08)), contrastOf(fgLum, at(0.92)));
    const median = contrastOf(fgLum, at(0.5));
    const large = t.size >= 24 || (t.bold && t.size >= 18.66);
    const need = large ? 3 : 4.5;

    if (worst < need) {
      issues.push(`بكسل: تباين ${worst.toFixed(2)}:1 (يلزم ${need}، الوسيط ${median.toFixed(1)}) — ${t.tag}.${t.cls} «${t.text}» ${Math.round(t.size)}px`);
    } else if (median > 15 && t.size < 24 && fgLum > at(0.5)) {
      // الهالة ظاهرة نصّ فاتح على داكن وحدها. داكن على ورق فاتح لا يتوهّج.
      issues.push(`راحة: ${median.toFixed(1)}:1 نصّ ساطع — ${t.tag}.${t.cls} «${t.text}» ${Math.round(t.size)}px`);
    }
  }
  // «صفر ملاحظات» بلا عدّاد كان يعني «لم يُقس شيء» مرة، فلا يُقبل بلا رقم.
  if (measured === 0 && texts.length > 0) {
    issues.unshift(`⚠ لم يُقَس أي عنصر من ${texts.length} — الفحص نفسه معطّل`);
  }
  probeCounts.push({ label, measured, seen: texts.length });
  if (issues.length) findings.push({ label: `${label} [بكسل]`, issues });
  return issues.length;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ locale: 'ar-SA' });

async function scan(page, label) {
  const r = await page.evaluate(CHECKS);
  const issues = [];
  if (r.overflow > 0) issues.push(`تمرير أفقي ${r.overflow}px`);
  for (const c of r.contrast) issues.push(`تباين ${c.ratio}:1 (يلزم ${c.need}) — ${c.tag}.${c.cls} «${c.text}» ${c.size}px`);
  for (const t of r.touch) issues.push(`هدف لمس ${t.w}×${t.h} — ${t.tag}.${t.cls}`);
  for (const c of r.clipped) issues.push(`نص مقطوع — ${c.tag}.${c.cls} «${c.text}»`);
  for (const l of r.longLines) issues.push(`سطر ${l.ch}ch — «${l.text}»`);
  if (issues.length) findings.push({ label, issues });
  await page.screenshot({ path: `${OUT}/${label}.png` });
  const pixel = await pixelContrast(page, label);
  return issues.length + pixel;
}

const HOST_W = Number(process.argv[2]) || 1280;
const HOST_H = Number(process.argv[3]) || 900;
const host = await context.newPage();
await host.setViewportSize({ width: HOST_W, height: HOST_H });
await host.goto(BASE);
await host.waitForSelector('.home__actions button');
await host.waitForLoadState('networkidle');
await scan(host, 'A-home-desktop');

await host.click('.home__actions button');
await host.waitForURL(/#\/host\//);
const code = host.url().split('/host/')[1];
await host.waitForSelector('.lobby__tabs');
await host.waitForTimeout(800);
await scan(host, 'B-host-lobby-empty');

const players = [];
for (let i = 0; i < NAMES.length; i++) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 414, height: 896 });
  await p.goto(`${BASE}/#/play/${code}`);
  await p.waitForSelector('#player-name');
  await p.waitForLoadState('networkidle');
  if (i === 0) await scan(p, 'C-player-join');
  await p.fill('#player-name', NAMES[i]);
  await p.locator('.join__avatars button').nth(i).click();
  await p.click('text=ادخل الجلسة');
  await p.waitForSelector('text=أنا جاهز');
  if (i === 0) await scan(p, 'D-player-lobby');
  await p.click('text=أنا جاهز');
  players.push(p);
}

await host.waitForTimeout(900);
await scan(host, 'E-host-lobby-full');
await host.click('text=ترتيب الجلوس'); await host.waitForTimeout(500);
await scan(host, 'F-host-seating');
await host.click('text=الإعدادات'); await host.waitForTimeout(500);
await scan(host, 'G-host-settings');
await host.click('text=الانضمام');

await host.click('text=ابدأ توزيع الأدوار');
await host.waitForTimeout(1400);
await scan(host, 'H-host-roles');
for (const [i, p] of players.entries()) {
  await p.waitForSelector('text=أظهر دوري');
  if (i === 0) await scan(p, 'I-player-role-cover');
  await p.click('text=أظهر دوري'); await p.waitForTimeout(400);
  if (i === 0) await scan(p, 'J-player-role');
  await p.click('text=فهمت دوري');
}

await host.waitForTimeout(1400);
await scan(host, 'K-host-dice');
for (const [i, p] of players.entries()) {
  await p.waitForSelector('text=ارمِ النرد');
  if (i === 0) await scan(p, 'L-player-dice');
  await p.click('text=ارمِ النرد'); await p.waitForTimeout(1800);
  if (i === 0) await scan(p, 'M-player-dice-result');
  await p.click('text=عرفت موعدي');
}

await host.waitForSelector('text=ابدأ الليل'); await host.waitForTimeout(700);
await scan(host, 'N-host-ready');
await scan(players[0], 'O-player-ready');
await host.click('text=ابدأ الليل');
await host.waitForTimeout(7000);
await scan(host, 'P-host-night');
await scan(players[0], 'Q-player-night');

await host.waitForSelector('text=اختفى', { timeout: 200000 });
await host.waitForTimeout(1500);
await scan(host, 'R-host-secret');

const done = new Set();
for (let round = 0; round < 60 && done.size < players.length; round++) {
  for (const [i, p] of players.entries()) {
    if (done.has(i)) continue;
    try {
      if (await p.locator('button:has-text("أكّد الاختيار")').count()) {
        await scan(p, 'S-player-accomplice-pick');
        await p.locator('.player-card').first().click();
        await p.click('text=أكّد الاختيار'); await p.waitForTimeout(700); continue;
      }
      if (await p.locator('button:has-text("أظهر المعلومة")').count()) {
        await scan(p, `T-player-secret-cover`);
        await p.click('text=أظهر المعلومة'); await p.waitForTimeout(500);
        await scan(p, `U-player-secret-${i}`); continue;
      }
      if (await p.locator('h2:has-text("افحص جارك")').count()) {
        await scan(p, 'V-player-inspect');
        await p.locator('.player-card').first().click(); await p.waitForTimeout(1000);
        await scan(p, 'W-player-inspect-result'); continue;
      }
      const save = p.locator('button:has-text("حفظت المعلومة"), button:has-text("فهمت")');
      if (await save.count()) {
        if (!done.size) await scan(p, 'X-player-no-info');
        await save.first().click(); done.add(i); continue;
      }
    } catch {}
  }
  await host.waitForTimeout(500);
}

await host.waitForSelector('text=ناقشوا ما شاهدتموه', { timeout: 60000 });
await host.waitForTimeout(900);
await scan(host, 'Y-host-discussion');
await scan(players[0], 'Z-player-discussion');
await host.click('text=انتقلوا إلى التصويت');
await host.waitForTimeout(1000);
await scan(host, 'AA-host-voting');
for (const [i, p] of players.entries()) {
  await p.waitForSelector('text=أكّد تصويتي');
  if (i === 0) await scan(p, 'AB-player-voting');
  await p.locator('.player-card').first().click();
  await p.click('text=أكّد تصويتي'); await p.waitForTimeout(300);
  if (i === 0) await scan(p, 'AC-player-voted');
}
await host.waitForTimeout(6500);
await scan(host, 'AD-host-reveal');
await host.waitForSelector('.results-table', { timeout: 60000 });
await host.waitForTimeout(1000);
await scan(host, 'AE-host-results');
await scan(players[0], 'AF-player-results');

// مقاسات إضافية للمضيف
for (const [w, h] of (HOST_W < 800 ? [[390, 844]] : [[1024, 768], [1440, 900], [820, 1180]])) {
  await host.setViewportSize({ width: w, height: h });
  await host.waitForTimeout(600);
  await scan(host, `AG-host-results-${w}`);
}

const totalMeasured = probeCounts.reduce((n, c) => n + c.measured, 0);
console.log(`\nقياس البكسل: ${totalMeasured} عنصر عبر ${probeCounts.length} شاشة`);
console.log(`\n═══ ${findings.length} شاشة فيها ملاحظات ═══\n`);
for (const f of findings) {
  console.log(`▶ ${f.label}`);
  for (const i of [...new Set(f.issues)]) console.log(`   • ${i}`);
}
fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
await browser.close();
