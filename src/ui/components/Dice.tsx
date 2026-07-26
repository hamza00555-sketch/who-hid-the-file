/**
 * النرد الرقمي — مكعب كرتوني يرتد ويدور ثم يستقر على النتيجة.
 */

import { useEffect, useState } from 'react';
import type { WakeSlot } from '../../game/types';
import './dice.css';

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [30, 30],
    [70, 70],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [30, 30],
    [70, 30],
    [30, 70],
    [70, 70],
  ],
  5: [
    [30, 30],
    [70, 30],
    [50, 50],
    [30, 70],
    [70, 70],
  ],
  6: [
    [30, 26],
    [70, 26],
    [30, 50],
    [70, 50],
    [30, 74],
    [70, 74],
  ],
};

interface Props {
  value: WakeSlot | null;
  rolling?: boolean;
  size?: number;
  tone?: 'amber' | 'sky';
}

export function Dice({ value, rolling = false, size = 120, tone = 'amber' }: Props) {
  const [face, setFace] = useState<number>(value ?? 1);

  useEffect(() => {
    if (!rolling) {
      if (value) setFace(value);
      return;
    }
    const timer = window.setInterval(() => {
      setFace(1 + Math.floor(Math.random() * 6));
    }, 90);
    return () => window.clearInterval(timer);
  }, [rolling, value]);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={rolling ? 'النرد يدور' : `النرد يُظهر ${face}`}
      className={`dice ${rolling ? 'dice--rolling' : 'dice--settled'}`}
      data-tone={tone}
    >
      <rect
        x="6"
        y="6"
        width="88"
        height="88"
        rx="20"
        fill="var(--dice-face)"
        stroke="var(--ink)"
        strokeWidth="5"
      />
      <path d="M 60 10 L 90 10 Q 94 10 94 16 L 94 46 Z" fill="var(--ink)" opacity="0.1" />
      {(PIPS[face] ?? []).map(([cx, cy], index) => (
        <circle key={index} cx={cx} cy={cy} r="8" fill="var(--ink)" />
      ))}
    </svg>
  );
}
