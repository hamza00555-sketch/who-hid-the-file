/**
 * ورقة الشخصيات — كل شخصية في كل حالاتها.
 *
 * ليست شاشة لعب: أداة عمل للمراجعة البصرية وضبط الرسم، ومرجع لمن سيرسم
 * الأصول النهائية لاحقًا. الرابط: `#/roster`
 */

import { CHARACTER_STATES, ROSTER } from '../game/roster';
import { Character } from '../ui/components/Character';
import { Dice } from '../ui/components/Dice';
import { FileProp } from '../ui/components/FileProp';
import './roster-sheet.css';

const STATE_LABELS: Record<string, string> = {
  idle: 'عادية',
  asleep: 'نائمة',
  startled: 'مستيقظة ومتفاجئة',
  suspicious: 'تشك',
  hiding: 'تخفي شيئًا',
  victory: 'فوز',
  defeat: 'خسارة',
  'look-right': 'تنظر يمينًا',
  'look-left': 'تنظر يسارًا',
};

export function RosterSheet() {
  return (
    <div className="sheet">
      <header className="sheet__head">
        <h1>ورقة الشخصيات</h1>
        <p className="lede">
          {ROSTER.length} شخصيات × {CHARACTER_STATES.length} حالات — كلها مولّدة من
          <code> src/game/roster.ts</code>
        </p>
      </header>

      <section className="sheet__props">
        <div>
          <FileProp state="idle" size={130} />
          <span>الملف</span>
        </div>
        <div>
          <FileProp state="taken" size={130} />
          <span>الملف مأخوذ</span>
        </div>
        <div>
          <Dice value={5} size={100} />
          <span>نرد</span>
        </div>
        <div>
          <Dice value={3} size={100} tone="sky" />
          <span>نرد ثانٍ</span>
        </div>
      </section>

      {ROSTER.map((character) => (
        <section key={character.id} className="sheet__row">
          <header>
            <h2>{character.name}</h2>
            <p>{character.trait}</p>
            <code>{character.id}</code>
          </header>
          <div className="sheet__states">
            {CHARACTER_STATES.map((state) => (
              <figure key={state}>
                <Character characterId={character.id} state={state} size={130} still />
                <figcaption>{STATE_LABELS[state] ?? state}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
