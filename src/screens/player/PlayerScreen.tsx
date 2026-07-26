/**
 * جهاز اللاعب — شاشة شخصية صامتة.
 *
 * لا يصدر منها صوت إطلاقًا، ولا تعرض إلا ما يخص صاحبها.
 * أثناء الليل تصبح شبه مطفأة ولا تستقبل أي لمسة.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GAME_CONFIG } from '../../config/game.config';
import { availableCharacters, ROSTER } from '../../game/roster';
import { slotOfNightPhase } from '../../game/types';
import { rememberSession, useRoom, useSecret, useSession } from '../../net/session';
import { TransportError } from '../../net/transport';
import { Character } from '../../ui/components/Character';
import { SceneBackdrop } from '../../ui/components/SceneBackdrop';
import { Badge, Button, Panel, WaitingNote } from '../../ui/components/kit';
import {
  PlayerDiceStage,
  PlayerLobbyStage,
  PlayerNightStage,
  PlayerResultsStage,
  PlayerRoleStage,
  PlayerSecretStage,
  PlayerVotingStage,
  PlayerWaitStage,
} from './playerStages';
import './player.css';

export function PlayerScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { transport, playerId, ready } = useSession();
  const { state, players, me, connection, loading, missing } = useRoom(code);
  const secret = useSecret(code);

  const phase = state?.meta.phase ?? 'lobby';
  const isNight = phase.startsWith('night-');
  const nightSlot = slotOfNightPhase(phase);

  useEffect(() => {
    document.body.dataset.night = String(isNight);
  }, [isNight]);

  /* اهتزاز صامت عند حلول موعد اللاعب — لا صوت ولا إضاءة */
  useEffect(() => {
    if (!isNight || !nightSlot || !secret) return;
    if (!secret.effectiveSlots.includes(nightSlot)) return;
    navigator.vibrate?.([220]);
  }, [isNight, nightSlot, secret]);

  /* اهتزازة مختلفة بعد إغلاق الأعين لمن استيقظ وحده: «لديك معلومة» */
  useEffect(() => {
    if (phase !== 'secret-actions' || !secret) return;
    const hasInfo =
      secret.soloSlots.length > 0 ||
      secret.accompliceQuota > 0 ||
      secret.knownAllies.length > 0;
    if (hasInfo) navigator.vibrate?.([60, 90, 60]);
  }, [phase, secret]);

  if (loading || !ready) {
    return (
      <Shell>
        <WaitingNote>جارٍ الاتصال بالجلسة</WaitingNote>
      </Shell>
    );
  }

  if (missing || !state) {
    return (
      <Shell>
        <h2>لا توجد جلسة بالرمز {code}</h2>
        <p className="lede">تأكد من الرمز مع المضيف.</p>
        <Button onClick={() => navigate('/')}>الرئيسية</Button>
      </Shell>
    );
  }

  if (!me) {
    return (
      <JoinForm
        code={code}
        takenNames={players.map((player) => player.name)}
        takenAvatars={players.map((player) => player.avatarId)}
        locked={state.meta.phase !== 'lobby'}
        full={players.length >= GAME_CONFIG.players.max}
        onJoin={async (name, avatarId) => {
          if (!playerId) return;
          await transport.joinRoom({ code, playerId, name, avatarId });
          rememberSession({ code, playerId, role: 'player' });
        }}
      />
    );
  }

  const offline = connection !== 'online';

  return (
    <div className={`screen screen--player ${isNight ? 'screen--blackout' : ''}`}>
      {!isNight && <SceneBackdrop tone={phase === 'discussion' ? 'dawn' : 'night'} table={false} />}

      {!isNight && (
        <header className="player-bar">
          <span className="player-bar__me">
            <Character characterId={me.avatarId} size={34} still />
            <strong>{me.name}</strong>
          </span>
          {offline ? <Badge tone="warn">إعادة اتصال…</Badge> : <Badge tone="live">متصل</Badge>}
        </header>
      )}

      <main className="screen__body player-body">
        {phase === 'lobby' && (
          <PlayerLobbyStage
            me={me}
            playerCount={players.length}
            onReady={(value) => void transport.updatePlayer(code, me.id, { ready: value })}
          />
        )}

        {phase === 'role-distribution' && (
          <PlayerRoleStage
            secret={secret}
            playerCount={players.length}
            acked={state.progress[me.id]?.roleAck ?? false}
            onAck={() => void transport.ack(code, me.id, 'roleAck')}
          />
        )}

        {phase === 'dice-roll' && (
          <PlayerDiceStage
            code={code}
            me={me}
            secret={secret}
            settings={state.settings}
            playerCount={players.length}
            acked={state.progress[me.id]?.diceAck ?? false}
          />
        )}

        {phase === 'ready-check' && (
          <PlayerWaitStage
            title="ضع جهازك على الطاولة"
            note="وجّه الشاشة إلى الأسفل واستمع إلى الجهاز الرئيسي."
            avatarId={me.avatarId}
            state="idle"
          />
        )}

        {isNight && <PlayerNightStage />}

        {phase === 'secret-actions' && (
          <PlayerSecretStage
            code={code}
            me={me}
            secret={secret}
            players={players}
            resolved={state.meta.secretStage === 'resolved'}
            acked={state.progress[me.id]?.secretAck ?? false}
          />
        )}

        {phase === 'discussion' && (
          <PlayerWaitStage
            title="ابدؤوا النقاش"
            note="تحدثوا مباشرة مع بعضكم. لا تعرضوا شاشاتكم."
            avatarId={me.avatarId}
            state="suspicious"
          />
        )}

        {phase === 'voting' && (
          <PlayerVotingStage
            code={code}
            me={me}
            players={players}
            voted={state.progress[me.id]?.voted ?? false}
          />
        )}

        {(phase === 'reveal' || phase === 'results') && (
          <PlayerResultsStage me={me} results={state.results} players={players} />
        )}

        {phase === 'paused' && (
          <PlayerWaitStage
            title="الجولة متوقفة"
            note="انتظر إشارة المضيف قبل أن تفتح عينيك."
            avatarId={me.avatarId}
            state="asleep"
          />
        )}
      </main>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="screen screen--player">
      <SceneBackdrop tone="night" table={false} />
      <div className="screen__body">{children}</div>
    </div>
  );
}

