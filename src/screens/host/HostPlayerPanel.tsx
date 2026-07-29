/**
 * شاشة المضيف **كلاعب**.
 *
 * حين يُشغَّل `hostPlays` يصير صاحب الجهاز الرئيسي لاعبًا كامل الحقوق: له
 * اسم وشخصية ومقعد وسرّ. لكن جهازه يقود الجولة أيضًا — فيحتاج الشاشتين معًا.
 *
 * لا منطق جديد هنا: كل مشهد هو مشهد اللاعب نفسه من `playerStages`. نسخة ثانية
 * من منطق «متى يُكشف الدور» أو «متى يجوز الفحص» كانت ستفترق عن الأصل عند أول
 * تعديل، وتُنتج لعبتين مختلفتين على طاولة واحدة.
 */

import { nightViewFor } from '../../game/night';
import type { Phase, PlayerProgress, PlayerPublic, PlayerSecret, RoomSettings, WakeSlot } from '../../game/types';
import { useSession } from '../../net/session';
import {
  PlayerDiceStage,
  PlayerNightStage,
  PlayerRoleStage,
  PlayerSecretStage,
  PlayerVotingStage,
} from '../player/playerStages';

export function HostPlayerPanel({
  code,
  me,
  secret,
  players,
  settings,
  phase,
  progress,
  nightSlot,
  secretResolved,
}: {
  code: string;
  me: PlayerPublic;
  secret: PlayerSecret | null;
  players: PlayerPublic[];
  settings: RoomSettings;
  phase: Phase;
  progress: Record<string, PlayerProgress>;
  nightSlot: WakeSlot | null;
  secretResolved: boolean;
}) {
  const { transport } = useSession();
  const mine = progress[me.id];
  const isNight = phase.startsWith('night-');

  const body = (() => {
    if (phase === 'role-distribution') {
      return (
        <PlayerRoleStage
          secret={secret}
          playerCount={players.length}
          acked={mine?.roleAck ?? false}
          onAck={() => void transport.ack(code, me.id, 'roleAck')}
        />
      );
    }

    if (phase === 'dice-roll') {
      return (
        <PlayerDiceStage
          code={code}
          me={me}
          secret={secret}
          settings={settings}
          playerCount={players.length}
          acked={mine?.diceAck ?? false}
        />
      );
    }

    if (isNight) {
      /*
        الإعتام لا يُرسم على الجهاز الرئيسي إطلاقًا.

        `PlayerNightStage` يعيد في حالة الإعتام صندوقًا أسود بارتفاع `100dvh` —
        وهو صحيح على جهاز اللاعب (الجهاز مقلوب ولا يُلمس)، وكارثة هنا: يبتلع
        شاشة الراوي كاملة فيرى المضيف والطاولة سوادًا بدل المرحلة والعدّ
        التنازلي.

        فيُسأل القرار أولًا، ولا يُرسم شيء إلا إن كان للمضيف فعل فعليّ.
      */
      const view = nightViewFor(secret, nightSlot, players.length, settings.diceMode);
      if (view === 'blackout') return null;
      return (
        <PlayerNightStage
          code={code}
          me={me}
          secret={secret}
          players={players}
          settings={settings}
          slot={nightSlot}
        />
      );
    }

    if (phase === 'secret-actions') {
      return (
        <PlayerSecretStage
          code={code}
          me={me}
          secret={secret}
          players={players}
          settings={settings}
          resolved={secretResolved}
          acked={mine?.secretAck ?? false}
        />
      );
    }

    if (phase === 'voting') {
      return (
        <PlayerVotingStage
          code={code}
          me={me}
          players={players}
          voted={mine?.voted ?? false}
        />
      );
    }

    return null;
  })();

  if (!body) return null;

  /*
    في الليل لا إطار ولا عنوان: مشهد الليل إمّا إعتام كامل أو شاشة المستيقظ
    وحده، وكلاهما يفسده صندوق مضيء حوله.
  */
  if (isNight) return <>{body}</>;

  return (
    <section className="host-me">
      <h2 className="host-me__title">دورك أنت</h2>
      {body}
    </section>
  );
}
