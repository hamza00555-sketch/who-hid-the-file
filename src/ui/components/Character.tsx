/**
 * الشخصية — رسم إجرائي بأسلوب كرتون تلفزيوني من بدايات الألفينات.
 *
 * القواعد الأسلوبية المطبَّقة هنا:
 * خط خارجي نظيف وسميك بلون حبر أزرق-أسود، رأس أكبر من الواقع (chibi خفيف)،
 * ظلال مسطحة بلا تدرّج، Silhouette قوي، تعبيرات مبالغة، تفاصيل محدودة.
 *
 * الشخصية كلها SVG مولّد من `CharacterDef` — إضافة شخصية = سطر في roster.ts.
 * عند توفّر أصول مرسومة يدويًا يكفي ملء `artSrc` وسيستخدمها المكوّن بدلًا من الرسم.
 */

import { useId, type CSSProperties } from 'react';
import { characterById, type CharacterDef, type CharacterState } from '../../game/roster';
import './character.css';

interface Props {
  characterId: string;
  state?: CharacterState;
  /** الارتفاع بالبكسل — العرض يُحسب تلقائيًا */
  size?: number;
  /** يوقف الرمش والتنفس (شاشات الليل) */
  still?: boolean;
  className?: string;
  title?: string;
  style?: CSSProperties;
}

const INK = 'var(--ink)';
const W = 200;
const H = 240;

const BUILD_WIDTH = { slim: 30, regular: 37, broad: 45 } as const;

export function Character({
  characterId,
  state = 'idle',
  size = 200,
  still = false,
  className = '',
  title,
  style,
}: Props) {
  const def = characterById(characterId);
  const uid = useId().replace(/[:]/g, '');

  if (def.artSrc) {
    return (
      <img
        src={def.artSrc}
        alt={title ?? def.name}
        height={size}
        className={`character ${className}`}
      />
    );
  }

  const half = BUILD_WIDTH[def.build];
  const tilt = headTilt(state);
  const showZzz = state === 'asleep';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      height={size}
      width={(size * W) / H}
      role="img"
      aria-label={title ?? def.name}
      className={`character ${still ? 'character--still' : ''} ${className}`}
      data-state={state}
      style={style}
    >
      <defs>
        <pattern
          id={`shemagh-${uid}`}
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="14" height="14" fill="#f6f7fb" />
          <rect width="14" height="4.5" fill={def.headwear === 'shemagh-red' ? '#c9403a' : '#dfe4ee'} />
          <rect width="4.5" height="14" fill={def.headwear === 'shemagh-red' ? '#c9403a' : '#dfe4ee'} />
        </pattern>
        <clipPath id={`face-${uid}`}>
          <ellipse cx="100" cy="80" rx="46" ry="50" />
        </clipPath>
      </defs>

      {/* ظل أرضي مسطح */}
      <ellipse cx="100" cy="232" rx={half + 22} ry="7" fill={INK} opacity="0.28" />

      <g className="character__body">
        {def.outfit === 'hoodie' && (
          <path
            d={`M ${100 - half - 6} 150 Q 100 96 ${100 + half + 6} 150 Z`}
            fill={def.outfitColor}
            stroke={INK}
            strokeWidth="4"
            strokeLinejoin="round"
          />
        )}

        <Arms state={state} half={half} def={def} />

        {/* الجذع */}
        <path
          d={torsoPath(def, half)}
          fill={def.outfitColor}
          stroke={INK}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <Collar def={def} half={half} />

        {/* الرقبة خلف الرأس */}
        <rect x="88" y="112" width="24" height="26" rx="9" fill={def.skin} stroke={INK} strokeWidth="4" />
      </g>

      <g
        className="character__head"
        style={{ transform: `rotate(${tilt}deg)`, transformOrigin: '100px 118px' }}
      >
        <HairBack def={def} uid={uid} />

        {/* الوجه */}
        <ellipse
          cx="100"
          cy="80"
          rx="46"
          ry="50"
          fill={def.skin}
          stroke={INK}
          strokeWidth="4"
        />
        {/* ظل مسطح على جانب واحد */}
        <g clipPath={`url(#face-${uid})`}>
          <path d="M 128 30 L 152 30 L 152 132 L 118 132 Z" fill={INK} opacity="0.1" />
        </g>

        {/* الأذنان */}
        {def.headwear === 'none' && (
          <>
            <ellipse cx="54" cy="84" rx="8" ry="11" fill={def.skin} stroke={INK} strokeWidth="4" />
            <ellipse cx="146" cy="84" rx="8" ry="11" fill={def.skin} stroke={INK} strokeWidth="4" />
          </>
        )}

        <Face state={state} def={def} />
        <FacialHair def={def} state={state} />
        <HairFront def={def} uid={uid} />
        <Accessory def={def} state={state} />
      </g>

      {showZzz && (
        <g className="character__zzz" fill={'var(--sky)'} fontWeight="800" fontSize="20">
          <text x="150" y="42">
            z
          </text>
          <text x="164" y="24" fontSize="15">
            z
          </text>
        </g>
      )}
    </svg>
  );
}

