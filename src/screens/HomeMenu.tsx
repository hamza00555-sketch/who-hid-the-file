/**
 * عناصر قائمة الشاشة الرئيسية وشريط المعلومات.
 *
 * الزر هنا ليس `Button` العام: المرجع يطلب صفًّا كاملًا فيه أيقونة على الحافة
 * البادئة، ونصّ متوسّط، وسهم على الحافة الأخرى — شكل «عنصر قائمة» لا شكل زر
 * ملصق. إبقاؤه منفصلًا يمنع تلويث `Button` بمتغيّرات لا تخص إلا هذه الشاشة.
 */

import type { ReactNode } from 'react';

export function MenuItem({
  icon,
  label,
  tone = 'primary',
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  tone?: 'primary' | 'quiet';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`menu-item menu-item--${tone}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="menu-item__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="menu-item__label">{label}</span>
      {/* السهم يشير يسارًا: اتجاه «التالي» في واجهة عربية */}
      <span className="menu-item__chevron" aria-hidden="true">
        ‹
      </span>
    </button>
  );
}

/**
 * مدى رقمي مثل «4–8»: في سياق عربي يقلب المتصفح ترتيبه بصريًا فيُقرأ «8-4».
 * العزل باتجاه LTR يثبّته. يُطبَّق تلقائيًا على القيم الرقمية وحدها حتى لا
 * ينقلب نصّ عربي مثل «جهاز لكل لاعب» إلى الاتجاه الخطأ.
 */
const NUMERIC = /^[\d\u0660-\u0669\s\u2013\u2014+-]+$/;

export function InfoStrip({
  items,
}: {
  items: { icon: ReactNode; value: string; label: string; tone: string }[];
}) {
  return (
    <ul className="info-strip">
      {items.map((item) => (
        <li key={item.label} className="info-strip__cell">
          <span className="info-strip__icon" style={{ color: item.tone }} aria-hidden="true">
            {item.icon}
          </span>
          <b dir={NUMERIC.test(item.value) ? 'ltr' : undefined}>{item.value}</b>
          <small>{item.label}</small>
        </li>
      ))}
    </ul>
  );
}

/* ── أيقونات: SVG مضمّن لا محارف رموز — يثبت شكلها عبر الأنظمة ── */

const S = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none' } as const;
const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const IconPlus = (
  <svg {...S} {...stroke}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconKey = (
  <svg {...S} {...stroke}>
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M18 12v4M15 12v3" />
  </svg>
);

export const IconClock = (
  <svg {...S} {...stroke}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconPeople = (
  <svg {...S} {...stroke}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20a6 6 0 0112 0" />
    <path d="M16 5.5a3 3 0 010 5.8M17 20a6 6 0 00-2-4.4" />
  </svg>
);

export const IconDevices = (
  <svg {...S} {...stroke}>
    <rect x="2" y="5" width="13" height="10" rx="2" />
    <path d="M6 19h6" />
    <rect x="17" y="9" width="5" height="10" rx="1.5" />
  </svg>
);

export const IconShield = (
  <svg {...S} {...stroke}>
    <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
  </svg>
);
