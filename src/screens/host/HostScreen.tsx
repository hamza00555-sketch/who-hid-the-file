/**
 * الجهاز الرئيسي — مقدّم اللعبة.
 *
 * يملك وحده: الصوت، الانتقال بين المراحل، توزيع الأدوار، حساب النتائج.
 * لا يعرض دورًا ولا نردًا ولا موعد استيقاظ لأي لاعب قبل شاشة النتائج.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useNarrator } from '../../audio/useNarrator';
import { GAME_CONFIG } from '../../config/game.config';
import {
  allAcked,
  applyPendingAccompliceChoice,
  enterSecretActions,
  finalizeWakeSlots,
  resolvePendingInspections,
  revealResults,
  startRoleDistribution,
} from '../../game/director';
import { planAccomplices } from '../../game/accomplice';
import { reorderSeats } from '../../game/seating';
import { isSupportedPlayerCount } from '../../game/rules';
import { slotOfNightPhase, type Phase } from '../../game/types';
import { useRoom, useSession } from '../../net/session';
import { SceneBackdrop, type SceneTone } from '../../ui/components/SceneBackdrop';
import { Badge, Button, WaitingNote } from '../../ui/components/kit';
import {
  HostDiceStage,
  HostDiscussionStage,
  HostLobbyStage,
  HostNightStage,
  HostReadyStage,
  HostResultsStage,
  HostRevealStage,
  HostRolesStage,
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
  'secret-actions': 'night',
  discussion: 'dawn',
  voting: 'dawn',
  reveal: 'dawn',
  results: 'dawn',
};

export function HostScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { transport } = useSession();
  const { state, players, isHost, playerCount, connection, loading, missing } = useRoom(code);

  const phase = state?.meta.phase ?? 'lobby';
  const roundId = state?.meta.roundId ?? '';
  const settings = state?.settings;
  const narrator = useNarrator({
    enabled: settings?.voiceEnabled ?? true,
    rate: settings?.ttsRate ?? GAME_CONFIG.defaults.ttsRate,
    naming: settings?.slotNaming ?? GAME_CONFIG.slotNaming,
  });

  const [countdown, setCountdown] = useState<{ value: number; total: number } | null>(null);
  const [revealStep, setRevealStep] = useState<number | null>(null);

  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const startedRef = useRef<string>('');

  const disconnected = players.filter((player) => !player.connected);
  const isNight = phase.startsWith('night-');

  useEffect(() => {
    // الجهاز الرئيسي لا يخفت أبدًا: يجب أن يُقرأ من الطرف الآخر للطاولة.
    // الإظلام حالة خاصة بأجهزة اللاعبين وحدها.
    document.body.dataset.night = 'false';
  }, []);

  /* ── مؤقتات المراحل: تعمل على جهاز المضيف وحده ── */

  const runCountdown = useCallback(
    async (seconds: number, guard: Phase) => {
      for (let value = seconds; value > 0; value--) {
        if (phaseRef.current !== guard) return false;
        setCountdown({ value, total: seconds });
        await wait(1000);
      }
      setCountdown(null);
      return phaseRef.current === guard;
    },
    [],
  );

  const runKey = `${roundId}:${phase}`;

  useEffect(() => {
    if (!isHost || !state) return;
    if (startedRef.current === runKey) return;
    startedRef.current = runKey;

    const guard = phase;
    const still = () => phaseRef.current === guard;

    void (async () => {
      if (guard === 'night-intro') {
        await narrator.say(narrator.script.nightStart);
        if (still()) await transport.setPhase(code, 'night-phase-1');
        return;
      }

      const slot = slotOfNightPhase(guard);
      if (slot) {
        await narrator.say(narrator.script.slotOpen(slot));
        if (!still()) return;
        const finished = await runCountdown(
          settings?.nightCountdownSeconds ?? GAME_CONFIG.defaults.nightCountdownSeconds,
          guard,
        );
        if (!finished) return;
        await narrator.say(narrator.script.slotClose(slot));
        if (!still()) return;

        if (slot < 6) {
          await transport.setPhase(code, `night-phase-${slot + 1}` as Phase);
        } else {
          await narrator.say(narrator.script.nightEnd);
          if (!still()) return;
          await enterSecretActions(transport, code, playerCount);
          await transport.setSecretStage(code, 'choosing');
          void narrator.say(narrator.script.secretActions);
        }
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

    if (phase === 'voting' && allAcked(progress, players, 'voted')) {
      void narrator.say(narrator.script.votingComplete);
      void revealResults(transport, code, players);
    }
  }, [isHost, state, phase, players, code, transport, narrator]);

  /* ── المرحلة السرية: تطبيق اختيار المُخفي فور وصوله ── */

  // اللاعبون خارج قائمة اعتماديات المراقب: تغيّر أي حقل عام لا يجب أن يُعيد الاشتراك.
  const playersRef = useRef(players);
  playersRef.current = players;
  /** يمنع كتابة `resolved` أكثر من مرة لكل جولة — الحالة القادمة عبر props قد تكون قديمة. */
  const resolvedRoundRef = useRef<string>('');

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

  if (loading) {
    return (
      <div className="screen screen--host">
        <SceneBackdrop tone="evening" />
        <div className="screen__body">
          <WaitingNote>جارٍ فتح الجلسة</WaitingNote>
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
        <div className="host-bar__group">
          <Badge tone="good">رمز الجلسة {code}</Badge>
          <Badge tone={connection === 'online' ? 'live' : 'warn'}>
            {connection === 'online' ? 'متصل' : 'انقطع الاتصال'}
          </Badge>
          {disconnected.length > 0 && (
            <Badge tone="warn">{disconnected.length} جهاز منقطع</Badge>
          )}
        </div>
        {!narrator.ttsAvailable && (
          <div className="host-bar__group">
            <Badge tone="warn">لا يوجد محرك نطق</Badge>
          </div>
        )}
      </header>

      <main className="screen__body host-body">
        {phase === 'lobby' && (
          <HostLobbyStage
            code={code}
            joinUrl={joinUrl}
            players={players}
            settings={state.settings}
            onSettings={(patch) => void transport.updateSettings(code, patch)}
            onReorder={handleReorder}
            onStart={startRoles}
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

        {(phase === 'night-intro' || isNight) && (
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
