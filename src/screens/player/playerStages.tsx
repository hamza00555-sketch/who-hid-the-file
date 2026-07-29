/**
 * مشاهد جهاز اللاعب. كل شاشة: معلومة واحدة وزر رئيسي واحد.
 */

import { useEffect, useMemo, useState } from 'react';
import { GAME_CONFIG, slotLabel } from '../../config/game.config';
import { characterById, type CharacterState } from '../../game/roster';
import { chooseSlot, submitPhysicalDice } from '../../game/deal';
import { canInspect, nightViewFor } from '../../game/night';
import { neighboursOf } from '../../game/seating';
import { rulesFor } from '../../game/rules';
import { validateVote, voteOptions } from '../../game/vote';
import type {
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

      {isHider && rules.hiderUsesAllDice && (
        <Panel tone="amber">لديك موعدان — تستطيع الاستيقاظ في كليهما.</Panel>
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
  const needsChoice = rules.memberChoosesSlot && secret?.role !== 'hider';

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
              if (!rules.memberChoosesSlot || updated.role === 'hider') {
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
  slot,
}: {
  code: string;
  me: PlayerPublic;
  secret: PlayerSecret | null;
  players: PlayerPublic[];
  settings: RoomSettings;
  slot: WakeSlot | null;
}) {
  const view = nightViewFor(secret, slot, players.length, settings.diceMode);

  if (view === 'pick' && secret) {
    return (
      <NightInspect code={code} me={me} secret={secret} players={players} settings={settings} />
    );
  }

  /* نتيجة الفحص تصل أثناء الليل نفسه، فتُعرض قبل أن يُغلق عينيه */
  if (view === 'revealed' && secret) {
    return <NightInspectResult secret={secret} players={players} settings={settings} />;
  }

  if (view === 'waiting') {
    return (
      <div className="night-awake">
        <WaitingNote>جارٍ كشف الموعد</WaitingNote>
      </div>
    );
  }

  return (
    <div className="night-blackout" aria-hidden="true">
      <span className="night-blackout__dot" />
      <p className="sr-only" aria-hidden="false">
        الليل جارٍ. استمع إلى الجهاز الرئيسي ولا تلمس هذا الجهاز.
      </p>
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
}: {
  code: string;
  me: PlayerPublic;
  secret: PlayerSecret;
  players: PlayerPublic[];
  settings: RoomSettings;
}) {
  const { transport } = useSession();
  const [error, setError] = useState<string | null>(null);
  const neighbours = useMemo(() => neighboursOf(me.id, players), [me.id, players]);
  const byId = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player])),
    [players],
  );

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
                try {
                  // هذا الجهاز لا يملك موعد الجار: يكتب الطلب، والمضيف يملأ الموعد.
                  await transport.writeSecret(code, me.id, {
                    ...secret,
                    inspection: { targetId: target.id, side, revealedSlot: null },
                  });
                  setError(null);
                } catch (cause) {
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
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  const mustChoose = secret.accompliceQuota > 0;

  /* ── المُخفي يختار متعاونيه ── */
  if (mustChoose) {
    const candidates = secret.accompliceCandidates
      .map((id) => byId[id])
      .filter((player): player is PlayerPublic => Boolean(player));

    return (
      <>
        <h2>اختر {secret.accompliceQuota === 1 ? 'متعاونًا واحدًا' : 'متعاونين اثنين'}</h2>
        <p className="lede">
          {secret.accompliceCandidates.length < players.length - 1
            ? 'هؤلاء من استيقظوا معك ورأوك.'
            : 'سيصلهم إشعار سري، ولن يعرف بقية اللاعبين شيئًا.'}
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
              await transport.writeSecret(code, me.id, {
                ...secret,
                accompliceChoice: picked,
              });
              setError(null);
            } catch {
              setError('تعذّر إرسال الاختيار. حاول مرة أخرى.');
            }
          }}
        >
          أكّد الاختيار
        </Button>
      </>
    );
  }

  if (!resolved) {
    return <WaitingNote>لحظة واحدة</WaitingNote>;
  }

  /* ── إشعار المتعاون ── */
  if (secret.becameAccomplice) {
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
    const allies = secret.knownAllies
      .map((id) => byId[id]?.name)
      .filter(Boolean) as string[];

    return (
      <>
        <Character characterId={me.avatarId} state="hiding" size={170} />
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
        <p className="lede">تفوز إذا لم يُكشف مُخفي الملف في التصويت.</p>
        <Button size="xl" full onClick={() => void transport.ack(code, me.id, 'secretAck')}>
          حفظت المعلومة
        </Button>
      </>
    );
  }

  /* ── المُخفي يعرف متعاونيه ── */
  if (secret.role === 'hider' && secret.knownAllies.length > 0) {
    if (!gate.revealed) {
      return (
        <>
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
      <>
        <h2>متعاونوك</h2>
        <Panel tone="violet">
          <p>
            <strong>
              {secret.knownAllies.map((id) => byId[id]?.name ?? '—').join('، ')}
            </strong>
          </p>
        </Panel>
        <Button size="xl" full onClick={() => void transport.ack(code, me.id, 'secretAck')}>
          حفظت المعلومة
        </Button>
      </>
    );
  }

  /*
    ── الفحص لم يُستخدم ──

    لا يُعرض المُنتقي هنا. الفحص يقع في لحظة واحدة: وهو مستيقظ في موعده — على
    جهازه في النمط الرقمي، وبرفع كوب جاره في نمط النرد. تقديم فرصة ثانية بعد
    انتهاء الليل يجعل النمطين لعبتين مختلفتين، ويمنح من فوّتها ميزة على من
    استعملها في وقتها.
  */
  if (canInspect(secret, players.length)) {
    return (
      <>
        <div className="role-cover role-cover--empty" aria-hidden="true">
          <span>لا معلومة</span>
        </div>
        <h2>لم تستعمل فحصك</h2>
        <p className="lede">
          {settings.diceMode === 'physical'
            ? 'كان بإمكانك رفع كوب أحد جاريك أثناء استيقاظك.'
            : 'كان بإمكانك اختيار أحد جاريك أثناء استيقاظك.'}
        </p>
        <Button size="xl" full onClick={() => void transport.ack(code, me.id, 'secretAck')}>
          فهمت
        </Button>
      </>
    );
  }

  /* ── نتيجة الفحص بعد أن يكتبها المضيف ── */
  if (secret.inspection?.revealedSlot) {
    const target = byId[secret.inspection.targetId];
    return (
      <>
        <Character characterId={target?.avatarId ?? me.avatarId} state="asleep" size={150} />
        <p className="lede">{target?.name}</p>
        <h2 className="slot-headline">{slotLabel(secret.inspection.revealedSlot)}</h2>
        <p className="eyebrow-note">
          هذا موعد استيقاظه فقط. لا يخبرك بدوره ولا هل استيقظ فعلًا.
        </p>
        <Button size="xl" full onClick={() => void transport.ack(code, me.id, 'secretAck')}>
          حفظت المعلومة
        </Button>
      </>
    );
  }

  if (secret.inspection) {
    return <WaitingNote>جارٍ كشف الموعد</WaitingNote>;
  }

  /* ── لا معلومة: نفس شكل الشاشة ونفس الزر حتى لا يكشف الانتظار أحدًا ── */
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
