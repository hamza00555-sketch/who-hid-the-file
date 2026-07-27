/**
 * إشعار «بلا خادم».
 *
 * حين تغيب متغيرات `VITE_FIREBASE_*` يعمل التطبيق على النقل المحلي: الجلسة
 * تُحفظ في تخزين المتصفح نفسه، فلا يوجد مكان مشترك يقرأ منه جهاز ثانٍ.
 *
 * الصمت هنا فخّ: التطبيق يعطي رمزًا و QR يبدوان صحيحين، ثم يرى اللاعب على
 * جهازه «لا توجد جلسة بالرمز» بلا سبب مفهوم. هذا الإشعار يقول السبب قبل
 * أن يجمع أحد أصدقاءه حول الطاولة.
 */

import { Panel } from './kit';
import './local-mode-notice.css';

const ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];

export function LocalModeNotice({ place }: { place: 'home' | 'lobby' }) {
  return (
    <Panel className="local-notice">
      <h3 className="local-notice__title">
        {place === 'lobby' ? 'لا يستطيع أحد الانضمام الآن' : 'هذه النسخة تعمل بلا خادم'}
      </h3>

      <p>
        الجلسة محفوظة في هذا المتصفح وحده، ولا يوجد خادم يشاركها. أي جهاز آخر لن
        يجدها — لا بالرمز ولا بالرابط ولا بمسح رمز QR.
      </p>
      <p className="local-notice__use">
        تصلح لتجربة الشاشات على جهاز واحد، لا للعب على الطاولة.
      </p>

      <details className="local-notice__how">
        <summary>كيف تُشغَّل بين الأجهزة؟</summary>
        <p>
          أنشئ مشروع Firebase بقاعدة بيانات Realtime Database، ثم أضف هذه المتغيرات
          الخمسة في إعدادات النشر وأعد النشر:
        </p>
        <ul className="local-notice__keys">
          {ENV_KEYS.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
        <p className="local-notice__ref">
          القواعد الأمنية الجاهزة في <code>firebase/database.rules.json</code>، والتفاصيل في{' '}
          <code>docs/FIREBASE_SCHEMA.md</code>.
        </p>
      </details>
    </Panel>
  );
}
