/**
 * الشخصية — تعرض الأصل المولّد لحالة الشخصية.
 *
 * الأصول في `public/characters/{id}/{state}.png` بخلفية شفافة، مولّدة عبر
 * GPT Image من الموجّهات في `scripts/art-spec.mjs` ومقطّعة من ورقة نماذج 3×3
 * فتبقى الحالات التسع لنفس الشخصية متطابقة الهوية.
 *
 * إضافة شخصية جديدة: سطر في `roster.ts` + مجلد أصول بنفس المعرّف.
 */

import { useState, type CSSProperties } from 'react';
import { characterById, type CharacterState } from '../../game/roster';
import './character.css';

interface Props {
  characterId: string;
  state?: CharacterState;
  /** الارتفاع بالبكسل */
  size?: number;
  /** يوقف التنفّس — شاشات الليل والقوائم المزدحمة */
  still?: boolean;
  className?: string;
  title?: string;
  style?: CSSProperties;
  /** أولوية التحميل: الشخصيات الكبيرة في المشهد الحالي */
  eager?: boolean;
}

export function Character({
  characterId,
  state = 'idle',
  size = 200,
  still = false,
  className = '',
  title,
  style,
  eager = false,
}: Props) {
  const def = characterById(characterId);
  const [failed, setFailed] = useState(false);

  // نسبة الأصول ثابتة تقريبًا (3 رؤوس طولًا) فيُحجز مكانها قبل التحميل
  // ويُمنع ارتجاج التخطيط.
  const width = Math.round(size * 0.62);

  if (failed) {
    return (
      <span
        className={`character character--missing ${className}`}
        style={{ width, height: size, ...style }}
        role="img"
        aria-label={title ?? def.name}
      />
    );
  }

  return (
    <img
      src={`${def.art}/${state}.png`}
      alt={title ?? def.name}
      height={size}
      width={width}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : 'auto'}
      onError={() => setFailed(true)}
      className={`character ${still ? 'character--still' : ''} ${className}`}
      data-state={state}
      style={{ height: size, width: 'auto', ...style }}
    />
  );
}
