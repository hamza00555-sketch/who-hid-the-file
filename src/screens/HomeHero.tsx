/**
 * بطل الشاشة الرئيسية.
 *
 * الرسم الجاهز `/scenes/home-hero.webp` هو الأصل. وإن لم يكن موجودًا بعد —
 * أو فشل تحميله — يعود إلى تركيب الشخصيات الحيّ بدل أن يترك فجوة. هذا يسمح
 * بشحن التصميم قبل وصول الرسم، وباستبداله لاحقًا بلا تعديل كود.
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
          src="/scenes/home-hero.webp"
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
