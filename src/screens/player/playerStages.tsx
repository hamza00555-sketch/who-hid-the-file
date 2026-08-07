/**
 * مشاهد جهاز اللاعب. كل شاشة: معلومة واحدة وزر رئيسي واحد.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { GAME_CONFIG, slotLabel } from '../../config/game.config';
import { characterById, type CharacterState } from '../../game/roster';
import { chooseSlot, submitPhysicalDice } from '../../game/deal';
import { canInspect, nightViewFor } from '../../game/night';
import { neighboursOf } from '../../game/seating';
import { rulesFor } from '../../game/rules';
import { validateVote, voteOptions } from '../../game/vote';
import type {
  Phase,
  PlayerPublic,
  PlayerSecret,
  RoomSettings,
  RoundResults,
  WakeSlot,
} from '../../game/types';
import { useSession, useRevealGate } from '../../net/session';
import { Character } from '../../ui/components/Character';
import { Dice } from '../../ui/components/Dice';
import { PlayerCard } from '../../ui/components/Table';
import { Badge, Button, Panel, WaitingNote } from '../../ui/components/kit';

/* ══════════════════════ الردهة ══════════════════════ */

export function PlayerLobbyStage({
  me,
  playerCount,
  onReady,
}: {
  me: PlayerPublic;
  playerCount: number;
  onReady: (value: boolean) => void;
}) {
  const character = characterById(me.avatarId);

  return (
    <>
      <Character characterId={me.avatarId} state={me.ready ? 'victory' : 'idle'} size={210} />
      <h2>{me.name}</h2>
      <p className="lede">{character.trait}</p>

      <Panel className="player-panel">
        <p>
          أنت اللاعب رقم <strong>{me.seat + 1}</strong> حول الطاولة، ومعك{' '}
          <strong>{playerCount}</strong> لاعبين.
        </p>
        <p className="eyebrow-note">
          إذا لم يطابق ترتيبك الجلوس الحقيقي، اطلب من المضيف تعديله.
        </p>
      </Panel>

      {me.ready ? (
        <>
          <Badge tone="live">أنت جاهز</Badge>
          <WaitingNote>بانتظار بقية اللاعبين</WaitingNote>
          <Button tone="ghost" onClick={() => onReady(false)}>
            تراجع
          </Button>
        </>
      ) : (
        <Button size="xl" full onClick={() => onReady(true)}>
          أنا جاهز
        </Button>
      )}
    </>
  );
}

/* ══════════════════════ الدور ══════════════════════ */

export function PlayerRoleStage({
  secret,
  playerCount,
  acked,
  onAck,
}: {
  secret: PlayerSecret | null;
  playerCount: number;
  acked: boolean;
  onAck: () => void;
}) {
  const gate = useRevealGate();

  if (!secret) return <WaitingNote>يوزّع المضيف الأدوار</WaitingNote>;

  if (acked) {
    return (
      <PlayerWaitStage
        title="حفظت دورك"
        note="ضع الجهاز على الطاولة وانتظر بقية اللاعبين."
        avatarId="faisal"
        state="hiding"
        hideAvatar
      />
    );
  }

  if (!gate.revealed) {
    return (
      <>
        <div className="role-cover" aria-hidden="true">
          <span>سرّي</span>
        </div>
        <h2>دورك جاهز</h2>
        <p className="lede">
          تأكد أن لا أحد ينظر إلى شاشتك، ثم اضغط لتكشف دورك.
        </p>
        <Button size="xl" full onClick={gate.reveal}>
          أظهر دوري
        </Button>
      </>
    );
  }

  const isHider = secret.role === 'hider';
  const rules = rulesFor(playerCount);

  return (
    <div className="role-card" data-role={secret.role}>
      <Character
        characterId={isHider ? 'tariq' : 'noura'}
        state={isHider ? 'hiding' : 'suspicious'}
        size={190}
      />
      <h1 className="role-card__name">
        {isHider ? GAME_CONFIG.roles.hider.label : GAME_CONFIG.roles.member.label}
      </h1>
      <p className="role-card__desc">
        {isHider
          ? `في موعدك، خذ ${GAME_CONFIG.prop.nameWithArticle} من منتصف الطاولة وأخفِه.`
          : `اعرف من أخفى ${GAME_CONFIG.prop.nameWithArticle} قبل انتهاء التصويت.`}
      </p>

      {isHider && rules.dicePerPlayer === 2 && (
        <Panel tone="amber">ستختار موعدًا واحدًا من نتيجتيك.</Panel>
      )}

      <Button size="xl" full onClick={onAck}>
        فهمت دوري
      </Button>
      <Button tone="ghost" onClick={gate.hide}>
        أخفِ الشاشة
      </Button>
    </div>
  );
}

