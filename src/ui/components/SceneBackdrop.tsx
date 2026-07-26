/**
 * خلفية المشهد — ليست تدرّجًا زخرفيًا بل مشهد مرسوم:
 * سماء بلون واحد، أفق مدينة، هالة المصباح الدافئ، وحافة الطاولة في المقدمة.
 *
 * قاعدة تصميم: كل الحدود اللونية القوية تبقى في الثلث السفلي فقط، حتى لا يمرّ
 * خط أفقي وسط الشخصيات أو النصوص. منطقة المحتوى تبقى بلون واحد هادئ.
 *
 * `tone` يحرّك المشهد من المساء إلى الليل إلى الفجر مع تقدّم الجولة.
 */

import './scene-backdrop.css';

export type SceneTone = 'evening' | 'night' | 'deep-night' | 'dawn';

interface Palette {
  sky: string;
  city: string;
  glow: string;
  glowOpacity: number;
}

const SKY: Record<SceneTone, Palette> = {
  evening: {
    sky: 'oklch(0.26 0.075 268)',
    city: 'oklch(0.20 0.065 270)',
    glow: 'oklch(0.62 0.13 300)',
    glowOpacity: 0.16,
  },
  night: {
    sky: 'oklch(0.19 0.058 264)',
    city: 'oklch(0.15 0.05 266)',
    glow: 'oklch(0.80 0.145 78)',
    glowOpacity: 0.12,
  },
  'deep-night': {
    sky: 'oklch(0.115 0.038 265)',
    city: 'oklch(0.09 0.03 266)',
    glow: 'oklch(0.70 0.10 250)',
    glowOpacity: 0.08,
  },
  dawn: {
    sky: 'oklch(0.28 0.072 266)',
    city: 'oklch(0.21 0.06 268)',
    glow: 'oklch(0.72 0.14 55)',
    glowOpacity: 0.24,
  },
};

interface Props {
  tone?: SceneTone;
  /** يخفي حافة الطاولة على شاشات اللاعب الصغيرة */
  table?: boolean;
  stars?: boolean;
}

export function SceneBackdrop({ tone = 'night', table = true, stars = true }: Props) {
  const palette = SKY[tone];

  return (
    <div className="scene-backdrop" data-tone={tone} aria-hidden="true">
      <svg
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMax slice"
        className="scene-backdrop__svg"
      >
        <rect width="1200" height="800" fill={palette.sky} />

        {stars && (
          <g className="scene-backdrop__stars" fill="oklch(0.88 0.07 225)">
            {STAR_POSITIONS.map(([cx, cy, r], index) => (
              <circle
                key={index}
                cx={cx}
                cy={cy}
                r={r}
                style={{ animationDelay: `${index * 0.4}s` }}
              />
            ))}
          </g>
        )}

        {/* هالة المصباح — مصدر الضوء الوحيد، منخفضة قرب الطاولة */}
        <ellipse cx="600" cy="700" rx="520" ry="230" fill={palette.glow} opacity={palette.glowOpacity} />
        <ellipse cx="600" cy="716" rx="300" ry="130" fill={palette.glow} opacity={palette.glowOpacity * 0.8} />

        {/* أفق المدينة — كله تحت الثلث السفلي */}
        <g fill={palette.city}>
          <rect x="20" y="560" width="96" height="120" />
          <rect x="132" y="516" width="62" height="164" />
          <rect x="210" y="586" width="118" height="94" />
          <rect x="344" y="546" width="54" height="134" />
          <rect x="820" y="540" width="80" height="140" />
          <rect x="916" y="592" width="126" height="88" />
          <rect x="1058" y="556" width="70" height="124" />
        </g>
        <rect y="676" width="1200" height="24" fill={palette.city} />

        {table && (
          <>
            <path d="M -40 800 L -40 706 Q 600 654 1240 706 L 1240 800 Z" fill="oklch(0.25 0.048 55)" />
            <path d="M -40 712 Q 600 660 1240 712" fill="none" stroke="var(--ink)" strokeWidth="6" />
            <path
              d="M -40 738 Q 600 686 1240 738"
              fill="none"
              stroke="oklch(0.32 0.055 55)"
              strokeWidth="12"
            />
          </>
        )}
      </svg>
      <div className="scene-backdrop__vignette" />
    </div>
  );
}

const STAR_POSITIONS: Array<[number, number, number]> = [
  [140, 90, 3],
  [300, 150, 2],
  [420, 70, 2.5],
  [560, 130, 2],
  [700, 60, 3],
  [840, 140, 2],
  [980, 90, 2.5],
  [1110, 160, 2],
  [220, 250, 2],
  [1040, 260, 2.5],
  [640, 300, 2],
  [380, 360, 2],
];
