/**
 * الملف — العنصر الفيزيائي في منتصف الطاولة، ونسخته المرسومة داخل اللعبة.
 * الشكل هو نفسه المرجع البصري للقطعة المطبوعة 3D (راجع printable-assets/).
 */

import './file-prop.css';

type PropState = 'idle' | 'breathing' | 'taken' | 'returned';

interface Props {
  state?: PropState;
  size?: number;
  className?: string;
}

const INK = 'var(--ink)';

export function FileProp({ state = 'idle', size = 160, className = '' }: Props) {
  if (state === 'taken') {
    return (
      <svg
        viewBox="0 0 200 170"
        height={size}
        width={(size * 200) / 170}
        role="img"
        aria-label="مكان الملف فارغ"
        className={`file-prop file-prop--taken ${className}`}
      >
        {/* غيمة كرتونية مكان الملف */}
        {/* غيمة فاتحة عمدًا: يجب أن تُرى من الطرف الآخر للطاولة على خلفية ليلية */}
        <g className="file-prop__puff" stroke={INK} strokeWidth="4">
          <circle cx="70" cy="96" r="26" fill="oklch(0.62 0.045 258)" />
          <circle cx="138" cy="98" r="24" fill="oklch(0.62 0.045 258)" />
          <circle cx="104" cy="82" r="32" fill="oklch(0.72 0.04 255)" />
          <circle cx="70" cy="96" r="26" fill="oklch(0.62 0.045 258)" stroke="none" />
          <circle cx="138" cy="98" r="24" fill="oklch(0.62 0.045 258)" stroke="none" />
          <circle cx="104" cy="82" r="32" fill="oklch(0.72 0.04 255)" stroke="none" />
        </g>
        <text
          x="100"
          y="104"
          textAnchor="middle"
          fontSize="66"
          fontWeight="900"
          fill="var(--amber)"
          stroke={INK}
          strokeWidth="5"
          paintOrder="stroke"
          className="file-prop__mark"
        >
          ؟
        </text>
        <ellipse cx="100" cy="150" rx="62" ry="8" fill={INK} opacity="0.3" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 200 170"
      height={size}
      width={(size * 200) / 170}
      role="img"
      aria-label="الملف"
      className={`file-prop file-prop--${state} ${className}`}
    >
      <ellipse cx="100" cy="152" rx="66" ry="9" fill={INK} opacity="0.32" />

      <g className="file-prop__stack">
        {/* أوراق خلف الملف */}
        <rect x="52" y="34" width="96" height="94" rx="6" fill="#f4f6fb" stroke={INK} strokeWidth="4" transform="rotate(-5 100 82)" />
        <rect x="58" y="30" width="96" height="94" rx="6" fill="#fdfdff" stroke={INK} strokeWidth="4" transform="rotate(4 100 82)" />

        {/* الغلاف */}
        <path
          d="M 40 52 L 84 52 L 94 40 L 160 40 Q 166 40 166 46 L 166 130 Q 166 136 160 136 L 40 136 Q 34 136 34 130 L 34 58 Q 34 52 40 52 Z"
          fill="var(--amber)"
          stroke={INK}
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
        {/* ظل مسطح على الغلاف */}
        <path
          d="M 120 40 L 160 40 Q 166 40 166 46 L 166 130 Q 166 136 160 136 L 120 136 Z"
          fill={INK}
          opacity="0.12"
        />
        {/* شريط ورقم */}
        <rect x="48" y="70" width="52" height="9" rx="4.5" fill={INK} opacity="0.55" />
        <rect x="48" y="88" width="34" height="9" rx="4.5" fill={INK} opacity="0.35" />
        <circle cx="140" cy="86" r="16" fill="var(--coral)" stroke={INK} strokeWidth="4" />
        <path d="M 133 86 L 138 92 L 148 80" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {state === 'returned' && (
        <g className="file-prop__sparks" stroke="var(--sky)" strokeWidth="5" strokeLinecap="round">
          <path d="M 22 32 L 12 22" />
          <path d="M 178 32 L 188 22" />
          <path d="M 100 18 L 100 6" />
        </g>
      )}
    </svg>
  );
}