function headTilt(state: CharacterState): number {
  switch (state) {
    case 'asleep':
      return 9;
    case 'suspicious':
      return -5;
    case 'hiding':
      return 6;
    case 'victory':
      return -3;
    case 'defeat':
      return 8;
    case 'look-right':
      return 4;
    case 'look-left':
      return -4;
    default:
      return 0;
  }
}

function torsoPath(def: CharacterDef, half: number): string {
  const top = 134;
  const bottom = 230;
  if (def.outfit === 'thobe' || def.outfit === 'abaya') {
    const flare = def.outfit === 'abaya' ? 26 : 16;
    return `M ${100 - half} ${top} Q 100 ${top - 12} ${100 + half} ${top} L ${100 + half + flare} ${bottom} L ${100 - half - flare} ${bottom} Z`;
  }
  return `M ${100 - half} ${top} Q 100 ${top - 12} ${100 + half} ${top} L ${100 + half + 6} ${bottom} L ${100 - half - 6} ${bottom} Z`;
}

function Collar({ def, half }: { def: CharacterDef; half: number }) {
  if (def.outfit === 'thobe' || def.outfit === 'abaya') {
    return (
      <path
        d={`M 92 136 L 100 156 L 108 136`}
        fill="none"
        stroke={INK}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    );
  }
  if (def.outfit === 'blazer') {
    return (
      <>
        <path
          d={`M ${100 - half + 4} 138 L 100 172 L ${100 + half - 4} 138 L 100 150 Z`}
          fill={def.accentColor}
          stroke={INK}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
      </>
    );
  }
  if (def.outfit === 'hoodie') {
    return (
      <path
        d="M 84 138 Q 100 152 116 138"
        fill="none"
        stroke={INK}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    );
  }
  return (
    <>
      <path
        d="M 88 136 L 100 154 L 112 136"
        fill={def.accentColor}
        stroke={INK}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <circle cx="100" cy="176" r="3.4" fill={INK} />
      <circle cx="100" cy="198" r="3.4" fill={INK} />
    </>
  );
}

/** نصف عرض الجذع عند الحافة السفلى — الذراعان يجب أن تخرجا عنه ليبقى الـ Silhouette واضحًا. */
function hemHalf(def: CharacterDef, half: number): number {
  if (def.outfit === 'abaya') return half + 26;
  if (def.outfit === 'thobe') return half + 16;
  return half + 6;
}

