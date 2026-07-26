/**
 * عناصر الواجهة المشتركة — أشكال «ملصق» بخط حبر خارجي وظل حافّ،
 * لا بطاقات بيضاء ولا زجاج ضبابي.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './kit.css';

/* ── الأزرار ── */

type ButtonTone = 'primary' | 'ghost' | 'danger' | 'quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: 'md' | 'lg' | 'xl';
  full?: boolean;
  icon?: ReactNode;
}

export function Button({
  tone = 'primary',
  size = 'md',
  full = false,
  icon,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn--${tone} btn--${size} ${full ? 'btn--full' : ''} ${className}`}
      {...rest}
    >
      {icon && <span className="btn__icon">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

/* ── اللوحة: شكل ملصق بحافة حبر ── */

export function Panel({
  children,
  tone = 'night',
  className = '',
  tilt = 0,
}: {
  children: ReactNode;
  tone?: 'night' | 'paper' | 'amber' | 'violet' | 'coral';
  className?: string;
  tilt?: number;
}) {
  return (
    <div
      className={`panel panel--${tone} ${className}`}
      style={tilt ? { rotate: `${tilt}deg` } : undefined}
    >
      {children}
    </div>
  );
}

/* ── عنوان المرحلة ── */

export function StageTitle({
  kicker,
  title,
  note,
}: {
  kicker?: string;
  title: string;
  note?: string;
}) {
  return (
    <header className="stage-title">
      {kicker && <p className="stage-title__kicker">{kicker}</p>}
      <h1>{title}</h1>
      {note && <p className="lede">{note}</p>}
    </header>
  );
}

/* ── فقاعة كلام كرتونية ── */

export function SpeechBubble({
  children,
  side = 'start',
}: {
  children: ReactNode;
  side?: 'start' | 'end';
}) {
  return (
    <div className={`bubble bubble--${side}`}>
      <div className="bubble__body">{children}</div>
    </div>
  );
}

/* ── شارة حالة ── */

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'live' | 'warn' | 'good' | 'secret';
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

/* ── عدّاد دائري كبير ── */

export function CountdownRing({
  seconds,
  total,
  label,
}: {
  seconds: number;
  total: number;
  label?: string;
}) {
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;

  return (
    <div className="countdown" role="timer" aria-live="off">
      <svg viewBox="0 0 200 200" className="countdown__ring">
        <circle cx="100" cy="100" r={radius} fill="none" stroke="var(--night-lift)" strokeWidth="16" />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="var(--sky)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          transform="rotate(-90 100 100)"
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <div className="countdown__value">
        <strong>{seconds}</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  );
}

/* ── شريط تقدّم اللاعبين: كم أنهى الخطوة ── */

export function ProgressPips({ done, total }: { done: number; total: number }) {
  return (
    <div className="pips" aria-label={`${done} من ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={`pips__dot ${index < done ? 'is-done' : ''}`} />
      ))}
    </div>
  );
}

/* ── حالة فارغة / انتظار ── */

export function WaitingNote({ children }: { children: ReactNode }) {
  return (
    <p className="waiting">
      <span className="waiting__dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {children}
    </p>
  );
}