/* ══════════════════════ النرد ══════════════════════ */

export function PlayerDiceStage({
  code,
  me,
  secret,
  settings,
  playerCount,
  acked,
}: {
  code: string;
  me: PlayerPublic;
  secret: PlayerSecret | null;
  settings: RoomSettings;
  playerCount: number;
  acked: boolean;
}) {
  const { transport } = useSession();
  const [rolling, setRolling] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [entries, setEntries] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const rules = rulesFor(playerCount);
  /*
    كل من يحصل على نتيجتين يختار واحدة — بما فيهم المُخفي.

    كان مستثنًى لأنه كان يستيقظ عند نتيجتيه معًا. وقد صار يستيقظ ليلةً واحدة
    مثل الجميع، فاستثناؤه يتركه بلا موعد فعّال إطلاقًا: لا يختار ولا يُختار
    له، فلا يستيقظ ولا يأخذ الملف — وتُلعب الجولة كلها بلا مُخفٍ.
  */
  const needsChoice = rules.memberChoosesSlot;

  useEffect(() => {
    setEntries(Array.from({ length: rules.dicePerPlayer }, () => ''));
  }, [rules.dicePerPlayer]);

  if (!secret) return <WaitingNote>بانتظار النرد</WaitingNote>;

  if (acked) {
    return (
      <PlayerWaitStage
        title="عرفت موعدك"
        note="ضع الجهاز على الطاولة والشاشة إلى الأسفل."
        avatarId={me.avatarId}
        state="asleep"
      />
    );
  }

  /* ── النرد الحقيقي ── */
  if (settings.diceMode === 'physical') {
    return (
      <>
        <h2>أدخل نتيجة نردك</h2>
        <p className="lede">
          ارمِ نردك داخل كوبك، انظر إليه وحدك، ثم اكتب الرقم هنا.
          {rules.dicePerPlayer === 2 && ' لديك نردان.'}
        </p>

        <div className="dice-entry">
          {entries.map((value, index) => (
            <input
              key={index}
              inputMode="numeric"
              pattern="[1-6]"
              maxLength={1}
              value={value}
              aria-label={`نتيجة النرد ${index + 1}`}
              onChange={(event) => {
                const next = [...entries];
                next[index] = event.target.value.replace(/[^1-6]/g, '').slice(0, 1);
                setEntries(next);
              }}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="join__error">
            {error}
          </p>
        )}

        <Button
          size="xl"
          full
          disabled={entries.some((value) => value === '')}
          onClick={async () => {
            try {
              const values = entries.map(Number);
              const updated = submitPhysicalDice(secret, values, playerCount);
              await transport.writeSecret(code, me.id, updated);
              setRevealed(true);
              setError(null);
              if (!rules.memberChoosesSlot) {
                await transport.ack(code, me.id, 'diceAck');
              }
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'رقم غير صالح.');
            }
          }}
        >
          أكّد الرقم
        </Button>

        {revealed && needsChoice && (
          <SlotChoice
            secret={secret}
            settings={settings}
            onChoose={async (slot) => {
              await transport.writeSecret(code, me.id, chooseSlot(secret, slot));
              await transport.ack(code, me.id, 'diceAck');
            }}
          />
        )}
      </>
    );
  }

  /* ── النرد الرقمي ── */
  if (!revealed) {
    return (
      <>
        <h2>ارمِ نردك</h2>
        <p className="lede">
          النتيجة سرية ولن تظهر على أي جهاز آخر
          {rules.dicePerPlayer === 2 && '. لديك نردان'}.
        </p>
        <div className="dice-row">
          {secret.dice.map((_, index) => (
            <Dice key={index} value={null} rolling={rolling} size={116} tone={index ? 'sky' : 'amber'} />
          ))}
        </div>
        <Button
          size="xl"
          full
          disabled={rolling}
          onClick={() => {
            setRolling(true);
            window.setTimeout(() => {
              setRolling(false);
              setRevealed(true);
            }, 1300);
          }}
        >
          ارمِ النرد
        </Button>
      </>
    );
  }

  return (
    <>
      <div className="dice-row">
        {secret.dice.map((value, index) => (
          <Dice key={index} value={value} size={116} tone={index ? 'sky' : 'amber'} />
        ))}
      </div>

      {needsChoice ? (
        <SlotChoice
          secret={secret}
          settings={settings}
          onChoose={async (slot) => {
            await transport.writeSecret(code, me.id, chooseSlot(secret, slot));
            await transport.ack(code, me.id, 'diceAck');
          }}
        />
      ) : (
        <>
          <h2 className="slot-headline">
            {secret.effectiveSlots.map((slot) => slotLabel(slot, settings.slotNaming)).join(' + ')}
          </h2>
          <p className="lede">
            {secret.effectiveSlots.length > 1
              ? 'تستيقظ في الموعدين.'
              : 'عند سماع هذا الموعد، افتح عينيك بصمت.'}
          </p>
          <Button size="xl" full onClick={() => void transport.ack(code, me.id, 'diceAck')}>
            عرفت موعدي
          </Button>
        </>
      )}
    </>
  );
}

