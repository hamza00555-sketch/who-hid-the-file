/**
 * موسيقى ما قبل الجولة — تدور في الردهة وتخفت حين تبدأ.
 * تُستدعى من شاشة المضيف وحدها: جهاز واحد يُسمِع الطاولة، كما الراوي.
 */

import { useEffect } from 'react';
import { GAME_CONFIG } from '../config/game.config';
import { musicPlayer } from './MusicPlayer';

export function useLobbyMusic(active: boolean): void {
  useEffect(() => {
    if (!active) {
      musicPlayer.stop();
      return;
    }
    musicPlayer.play(GAME_CONFIG.lobbyMusicSrc);
    return () => musicPlayer.stop();
  }, [active]);
}
