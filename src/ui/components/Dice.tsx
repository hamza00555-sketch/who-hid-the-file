/**
 * النرد الرقمي — يعرض وجه النتيجة، ويقلّب الوجوه أثناء الدوران.
 * الأصول: `public/props/dice/{1..6}.png`.
 */

import { useEffect, useState } from 'react';
import type { WakeSlot } from '../../game/types';
import './dice.css';

interface Props {
  value: WakeSlot | null;
  rolling?: boolean;
  size?: number;
  /** `sky` يلوّن النرد الثاني في وضع الأربعة لاعبين ليتميّز عن الأول */
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
    <span
      className={`dice ${rolling ? 'dice--rolling' : 'dice--settled'}`}
      data-tone={tone}
      style={{ width: size, height: size }}
      role="img"
      aria-label={rolling ? 'النرد يدور' : `النرد يُظهر ${face}`}
    >
      <img src={`/props/dice/${face}.png`} alt="" width={size} height={size} decoding="async" />
    </span>
  );
}

/** يُحمّل وجوه النرد مسبقًا حتى لا يومض التقليب أثناء الدوران. */
export function preloadDice() {
  for (let face = 1; face <= 6; face++) {
    const image = new Image();
    image.src = `/props/dice/${face}.png`;
  }
}