function SlotChoice({
  secret,
  settings,
  onChoose,
}: {
  secret: PlayerSecret;
  settings: RoomSettings;
  onChoose: (slot: WakeSlot) => void;
}) {
  const unique = [...new Set(secret.dice)];

  if (unique.length === 1) {
    return (
      <>
        <h2 className="slot-headline">{slotLabel(unique[0]!, settings.slotNaming)}</h2>
        <p className="lede">نتيجتاك متطابقتان، فتستيقظ مرة واحدة.</p>
        <Button size="xl" full onClick={() => onChoose(unique[0]!)}>
          عرفت موعدي
        </Button>
      </>
    );
  }

  return (
    <>
      <h2>اختر موعدك</h2>
      <p className="lede">تستيقظ في واحد فقط من النتيجتين.</p>
      <div className="stack">
        {unique.map((slot) => (
          <Button key={slot} size="lg" full tone="quiet" onClick={() => onChoose(slot)}>
            {slotLabel(slot, settings.slotNaming)}
          </Button>
        ))}
      </div>
    </>
  );
}

/* ══════════════════════ الليل ══════════════════════ */

/**
 * شاشة الليل.
 *
 * الأصل إعتام كامل: الجهاز لا يُلمس ولا يضيء. الاستثناء الوحيد أن يكون
 * اللاعب مستيقظًا وحده في هذه اللحظة **وفي النمط الرقمي** — عندها يفحص
 * جاره من جهازه، وهو نظير رفع الكوب في نمط النرد الحقيقي.
 *
 * في نمط النرد والأكواب لا شيء على الشاشة إطلاقًا: الراوي يطلب رفع الكوب،
 * والمعلومة تحت الكوب لا في الجهاز. إضاءة الشاشة هناك تفضح المستيقظ.
 */
