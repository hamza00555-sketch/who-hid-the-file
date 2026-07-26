import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider } from './net/session';
import { Home } from './screens/Home';
import { RosterSheet } from './screens/RosterSheet';
import { HostScreen } from './screens/host/HostScreen';
import { PlayerScreen } from './screens/player/PlayerScreen';

export function App() {
  return (
    <SessionProvider>
      {/* HashRouter: الروابط تعمل بلا إعداد خادم، ومسح QR يفتحها مباشرة */}
      <HashRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/host/:code" element={<HostScreen />} />
          <Route path="/play/:code" element={<PlayerScreen />} />
          {/* أداة مراجعة بصرية للأصول — ليست جزءًا من مسار اللعب */}
          <Route path="/roster" element={<RosterSheet />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </SessionProvider>
  );
}
