/**
 * بطل الشاشة الرئيسية.
 *
 * الرسم مقصوص بخلفية شفافة لا مشهدًا مستطيلًا. المشهد المستطيل كان يرسم
 * لوحًا كحليًّا فوق خلفية الصفحة مهما نُعّمت حوافه — والحلّ الوسط (تذويب
 * الحواف) أسوأ الاثنين: لا هو مقصوص ولا هو ممتدّ. أما المقصوص فيجلس على
 * مشهد التطبيق نفسه، فلا حدّ له عند أي عرض شاشة.
 *
 * وإن فشل تحميله عاد إلى تركيب الشخصيات الحيّ بدل أن يترك فجوة.
 */

import { useState } from 'react';
import { ROSTER } from '../game/roster';
import { Character } from '../ui/components/Character';
import { FileProp } from '../ui/components/FileProp';

export function HomeHero() {
  const [useArt, setUseArt] = useState(true);

  if (useArt) {
    return (
      <div className="home__hero" aria-hidden="true">
        <img
          src="/ui/home-hero.webp"
          alt=""
          decoding="async"
          fetchPriority="high"
          onError={() => setUseArt(false)}
        />
      </div>
    );
  }

  return (
    <div className="home__stage" aria-hidden="true">
      <Character
        characterId={ROSTER[0]!.id}
        state="look-left"
        size={150}
        className="home__char home__char--b"
      />
      <FileProp state="breathing" size={132} className="home__file" />
      <Character
        characterId={ROSTER[5]!.id}
        state="look-right"
        size={150}
        className="home__char home__char--c"
      />
    </div>
  );
}