export function PlayerNightStage({
  code,
  me,
  secret,
  players,
  settings,
  phase,
  slot,
  endsAt,
}: {
  code: string;
  me: PlayerPublic;
  secret: PlayerSecret | null;
  players: PlayerPublic[];
  settings: RoomSettings;
  phase: Phase;
  slot: WakeSlot | null;
  endsAt: number | null;
}) {
  /*
    ── الاختيار لا يُنقض ──

    الفحص طلبٌ يُكتب على الشبكة ثم يملؤه المضيف، وبين اللحظتين تمرّ لقطات
    قديمة على الجهاز. فكانت البطاقتان تعودان بعد الضغط فيظنّ اللاعب أن ضغطته
    ضاعت — فيضغط الأخرى، ويظنّ أن له فحصين.

    هذه الذاكرة المحلّية تُغلق الباب فور الضغط: لا يعود المُنتقي في هذه الليلة
    مهما تأخّرت الشبكة. والمعيار هو الموعد نفسه، فليلة جديدة تفتحه من جديد.
  */
  const [pickedAt, setPickedAt] = useState<WakeSlot | null>(null);

  /*
    ── آخر الليل ──

    نداء واحد للمُخفي وحده. بقية الأجهزة تبقى على لوحة الليل نفسها بلا كلمة
    إضافية: أي فرق في الشكل بين جهاز وآخر هنا يكشف من نُودي.
  */
  if (phase === 'night-accomplices') {
    const isHider = secret?.role === 'hider';
    return (
      <NightHud
        title="آخر الليل"
        endsAt={endsAt}
        settings={settings}
        myTurn={isHider}
        task="افتح عينيك واختر من يساعدك. اختيارك سري ولن يعرفه غيرك."
      >
        {isHider && secret && secret.accompliceQuota > 0 && (
          <AccompliceChoice code={code} me={me} secret={secret} players={players} />
        )}
        {isHider && secret && secret.accompliceQuota === 0 && (
          <p className="night-hud__note">اخترت. أغلق عينيك وانتظر الراوي.</p>
        )}
      </NightHud>
    );
  }

  const view = nightViewFor(secret, slot, players.length, settings.diceMode);
  const myTurn = slot != null && (secret?.effectiveSlots.includes(slot) ?? false);

  const inner = (() => {
    /* نتيجة الفحص تصل أثناء الليل نفسه، فتُعرض قبل أن يُغلق عينيه */
    if (view === 'revealed' && secret) {
      return <NightInspectResult secret={secret} players={players} settings={settings} />;
    }
    if (view === 'waiting' || (pickedAt != null && pickedAt === slot)) {
      return <WaitingNote>جارٍ كشف الموعد</WaitingNote>;
    }
    if (view === 'pick' && secret) {
      return (
        <NightInspect
          code={code}
          me={me}
          secret={secret}
          players={players}
          settings={settings}
          onPicked={() => setPickedAt(slot)}
        />
      );
    }

    /*
      الراوي يقول للطاولة كلها «وإذا كنتم وحدكم، اختاروا أحد جاريكم» — ولا
      يستطيع غير ذلك، فالصوت عامّ ولا يعرف من انفرد. فمن استيقظ مع غيره يسمع
      الوعد ثم ينتظر شاشة لا تأتي، ويظنّ التطبيق معطّلًا.

      السطر هنا يُغلق الفجوة: يقول له لماذا لا فحص له، ولا يكشف من كان معه.
    */
    if (myTurn && rulesFor(players.length).inspectionEnabled && secret) {
      return (
        <p className="night-hud__note">
          استيقظ معك أحد هذه الليلة — تعرّف عليه، ولا فحص لك.
        </p>
      );
    }
    return null;
  })();

  return (
    <NightHud
      title={slot ? slotLabel(slot, settings.slotNaming) : 'الليل يبدأ'}
      endsAt={endsAt}
      settings={settings}
      myTurn={myTurn}
      task={nightTask(secret, settings)}
    >
      {inner}
    </NightHud>
  );
}

/**
 * ما يبقى على شاشة اللاعب طوال الليل.
 *
 * الشاشة السوداء التامّة كانت قرارًا مقصودًا — «الجهاز مقلوب فلا شيء يُعرض» —
 * لكنها تُقرأ كعطل: من يرفع جهازه ليتأكّد أن اللعبة تعمل يجد سوادًا. والمعلومة
 * الظاهرة هنا **واحدة على كل الأجهزة** (اسم اللعبة، رقم الليلة، ما بقي من
 * العدّ)، فلا تكشف من مستيقظ ومن نائم.
 *
 * ما يختلف بين جهاز وآخر هو ما تحت الخطّ: تعليمة الدور لمن جاء موعده. وذلك
 * مقصود ومطلوب — ومن يقرؤه هو وحده من فتح عينيه بأمر الراوي.
 */
function NightHud({
  title,
  endsAt,
  settings,
  myTurn,
  task,
  children,
}: {
  title: string;
  endsAt: number | null;
  settings: RoomSettings;
  myTurn: boolean;
  task: string;
  children: ReactNode;
}) {
  const remaining = useCountdown(endsAt);

  return (
    <div className={`night-hud ${myTurn ? 'night-hud--mine' : ''}`}>
      <p className="night-hud__game">{settings.gameName}</p>

      <h2 className="night-hud__slot">{title}</h2>

      {remaining != null && (
        <p className="night-hud__timer" dir="ltr" aria-label={`بقي ${remaining} ثانية`}>
          {remaining}
        </p>
      )}

      {myTurn ? (
        <div className="night-hud__turn">
          <p className="night-hud__badge">هذه ليلتك</p>
          <p className="night-hud__task">{task}</p>
        </div>
      ) : (
        <p className="night-hud__idle">أغمض عينيك واستمع</p>
      )}

      {children}

    </div>
  );
}

/** ما على اللاعب فعله في موعده — بكلماته لا بمصطلح الكود. */
function nightTask(secret: PlayerSecret | null, settings: RoomSettings): string {
  if (secret?.role === 'hider') {
    return `افتح عينيك، خذ ${GAME_CONFIG.prop.nameWithArticle} من وسط الطاولة وأخفِه.`;
  }
  if (settings.diceMode === 'physical') {
    return 'افتح عينيك وتعرّف على من استيقظ معك. وإن كنت وحدك، ارفع كوب أحد جاريك.';
  }
  return 'افتح عينيك وتعرّف على من استيقظ معك.';
}