/* ══════════════════════ الانضمام ══════════════════════ */

function JoinForm({
  code,
  takenNames,
  takenAvatars,
  locked,
  full,
  onJoin,
}: {
  code: string;
  takenNames: string[];
  takenAvatars: string[];
  locked: boolean;
  full: boolean;
  onJoin: (name: string, avatarId: string) => Promise<void>;
}) {
  const takenKey = takenAvatars.join(',');
  const options = useMemo(
    () => availableCharacters(takenKey ? takenKey.split(',') : []),
    [takenKey],
  );
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState(options[0]?.id ?? ROSTER[0]!.id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!options.some((option) => option.id === avatarId) && options[0]) {
      setAvatarId(options[0].id);
    }
  }, [options, avatarId]);

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const nameTaken = takenNames.includes(trimmed);
  const valid = trimmed.length >= 2 && !nameTaken && !locked && !full;

  const selected = options.find((option) => option.id === avatarId) ?? ROSTER[0]!;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onJoin(trimmed, avatarId);
    } catch (cause) {
      setError(
        cause instanceof TransportError ? cause.message : 'تعذّر الانضمام. حاول مرة أخرى.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="screen screen--player">
      <SceneBackdrop tone="evening" table={false} />
      <div className="screen__body join">
        <p className="join__code">
          جلسة <strong>{code}</strong>
        </p>

        <div className="join__preview">
          <Character characterId={selected.id} state="idle" size={200} />
          <p className="join__trait">{selected.trait}</p>
        </div>

        <label className="join__label" htmlFor="player-name">
          اسمك
        </label>
        <input
          id="player-name"
          className="join__name"
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, 20))}
          placeholder="اكتب اسمك"
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={nameTaken || undefined}
        />
        {nameTaken && (
          <p role="alert" className="join__error">
            هذا الاسم مستخدم في الجلسة — اختر اسمًا آخر.
          </p>
        )}

        <p className="join__label">اختر شخصيتك</p>
        <ul className="join__avatars">
          {options.map((character) => (
            <li key={character.id}>
              <button
                type="button"
                aria-pressed={avatarId === character.id}
                data-selected={avatarId === character.id || undefined}
                onClick={() => setAvatarId(character.id)}
                aria-label={character.name}
              >
                <Character characterId={character.id} size={64} still />
                <span>{character.name}</span>
              </button>
            </li>
          ))}
        </ul>

        {locked && (
          <Panel tone="coral">
            بدأت الجولة بالفعل. اطلب من المضيف إعادتك عبر إجراء الاستعادة.
          </Panel>
        )}
        {full && !locked && (
          <Panel tone="coral">
            الجلسة مكتملة ({GAME_CONFIG.players.max} لاعبين).
          </Panel>
        )}
        {error && (
          <p role="alert" className="join__error">
            {error}
          </p>
        )}

        <Button size="lg" full onClick={submit} disabled={!valid || busy}>
          ادخل الجلسة
        </Button>
      </div>
    </div>
  );
}