function Arms({
  state,
  half,
  def,
}: {
  state: CharacterState;
  half: number;
  def: CharacterDef;
}) {
  const sleeve = def.outfitColor;
  const shoulderY = 148;
  const right = 100 - half - 2;
  const left = 100 + half + 2;
  // نهاية الذراع خارج حافة الثوب دائمًا، وإلا اختفت داخل الجذع
  const hem = hemHalf(def, half);
  const restRight = 100 - hem - 7;
  const restLeft = 100 + hem + 7;

  if (state === 'victory') {
    return (
      <g stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d={`M ${right} ${shoulderY} Q ${right - 26} 116 ${right - 16} 82`} fill="none" stroke={sleeve} strokeWidth="17" />
        <path d={`M ${right} ${shoulderY} Q ${right - 26} 116 ${right - 16} 82`} fill="none" strokeWidth="4" />
        <path d={`M ${left} ${shoulderY} Q ${left + 26} 116 ${left + 16} 82`} fill="none" stroke={sleeve} strokeWidth="17" />
        <path d={`M ${left} ${shoulderY} Q ${left + 26} 116 ${left + 16} 82`} fill="none" strokeWidth="4" />
        <circle cx={right - 16} cy="76" r="9" fill={def.skin} />
        <circle cx={left + 16} cy="76" r="9" fill={def.skin} />
      </g>
    );
  }

  if (state === 'hiding') {
    return (
      <g stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d={`M ${right} ${shoulderY} Q ${restRight - 8} 186 ${restRight} 208`} fill="none" stroke={sleeve} strokeWidth="17" />
        <path d={`M ${right} ${shoulderY} Q ${restRight - 8} 186 ${restRight} 208`} fill="none" strokeWidth="4" />
        <circle cx={restRight} cy="210" r="8" fill={def.skin} strokeWidth="3.5" />
        {/* يد مرفوعة بجانب الفم — إشارة الإخفاء */}
        <path d={`M ${left} ${shoulderY} Q ${left + 20} 128 ${left - 12} 104`} fill="none" stroke={sleeve} strokeWidth="17" />
        <path d={`M ${left} ${shoulderY} Q ${left + 20} 128 ${left - 12} 104`} fill="none" strokeWidth="4" />
        <circle cx={left - 14} cy="100" r="10" fill={def.skin} />
      </g>
    );
  }

  if (state === 'defeat') {
    const dr = `M ${right} ${shoulderY} Q ${restRight - 6} 190 ${restRight} 220`;
    const dl = `M ${left} ${shoulderY} Q ${restLeft + 6} 190 ${restLeft} 220`;
    return (
      <g stroke={INK} strokeWidth="4" strokeLinecap="round">
        <path d={dr} fill="none" stroke={sleeve} strokeWidth="17" />
        <path d={dr} fill="none" strokeWidth="4" />
        <path d={dl} fill="none" stroke={sleeve} strokeWidth="17" />
        <path d={dl} fill="none" strokeWidth="4" />
        <circle cx={restRight} cy="222" r="8" fill={def.skin} strokeWidth="3.5" />
        <circle cx={restLeft} cy="222" r="8" fill={def.skin} strokeWidth="3.5" />
      </g>
    );
  }

  const ar = `M ${right} ${shoulderY} Q ${restRight - 8} 180 ${restRight} 210`;
  const al = `M ${left} ${shoulderY} Q ${restLeft + 8} 180 ${restLeft} 210`;
  return (
    <g stroke={INK} strokeWidth="4" strokeLinecap="round">
      <path d={ar} fill="none" stroke={sleeve} strokeWidth="17" />
      <path d={ar} fill="none" strokeWidth="4" />
      <path d={al} fill="none" stroke={sleeve} strokeWidth="17" />
      <path d={al} fill="none" strokeWidth="4" />
      <circle cx={restRight} cy="212" r="8" fill={def.skin} stroke={INK} strokeWidth="3.5" />
      <circle cx={restLeft} cy="212" r="8" fill={def.skin} stroke={INK} strokeWidth="3.5" />
    </g>
  );
}

/* ── الوجه: العيون والحواجب والفم ── */