/**
 * الثواني المتبقية من لحظة نهاية مُزامَنة.
 *
 * الحساب من *اللحظة* لا من عدّاد محلّي: جهاز تأخّر عن الشبكة أو نام ثانيتين
 * يعود إلى الرقم الصحيح فورًا بدل أن يتأخّر عن الطاولة إلى الأبد.
 */
function useCountdown(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt == null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  if (endsAt == null) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/**
 * اختيار المتعاونين — يظهر على جهاز المُخفي وحده في آخر الليل.
 *
 * الجهاز يكتب الاختيار ولا يطبّقه: تحويل لاعب آخر إلى متعاون كتابةٌ في سرّه،
 * وهي من حق المضيف وحده. راجع `applyPendingAccompliceChoice`.
 */
function AccompliceChoice({
  code,
  me,
  secret,
  players,
}: {
  code: string;
  me: PlayerPublic;
  secret: PlayerSecret;
  players: PlayerPublic[];
}) {
  const { transport } = useSession();
  const [picked, setPicked] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player])),
    [players],
  );
  const candidates = secret.accompliceCandidates
    .map((id) => byId[id])
    .filter((player): player is PlayerPublic => Boolean(player));

  if (sent) {
    return <p className="night-hud__note">وصل اختيارك. أغلق عينيك.</p>;
  }

  return (
    <div className="night-awake">
      <h2>{secret.accompliceQuota === 1 ? 'اختر متعاونًا واحدًا' : 'اختر متعاونَين'}</h2>
      <p className="lede">
        {secret.accompliceQuota === 1 ? 'سيصله' : 'سيصلهما'} إشعار سري بعد انتهاء الليل، ولن
        يعرف بقية اللاعبين شيئًا.
      </p>
      <div className="stack">
        {candidates.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            selected={picked.includes(player.id)}
            onSelect={() =>
              setPicked((current) =>
                current.includes(player.id)
                  ? current.filter((id) => id !== player.id)
                  : current.length < secret.accompliceQuota
                    ? [...current, player.id]
                    : current,
              )
            }
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="join__error">
          {error}
        </p>
      )}
      <Button
        size="xl"
        full
        disabled={picked.length !== secret.accompliceQuota}
        onClick={async () => {
          try {
            await transport.writeSecret(code, me.id, { ...secret, accompliceChoice: picked });
            setSent(true);
            setError(null);
          } catch {
            setError('تعذّر إرسال الاختيار. حاول مرة أخرى.');
          }
        }}
      >
        أكّد الاختيار
      </Button>
    </div>
  );
}

/** اختيار الجار أثناء الليل — خياران لا ثالث لهما. */
function NightInspect({
  code,
  me,
  secret,
  players,
  settings,
  onPicked,
}: {
  code: string;
  me: PlayerPublic;
  secret: PlayerSecret;
  players: PlayerPublic[];
  settings: RoomSettings;
  onPicked: () => void;
}) {
  const { transport } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const neighbours = useMemo(() => neighboursOf(me.id, players), [me.id, players]);
  const byId = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player])),
    [players],
  );

  /*
    فور اللمس تختفي البطاقتان ويظهر الانتظار — لا بعد ردّ الشبكة.

    كانتا تبقيان ظاهرتين حتى تعود اللقطة الجديدة، فيظنّ اللاعب أن ضغطته ضاعت
    ويضغط الأخرى. والأسوأ أنه يظنّ أن له فحصين وليس له إلا واحد.
  */
  if (busy) {
    return (
      <div className="night-awake">
        <WaitingNote>جارٍ كشف الموعد</WaitingNote>
      </div>
    );
  }

  return (
    <div className="night-awake">
      <h2>استيقظت وحدك</h2>
      <p className="lede">
        اختر أحد جاريك لترى موعد استيقاظه. مرّة واحدة فقط، ولا شيء غير الموعد.
      </p>
      <div className="stack">
        {(['right', 'left'] as const).map((side) => {
          const target = byId[neighbours[side]];
          if (!target) return null;
          return (
            <PlayerCard
              key={side}
              player={target}
              status={side === 'right' ? 'الجالس عن يمينك' : 'الجالس عن يسارك'}
              onSelect={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  // هذا الجهاز لا يملك موعد الجار: يكتب الطلب، والمضيف يملأ الموعد.
                  await transport.writeSecret(code, me.id, {
                    ...secret,
                    inspection: { targetId: target.id, side, revealedSlot: null },
                  });
                  setError(null);
                  onPicked();
                } catch (cause) {
                  // الفشل يُعيد البطاقتين: الخيار لم يُسجَّل، ولا يجوز أن يضيع
                  setBusy(false);
                  setError(cause instanceof Error ? cause.message : 'تعذّر الفحص.');
                }
              }}
            />
          );
        })}
      </div>
      <p className="eyebrow-note">
        {settings.slotNaming === 'hours' ? 'ستظهر لك ساعته فقط.' : 'ستظهر لك ليلته فقط.'}
      </p>
      {error && (
        <p role="alert" className="join__error">
          {error}
        </p>
      )}
    </div>
  );
}

