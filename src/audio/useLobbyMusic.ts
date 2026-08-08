/**
 * موسيقى ما قبل الجولة.
 *
 * ── على كل الأجهزة، لا على المضيف وحده ──
 *
 * الراوي جهاز واحد لأنه يُعطي أوامر: صوتان يقولان «افتحوا أعينكم» في لحظتين
 * مختلفتين يُفسدان الليل. أما الموسيقى فمزاج لا تعليمة — تبدأ مع فتح اللعبة
 * على كل جهاز، وتُهيّئ الطاولة قبل أن تبدأ الجولة.
 *
 * وتصمت لحظةَ تبدأ الجولة: من توزيع الأدوار فصاعدًا لا شيء يزاحم الراوي.
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
