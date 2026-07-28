/**
 * تدقيق قواعد الأمان على قاعدة البيانات الحقيقية.
 *
 *   npm run verify:rules
 *
 * يفتح **ثلاث هويات مجهولة منفصلة** عبر REST — لا عبر SDK — لأن
 * `src/net/firebase.ts` يحتفظ بمصادقة مفردة على مستوى الوحدة، فكل نسخة داخل
 * عملية واحدة هي نفس المستخدم. عزل الأسرار بين لاعبَين لا يمكن إثباته إلا
 * بهويات حقيقية مختلفة، وهذا ملفّه.
 *
 * يقرأ الإعداد من `.env.production` فلا يُكرَّر في مكانين.
 */

import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.production', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const KEY = env.VITE_FIREBASE_API_KEY;
const DB = env.VITE_FIREBASE_DATABASE_URL;
if (!KEY || !DB) {
  console.error('ينقص VITE_FIREBASE_API_KEY أو VITE_FIREBASE_DATABASE_URL في .env.production');
  process.exit(2);
}
const CODE = 'T' + Math.random().toString(36).slice(2, 5).toUpperCase();


const signIn = async () => {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`,
    { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{"returnSecureToken":true}' });
  const d = await r.json();
  if (!d.idToken) throw new Error('signIn failed: ' + JSON.stringify(d));
  return { uid: d.localId, tok: d.idToken };
};
const req = async (method, path, tok, body) => {
  const r = await fetch(`${DB}/${path}.json?auth=${tok}`,
    { method, headers: {'Content-Type':'application/json'}, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, body: text };
};
const ok  = (c, m) => console.log(`${c ? '✅' : '❌'} ${m}`);
let fails = 0;
const expect = (cond, msg) => { if (!cond) fails++; ok(cond, msg); };

// جهازان مستقلان تمامًا: هويتان مجهولتان مختلفتان
const host = await signIn();
const p1   = await signIn();
const p2   = await signIn();
console.log(`جهاز المضيف uid=${host.uid.slice(0,8)}…  لاعب١=${p1.uid.slice(0,8)}…  لاعب٢=${p2.uid.slice(0,8)}…\n`);

// 1) المضيف ينشئ الجلسة
let r = await req('PUT', `rooms/${CODE}/meta`, host.tok, {
  code: CODE, hostUid: host.uid, phase: 'lobby', resumePhase: null,
  roundId: 'r1', createdAt: Date.now(), updatedAt: Date.now(), status: 'open' });
expect(r.status === 200, `المضيف أنشأ meta الجلسة ${CODE}`);
r = await req('PUT', `rooms/${CODE}/settings`, host.tok, {
  gameName: 'الملف المفقود', diceMode: 'digital', slotNaming: 'night',
  nightCountdownSeconds: 10, discussionSeconds: 180, voiceEnabled: true, ttsRate: 1 });
expect(r.status === 200, 'المضيف كتب الإعدادات');

// 2) جهاز ثانٍ يقرأ الجلسة — هذا هو ما كان مستحيلًا قبل اليوم
r = await req('GET', `rooms/${CODE}/meta`, p1.tok);
expect(r.status === 200 && r.body.includes(CODE), 'جهاز آخر وجد الجلسة بالرمز');

// 3) اللاعبان ينضمّان
for (const [i, p] of [p1, p2].entries()) {
  r = await req('PUT', `rooms/${CODE}/players/${p.uid}`, p.tok, {
    id: p.uid, name: ['هزاع','ريما'][i], avatarId: ['saud','lama'][i], seat: i,
    ready: false, connected: true, lastSeen: Date.now(), joinedAt: Date.now(), isHost: false });
  expect(r.status === 200, `انضم ${['هزاع','ريما'][i]} من جهازه`);
}

// 4) المضيف يرى الاثنين
r = await req('GET', `rooms/${CODE}/players`, host.tok);
expect(r.body.includes('هزاع') && r.body.includes('ريما'), 'المضيف يرى اللاعبَين');

// ── القواعد الأمنية ──
console.log('\n— حدود القواعد —');

r = await req('PUT', `rooms/${CODE}/round/secrets/${p1.uid}`, host.tok, { role: 'hider', dice: [3], soloSlots: [3] });
expect(r.status === 200, 'المضيف يكتب سر اللاعب');

r = await req('GET', `rooms/${CODE}/round/secrets/${p1.uid}`, p1.tok);
expect(r.status === 200 && r.body.includes('hider'), 'اللاعب يقرأ سرّه هو');

r = await req('GET', `rooms/${CODE}/round/secrets/${p1.uid}`, p2.tok);
expect(r.status === 401, 'لاعب آخر مُنع من قراءة السر ← الأهم');

r = await req('PUT', `rooms/${CODE}/round/votes/${p1.uid}`, p1.tok, p1.uid);
expect(r.status === 401, 'التصويت للنفس مرفوض');

r = await req('PUT', `rooms/${CODE}/round/votes/${p1.uid}`, p1.tok, p2.uid);
expect(r.status === 200, 'التصويت لغيره مقبول');

r = await req('PUT', `rooms/${CODE}/round/votes/${p1.uid}`, p1.tok, host.uid);
expect(r.status === 401, 'تغيير الصوت بعد تسجيله مرفوض');

r = await req('GET', `rooms/${CODE}/round/votes`, p2.tok);
expect(r.status === 401, 'اللاعب لا يقرأ أصوات الآخرين');

r = await req('GET', `rooms/${CODE}/round/votes`, host.tok);
expect(r.status === 200, 'المضيف يقرأ الأصوات');

r = await req('PUT', `rooms/${CODE}/meta/phase`, p2.tok, 'voting');
expect(r.status === 401, 'لاعب لا يستطيع تغيير مرحلة الجولة');

r = await req('PUT', `rooms/${CODE}/players/${p1.uid}/name`, p2.tok, 'مزوّر');
expect(r.status === 401, 'لاعب لا يعدّل بيانات لاعب آخر');

r = await req('PUT', `rooms/${CODE}/round/secrets`, host.tok, { [p1.uid]: { role: 'member', dice: [2] } });
expect(r.status === 200, 'المضيف يوزّع الأدوار دفعة واحدة');

r = await req('DELETE', `rooms/${CODE}/round/votes`, host.tok);
expect(r.status === 200, 'المضيف يصفّر الأصوات لجولة جديدة');

r = await req('PUT', `rooms/${CODE}/round/votes`, host.tok, { [p1.uid]: p2.uid });
expect(r.status === 401, 'المضيف لا يستطيع تزوير الأصوات');

r = await req('DELETE', `rooms/${CODE}/round/progress`, host.tok);
expect(r.status === 200, 'المضيف يصفّر التقدّم');

// تنظيف
await req('DELETE', `rooms/${CODE}`, host.tok);
console.log(`\n${fails === 0 ? '✅ كل الفحوص نجحت' : `❌ ${fails} فحص فشل`}`);
process.exit(fails ? 1 : 0);
