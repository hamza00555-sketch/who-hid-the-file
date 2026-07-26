/**
 * الشاشة الرئيسية — مشهد افتتاحي: الملف في الوسط والفريق حوله.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GAME_CONFIG } from '../config/game.config';
import { ROSTER } from '../game/roster';
import type { RoomSettings } from '../game/types';
import { useSession, rememberSession, recallSession, forgetSession } from '../net/session';
import { isFirebaseConfigured } from '../net/env';
import { Character } from '../ui/components/Character';
import { FileProp } from '../ui/components/FileProp';
import { SceneBackdrop } from '../ui/components/SceneBackdrop';
import { Badge, Button, Panel } from '../ui/components/kit';
import './home.css';

const DEFAULT_SETTINGS: RoomSettings = {
  gameName: GAME_CONFIG.name,
  diceMode: GAME_CONFIG.defaults.diceMode,
  slotNaming: GAME_CONFIG.slotNaming,
  nightCountdownSeconds: GAME_CONFIG.defaults.nightCountdownSeconds,
  discussionSeconds: GAME_CONFIG.defaults.discussionSeconds,
  voiceEnabled: GAME_CONFIG.defaults.voiceEnabled,
  ttsRate: GAME_CONFIG.defaults.ttsRate,
  tableMode: GAME_CONFIG.defaults.tableMode,
};

export function Home() {
  const navigate = useNavigate();
  const { transport, playerId, ready } = useSession();
  const [mode, setMode] = useState<'idle' | 'joining'>('idle');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previous, setPrevious] = useState(recallSession());

  useEffect(() => {
    document.body.dataset.night = 'false';
  }, []);

  async function createRoom() {
    if (!playerId) return;
    setBusy(true);
    setError(null);
    try {
      const newCode = await transport.createRoom(playerId, DEFAULT_SETTINGS);
      rememberSession({ code: newCode, playerId, role: 'host' });
      navigate(`/host/${newCode}`);
    } catch {
      setError('تعذّر إنشاء الجلسة. تحقق من الاتصال وحاول مرة أخرى.');
      setBusy(false);
    }
  }

  function goJoin() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < GAME_CONFIG.roomCode.length) {
      setError(`رمز الجلسة مكوّن من ${GAME_CONFIG.roomCode.length} أحرف.`);
      return;
    }
    navigate(`/play/${trimmed}`);
  }

  return (
    <div className="screen home">
      <SceneBackdrop tone="evening" />

      <div className="home__badges">
        <Badge tone={isFirebaseConfigured() ? 'live' : 'warn'}>
          {isFirebaseConfigured() ? 'متصل بـ Firebase' : 'وضع محلي — بلا خادم'}
        </Badge>
      </div>

      <div className="screen__body home__body">
        <div className="home__stage" aria-hidden="true">
          <Character characterId={ROSTER[3]!.id} state="suspicious" size={148} className="home__char home__char--a" />
          <Character characterId={ROSTER[0]!.id} state="look-left" size={168} className="home__char home__char--b" />
          <FileProp state="breathing" size={148} className="home__file" />
          <Character characterId={ROSTER[5]!.id} state="look-right" size={168} className="home__char home__char--c" />
          <Character characterId={ROSTER[6]!.id} state="hiding" size={148} className="home__char home__char--d" />
        </div>

        <header className="home__title">
          <h1>{GAME_CONFIG.name}</h1>
          <p className="home__tagline">{GAME_CONFIG.tagline}</p>
        </header>

        {mode === 'idle' ? (
          <div className="home__actions">
            <Button size="xl" onClick={createRoom} disabled={!ready || busy}>
              إنشاء جلسة
            </Button>
            <Button size="lg" tone="quiet" onClick={() => setMode('joining')}>
              انضمام برمز
            </Button>
          </div>
        ) : (
          <Panel className="home__join">
            <label className="home__label" htmlFor="code">
              اكتب رمز الجلسة
            </label>
            <input
              id="code"
              className="home__code-input"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 6))}
              placeholder="XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              enterKeyHint="go"
              onKeyDown={(event) => event.key === 'Enter' && goJoin()}
            />
            <div className="row">
              <Button size="lg" onClick={goJoin}>
                انضم
              </Button>
              <Button tone="ghost" onClick={() => setMode('idle')}>
                رجوع
              </Button>
            </div>
          </Panel>
        )}

        {previous && (
          <Panel tone="night" className="home__resume">
            <p>
              لديك جلسة سابقة بالرمز <strong>{previous.code}</strong>.
            </p>
            <div className="row">
              <Button
                tone="quiet"
                onClick={() =>
                  navigate(
                    previous.role === 'host'
                      ? `/host/${previous.code}`
                      : `/play/${previous.code}`,
                  )
                }
              >
                استئناف
              </Button>
              <Button
                tone="ghost"
                onClick={() => {
                  forgetSession();
                  setPrevious(null);
                }}
              >
                تجاهل
              </Button>
            </div>
          </Panel>
        )}

        {error && (
          <p role="alert" className="home__error">
            {error}
          </p>
        )}

        <p className="home__footer">
          {GAME_CONFIG.players.min}–{GAME_CONFIG.players.max} لاعبين · جهاز رئيسي + جهاز لكل
          لاعب · {GAME_CONFIG.owner}
        </p>
      </div>
    </div>
  );
}
