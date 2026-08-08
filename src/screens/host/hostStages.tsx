/**
 * مشاهد الجهاز الرئيسي. كل مشهد مقروء من مسافة حول الطاولة:
 * نص كبير، حالة واحدة واضحة، ورسم يشرح المطلوب قبل قراءة الكلمات.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { GAME_CONFIG, slotLabel } from '../../config/game.config';
import { ROSTER } from '../../game/roster';
import { rulesFor, isSupportedPlayerCount } from '../../game/rules';
import { neighboursOf } from '../../game/seating';
import type {
  Phase,
  PlayerProgress,
  PlayerPublic,
  RoomSettings,
  RoundResults,
} from '../../game/types';
import { slotOfNightPhase } from '../../game/types';
import { isFirebaseConfigured } from '../../net/env';
import { Character } from '../../ui/components/Character';
import { LocalModeNotice } from '../../ui/components/LocalModeNotice';
import { Dice } from '../../ui/components/Dice';
import { FileProp } from '../../ui/components/FileProp';
import { SeatRing, SeatingEditor } from '../../ui/components/Table';
import {
  Badge,
  Button,
  CountdownRing,
  Panel,
  ProgressPips,
  StageTitle,
  WaitingNote,
} from '../../ui/components/kit';

type Progress = Record<string, PlayerProgress>;

function doneCount(progress: Progress, players: PlayerPublic[], key: keyof PlayerProgress) {
  return players.filter((player) => progress[player.id]?.[key]).length;
}

/* ══════════════════════════ قائمة الجولة ══════════════════════════ */

/**
 * لوحة المضيف أثناء الجولة: ضبطُ ما يجوز ضبطه، وإنهاء الجولة، والخروج.
 *
 * لم يكن للمضيف بعد بدء الجولة أي مخرج: لا تعديل إعداد، ولا إنهاء، ولا رجوع —
 * إلا بإغلاق المتصفّح. وجولة تُلعب مع أصدقاء تحتاج الثلاثة: يُخفَّض العدّاد،
 * أو تُعاد الجولة، أو يُقال «خلاص».
 */
