/**
 * خلفية المشهد — مجلس سعودي مرسوم، تتحرك نغمته مع تقدّم الجولة.
 * الأصول: `public/scenes/{tone}.webp` (مولّدة عبر GPT Image).
 *
 * فوق الصورة حجاب خافت يرفع تباين النص دون طمس الرسم، فلا تحتاج الشاشات
 * إلى بطاقات بيضاء خلف كلامها.
 */

import './scene-backdrop.css';

export type SceneTone = 'evening' | 'night' | 'deep-night' | 'dawn';

interface Props {
  tone?: SceneTone;
  /** يُبقي مقدمة الطاولة ظاهرة؛ يُطفأ على شاشات اللاعب الضيقة */
  table?: boolean;
  /** مهملة — أُبقيت للتوافق مع نداءات الشاشات القائمة */
  stars?: boolean;
}

export function SceneBackdrop({ tone = 'night', table = true }: Props) {
  return (
    <div className="scene-backdrop" data-tone={tone} data-table={table} aria-hidden="true">
      {/* المشهد هو العنصر البصري الأساسي للشاشة، فيُحمَّل بأولوية عالية:
          تأخيره يترك الشاشة سوداء في أول رسم. */}
      <img
        className="scene-backdrop__image"
        src={`/scenes/${tone}.webp`}
        alt=""
        decoding="async"
        fetchPriority="high"
      />
      <div className="scene-backdrop__vignette" />
    </div>
  );
}

/** يُحمّل مشاهد الجولة مسبقًا حتى لا تومض الخلفية عند تغيّر المرحلة. */
export function preloadScenes() {
  for (const tone of ['evening', 'night', 'deep-night', 'dawn'] as const) {
    const image = new Image();
    image.src = `/scenes/${tone}.webp`;
  }
}
