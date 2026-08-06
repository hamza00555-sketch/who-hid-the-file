/**
 * حالة الجلسة على هذا الجهاز: الهوية، الغرفة، السر الشخصي، حالة الاتصال.
 * كل الشاشات تقرأ من هنا ولا تلمس طبقة النقل مباشرة.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { seatedOrder } from '../game/seating';
import type { PlayerPublic, PlayerSecret, RoomState } from '../game/types';
import { getTransport } from './index';
import type { ConnectionStatus, RoomTransport } from './transport';

const STORAGE_KEY = 'mafqood:last-session';

export interface StoredSession {
  code: string;
  playerId: string;
  role: 'host' | 'player';
}

export function rememberSession(session: StoredSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function recallSession(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function forgetSession() {
  localStorage.removeItem(STORAGE_KEY);
}

interface SessionValue {
  transport: RoomTransport;
  playerId: string | null;
  ready: boolean;
  /** سبب فشل فتح الهوية على هذا الجهاز، إن فشل */
  identityError: string | null;
  /** رمز الخطأ التقني — يُعرض صغيرًا ليُنقَل عند طلب المساعدة */
  identityCode: string | null;
  /** إعادة محاولة فتح الهوية */
  retryIdentity: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [instance, setInstance] = useState<RoomTransport | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityCode, setIdentityCode] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  /*
    ── الفشل يجب أن يُقال ──

    كان الخطأ يُبتلع في `catch` فارغ: تبقى الهوية `null`، ويبقى `ready` كاذبًا،
    وتبقى الشاشة على «جارٍ الاتصال بالجلسة» إلى الأبد. ثلاثة أصدقاء يفتحون نفس
    الرابط، فيدخل واحد ويقف اثنان بلا كلمة تشرح ولا زر يُعيد.

    الآن يُحفَظ السبب ويُعرَض، ومعه إعادة محاولة صريحة.
  */
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await getTransport();
        if (!active) return;
        setInstance(loaded);
        const id = await loaded.identify();
        if (!active) return;
        setPlayerId(id);
        setIdentityError(null);
        setIdentityCode(null);
      } catch (cause) {
        if (!active) return;
        setPlayerId(null);
        setIdentityError(
          cause instanceof Error ? cause.message : 'تعذّر فتح الجلسة على هذا الجهاز.',
        );
        setIdentityCode((cause as { code?: string } | null)?.code ?? null);
      }
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  const retryIdentity = useCallback(() => {
    setIdentityError(null);
    setIdentityCode(null);
    setAttempt((current) => current + 1);
  }, []);

  const value = useMemo<SessionValue | null>(
    () =>
      instance
        ? {
            transport: instance,
            playerId,
            ready: playerId !== null,
            identityError,
            identityCode,
            retryIdentity,
          }
        : null,
    [instance, playerId, identityError, identityCode, retryIdentity],
  );

  // لا تُركَّب الشاشات قبل جاهزية النقل — تتجنب فحوصات null في كل مكان.
  if (!value) return <BootScreen error={identityError} onRetry={retryIdentity} />;

  return <SessionContext value={value}>{children}</SessionContext>;
}

function BootScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="screen">
      <div className="screen__body">
        {error ? (
          <>
            <h2>تعذّر فتح الجلسة</h2>
            <p className="lede">{error}</p>
            <button type="button" className="btn btn--md btn--primary" onClick={onRetry}>
              أعد المحاولة
            </button>
          </>
        ) : (
          <p className="lede">جارٍ التحميل…</p>
        )}
      </div>
    </div>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession خارج SessionProvider');
  return value;
}

export interface RoomView {
  state: RoomState | null;
  players: PlayerPublic[];
  me: PlayerPublic | null;
  isHost: boolean;
  playerCount: number;
  connection: ConnectionStatus;
  loading: boolean;
  missing: boolean;
  /** طال الانتظار بلا أي رد من الخادم */
  stalled: boolean;
}

/** بعدها يُقال للاعب إن شيئًا لا يسير كما ينبغي، بدل دوّامة لا تنتهي */
const STALL_AFTER_MS = 9000;

/** يراقب الغرفة ويعيد نسخة جاهزة للعرض مع اللاعبين مرتّبين بالمقاعد. */
export function useRoom(code: string | null): RoomView {
  const { transport: instance, playerId } = useSession();
  const [state, setState] = useState<RoomState | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [loaded, setLoaded] = useState(false);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!code) return;
    setLoaded(false);
    setStalled(false);
    /*
      انتظارٌ بلا حدّ يُقرأ كعطل صامت. إن لم يصل شيء خلال هذه المدة فالأرجح أن
      الاشتراك لن يصل أصلًا — والقول أفضل من دوّامة تدور إلى الأبد.
    */
    const timer = window.setTimeout(() => setStalled(true), STALL_AFTER_MS);
    const stop = instance.watchRoom(code, (next) => {
      window.clearTimeout(timer);
      setStalled(false);
      setState(next);
      setLoaded(true);
    });
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [code, instance]);

  useEffect(() => instance.watchConnection(setConnection), [instance]);

  const players = useMemo(
    () => (state ? seatedOrder(Object.values(state.players)) : []),
    [state],
  );

  return {
    state,
    players,
    me: players.find((p) => p.id === playerId) ?? null,
    isHost: Boolean(state && playerId && state.meta.hostUid === playerId),
    playerCount: players.length,
    connection,
    loading: !loaded,
    missing: loaded && state === null,
    stalled,
  };
}

/** 🔒 السر الشخصي لهذا الجهاز فقط. */
export function useSecret(code: string | null): PlayerSecret | null {
  const { transport: instance, playerId } = useSession();
  const [secret, setSecret] = useState<PlayerSecret | null>(null);

  useEffect(() => {
    if (!code || !playerId) return;
    return instance.watchSecret(code, playerId, setSecret);
  }, [code, playerId, instance]);

  return secret;
}

/**
 * يُبقي حضور اللاعب حيًّا ما دام على شاشة الجلسة.
 *
 * يجب أن يعيش طوال وجوده في الغرفة لا لحظة الانضمام فقط: حارس الانقطاع على
 * الخادم يُستهلَك عند تنفيذه، فمن غير إعادة تسليح يبقى اللاعب «منقطعًا» بعد
 * أول خروج من التطبيق ولو رجع فورًا.
 */
export function usePresence(code: string | null, playerId: string | null): void {
  const { transport: instance } = useSession();
  useEffect(() => {
    if (!code || !playerId) return;
    return instance.watchPresence(code, playerId);
  }, [code, playerId, instance]);
}

/** إخفاء السر بلمسة واعية — لا يُعرض تلقائيًا بعد إعادة الاتصال. */
export function useRevealGate(): { revealed: boolean; reveal: () => void; hide: () => void } {
  const [revealed, setRevealed] = useState(false);
  return {
    revealed,
    reveal: useCallback(() => setRevealed(true), []),
    hide: useCallback(() => setRevealed(false), []),
  };
}