function Face({ state, def }: { state: CharacterState; def: CharacterDef }) {
  const gaze = gazeOffset(state);

  if (state === 'asleep') {
    return (
      <g stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none">
        <path d="M 70 82 Q 82 92 94 82" />
        <path d="M 106 82 Q 118 92 130 82" />
        <ellipse cx="100" cy="106" rx="7" ry="6" fill={INK} opacity="0.85" stroke="none" />
        <path d="M 66 62 Q 80 56 92 60" strokeWidth="4" />
        <path d="M 108 60 Q 120 56 134 62" strokeWidth="4" />
      </g>
    );
  }

  const eyeShape = eyeGeometry(state);

  return (
    <g>
      {/* الحواجب */}
      <g stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none">
        <path d={browPath(state, 'right')} />
        <path d={browPath(state, 'left')} />
      </g>

      {/* العيون */}
      <g className="character__eyes">
        <ellipse
          cx="82"
          cy="82"
          rx={eyeShape.rx}
          ry={eyeShape.ry}
          fill="#fdfdff"
          stroke={INK}
          strokeWidth="3.5"
        />
        <ellipse
          cx="118"
          cy="82"
          rx={eyeShape.rx}
          ry={eyeShape.ry}
          fill="#fdfdff"
          stroke={INK}
          strokeWidth="3.5"
        />
        <circle cx={82 + gaze} cy={82 + eyeShape.pupilDy} r={eyeShape.pupil} fill={INK} />
        <circle cx={118 + gaze} cy={82 + eyeShape.pupilDy} r={eyeShape.pupil} fill={INK} />
        <circle cx={82 + gaze + 2.5} cy={78 + eyeShape.pupilDy} r="2" fill="#fff" />
        <circle cx={118 + gaze + 2.5} cy={78 + eyeShape.pupilDy} r="2" fill="#fff" />
      </g>

      {/* الفم */}
      <path
        d={mouthPath(state)}
        fill={state === 'startled' ? INK : 'none'}
        stroke={INK}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* احمرار خدود للفوز */}
      {state === 'victory' && (
        <g fill={def.accentColor} opacity="0.55">
          <ellipse cx="64" cy="98" rx="10" ry="6" />
          <ellipse cx="136" cy="98" rx="10" ry="6" />
        </g>
      )}

      {/* قطرة عرق للتوتر */}
      {state === 'hiding' && (
        <path
          d="M 136 52 q 6 10 0 14 q -6 -4 0 -14 z"
          fill="var(--sky)"
          stroke={INK}
          strokeWidth="2.5"
        />
      )}
    </g>
  );
}

function eyeGeometry(state: CharacterState) {
  switch (state) {
    case 'startled':
      return { rx: 15, ry: 17, pupil: 6.5, pupilDy: 0 };
    case 'suspicious':
      return { rx: 14, ry: 6.5, pupil: 5, pupilDy: 0 };
    case 'defeat':
      return { rx: 12, ry: 9, pupil: 5, pupilDy: 2 };
    case 'victory':
      return { rx: 13, ry: 11, pupil: 6, pupilDy: -1 };
    default:
      return { rx: 13, ry: 13, pupil: 6, pupilDy: 0 };
  }
}

function gazeOffset(state: CharacterState): number {
  // في SVG المحور س يزيد يمينًا على الشاشة؛ «ينظر يمينًا» = يمين اللاعب المقابل
  switch (state) {
    case 'look-right':
      return 6;
    case 'look-left':
      return -6;
    case 'hiding':
      return -5;
    case 'suspicious':
      return 5;
    default:
      return 0;
  }
}

function browPath(state: CharacterState, side: 'right' | 'left'): string {
  const x = side === 'right' ? 82 : 118;
  const w = 15;
  switch (state) {
    case 'startled':
      return `M ${x - w} 54 Q ${x} 46 ${x + w} 54`;
    case 'suspicious':
      return side === 'right'
        ? `M ${x - w} 60 L ${x + w} 66`
        : `M ${x - w} 60 L ${x + w} 52`;
    case 'defeat':
      return side === 'right'
        ? `M ${x - w} 58 L ${x + w} 66`
        : `M ${x - w} 66 L ${x + w} 58`;
    case 'victory':
      return `M ${x - w} 58 Q ${x} 50 ${x + w} 58`;
    case 'hiding':
      return side === 'right'
        ? `M ${x - w} 62 Q ${x} 54 ${x + w} 60`
        : `M ${x - w} 60 Q ${x} 52 ${x + w} 62`;
    default:
      return `M ${x - w} 60 Q ${x} 55 ${x + w} 60`;
  }
}