function NightInspectResult({
  secret,
  players,
  settings,
}: {
  secret: PlayerSecret;
  players: PlayerPublic[];
  settings: RoomSettings;
}) {
  const target = players.find((player) => player.id === secret.inspection?.targetId);
  return (
    <div className="night-awake">
      <p className="lede">{target?.name}</p>
      <h2 className="slot-headline">
        {slotLabel(secret.inspection!.revealedSlot!, settings.slotNaming)}
      </h2>
      <p className="eyebrow-note">
        هذا موعد استيقاظه فقط. لا يخبرك بدوره ولا هل استيقظ فعلًا. احفظه وأغلق عينيك.
      </p>
    </div>
  );
}

/* ══════════════════════ المرحلة السرية ══════════════════════ */

export function PlayerSecretStage({
  code,
  me,
  secret,
  players,
  settings,
  resolved,
  acked,
}: {
  code: string;
  me: PlayerPublic;
  secret: PlayerSecret | null;
  players: PlayerPublic[];
  settings: RoomSettings;
  resolved: boolean;
  acked: boolean;
}) {
  const { transport } = useSession();
  const gate = useRevealGate();

  const byId = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player])),
    [players],
  );

  if (!secret) return <WaitingNote>لحظة…</WaitingNote>;

  if (acked) {
    return (
      <PlayerWaitStage
        title="حفظت معلومتك"
        note="ضع الجهاز وانتظر بقية اللاعبين."
        avatarId={me.avatarId}
        state="suspicious"
      />
    );
  }

  /*
    لا شاشة اختيار متعاونين هنا: الاختيار يقع في آخر الليل والأعين مغلقة
    (`night-accomplices`). ما يبقى للمرحلة السرية هو **إيصال** المعلومة —
    من صار متعاونًا، ومن يعرف من — بعد أن تُفتح الأعين.
  */
  if (!resolved) {
    return <WaitingNote>لحظة واحدة</WaitingNote>;
  }

  const blocks = secretBlocks(secret, players, settings, byId);

  if (secret.inspection && !secret.inspection.revealedSlot) {
    return <WaitingNote>جارٍ كشف الموعد</WaitingNote>;
  }

  /* ── لا معلومة: نفس شكل الشاشة ونفس الزر حتى لا يكشف الانتظار أحدًا ── */
  if (blocks.length === 0) {
    return (
      <>
        <div className="role-cover role-cover--empty" aria-hidden="true">
          <span>لا معلومة</span>
        </div>
        <h2>لا توجد معلومة لك هذه الجولة</h2>
        <p className="lede">اعتمد على ما سمعته ورأيته حول الطاولة.</p>
        <Button size="xl" full onClick={() => void transport.ack(code, me.id, 'secretAck')}>
          فهمت
        </Button>
      </>
    );
  }

  if (!gate.revealed) {
    return (
      <>
        <div className="role-cover role-cover--secret" aria-hidden="true">
          <span>لك معلومة</span>
        </div>
        <p className="lede">تأكد أن لا أحد ينظر إلى شاشتك.</p>
        <Button size="xl" full onClick={gate.reveal}>
          أظهر المعلومة
        </Button>
      </>
    );
  }

  return (
    <div className="secret-sheet">
      {blocks}
      <Button size="xl" full onClick={() => void transport.ack(code, me.id, 'secretAck')}>
        حفظت المعلومة
      </Button>
    </div>
  );
}

