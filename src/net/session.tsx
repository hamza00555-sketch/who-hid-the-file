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
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [instance, setInstance] = useState<RoomTransport | null>(null);

  useEffect(() => {
    let active = true;
    void getTransport().then(async (loaded) => {
      if (!active) return;
      setInstance(loaded);
      try {
        const id = await loaded.identify();
        if (active) setPlayerId(id);
      } catch {
        if (active) setPlayerId(null);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<SessionValue | null>(
    () => (instance ? { transport: instance, playerId, ready: playerId !== null } : null),
    [instance, playerId],
  );

  // لا تُركَّب الشاشات قبل جاهزية النقل — تتجنب فحوصات null في كل مكان.
  if (!value) return <BootScreen />;

  return <SessionContext value={value}>{children}</SessionContext>;
}

function BootScreen() {
  return (
    <div className="screen">
      <div className="screen__body">
        <p className="lede">جارٍ التحميل…</p>
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
}

/** يراقب الغرفة ويعيد نسخة جاهزة للعرض مع اللاعبين مرتّبين بالمقاعد. */
export function useRoom(code: string | null): RoomView {
  const { transport: instance, playerId } = useSession();
  const [state, setState] = useState<RoomState | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!code) return;
    setLoaded(false);
    const stop = instance.watchRoom(code, (next) => {
      setState(next);
      setLoaded(true);
    });
    return stop;
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

/** إخفاء السر بلمسة واعية — لا يُعرض تلقائيًا بعد إعادة الاتصال. */
export function useRevealGate(): { revealed: boolean; reveal: () => void; hide: () => void } {
  const [revealed, setRevealed] = useState(false);
  return {
    revealed,
    reveal: useCallback(() => setRevealed(true), []),
    hide: useCallback(() => setRevealed(false), []),
  };
}