function mouthPath(state: CharacterState): string {
  switch (state) {
    case 'startled':
      return 'M 86 106 Q 100 100 114 106 Q 100 124 86 106 Z';
    case 'suspicious':
      return 'M 86 110 L 114 108';
    case 'victory':
      return 'M 82 106 Q 100 128 118 106';
    case 'defeat':
      return 'M 84 118 Q 100 104 116 118';
    case 'hiding':
      return 'M 86 112 Q 96 106 112 110';
    default:
      return 'M 87 108 Q 100 118 113 108';
  }
}

/* ── الشعر وغطاء الرأس ── */

function HairBack({ def, uid }: { def: CharacterDef; uid: string }) {
  if (def.headwear === 'hijab' || def.headwear === 'tarha') {
    return (
      <path
        d="M 100 22 Q 154 22 154 92 Q 154 136 140 158 L 60 158 Q 46 136 46 92 Q 46 22 100 22 Z"
        fill={def.headwear === 'hijab' ? def.accentColor : def.outfitColor}
        stroke={INK}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    );
  }
  if (def.headwear === 'shemagh-red' || def.headwear === 'shemagh-white' || def.headwear === 'ghutra') {
    return (
      <path
        d="M 100 20 Q 156 20 158 88 Q 160 130 148 152 L 52 152 Q 40 130 42 88 Q 44 20 100 20 Z"
        fill={def.headwear === 'ghutra' ? '#f7f8fc' : `url(#shemagh-${uid})`}
        stroke={INK}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    );
  }
  if (def.hair === 'bun') {
    return <circle cx="100" cy="26" r="17" fill={def.hairColor} stroke={INK} strokeWidth="4" />;
  }
  if (def.hair === 'ponytail') {
    return (
      <path
        d="M 138 46 Q 172 62 164 110 Q 160 132 146 128 Q 156 96 132 66 Z"
        fill={def.hairColor}
        stroke={INK}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    );
  }
  if (def.hair === 'wavy' || def.hair === 'curly') {
    return (
      <path
        d="M 100 24 Q 152 24 152 88 Q 152 120 144 132 L 56 132 Q 48 120 48 88 Q 48 24 100 24 Z"
        fill={def.hairColor}
        stroke={INK}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    );
  }
  return null;
}

function HairFront({ def, uid }: { def: CharacterDef; uid: string }) {
  const stroke = { stroke: INK, strokeWidth: 4, strokeLinejoin: 'round' as const };

  if (def.headwear === 'hijab') {
    return (
      <path
        d="M 100 30 Q 146 30 148 76 Q 128 44 100 44 Q 72 44 52 76 Q 54 30 100 30 Z"
        fill={def.hairColor}
        opacity="0"
        {...stroke}
        strokeWidth="0"
      />
    );
  }
  if (def.headwear === 'tarha') {
    // طرحة تكشف مقدمة الشعر
    return (
      <path
        d="M 100 32 Q 138 32 144 62 Q 122 46 100 48 Q 78 46 56 62 Q 62 32 100 32 Z"
        fill={def.hairColor}
        {...stroke}
      />
    );
  }
  if (
    def.headwear === 'shemagh-red' ||
    def.headwear === 'shemagh-white' ||
    def.headwear === 'ghutra'
  ) {
    // العقال
    return (
      <g>
        <ellipse
          cx="100"
          cy="34"
          rx="54"
          ry="13"
          fill="none"
          stroke={INK}
          strokeWidth="9"
        />
        <ellipse cx="100" cy="30" rx="54" ry="13" fill="none" stroke={INK} strokeWidth="7" />
        <ellipse cx="100" cy="34" rx="54" ry="13" fill="none" stroke="#2c2c34" strokeWidth="5" />
      </g>
    );
  }

  switch (def.hair) {
    case 'buzz':
      return (
        <path d="M 56 66 Q 100 22 144 66 Q 100 46 56 66 Z" fill={def.hairColor} {...stroke} />
      );
    case 'fringe':
      return (
        <path
          d="M 54 68 Q 60 26 100 26 Q 140 26 146 68 Q 126 46 108 60 Q 92 40 74 58 Z"
          fill={def.hairColor}
          {...stroke}
        />
      );
    case 'curly':
      return (
        <g fill={def.hairColor} {...stroke}>
          <circle cx="66" cy="44" r="18" />
          <circle cx="100" cy="30" r="21" />
          <circle cx="134" cy="44" r="18" />
        </g>
      );
    case 'wavy':
      return (
        <path
          d="M 52 70 Q 58 26 100 26 Q 142 26 148 70 Q 132 48 112 58 Q 96 40 78 56 Q 66 50 52 70 Z"
          fill={def.hairColor}
          {...stroke}
        />
      );
    case 'bun':
    case 'ponytail':
      return (
        <path
          d="M 54 64 Q 62 24 100 24 Q 138 24 146 64 Q 122 44 100 46 Q 78 44 54 64 Z"
          fill={def.hairColor}
          {...stroke}
        />
      );
    default:
      return (
        <path
          d="M 54 66 Q 62 24 100 24 Q 138 24 146 66 Q 130 42 100 42 Q 70 42 54 66 Z"
          fill={def.hairColor}
          {...stroke}
          key={uid}
        />
      );
  }
}