/**
 * كل ما يملكه اللاعب من معلومة سرّية، مفصولًا كتلةً كتلة.
 *
 * ── لماذا قائمة لا سلسلة `if/return` ──
 *
 * كانت الشاشة تعرض **أول** معلومة تنطبق ثم تتوقف. ومن فحص جاره ثم اختاره
 * المُخفي متعاونًا كان يفقد نتيجة فحصه كاملةً: يقرؤها لحظةً في ليلته، ثم يحلّ
 * إشعار المتعاون محلّها ولا تعود. والمعلومتان مستقلّتان — واحدة عمّا رآه
 * وأخرى عمّن صار معه — فلا سبب لأن تُلغي إحداهما الأخرى.
 *
 * وهي مشتركة بين المرحلة السرية وشاشة النقاش، فمن غاب جهازه لحظةَ الإعلان
 * يجدها حين يعود.
 */
function secretBlocks(
  secret: PlayerSecret,
  players: PlayerPublic[],
  settings: RoomSettings,
  byId: Record<string, PlayerPublic | undefined>,
): ReactNode[] {
  const allies = secret.knownAllies
    .map((id) => byId[id]?.name)
    .filter(Boolean) as string[];

  const inspected = secret.inspection?.revealedSlot
    ? { target: byId[secret.inspection.targetId], slot: secret.inspection.revealedSlot }
    : null;

  const blocks: ReactNode[] = [];

  if (secret.becameAccomplice) {
    blocks.push(
      <div className="secret-block" key="accomplice">
        <h2>صرت {GAME_CONFIG.roles.accomplice.label}</h2>
        <Panel tone="violet">
          {allies.length > 0 ? (
            <p>
              تعرف الآن: <strong>{allies.join('، ')}</strong>
            </p>
          ) : (
            <p>لا تعرف هوية مُخفي الملف — لكنك تفوز بفوزه.</p>
          )}
        </Panel>
        <p className="eyebrow-note">تفوز إذا لم يُكشف مُخفي الملف في التصويت.</p>
      </div>,
    );
  }

  if (secret.role === 'hider' && allies.length > 0) {
    blocks.push(
      <div className="secret-block" key="hider">
        <h2>متعاونوك</h2>
        <Panel tone="violet">
          <p>
            <strong>{allies.join('، ')}</strong>
          </p>
        </Panel>
      </div>,
    );
  }

  if (inspected) {
    blocks.push(
      <div className="secret-block" key="inspection">
        <h2 className="secret-block__label">موعد جارك</h2>
        <Panel tone="night">
          <p className="lede">{inspected.target?.name ?? '—'}</p>
          <p className="slot-headline">{slotLabel(inspected.slot, settings.slotNaming)}</p>
        </Panel>
        <p className="eyebrow-note">
          هذا موعد استيقاظه فقط. لا يخبرك بدوره ولا هل استيقظ فعلًا.
        </p>
      </div>,
    );
  }

  /*
    الفحص يقع في لحظة واحدة — وهو مستيقظ في موعده — ولا يُعرض المُنتقي هنا:
    فرصة ثانية بعد الليل تجعل نمطي اللعب لعبتين، وتمنح من فوّتها ميزة على من
    استعملها في وقتها.
  */
  if (canInspect(secret, players.length)) {
    blocks.push(
      <div className="secret-block" key="missed">
        <h2>لم تستعمل فحصك</h2>
        <p className="lede">
          {settings.diceMode === 'physical'
            ? 'كان بإمكانك رفع كوب أحد جاريك أثناء استيقاظك.'
            : 'كان بإمكانك اختيار أحد جاريك أثناء استيقاظك.'}
        </p>
      </div>,
    );
  }

  return blocks;
}

/* ══════════════════════ النقاش ══════════════════════ */

/**
 * شاشة النقاش — ومعها معلومة من غاب جهازه.
 *
 * المضيف ينتقل إلى النقاش حين يؤكّد **المتصلون** إجراءاتهم السرية، فمن انقطع
 * جهازه لحظة الإعلان يعود إلى مرحلة تجاوزته. والمعلومة موجودة في سرّه — كُتبت
 * ولم تُقرأ. فتُعرض هنا: من اختاره المُخفي متعاونًا يبقى متعاونًا ولو غاب
 * جهازه، ويجدها حين يرجع.
 */
