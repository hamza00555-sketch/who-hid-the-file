/**
 * الشاشة الرئيسية — مشهد افتتاحي: الملف في الوسط والفريق حوله.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GAME_CONFIG } from '../config/game.config';
import type { RoomSettings } from '../game/types';
import { useSession, rememberSession, recallSession, forgetSession } from '../net/session';
import { isFirebaseConfigured } from '../net/env';
import { SceneBackdrop, preloadScenes } from '../ui/components/SceneBackdrop';
import { preloadDice } from '../ui/components/Dice';
import { Badge, Button, Panel } from '../ui/components/kit';
import { LocalModeNotice } from '../ui/components/LocalModeNotice';
import { HomeHero } from './HomeHero';
import {
  IconClock,
  IconDevices,
  IconKey,
  IconPeople,
  IconPlus,
  IconShield,
  InfoStrip,
  MenuItem,
} from './HomeMenu';
import './home.css';

const DEFAULT_SETTINGS: RoomSettings = {
  gameName: GAME_CONFIG.name,
  diceMode: GAME_CONFIG.defaults.diceMode,
  slotNaming: GAME_CONFIG.slotNaming,
  nightCountdownSeconds: GAME_CONFIG.defaults.nightCountdownSeconds,
  discussionSeconds: GAME_CONFIG.defaults.discussionSeconds,
  voiceEnabled: GAME_CONFIG.defaults.voiceEnabled,
  hostPlays: GAME_CONFIG.defaults.hostPlays,
  narratorVoice: GAME_CONFIG.defaults.narratorVoice,
  narratorSource: GAME_CONFIG.defaults.narratorSource,
  ttsRate: GAME_CONFIG.defaults.ttsRate,
};

export function Home() {
  const navigate = useNavigate();
  const { transport, playerId, ready } = useSession();
  const [mode, setMode] = useState<'idle' | 'joining'>('idle');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previous, setPrevious] = useState(recallSession());
  const online = isFirebaseConfigured();

  useEffect(() => {
    document.body.dataset.night = 'false';
    // مشاهد الجولة ووجوه النرد تُحمَّل مبكرًا فلا تومض عند تغيّر المرحلة
    preloadScenes();
    preloadDice();
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

      {online && (
        <div className="home__badges">
          <Badge tone="live">متصل بـ Firebase</Badge>
        </div>
      )}

      <div className="screen__body home__body">
        <HomeHero />

        <header className="home__title">
          <h1>{GAME_CONFIG.name}</h1>
          <p className="home__tagline">{GAME_CONFIG.tagline}</p>
        </header>

        {/*
          الشارة الصغيرة لم تكن كافية: المضيف يقرأ «وضع محلي» ولا يربطها بأن
          أصدقاءه لن يستطيعوا الدخول. الإشعار يسبق زر الإنشاء لهذا السبب.
        */}
        {!online && <LocalModeNotice place="home" />}

        {mode === 'idle' ? (
          <div className="home__actions">
            <MenuItem
              icon={IconPlus}
              label={online ? 'إنشاء جلسة' : 'إنشاء جلسة تجريبية'}
              disabled={!ready || busy}
              onClick={createRoom}
            />
            <MenuItem
              icon={IconKey}
              label="انضمام برمز"
              tone="quiet"
              onClick={() => setMode('joining')}
            />
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
            <div className="home__resume-text">
              <p>
                لديك جلسة سابقة بالرمز{' '}
                <strong dir="ltr" className="home__resume-code">
                  {previous.code}
                </strong>
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
            </div>
            {/*
              الخزنة ليست زينة: الجلسة السابقة «محفوظة» لا جارية، والخزنة تقول
              ذلك قبل قراءة السطر. تأتي بعد النص في الـ DOM فتقع على الحافة
              النهائية في اتجاه RTL — أي بعيدًا عن حيث تبدأ العين القراءة.
              `aria-hidden` لأن النص يقول المعنى كاملًا.
            */}
            <img className="home__resume-art" src="/ui/vault.png" alt="" aria-hidden="true" />
          </Panel>
        )}

        {error && (
          <p role="alert" className="home__error">
            {error}
          </p>
        )}

        <InfoStrip
          items={[
            { icon: IconClock, value: '60–90', label: 'دقيقة', tone: 'var(--sky)' },
            {
              icon: IconPeople,
              value: `${GAME_CONFIG.players.min}–${GAME_CONFIG.players.max}`,
              label: 'لاعبين',
              tone: 'var(--violet)',
            },
            { icon: IconDevices, value: 'جهاز لكل لاعب', label: 'مع جهاز رئيسي', tone: 'var(--mint)' },
            { icon: IconShield, value: 'قوسي', label: 'التأمينات الاجتماعية', tone: 'var(--amber)' },
          ]}
        />
      </div>
    </div>
  );
}