function FacialHair({ def, state }: { def: CharacterDef; state: CharacterState }) {
  if (def.facialHair === 'none') return null;
  const opacity = def.facialHair === 'stubble' ? 0.32 : 1;

  if (def.facialHair === 'moustache') {
    return (
      <path
        d="M 84 100 Q 100 94 116 100 Q 100 106 84 100 Z"
        fill={def.hairColor}
        stroke={INK}
        strokeWidth="2.5"
      />
    );
  }

  return (
    <g opacity={opacity}>
      <path
        d="M 58 88 Q 62 132 100 132 Q 138 132 142 88 Q 138 118 100 118 Q 62 118 58 88 Z"
        fill={def.hairColor}
        stroke={INK}
        strokeWidth={def.facialHair === 'stubble' ? 0 : 3.5}
        strokeLinejoin="round"
      />
      {def.facialHair === 'beard' && state !== 'startled' && (
        <path d="M 84 100 Q 100 94 116 100 Q 100 107 84 100 Z" fill={def.hairColor} />
      )}
    </g>
  );
}

function Accessory({ def, state }: { def: CharacterDef; state: CharacterState }) {
  switch (def.accessory) {
    case 'glasses':
      return (
        <g fill="none" stroke={INK} strokeWidth="4">
          <rect x="62" y="68" width="38" height="30" rx="10" fill="#cfe6f7" fillOpacity="0.22" />
          <rect x="104" y="68" width="38" height="30" rx="10" fill="#cfe6f7" fillOpacity="0.22" />
          <path d="M 100 82 L 104 82" />
          <path d="M 62 80 L 50 78" />
          <path d="M 142 80 L 154 78" />
        </g>
      );
    case 'headphones':
      return (
        <g stroke={INK} strokeWidth="4" fill={def.accentColor}>
          <path d="M 48 82 Q 48 18 100 18 Q 152 18 152 82" fill="none" strokeWidth="7" />
          <rect x="36" y="72" width="24" height="34" rx="10" />
          <rect x="140" y="72" width="24" height="34" rx="10" />
        </g>
      );
    case 'cap':
      return (
        <g stroke={INK} strokeWidth="4" strokeLinejoin="round">
          <path d="M 52 46 Q 58 12 100 12 Q 142 12 148 46 Z" fill={def.accentColor} />
          <path d="M 52 46 L 24 54 Q 44 62 60 52 Z" fill={def.accentColor} />
        </g>
      );
    case 'earring':
      return (
        <circle cx="146" cy="96" r="5" fill={def.accentColor} stroke={INK} strokeWidth="2.5" />
      );
    case 'lanyard':
      return (
        <g stroke={INK} strokeWidth="3.5">
          <path d="M 88 140 L 100 176 L 112 140" fill="none" stroke={def.accentColor} strokeWidth="6" />
          <rect
            x="90"
            y="174"
            width="22"
            height="16"
            rx="3"
            fill="#f7f8fc"
            transform={state === 'victory' ? 'rotate(-8 101 182)' : undefined}
          />
        </g>
      );
    default:
      return null;
  }
}