export function HostRoundMenu({
  settings,
  onSettings,
  onNewRound,
  onClose,
  onDismiss,
}: {
  settings: RoomSettings;
  onSettings: (patch: Partial<RoomSettings>) => void;
  onNewRound: () => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const [confirming, setConfirming] = useState<'round' | 'close' | null>(null);

  return (
    <div className="host-menu" role="dialog" aria-label="إعدادات الجولة">
      <div className="host-menu__sheet">
        <div className="host-menu__top">
          <h2>الجولة</h2>
          <Button tone="ghost" onClick={onDismiss}>
            إغلاق
          </Button>
        </div>

        <SettingsPanel settings={settings} onChange={onSettings} inRound />

        <div className="host-menu__actions">
          {confirming === 'round' ? (
            <Panel tone="coral">
              <p>ستُلغى الجولة الحالية ويعود الجميع إلى الردهة. الأدوار تُوزَّع من جديد.</p>
              <div className="row">
                <Button tone="danger" onClick={onNewRound}>
                  نعم، أعد الجولة
                </Button>
                <Button tone="ghost" onClick={() => setConfirming(null)}>
                  تراجع
                </Button>
              </div>
            </Panel>
          ) : (
            <Button full tone="quiet" onClick={() => setConfirming('round')}>
              أنهِ الجولة وعُد إلى الردهة
            </Button>
          )}

          {confirming === 'close' ? (
            <Panel tone="coral">
              <p>ستُغلق الجلسة على كل الأجهزة، ولن يمكن استئنافها بنفس الرمز.</p>
              <div className="row">
                <Button tone="danger" onClick={onClose}>
                  نعم، أغلق الجلسة
                </Button>
                <Button tone="ghost" onClick={() => setConfirming(null)}>
                  تراجع
                </Button>
              </div>
            </Panel>
          ) : (
            <Button full tone="ghost" onClick={() => setConfirming('close')}>
              أغلق الجلسة واخرج
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ الردهة ══════════════════════════ */

export function HostLobbyStage({
  code,
  joinUrl,
  players,
  settings,
  hostJoined,
  onSettings,
  onReorder,
  onStart,
  onHostJoin,
}: {
  code: string;
  joinUrl: string;
  players: PlayerPublic[];
  settings: RoomSettings;
  hostJoined: boolean;
  onSettings: (patch: Partial<RoomSettings>) => void;
  onReorder: (from: number, to: number) => void;
  onStart: () => void;
  onHostJoin: (name: string, avatarId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<'join' | 'seating' | 'settings'>('join');
  const readyCount = players.filter((player) => player.ready).length;
  const countOk = isSupportedPlayerCount(players.length);
  const allReady = players.length > 0 && readyCount === players.length;
  const allConnected = players.every((player) => player.connected);
  const hostMissing = settings.hostPlays && !hostJoined;
  const canStart = countOk && allReady && allConnected && !hostMissing;

  const blockers = [
    hostMissing && 'هذا الجهاز يلعب — اكتب اسمك واختر شخصيتك أولًا',
    !countOk && `العدد الحالي ${players.length} — المطلوب من ${GAME_CONFIG.players.min} إلى ${GAME_CONFIG.players.max}`,
    countOk && !allReady && `${players.length - readyCount} لاعب لم يضغط «أنا جاهز»`,
    !allConnected && 'يوجد جهاز منقطع',
  ].filter(Boolean) as string[];

  return (
    <div className="lobby">
      <div className="lobby__main">
        <nav className="lobby__tabs" role="tablist">
          {(
            [
              ['join', 'الانضمام'],
              ['seating', 'ترتيب الجلوس'],
              ['settings', 'الإعدادات'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              className="lobby__tab"
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === 'join' && (
          <>
            {hostMissing && (
              <HostSeatForm
                takenNames={players.map((player) => player.name)}
                takenAvatars={players.map((player) => player.avatarId)}
                onJoin={onHostJoin}
              />
            )}
            <JoinPanel code={code} joinUrl={joinUrl} />
          </>
        )}

        {tab === 'seating' && (
          <Panel>
            <h3>رتّب اللاعبين كما يجلسون فعلًا</h3>
            <p className="eyebrow-note">
              الترتيب من المقعد ١ مع عقارب الساعة. اللاعب التالي يجلس عن يسار سابقه.
            </p>
            <SeatingEditor players={players} onReorder={onReorder} />
          </Panel>
        )}

        {tab === 'settings' && <SettingsPanel settings={settings} onChange={onSettings} />}
      </div>

      <aside className="lobby__side">
        {/* سطر حالة واحد يقرأه المضيف بنظرة — لا رقم عملاق منفصل عن وصفه */}
        <p className="lobby__count">
          {players.length === 0 ? (
            'لم ينضم أحد بعد'
          ) : (
            <>
              <strong>{readyCount}</strong> جاهزون من <strong>{players.length}</strong>
            </>
          )}
        </p>

        {/* الحلقة تمثّل الطاولة الحقيقية — لا معنى لها على شاشة جوال ضيقة */}
        <div className="lobby__ring">
          <SeatRing
            players={players}
            caption={players.length ? undefined : 'بانتظار اللاعبين'}
          />
        </div>

        <RosterStrip players={players} />
      </aside>

      <div className="lobby__bar">
        {blockers.length > 0 ? (
          <ul className="lobby__blockers">
            {blockers.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        ) : (
          <p className="lobby__ready-note">كل شيء جاهز — ابدؤوا متى شئتم.</p>
        )}
        <Button size="lg" onClick={onStart} disabled={!canStart}>
          ابدأ توزيع الأدوار
        </Button>
      </div>
    </div>
  );
}

/**
 * قائمة اللاعبين + مقاعد فارغة منقّطة تكمل الحدّ الأدنى.
 *
 * القائمة الفارغة كانت تترك فراغًا صامتًا لا يقول للمضيف كم ينقصه. الظلال
 * المنقّطة تجعل «العدد الناقص» شيئًا يُرى لا رقمًا يُحسب — وتختفي من تلقاء
 * نفسها حين يكتمل الحدّ الأدنى، فلا تتحوّل إلى ضجيج بعد اكتمال العدد.
 */
function RosterStrip({ players }: { players: PlayerPublic[] }) {
  const missing = Math.max(0, GAME_CONFIG.players.min - players.length);

  return (
    <ul className="lobby__roster">
      {players.map((player, index) => (
        <li
          key={player.id}
          data-state={!player.connected ? 'offline' : player.ready ? 'ready' : 'waiting'}
        >
          <b aria-hidden="true">{index + 1}</b>
          {player.name}
          <span aria-hidden="true">
            {!player.connected ? '⚡' : player.ready ? '✓' : '…'}
          </span>
        </li>
      ))}

      {/*
        المقاعد الفارغة تمثيل بصري لرقم يُنطق كاملًا في شريط البدء أسفل
        الشاشة، فتُخفى عن القارئ الصوتي بدل أن تُقرأ ثمانِ مرات بلا معنى.
      */}
      {Array.from({ length: missing }, (_, index) => (
        <li key={`empty-${index}`} data-state="empty" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="8"
              r="3.6"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="3 2.6"
            />
            <path
              d="M4.6 20a7.4 7.4 0 0114.8 0"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="3 2.6"
            />
          </svg>
        </li>
      ))}
    </ul>
  );
}

/**
 * مقعد المضيف حين يلعب.
 *
 * نموذج مصغّر لا نسخة من شاشة انضمام اللاعب: المضيف لا يحتاج مسح رمز ولا
 * كتابة رمز الجلسة — هو صاحبها. يحتاج اسمًا وشخصية فقط.
 */
function HostSeatForm({
  takenNames,
  takenAvatars,
  onJoin,
}: {
  takenNames: string[];
  takenAvatars: string[];
  onJoin: (name: string, avatarId: string) => Promise<void>;
}) {
  const options = useMemo(
    () => ROSTER.filter((character) => !takenAvatars.includes(character.id)),
    [takenAvatars],
  );
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chosen = avatarId ?? options[0]?.id ?? null;
  const trimmed = name.trim();
  const nameTaken = takenNames.some((other) => other.trim() === trimmed);
  const valid = trimmed.length > 0 && !nameTaken && chosen !== null;

  return (
    <Panel tone="night" className="host-seat">
      <h3>أنت تلعب هذه الجولة</h3>
      <p className="host-seat__lede">
        اكتب اسمك واختر شخصيتك. سيصلك دورك على هذا الجهاز مثل بقية اللاعبين.
      </p>

      <label className="host-seat__label" htmlFor="host-name">
        اسمك
      </label>
      <input
        id="host-name"
        className="host-seat__name"
        value={name}
        onChange={(event) => setName(event.target.value.slice(0, 20))}
        placeholder="اكتب اسمك"
        autoComplete="off"
        aria-invalid={nameTaken || undefined}
      />
      {nameTaken && (
        <p role="alert" className="host-seat__error">
          هذا الاسم مستخدم في الجلسة — اختر اسمًا آخر.
        </p>
      )}

      <p className="host-seat__label">اختر شخصيتك</p>
      <ul className="host-seat__avatars">
        {options.map((character) => (
          <li key={character.id}>
            <button
              type="button"
              aria-pressed={chosen === character.id}
              data-selected={chosen === character.id || undefined}
              onClick={() => setAvatarId(character.id)}
              aria-label={character.name}
            >
              <Character characterId={character.id} size={46} still />
              <span>{character.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <Button
        size="lg"
        full
        disabled={!valid || busy}
        onClick={async () => {
          if (!valid || !chosen) return;
          setBusy(true);
          try {
            await onJoin(trimmed, chosen);
          } finally {
            setBusy(false);
          }
        }}
      >
        خذ مقعدك
      </Button>
    </Panel>
  );
}

function JoinPanel({ code, joinUrl }: { code: string; joinUrl: string }) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    void QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 420,
      color: { dark: '#101a33', light: '#f7f9ff' },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [joinUrl]);

  /*
    بلا خادم لا يوجد مكان مشترك تُخزَّن فيه الجلسة: كل متصفح يحتفظ بها عنده.
    عرض QR ورابط هنا وعدٌ كاذب — الجهاز الثاني سيرى «لا توجد جلسة بالرمز».
  */
  if (!isFirebaseConfigured()) {
    return <LocalModeNotice place="lobby" />;
  }

  return (
    /*
      الشخصيتان تتّكئان على الحافة العليا للبطاقة وتشيران إلى الرمز. الرسم
      ليس زينة: البطاقة البيضاء وحدها لا تقول لمن هي، والإشارة لأسفل توجّه
      نظر من حول الطاولة إلى الرمز قبل قراءة أي كلمة.
    */
    <div className="join-stage">
      <img className="join-stage__peekers" src="/ui/lobby-peekers.png" alt="" aria-hidden="true" />
      <Panel tone="paper" className="join-panel">
        <div className="join-panel__text">
          <p className="join-panel__label">امسحوا الرمز أو اكتبوا</p>
          <p className="join-panel__code">{code}</p>
          <p className="join-panel__url">{joinUrl}</p>
        </div>
        <div className="join-panel__qr">
          {qr ? (
            <img src={qr} alt={`رمز QR للانضمام إلى الجلسة ${code}`} />
          ) : (
            <WaitingNote>جارٍ توليد رمز QR</WaitingNote>
          )}
        </div>
        <p className="join-panel__hint">
          كل لاعب يفتح الرابط على جهازه، يكتب اسمه، يختار شخصيته، ثم يضغط «أنا جاهز».
        </p>
      </Panel>
    </div>
  );
}

/**
 * إعدادات الغرفة.
 *
 * `inRound` يُخفي ما لا يجوز تغييره وسط جولة: طريقة النرد ومصطلح المواعيد
 * ومن يلعب. تغييرها بعد توزيع الأدوار يُنتج طاولة نصفها على قاعدة ونصفها على
 * أخرى — بينما الصوت والمُهَل يمكن ضبطها في أي لحظة بلا أثر على ما مضى.
 */
function SettingsPanel({
  settings,
  onChange,
  inRound = false,
}: {
  settings: RoomSettings;
  onChange: (patch: Partial<RoomSettings>) => void;
  inRound?: boolean;
}) {
  return (
    <Panel className="settings-panel">
      <h3>إعدادات الجولة</h3>

      {!inRound && (
      <fieldset className="settings-panel__field">
        <legend>طريقة تحديد موعد الاستيقاظ</legend>
        <div className="settings-panel__choices">
          <Choice
            checked={settings.diceMode === 'digital'}
            onChange={() => onChange({ diceMode: 'digital' })}
            title="نرد رقمي داخل التطبيق"
            note="لا يحتاج ملحقات — الوضع الافتراضي"
          />
          <Choice
            checked={settings.diceMode === 'physical'}
            onChange={() => onChange({ diceMode: 'physical' })}
            title="نرد حقيقي"
            note="كل لاعب يرمي نرده في كوبه ويُدخل الرقم"
          />
        </div>
      </fieldset>
      )}

      {!inRound && (
      <fieldset className="settings-panel__field">
        <legend>مصطلح المواعيد</legend>
        <div className="settings-panel__choices">
          <Choice
            checked={settings.slotNaming === 'nights'}
            onChange={() => onChange({ slotNaming: 'nights' })}
            title="الليلة الأولى … السادسة"
          />
          <Choice
            checked={settings.slotNaming === 'hours'}
            onChange={() => onChange({ slotNaming: 'hours' })}
            title="الساعة الواحدة … السادسة"
          />
        </div>
      </fieldset>
      )}

      {!inRound && (
      <fieldset className="settings-panel__field">
        <legend>من يلعب</legend>
        <div className="settings-panel__choices">
          <Choice
            checked={!settings.hostPlays}
            onChange={() => onChange({ hostPlays: false })}
            title="هذا الجهاز راوٍ فقط"
            note="يدير الصوت والمراحل ولا يأخذ دورًا"
          />
          <Choice
            checked={settings.hostPlays}
            onChange={() => onChange({ hostPlays: true })}
            title="هذا الجهاز يلعب أيضًا"
            note="يأخذ دورًا ونردًا وصوتًا مثل الجميع"
          />
        </div>
      </fieldset>
      )}

      {/*
        إطفاء الراوي لا يُسكت اللعبة فقط: بلا صوت لا شيء يقود المراحل، فتصير
        الشاشة كلّها زرًّا ينقل الليلة بلمسة. راجع `night-tap`.
      */}
      <fieldset className="settings-panel__field">
        <legend>موسيقى الردهة</legend>
        <div className="settings-panel__choices">
          <Choice
            checked={settings.musicEnabled}
            onChange={() => onChange({ musicEnabled: true })}
            title="تعمل قبل الجولة"
            note="تخفت من نفسها حين تبدأ"
          />
          <Choice
            checked={!settings.musicEnabled}
            onChange={() => onChange({ musicEnabled: false })}
            title="بلا موسيقى"
          />
        </div>
      </fieldset>

      <fieldset className="settings-panel__field">
        <legend>التعليق الصوتي</legend>
        <div className="settings-panel__choices">
          <Choice
            checked={settings.voiceEnabled}
            onChange={() => onChange({ voiceEnabled: true })}
            title="راوٍ يقود الليل"
            note="يعلن المواعيد ويعدّ الوقت تلقائيًا"
          />
          <Choice
            checked={!settings.voiceEnabled}
            onChange={() => onChange({ voiceEnabled: false })}
            title="بلا تعليق صوتي"
            note="تنقل الليالي بلمسة على الشاشة"
          />
        </div>
      </fieldset>

      {settings.voiceEnabled && (
      <fieldset className="settings-panel__field">
        <legend>صوت الراوي</legend>
        <div className="settings-panel__choices">
          <Choice
            checked={settings.narratorVoice === 'male'}
            onChange={() => onChange({ narratorVoice: 'male' })}
            title="صوت رجل"
          />
          <Choice
            checked={settings.narratorVoice === 'female'}
            onChange={() => onChange({ narratorVoice: 'female' })}
            title="صوت امرأة"
          />
        </div>
      </fieldset>
      )}

      {/*
        مخرج للحالة التي لا يستطيع فيها الجهاز تشغيل التسجيلات — تمنعها سياسة
        التشغيل التلقائي في بعض المتصفحات فيسكت الراوي بلا سبب ظاهر. زرٌّ
        واحد يُرجع الصوت الآلي، وجولة بصوت خشن خير من جولة صامتة.
      */}
      {settings.voiceEnabled && (
      <fieldset className="settings-panel__field">
        <legend>مصدر النطق</legend>
        <div className="settings-panel__choices">
          <Choice
            checked={settings.narratorSource !== 'tts'}
            onChange={() => onChange({ narratorSource: 'recorded' })}
            title="التسجيلات"
            note="الصوت المعتمد — الأوضح"
          />
          <Choice
            checked={settings.narratorSource === 'tts'}
            onChange={() => onChange({ narratorSource: 'tts' })}
            title="صوت الجهاز"
            note="استعمله إذا لم تسمع الراوي"
          />
        </div>
      </fieldset>
      )}

      <label className="settings-panel__row">
        <span>مدة العد التنازلي في كل مرحلة</span>
        <input
          type="range"
          min={8}
          max={30}
          value={settings.nightCountdownSeconds}
          onChange={(event) =>
            onChange({ nightCountdownSeconds: Number(event.target.value) })
          }
        />
        <output>{settings.nightCountdownSeconds} ثانية</output>
      </label>

      <label className="settings-panel__row">
        <span>مدة النقاش</span>
        <input
          type="range"
          min={60}
          max={420}
          step={30}
          value={settings.discussionSeconds}
          onChange={(event) => onChange({ discussionSeconds: Number(event.target.value) })}
        />
        <output>{Math.round(settings.discussionSeconds / 60)} دقيقة</output>
      </label>

    </Panel>
  );
}

function Choice({
  checked,
  onChange,
  title,
  note,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  note?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className="choice"
      data-checked={checked || undefined}
      onClick={onChange}
    >
      <span className="choice__mark" aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        {note && <small>{note}</small>}
      </span>
    </button>
  );
}

/* ══════════════════════════ توزيع الأدوار ══════════════════════════ */

export function HostRolesStage({
  players,
  progress,
}: {
  players: PlayerPublic[];
  progress: Progress;
}) {
  const done = doneCount(progress, players, 'roleAck');

  return (
    <>
      <StageTitle
        kicker="وُزّعت الأدوار"
        title="انظروا إلى أجهزتكم"
        note="دور كل لاعب وصل إلى جهازه وحده. لا تعرضوا شاشاتكم لأحد."
      />
      <div className="host-strip" aria-hidden="true">
        {players.slice(0, 6).map((player, index) => (
          <Character
            key={player.id}
            characterId={player.avatarId}
            state={index % 2 ? 'suspicious' : 'hiding'}
            size={130}
          />
        ))}
      </div>
      <Panel className="host-progress">
        <p>
          <strong>{done}</strong> من {players.length} أكّدوا استلام أدوارهم
        </p>
        <ProgressPips done={done} total={players.length} />
        <ul className="host-progress__names">
          {players.map((player) => (
            <li key={player.id} data-done={progress[player.id]?.roleAck || undefined}>
              {player.name}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

/* ══════════════════════════ النرد ══════════════════════════ */

export function HostDiceStage({
  players,
  progress,
  settings,
}: {
  players: PlayerPublic[];
  progress: Progress;
  settings: RoomSettings;
}) {
  const done = doneCount(progress, players, 'diceAck');
  const rules = isSupportedPlayerCount(players.length) ? rulesFor(players.length) : null;

  return (
    <>
      <StageTitle
        kicker={settings.diceMode === 'digital' ? 'نرد رقمي' : 'نرد حقيقي'}
        title="حدّدوا مواعيد استيقاظكم"
        note={
          settings.diceMode === 'digital'
            ? 'كل لاعب يرمي نرده على جهازه ويرى نتيجته وحده.'
            : 'كل لاعب يرمي نرده داخل كوبه، يراه وحده، ثم يُدخل الرقم في جهازه.'
        }
      />

      <div className="host-dice" aria-hidden="true">
        <Dice value={null} rolling size={130} />
        {rules?.dicePerPlayer === 2 && <Dice value={null} rolling size={130} tone="sky" />}
      </div>

      {rules?.dicePerPlayer === 2 && (
        <Panel tone="amber">
          <strong>وضع الأربعة لاعبين:</strong> كل لاعب يحصل على نتيجتين. أعضاء الفريق
          يختارون واحدة فقط.
        </Panel>
      )}

      <Panel className="host-progress">
        <p>
          <strong>{done}</strong> من {players.length} عرفوا مواعيدهم
        </p>
        <ProgressPips done={done} total={players.length} />
      </Panel>
    </>
  );
}

/* ══════════════════════════ الاستعداد ══════════════════════════ */

export function HostReadyStage({
  players,
  onStart,
}: {
  players: PlayerPublic[];
  onStart: () => void;
}) {
  const checks = [
    { text: `${GAME_CONFIG.prop.placeInstruction}`, ok: true },
    { text: 'ضعوا الأجهزة أمام أصحابها والشاشات إلى الأسفل', ok: true },
    { text: 'ارفعوا صوت الجهاز الرئيسي', ok: true },
    { text: 'كل الأجهزة متصلة', ok: players.every((player) => player.connected) },
  ];

  return (
    <>
      <StageTitle kicker="قبل أن يبدأ الليل" title="استعدوا" />

      <div className="ready-scene">
        <FileProp state="breathing" size={190} />
      </div>

      <Panel tone="paper" className="ready-list">
        <ul>
          {checks.map((check) => (
            <li key={check.text} data-ok={check.ok || undefined}>
              <span aria-hidden="true">{check.ok ? '✓' : '!'}</span>
              {check.text}
            </li>
          ))}
        </ul>
        <p className="ready-list__note">
          عند سماع موعدكم، افتحوا أعينكم ونفّذوا الإجراء بصمت.
        </p>
      </Panel>

      <Button size="xl" onClick={onStart} disabled={!checks.every((check) => check.ok)}>
        ابدأ الليل
      </Button>
    </>
  );
}

/* ══════════════════════════ الليل ══════════════════════════ */

export function HostNightStage({
  phase,
  countdown,
  naming,
  disconnected,
  onPause,
}: {
  phase: Phase;
  countdown: { value: number; total: number } | null;
  naming: RoomSettings['slotNaming'];
  disconnected: PlayerPublic[];
  onPause: () => void;
}) {
  const slot = slotOfNightPhase(phase);
  const closing = phase === 'night-accomplices';
  const sleepers = useMemo(() => ROSTER.slice(0, 5), []);

  /*
    عنوان محايد في خطوة المتعاونين: الطاولة كلها تقرأ هذه الشاشة، وكتابة
    «يختار متعاونيه» فوقها تخبر الجميع بما يجري الآن — والراوي نطقه أصلًا.
    ما يبقى مخفيًا هو **من** يفعله، وهذا لا يظهر هنا ولا هناك.
  */
  return (
    <div className="night-stage">
      <p className="night-stage__label">{slot ? 'مرحلة' : ''}</p>
      <h1 className="night-stage__title">
        {slot ? slotLabel(slot, naming) : closing ? 'آخر الليل' : 'بدأ الليل'}
      </h1>

      <div className="night-stage__sleepers" aria-hidden="true">
        {sleepers.map((character, index) => (
          <Character
            key={character.id}
            characterId={character.id}
            state="asleep"
            size={112}
            style={{ animationDelay: `${index * 0.3}s` }}
          />
        ))}
      </div>

      {countdown ? (
        <CountdownRing seconds={countdown.value} total={countdown.total} label="ثانية" />
      ) : (
        <div className="night-stage__dots">
          <WaitingNote>الجميع يغلق عينيه</WaitingNote>
        </div>
      )}

      <div className="night-stage__meter" aria-label="تقدّم الليل">
        {[1, 2, 3, 4, 5, 6].map((value) => (
          <span
            key={value}
            data-state={
              closing || (slot && value < slot) ? 'past' : value === slot ? 'now' : 'next'
            }
          />
        ))}
      </div>

      {disconnected.length > 0 && (
        <Panel tone="coral" className="night-stage__alert">
          <strong>انقطع {disconnected.length} جهاز.</strong> أوقف الجولة وانتظر عودتهم — لا
          تُكمِل الليل بدونهم.
          <Button tone="quiet" onClick={onPause}>
            أوقف الجولة
          </Button>
        </Panel>
      )}
    </div>
  );
}

/* ══════════════════════════ المرحلة السرية ══════════════════════════ */

export function HostSecretStage({
  players,
  progress,
  resolved,
}: {
  players: PlayerPublic[];
  progress: Progress;
  resolved: boolean;
}) {
  const done = doneCount(progress, players, 'secretAck');

  return (
    <>
      <div className="secret-scene">
        <FileProp state="taken" size={200} />
      </div>
      <StageTitle
        kicker="انتهى الليل"
        title={`${GAME_CONFIG.prop.nameWithArticle} اختفى!`}
        note="كل لاعب ينظر إلى جهازه وحده الآن. من لديه معلومة سيراها."
      />
      <Panel className="host-progress">
        {resolved ? (
          <>
            <p>
              <strong>{done}</strong> من {players.length} أنهوا إجراءاتهم السرية
            </p>
            <ProgressPips done={done} total={players.length} />
          </>
        ) : (
          <WaitingNote>تجري إجراءات سرية على أحد الأجهزة</WaitingNote>
        )}
      </Panel>
    </>
  );
}

/* ══════════════════════════ النقاش ══════════════════════════ */

export function HostDiscussionStage({
  players,
  seconds,
  onVote,
}: {
  players: PlayerPublic[];
  seconds: number;
  onVote: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    timerRef.current = window.setInterval(() => {
      setRemaining((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [running]);

  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <>
      <StageTitle
        kicker="النقاش"
        title="ناقشوا ما شاهدتموه"
        note="يمكنكم قول الحقيقة أو محاولة تضليل الآخرين — لكن لا تعرضوا شاشاتكم السرية."
      />

      <SeatRing players={players} caption={`${minutes}:${String(secs).padStart(2, '0')}`} />

      <div className="row">
        <Button tone="quiet" onClick={() => setRunning((value) => !value)}>
          {running ? 'إيقاف المؤقت' : 'استكمال المؤقت'}
        </Button>
        <Button size="lg" onClick={onVote}>
          انتقلوا إلى التصويت
        </Button>
      </div>
    </>
  );
}

/* ══════════════════════════ التصويت ══════════════════════════ */

export function HostVotingStage({
  players,
  progress,
}: {
  players: PlayerPublic[];
  progress: Progress;
}) {
  const done = doneCount(progress, players, 'voted');

  return (
    <>
      <StageTitle
        kicker="التصويت"
        title={`من تعتقدون أنه أخفى ${GAME_CONFIG.prop.nameWithArticle}؟`}
        note="التصويت سري ومتزامن. لن تظهر أي نتيجة قبل وصول كل الأصوات."
      />

      <div className="vote-count">
        <strong>{done}</strong>
        <span>من {players.length} صوّتوا</span>
      </div>
      <ProgressPips done={done} total={players.length} />

      <ul className="vote-names">
        {players.map((player) => (
          <li key={player.id} data-done={progress[player.id]?.voted || undefined}>
            <Character
              characterId={player.avatarId}
              size={62}
              still
              state={progress[player.id]?.voted ? 'idle' : 'suspicious'}
            />
            <span>{player.name}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ══════════════════════════ الكشف ══════════════════════════ */

export function HostRevealStage({
  step,
  results,
  players,
}: {
  step: number | null;
  results: RoundResults | null;
  players: PlayerPublic[];
}) {
  const byId = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player])),
    [players],
  );

  if (step === null || step > 0) {
    return (
      <div className="reveal-count">
        <span key={step}>{step ?? 3}</span>
      </div>
    );
  }

  if (!results) return <WaitingNote>جارٍ حساب النتيجة</WaitingNote>;

  const teamWon = results.winner === 'team';

  return (
    <div className="reveal">
      <h1 className="reveal__headline">
        {teamWon
          ? `وجدتم ${GAME_CONFIG.roles.hider.label}!`
          : `نجحت الخطة… ولم تعرفوا من أخفى ${GAME_CONFIG.prop.nameWithArticle}`}
      </h1>

      <div className="reveal__cast">
        {results.tally.topVoted.map((playerId) => {
          const player = byId[playerId];
          const row = results.reveal.find((entry) => entry.playerId === playerId);
          if (!player) return null;
          const isHider = row?.role === 'hider';
          return (
            <div key={playerId} className="reveal__card" data-hider={isHider || undefined}>
              <Character
                characterId={player.avatarId}
                state={isHider ? 'startled' : 'defeat'}
                size={170}
              />
              <strong>{player.name}</strong>
              <Badge tone={isHider ? 'warn' : 'neutral'}>
                {row?.role === 'hider'
                  ? GAME_CONFIG.roles.hider.label
                  : row?.role === 'accomplice'
                    ? GAME_CONFIG.roles.accomplice.label
                    : GAME_CONFIG.roles.member.label}
              </Badge>
              <small>{results.tally.counts[playerId] ?? 0} أصوات</small>
            </div>
          );
        })}
      </div>

      <FileProp state={teamWon ? 'returned' : 'taken'} size={150} />
    </div>
  );
}

/* ══════════════════════════ النتائج ══════════════════════════ */

export function HostResultsStage({
  results,
  players,
  naming,
  onNewRound,
  onHome,
}: {
  results: RoundResults | null;
  players: PlayerPublic[];
  naming: RoomSettings['slotNaming'];
  onNewRound: () => void;
  onHome: () => void;
}) {
  const byId = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player])),
    [players],
  );
  const name = (id: string | null) => (id ? (byId[id]?.name ?? '—') : '—');

  if (!results) return <WaitingNote>لا توجد نتيجة</WaitingNote>;

  const teamWon = results.winner === 'team';

  return (
    <>
      <StageTitle
        kicker={teamWon ? 'فاز أعضاء الفريق' : 'فاز مُخفي الملف'}
        title={teamWon ? `عاد ${GAME_CONFIG.prop.nameWithArticle}` : `${GAME_CONFIG.prop.nameWithArticle} لم يعد`}
      />

      <div className="results-cast">
        {players.map((player) => {
          const row = results.reveal.find((entry) => entry.playerId === player.id);
          const role = row?.role ?? 'member';
          const won = teamWon ? role === 'member' : role !== 'member';
          return (
            <div key={player.id} className="results-cast__item">
              <Character
                characterId={player.avatarId}
                state={won ? 'victory' : 'defeat'}
                size={110}
              />
              <strong>{player.name}</strong>
              <Badge
                tone={role === 'hider' ? 'warn' : role === 'accomplice' ? 'secret' : 'neutral'}
              >
                {role === 'hider'
                  ? GAME_CONFIG.roles.hider.label
                  : role === 'accomplice'
                    ? GAME_CONFIG.roles.accomplice.label
                    : GAME_CONFIG.roles.member.label}
              </Badge>
            </div>
          );
        })}
      </div>

      <Panel tone="paper" className="results-table-wrap">
        <table className="results-table">
          <thead>
            <tr>
              <th>اللاعب</th>
              <th>الدور</th>
              <th>موعده</th>
              <th>استيقظ مع</th>
              <th>فحص</th>
              <th>صوّت لـ</th>
            </tr>
          </thead>
          <tbody>
            {results.reveal.map((row) => (
              <tr key={row.playerId}>
                <td data-label="اللاعب">{name(row.playerId)}</td>
                <td data-label="الدور">
                  {row.role === 'hider'
                    ? GAME_CONFIG.roles.hider.label
                    : row.role === 'accomplice'
                      ? GAME_CONFIG.roles.accomplice.label
                      : GAME_CONFIG.roles.member.label}
                </td>
                <td data-label="موعده">
                  {row.effectiveSlots.map((slot) => slotLabel(slot, naming)).join(' + ')}
                </td>
                <td data-label="استيقظ مع">
                  {row.wokeWith.length ? row.wokeWith.map(name).join('، ') : 'كان وحده'}
                </td>
                <td data-label="فحص">
                  {row.inspected
                    ? `${name(row.inspected.targetId)} → ${
                        row.inspected.revealedSlot
                          ? slotLabel(row.inspected.revealedSlot, naming)
                          : '—'
                      }`
                    : '—'}
                </td>
                {/* عنصر واحد: في التخطيط المكدّس كل ابن خانةُ شبكة مستقلة،
                    فكان عدد الأصوات ينزل سطرًا وحده بعيدًا عن الاسم */}
                <td data-label="صوّت لـ">
                  <span>
                    {name(row.votedFor)}
                    {row.votedFor && (
                      <small> ({results.tally.counts[row.votedFor] ?? 0})</small>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="row">
        <Button size="lg" onClick={onNewRound}>
          جولة جديدة بنفس اللاعبين
        </Button>
        <Button tone="ghost" onClick={onHome}>
          العودة للرئيسية
        </Button>
      </div>
    </>
  );
}

/** يُستخدم في شاشة النتائج للتحقق من صحة الجيران عند التدقيق اليدوي. */
export function neighboursLabel(playerId: string, players: PlayerPublic[]): string {
  try {
    const { right, left } = neighboursOf(playerId, players);
    const name = (id: string) => players.find((player) => player.id === id)?.name ?? '—';
    return `يمينه ${name(right)} · يساره ${name(left)}`;
  } catch {
    return '';
  }
}
