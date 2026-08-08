/**
 * الجهاز الرئيسي — مقدّم اللعبة.
 *
 * يملك وحده: الصوت، الانتقال بين المراحل، توزيع الأدوار، حساب النتائج.
 * لا يعرض دورًا ولا نردًا ولا موعد استيقاظ لأي لاعب قبل شاشة النتائج.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLobbyMusic } from '../../audio/useLobbyMusic';
import { useNarrator } from '../../audio/useNarrator';
import { GAME_CONFIG } from '../../config/game.config';
import {
  allAcked,
  applyPendingAccompliceChoice,
  closeAccompliceNight,
  enterAccompliceNight,
  enterSecretActions,
  finalizeWakeSlots,
  resolvePendingInspections,
  revealResults,
  startRoleDistribution,
} from '../../game/director';
import { planAccomplices } from '../../game/accomplice';
import { reorderSeats } from '../../game/seating';
import { isSupportedPlayerCount, rulesFor } from '../../game/rules';
import { slotOfNightPhase, type Phase } from '../../game/types';
import { forgetSession, usePresence, useRoom, useSecret, useSession } from '../../net/session';
import { SceneBackdrop, type SceneTone } from '../../ui/components/SceneBackdrop';
import { Badge, Button, ExitButton, WaitingNote } from '../../ui/components/kit';
import { HostPlayerPanel, hostNightActive } from './HostPlayerPanel';
import {
  HostDiceStage,
  HostDiscussionStage,
  HostLobbyStage,
  HostNightStage,
  HostReadyStage,
  HostResultsStage,
  HostRevealStage,
  HostRolesStage,
  HostRoundMenu,
  HostSecretStage,
  HostVotingStage,
} from './hostStages';
import './host.css';

const SCENE_TONE: Partial<Record<Phase, SceneTone>> = {
  lobby: 'evening',
  'role-distribution': 'evening',
  'dice-roll': 'evening',
  'ready-check': 'night',
  'night-intro': 'deep-night',
  'night-phase-1': 'deep-night',
  'night-phase-2': 'deep-night',
  'night-phase-3': 'deep-night',
  'night-phase-4': 'deep-night',
  'night-phase-5': 'deep-night',
  'night-phase-6': 'deep-night',
  'night-accomplices': 'deep-night',
  'secret-actions': 'night',
  discussion: 'dawn',
  voting: 'dawn',
  reveal: 'dawn',
  results: 'dawn',
};

export function HostScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { transport, playerId, identityError, retryIdentity } = useSession();
  const { state, players, me, isHost, playerCount, connection, loading, missing, stalled } =
    useRoom(code);
  const secret = useSecret(code);

  // المضيف حين يلعب لاعبٌ أيضًا، فحضوره يُجدَّد مثل الجميع
  usePresence(code, me ? playerId : null);

  const phase = state?.meta.phase ?? 'lobby';
  const roundId = state?.meta.roundId ?? '';
  const settings = state?.settings;
  const narrator = useNarrator({
    enabled: settings?.voiceEnabled ?? true,
    rate: settings?.ttsRate ?? GAME_CONFIG.defaults.ttsRate,
    naming: settings?.slotNaming ?? GAME_CONFIG.slotNaming,
    voice: settings?.narratorVoice ?? GAME_CONFIG.defaults.narratorVoice,
    source: settings?.narratorSource ?? GAME_CONFIG.defaults.narratorSource,
  });

  /*
    ── الليل بلا تعليق صوتي ──

    حين يُطفأ الراوي لا شيء يقود المراحل: لا جملة تُقال ولا عدّ يمشي. فيقودها
    صاحب الجهاز بلمسة — والشاشة كلّها هي الزر، لأن عينيه مغمضتان وهو يلعب مع
    الطاولة فلا يبحث عن زرّ صغير.
  */
  const [pendingStep, setPendingStep] = useState<{ label: string; run: () => Promise<void> } | null>(
    null,
  );
  /*
    موسيقى ما قبل الجولة تدور على **كل** جهاز — بخلاف الراوي الذي يبقى على
    جهاز واحد لأنه يُعطي أوامر. وتصمت لحظةَ يبدأ توزيع الأدوار.
  */
  useLobbyMusic(phase === 'lobby' && (settings?.musicEnabled ?? true));

  const [menuOpen, setMenuOpen] = useState(false);
  const [countdown, setCountdown] = useState<{ value: number; total: number } | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [revealStep, setRevealStep] = useState<number | null>(null);

  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const startedRef = useRef<string>('');
  /** وصل اختيار المُخفي لمتعاونيه — يُنهي عدّ الخطوة قبل وقته */
  const accompliceReadyRef = useRef(false);
  /** جولة أُطلق كشفها — يمنع حساب النتيجة مرّتين */
  const revealedRoundRef = useRef<string>('');
  /** لحظةٌ لا يُغلق الموعد قبلها: نافذة قراءة من كشف فحصٍ للتوّ */
  const readUntilRef = useRef(0);

  const disconnected = players.filter((player) => !player.connected);
  const isNight = phase.startsWith('night-');
  /** بلا راوٍ لا شيء يقود المراحل — فيقودها صاحب الجهاز بلمسة */
  const silent = !(settings?.voiceEnabled ?? true);

  useEffect(() => {
    // الجهاز الرئيسي لا يخفت أبدًا: يجب أن يُقرأ من الطرف الآخر للطاولة.
    // الإظلام حالة خاصة بأجهزة اللاعبين وحدها.
    document.body.dataset.night = 'false';
  }, []);

  /* ── مؤقتات المراحل: تعمل على جهاز المضيف وحده ── */

  /*
    العدّ يُنشر لحظةَ انتهائه لا ثوانيه المتبقية: كل جهاز يحسب بساعته، فلا
    رسالة كل ثانية ولا انحراف يتراكم مع تأخّر الشبكة. من يستيقظ في موعده
    يحتاج أن يرى كم بقي له قبل «أغلقوا أعينكم».

    وينتهي عند **لحظة**، لا بعد عددٍ ثابت من الدورات — لأن اللحظة قابلة
    للتأجيل. ومن يفحص جاره يحتاج ذلك: العدّ يبدأ مع فتح الموعد، فتُصرَف ثوانيه
    في أن ينتبه اللاعب ويقرأ البطاقتين ويضغط وتذهب اللمسة إلى المضيف وتعود.
    فيصل الموعد المكشوف والعدّ في آخره، ويُغلق قبل أن يُقرأ.

    فحين يُكشف فحص تُدفع النهاية إلى الأمام بمقدار نافذة قراءة تبدأ **من لحظة
    الكشف**. والتمديد لا يقع إلا في الليلة التي فُحص فيها فعلًا، ولا يتجاوز
    نافذة واحدة مهما تعدّد الفاحصون — فالليل يبقى مضبوطًا.
  */
  const runCountdown = useCallback(
    async (seconds: number, guard: Phase, done?: () => boolean) => {
      const start = Date.now();
      let endsAt = start + seconds * 1000;
      let published = 0;
      let total = seconds;

      for (;;) {
        if (phaseRef.current !== guard) return false;
        // خطوة انتهت قبل وقتها (وصل اختيار المُخفي مثلًا) لا تُبقي الطاولة تنتظر
        if (done?.()) break;

        endsAt = Math.max(endsAt, readUntilRef.current);
        if (endsAt !== published) {
          published = endsAt;
          total = Math.max(total, Math.ceil((endsAt - start) / 1000));
          // الأجهزة تحسب من اللحظة، فيرى الفاحص عدّاده يمتدّ لا يقفز
          void transport.setPhaseDeadline(code, endsAt);
        }

        const remaining = endsAt - Date.now();
        if (remaining <= 0) break;
        setCountdown({ value: Math.ceil(remaining / 1000), total });
        await wait(Math.min(250, remaining));
      }

      setCountdown(null);
      void transport.setPhaseDeadline(code, null);
      return phaseRef.current === guard;
    },
    [transport, code],
  );

  const runKey = `${roundId}:${phase}`;

  useEffect(() => {
    if (!isHost || !state) return;
    if (startedRef.current === runKey) return;
    startedRef.current = runKey;

    const guard = phase;
    const still = () => phaseRef.current === guard;
    setPendingStep(null);
    readUntilRef.current = 0;

    /*
      كل انتقالات المراحل تجري داخل هذه الدالة. أي رفض داخلها — كتابة تفشل،
      شبكة تتعثّر، قاعدة ترفض — كان يبتلعه الوعد بلا أثر: تتوقف الجولة عند
      مرحلتها، وتبقى شاشات اللاعبين على آخر ما رسمته بلا كلمة تفسّر. وهذا
      بالضبط شكل العطل: «انتهى الليل والشاشات ما زالت فارغة».

      الآن يُلتقط الخطأ ويُعرض للمضيف مع زر إعادة محاولة، فالجولة تُستأنف بدل
      أن تموت صامتة.
    */
    void (async () => {
      try {
      if (guard === 'night-intro') {
        if (silent) {
          // جملة الراوي الأخيرة تبقى معلّقة وقد سكت — تُمحى قبل فتح خطوة يدوية
          narrator.stop();
          setPendingStep({
            label: 'ابدأ الموعد الأول',
            run: async () => transport.setPhase(code, 'night-phase-1'),
          });
          return;
        }
        await narrator.say(narrator.script.nightStart);
        if (still()) await transport.setPhase(code, 'night-phase-1');
        return;
      }

      const slot = slotOfNightPhase(guard);
      if (slot) {
        const closeSlot = async () => {
          if (slot < 6) {
            await transport.setPhase(code, `night-phase-${slot + 1}` as Phase);
          } else {
            // آخر موعد انتهى، ويبقى من الليل نداء واحد: المُخفي ومتعاونوه.
            await enterAccompliceNight(transport, code, playerCount);
          }
        };

        if (silent) {
          narrator.stop();
          setPendingStep({
            label: slot < 6 ? 'الموعد التالي' : 'أنهِ المواعيد',
            run: closeSlot,
          });
          return;
        }

        await narrator.say(
          narrator.script.slotOpen(
            slot,
            settings?.diceMode ?? GAME_CONFIG.defaults.diceMode,
            rulesFor(playerCount).inspectionEnabled,
          ),
        );
        if (!still()) return;
        const finished = await runCountdown(
          settings?.nightCountdownSeconds ?? GAME_CONFIG.defaults.nightCountdownSeconds,
          guard,
        );
        if (!finished) return;
        await narrator.say(narrator.script.slotClose(slot));
        if (!still()) return;
        await closeSlot();
        return;
      }

      /*
        ── آخر الليل: المُخفي يختار متعاونيه ──

        قبل نهاية الليل لا بعدها: المتعاون يقف مع المُخفي في نفس الظلام، وسؤاله
        بعد أن تُفتح الأعين كان يجعل نصف اللعبة يحدث والطاولة تنظر إلى بعضها.

        العدّ ينتهي مبكرًا إن وصل الاختيار، وإن لم يصل يختار المخرج نيابةً —
        فلا جولة بلا متعاون بعد أن وعد الراوي به.
      */
      if (guard === 'night-accomplices') {
        accompliceReadyRef.current = false;

        const closeNight = async () => {
          await closeAccompliceNight(transport, code, playerCount);
          await enterSecretActions(transport, code);
          await transport.setSecretStage(code, 'choosing');
        };

        if (silent) {
          narrator.stop();
          setPendingStep({ label: 'أنهِ الليل', run: closeNight });
          return;
        }

        await narrator.say(
          narrator.script.accompliceCall(rulesFor(playerCount).accompliceCount),
        );
        if (!still()) return;
        const finished = await runCountdown(
          settings?.nightCountdownSeconds ?? GAME_CONFIG.defaults.nightCountdownSeconds,
          guard,
          () => accompliceReadyRef.current,
        );
        if (!finished) return;
        await closeAccompliceNight(transport, code, playerCount);
        await narrator.say(narrator.script.accompliceClose);
        if (!still()) return;
        await narrator.say(narrator.script.nightEnd);
        if (!still()) return;
        await enterSecretActions(transport, code);
        await transport.setSecretStage(code, 'choosing');
        void narrator.say(narrator.script.secretActions);
        return;
      }

      if (guard === 'discussion') {
        void narrator.say(narrator.script.discussion);
        return;
      }

      if (guard === 'voting') {
        void narrator.say(narrator.script.voting);
        return;
      }

      if (guard === 'reveal') {
        void narrator.say(narrator.script.revealCountdown);
        for (const step of [3, 2, 1]) {
          if (!still()) return;
          setRevealStep(step);
          await wait(900);
        }
        setRevealStep(0);
        await wait(2600);
        if (!still()) return;
        const winner = state.results?.winner;
        void narrator.say(
          winner === 'team' ? narrator.script.teamWin : narrator.script.hiderWin,
        );
        await wait(3200);
        if (still()) await transport.setPhase(code, 'results');
      }
      } catch (cause) {
        setStageError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, [
    runKey,
    isHost,
    state,
    phase,
    code,
    transport,
    narrator,
    playerCount,
    runCountdown,
    settings?.nightCountdownSeconds,
    settings?.diceMode,
    silent,
  ]);

  /* ── انتقالات مشروطة بجاهزية اللاعبين ── */

  useEffect(() => {
    if (!isHost || !state) return;
    const progress = state.progress;

    if (phase === 'role-distribution' && allAcked(progress, players, 'roleAck')) {
      void transport.setPhase(code, 'dice-roll');
    }

    if (phase === 'dice-roll' && allAcked(progress, players, 'diceAck')) {
      void finalizeWakeSlots(transport, code).then(() =>
        transport.setPhase(code, 'ready-check'),
      );
    }

    if (phase === 'secret-actions' && state.meta.secretStage === 'resolved') {
      if (allAcked(progress, players, 'secretAck')) {
        void transport.setPhase(code, 'discussion');
      }
    }

    /*
      وصول كل الأصوات لا يعني أن الكشف سينجح: حساب النتيجة يقرأ كل الأسرار
      ويكتب صفحةً كاملة، وأي رفض هنا كان يُبتلع في وعد بلا `catch` — فتقف
      الجولة عند «٤ من ٤ صوّتوا» إلى الأبد بلا رسالة.

      الحارس يمنع أيضًا إطلاق الكشف مرّتين: هذا المراقب يعمل مع كل تغيّر حالة.
    */
    if (phase === 'voting' && allAcked(progress, players, 'voted')) {
      if (revealedRoundRef.current !== roundId) {
        revealedRoundRef.current = roundId;
        void narrator.say(narrator.script.votingComplete);
        void revealResults(transport, code, players).catch((cause) => {
          revealedRoundRef.current = '';
          setStageError(cause instanceof Error ? cause.message : String(cause));
        });
      }
    }
  }, [isHost, state, phase, players, code, transport, narrator, roundId]);

  /* ── المرحلة السرية: تطبيق اختيار المُخفي فور وصوله ── */

  // اللاعبون خارج قائمة اعتماديات المراقب: تغيّر أي حقل عام لا يجب أن يُعيد الاشتراك.
  const playersRef = useRef(players);
  playersRef.current = players;
  /** يمنع كتابة `resolved` أكثر من مرة لكل جولة — الحالة القادمة عبر props قد تكون قديمة. */
  const resolvedRoundRef = useRef<string>('');

  /*
    ── فحص الجار أثناء الليل ──

    في النمط الرقمي يفحص اللاعب جاره وهو مستيقظ في موعده، لا بعد انتهاء الليل:
    هذا ما يحدث فعلًا في نمط الأكواب (يرفع الكوب وهو مستيقظ)، والنمطان يجب أن
    يتطابقا في التوقيت وإلّا اختلفت اللعبتان.

    لكن اللاعب لا يستطيع قراءة سر جاره، فيكتب الطلب فارغًا والمضيف يملؤه. لذلك
    يجب أن يستمع المضيف للأسرار أثناء مراحل الليل أيضًا، لا في المرحلة السرية
    وحدها كما كان.
  */
  useEffect(() => {
    if (!isHost || !roundId || !phase.startsWith('night-phase-')) return;
    return transport.watchAllSecrets(code, (secrets) => {
      if (Object.keys(secrets).length === 0) return;
      void resolvePendingInspections(transport, code, playersRef.current, secrets).then(
        (revealed) => {
          // الموعد المكشوف وصل الآن — تبدأ نافذة القراءة من هذه اللحظة
          if (revealed) {
            readUntilRef.current = Date.now() + GAME_CONFIG.nightReadSeconds * 1000;
          }
        },
      );
    });
  }, [isHost, phase, roundId, code, transport]);

  /*
    ── خطوة المتعاونين ──

    جهاز المُخفي يكتب اختياره ولا يستطيع تطبيقه: التطبيق يعدّل أسرار لاعبين
    آخرين. فيلتقطه المضيف هنا ويطبّقه فورًا، ويرفع العلم الذي يُنهي عدّ الخطوة
    مبكرًا بدل أن تنتظر الطاولة في الظلام بلا سبب.
  */
  useEffect(() => {
    if (!isHost || phase !== 'night-accomplices' || !roundId) return;
    return transport.watchAllSecrets(code, (secrets) => {
      if (Object.keys(secrets).length === 0) return;
      const hider = Object.values(secrets).find((secret) => secret.role === 'hider');
      if (!hider) return;
      if ((hider.accompliceChoice?.length ?? 0) === 0 && hider.accompliceQuota > 0) return;
      accompliceReadyRef.current = true;
      void applyPendingAccompliceChoice(transport, code, playerCount, secrets);
    });
  }, [isHost, phase, roundId, code, transport, playerCount]);

  useEffect(() => {
    if (!isHost || phase !== 'secret-actions' || !roundId) return;

    return transport.watchAllSecrets(code, (secrets) => {
      if (Object.keys(secrets).length === 0) return;

      // طلبات فحص الجيران يحلّها المضيف لأن اللاعب لا يقرأ سر جاره.
      void resolvePendingInspections(transport, code, playersRef.current, secrets);

      const markResolved = () => {
        if (resolvedRoundRef.current === roundId) return;
        resolvedRoundRef.current = roundId;
        void transport.setSecretStage(code, 'resolved');
      };

      const plan = planAccomplices(secrets, playerCount);
      const hider = plan.hiderId ? secrets[plan.hiderId] : null;

      if ((hider?.accompliceQuota ?? 0) === 0) {
        markResolved();
        return;
      }

      void applyPendingAccompliceChoice(transport, code, playerCount, secrets).then(
        (applied) => applied && markResolved(),
      );
    });
  }, [isHost, phase, roundId, transport, code, playerCount]);

  /* ── تنبيه انقطاع أثناء الليل ── */

  const warnedRef = useRef(false);
  useEffect(() => {
    if (!isHost || !isNight) {
      warnedRef.current = false;
      return;
    }
    if (disconnected.length > 0 && !warnedRef.current) {
      warnedRef.current = true;
      void narrator.say(narrator.script.disconnected);
    }
  }, [isHost, isNight, disconnected.length, narrator]);

  /* ── إجراءات المضيف ── */

  const startRoles = useCallback(async () => {
    if (!isSupportedPlayerCount(playerCount)) return;
    await startRoleDistribution(
      transport,
      code,
      players.map((player) => player.id),
    );
  }, [transport, code, players, playerCount]);

  const handleReorder = useCallback(
    (from: number, to: number) => {
      void transport.setSeats(code, reorderSeats(players, from, to));
    },
    [transport, code, players],
  );

  const joinUrl = useMemo(() => {
    const { origin, pathname } = window.location;
    return `${origin}${pathname}#/play/${code}`;
  }, [code]);

  /* هوية لم تُفتح: قول وزر بدل دوّامة لا تنتهي — راجع PlayerScreen */
  if (identityError) {
    return (
      <div className="screen screen--host">
        <SceneBackdrop tone="evening" />
        <div className="screen__body">
          <h2>تعذّر فتح الجلسة</h2>
          <p className="lede">{identityError}</p>
          <Button onClick={retryIdentity}>أعد المحاولة</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="screen screen--host">
        <SceneBackdrop tone="evening" />
        <div className="screen__body">
          <WaitingNote>جارٍ فتح الجلسة</WaitingNote>
          {stalled && (
            <>
              <p className="lede">
                طال الانتظار أكثر من المعتاد. تأكد من الإنترنت ثم أعد المحاولة.
              </p>
              <Button onClick={() => window.location.reload()}>أعد المحاولة</Button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (missing || !state) {
    return (
      <div className="screen screen--host">
        <SceneBackdrop tone="evening" />
        <div className="screen__body">
          <h2>لا توجد جلسة بالرمز {code}</h2>
          <p className="lede">قد تكون الجلسة أُغلقت أو أن الرمز غير صحيح.</p>
          <Button onClick={() => navigate('/')}>العودة للرئيسية</Button>
        </div>
      </div>
    );
  }

  if (!isHost) {
    return (
      <div className="screen screen--host">
        <SceneBackdrop tone="evening" />
        <div className="screen__body">
          <h2>هذا الجهاز ليس الجهاز الرئيسي</h2>
          <p className="lede">
            جهاز واحد فقط يقود الجلسة. انضم كلاعب لتحصل على شاشتك الشخصية.
          </p>
          <Button onClick={() => navigate(`/play/${code}`)}>انضم كلاعب</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen screen--host" data-phase={phase}>
      <SceneBackdrop tone={SCENE_TONE[phase] ?? 'night'} table={!isNight} />

      <header className="host-bar">
        <div className="host-bar__group host-bar__group--lead">
          {/*
            الخروج في الردهة فقط: بعد بدء الجولة يصبح هذا الجهاز هو المقدّم،
            ومغادرته تترك الطاولة بلا صوت ولا تحكّم. وحتى في الردهة يحتاج
            تأكيدًا لأن الجلسة والرمز يخصّان بقية اللاعبين لا المضيف وحده.
          */}
          {phase === 'lobby' && (
            <ExitButton
              label="خروج"
              confirmLabel="أغلق الجلسة"
              onExit={() => {
                forgetSession();
                navigate('/');
              }}
            />
          )}
          <Badge tone="good">رمز الجلسة {code}</Badge>
          <Badge tone={connection === 'online' ? 'live' : 'warn'}>
            {connection === 'online' ? 'متصل' : 'انقطع الاتصال'}
          </Badge>
          {disconnected.length > 0 && (
            <Badge tone="warn">{disconnected.length} جهاز منقطع</Badge>
          )}
        </div>
        <div className="host-bar__group">
          {!narrator.ttsAvailable && <Badge tone="warn">لا يوجد محرك نطق</Badge>}
          {/*
            بعد بدء الجولة لم يكن للمضيف أي مخرج: لا ضبط إعداد، ولا إنهاء، ولا
            خروج — إلا بإغلاق المتصفّح. هذا الزر هو الباب.
          */}
          {phase !== 'lobby' && (
            <button
              type="button"
              className="host-bar__menu"
              onClick={() => setMenuOpen(true)}
              aria-label="إعدادات الجولة"
            >
              ⚙
            </button>
          )}
        </div>
      </header>

      {menuOpen && (
        <HostRoundMenu
          settings={state.settings}
          onSettings={(patch) => void transport.updateSettings(code, patch)}
          onDismiss={() => setMenuOpen(false)}
          onNewRound={() => {
            setMenuOpen(false);
            setStageError(null);
            startedRef.current = '';
            revealedRoundRef.current = '';
            void transport.resetRound(code);
          }}
          onClose={() => {
            setMenuOpen(false);
            void transport.closeRoom(code).finally(() => {
              forgetSession();
              navigate('/');
            });
          }}
        />
      )}

      {/*
        ── الشاشة كلّها زر ──

        في وضع بلا تعليق صوتي يقود المضيف الليل بلمسة، وعيناه مغمضتان مع
        الطاولة. فالطبقة تملأ الشاشة وتقع **تحت** كل ما هو تفاعليّ: لمسة على
        فراغ تنقل الليلة، ولمسة على بطاقة جار تفعل ما كانت تفعله.
      */}
      {pendingStep && (
        <button
          type="button"
          className="night-tap"
          onClick={() => {
            const step = pendingStep;
            setPendingStep(null);
            void step.run().catch((cause) => {
              setPendingStep(step);
              setStageError(cause instanceof Error ? cause.message : String(cause));
            });
          }}
        >
          <span className="night-tap__hint">{pendingStep.label}</span>
          <span className="night-tap__note">المس أي مكان</span>
        </button>
      )}

      <main className="screen__body host-body">
        {/*
          الجولة تتوقّف صامتة إن رُفضت كتابة أو تعثّرت شبكة. إظهار السبب مع زر
          إعادة محاولة يحوّل «الشاشات فاضية ولا أحد يعرف لماذا» إلى عطل مرئي
          قابل للتجاوز.
        */}
        {stageError && (
          <div className="host-stage-error" role="alert">
            <strong>تعثّرت الجولة</strong>
            <p>{stageError}</p>
            <Button
              onClick={() => {
                setStageError(null);
                startedRef.current = '';
                void transport.setPhase(code, phase);
              }}
            >
              أعد المحاولة
            </Button>
          </div>
        )}
        {/*
          المضيف لاعب أيضًا: شاشته الخاصة تسبق مشهد الجمهور لأنها الإجراء
          المطلوب منه الآن، ومشهد الجمهور حالةٌ يقرؤها من حوله.
        */}
        {state.settings.hostPlays && me && (
          <HostPlayerPanel
            code={code}
            me={me}
            secret={secret}
            players={players}
            settings={state.settings}
            phase={phase}
            progress={state.progress}
            nightSlot={slotOfNightPhase(phase)}
            secretResolved={state.meta.secretStage === 'resolved'}
            endsAt={state.meta.phaseEndsAt ?? null}
          />
        )}

        {phase === 'lobby' && (
          <HostLobbyStage
            code={code}
            joinUrl={joinUrl}
            players={players}
            settings={state.settings}
            hostJoined={Boolean(me)}
            onSettings={(patch) => void transport.updateSettings(code, patch)}
            onReorder={handleReorder}
            onStart={startRoles}
            onHostJoin={async (name, avatarId) => {
              if (!playerId) return;
              await transport.joinRoom({ code, playerId, name, avatarId });
              // المضيف جاهز فور جلوسه: لا شاشة انتظار له يضغط فيها «أنا جاهز»
              await transport.updatePlayer(code, playerId, { ready: true });
            }}
          />
        )}

        {phase === 'role-distribution' && (
          <HostRolesStage players={players} progress={state.progress} />
        )}

        {phase === 'dice-roll' && (
          <HostDiceStage
            players={players}
            progress={state.progress}
            settings={state.settings}
          />
        )}

        {phase === 'ready-check' && (
          <HostReadyStage
            players={players}
            onStart={() => {
              void narrator.say(narrator.script.readyCheck);
              void transport.setPhase(code, 'night-intro');
            }}
          />
        )}

        {/*
          مشهد الراوي يختفي حين يكون لصاحب الجهاز فعلٌ شخصيّ في الليل: الشاشتان
          معًا تجعلان الصفحة أطول من الجهاز، فتنزل نتيجة الفحص تحت الطيّة —
          والأعين مغلقة حول الطاولة أصلًا، فلا أحد ينظر إلى مشهد الراوي الآن.
        */}
        {(phase === 'night-intro' || isNight) &&
          !(
            state.settings.hostPlays &&
            me &&
            hostNightActive(
              secret,
              phase,
              slotOfNightPhase(phase),
              players.length,
              state.settings.diceMode,
            )
          ) && (
          <HostNightStage
            phase={phase}
            countdown={countdown}
            naming={state.settings.slotNaming}
            disconnected={disconnected}
            onPause={() => void transport.setPhase(code, 'paused')}
          />
        )}

        {phase === 'secret-actions' && (
          <HostSecretStage
            players={players}
            progress={state.progress}
            resolved={state.meta.secretStage === 'resolved'}
          />
        )}

        {phase === 'discussion' && (
          <HostDiscussionStage
            players={players}
            seconds={state.settings.discussionSeconds}
            onVote={() => void transport.setPhase(code, 'voting')}
          />
        )}

        {phase === 'voting' && (
          <HostVotingStage players={players} progress={state.progress} />
        )}

        {phase === 'reveal' && (
          <HostRevealStage
            step={revealStep}
            results={state.results}
            players={players}
          />
        )}

        {phase === 'results' && (
          <HostResultsStage
            results={state.results}
            players={players}
            naming={state.settings.slotNaming}
            onNewRound={() => void transport.resetRound(code)}
            onHome={() => navigate('/')}
          />
        )}

        {phase === 'paused' && (
          <div className="stack" style={{ alignItems: 'center' }}>
            <h1>الجولة متوقفة</h1>
            <p className="lede">انتظروا عودة الأجهزة المنقطعة قبل الاستكمال.</p>
            <Button
              size="lg"
              onClick={() => {
                void narrator.say(narrator.script.resumed);
                void transport.setPhase(code, state.meta.resumePhase ?? 'ready-check');
              }}
            >
              استكمال الجولة
            </Button>
          </div>
        )}
      </main>

      {narrator.caption && (
        <div className="host-caption" role="status" aria-live="polite">
          <p>{narrator.caption}</p>
          <button
            type="button"
            className="host-caption__repeat"
            onClick={narrator.repeat}
            aria-label="أعد الجملة"
          >
            ↻
          </button>
        </div>
      )}
    </div>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