export function PlayerDiscussionStage({
  code,
  me,
  secret,
  players,
  settings,
  acked,
}: {
  code: string;
  me: PlayerPublic;
  secret: PlayerSecret | null;
  players: PlayerPublic[];
  settings: RoomSettings;
  acked: boolean;
}) {
  const { transport } = useSession();
  const gate = useRevealGate();
  const byId = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player])),
    [players],
  );

  const blocks = secret ? secretBlocks(secret, players, settings, byId) : [];

  if (acked || blocks.length === 0) {
    return (
      <PlayerWaitStage
        title="ابدؤوا النقاش"
        note="تحدثوا مباشرة مع بعضكم. لا تعرضوا شاشاتكم."
        avatarId={me.avatarId}
        state="suspicious"
      />
    );
  }

  if (!gate.revealed) {
    return (
      <>
        <h2>ابدؤوا النقاش</h2>
        <p className="lede">وصلتك معلومة سرّية لم تقرأها بعد.</p>
        <div className="role-cover role-cover--secret" aria-hidden="true">
          <span>لك معلومة</span>
        </div>
        <Button size="xl" full onClick={gate.reveal}>
          أظهر المعلومة
        </Button>
      </>
    );
  }

  return (
    <div className="secret-sheet">
      {blocks}
      <Button size="xl" full onClick={() => void transport.ack(code, me.id, 'secretAck')}>
        حفظت المعلومة
      </Button>
    </div>
  );
}

/* ══════════════════════ التصويت ══════════════════════ */

export function PlayerVotingStage({
  code,
  me,
  players,
  voted,
}: {
  code: string;
  me: PlayerPublic;
  players: PlayerPublic[];
  voted: boolean;
}) {
  const { transport } = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (voted) {
    return (
      <div className="vote-locked">
        <Character characterId={me.avatarId} state="suspicious" size={170} />
        <h2>تم تسجيل تصويتك</h2>
        <p className="lede">لا يمكن تغييره. انتظر بقية اللاعبين.</p>
        <WaitingNote>ينتظر المضيف باقي الأصوات</WaitingNote>
      </div>
    );
  }

  const options = voteOptions(me.id, players);

  return (
    <>
      <h2>من تعتقد أنه أخفى {GAME_CONFIG.prop.nameWithArticle}؟</h2>
      <p className="lede">اختيارك سري. لا يمكنك التصويت لنفسك.</p>

      <div className="stack">
        {options.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            selected={selected === player.id}
            onSelect={() => setSelected(player.id)}
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="join__error">
          {error}
        </p>
      )}

      <Button
        size="xl"
        full
        tone="danger"
        disabled={!selected}
        onClick={async () => {
          if (!selected) return;
          try {
            validateVote(me.id, selected, players, voted);
            await transport.submitVote(code, me.id, selected);
            setError(null);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'تعذّر التصويت.');
          }
        }}
      >
        أكّد تصويتي
      </Button>
    </>
  );
}

/* ══════════════════════ النتائج ══════════════════════ */

export function PlayerResultsStage({
  me,
  results,
  players,
}: {
  me: PlayerPublic;
  results: RoundResults | null;
  players: PlayerPublic[];
}) {
  if (!results) {
    return (
      <PlayerWaitStage
        title="انظروا إلى الجهاز الرئيسي"
        note="النتيجة تُعرض هناك."
        avatarId={me.avatarId}
        state="startled"
      />
    );
  }

  const mine = results.reveal.find((row) => row.playerId === me.id);
  const teamWon = results.winner === 'team';
  const iWon = teamWon ? mine?.role === 'member' : mine?.role !== 'member';
  const hider = players.find((player) => player.id === results.hiderId);

  return (
    <>
      <Character characterId={me.avatarId} state={iWon ? 'victory' : 'defeat'} size={200} />
      <h1>{iWon ? 'فزت!' : 'خسرت'}</h1>
      <Panel tone={iWon ? 'amber' : 'night'}>
        <p>
          {GAME_CONFIG.roles.hider.label} كان <strong>{hider?.name ?? '—'}</strong>
        </p>
      </Panel>
      <p className="lede">التفاصيل الكاملة على الجهاز الرئيسي.</p>
    </>
  );
}

/* ══════════════════════ الانتظار ══════════════════════ */

export function PlayerWaitStage({
  title,
  note,
  avatarId,
  state = 'idle',
  hideAvatar = false,
}: {
  title: string;
  note?: string;
  avatarId: string;
  state?: CharacterState;
  hideAvatar?: boolean;
}) {
  return (
    <>
      {!hideAvatar && <Character characterId={avatarId} state={state} size={170} />}
      <h2>{title}</h2>
      {note && <p className="lede">{note}</p>}
      <WaitingNote>بانتظار المضيف</WaitingNote>
    </>
  );
}
