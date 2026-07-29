/**
 * الراوي — ربط مدير الصوت بشاشة المضيف، مع Captions متزامنة.
 * لا تُستدعى هذه الأدوات على جهاز اللاعب إطلاقًا.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SlotNaming } from '../config/game.config';
import { audioManager, AudioManager } from './AudioManager';
import type { NarratorVoice } from '../game/types';
import { buildScript, type VoiceLine } from './script.ar';

export function useNarrator(options: {
  enabled: boolean;
  rate: number;
  naming: SlotNaming;
  voice: NarratorVoice;
}) {
  const { enabled, rate, naming, voice } = options;
  const [caption, setCaption] = useState<string | null>(null);
  const lastLines = useRef<VoiceLine[]>([]);

  const script = useMemo(() => buildScript(naming), [naming]);

  useEffect(() => {
    audioManager.configure({ enabled, rate, voice });
  }, [enabled, rate, voice]);

  useEffect(() => audioManager.onCaption(setCaption), []);

  useEffect(() => () => audioManager.stop(), []);

  /** يعيد وعدًا ينتهي بانتهاء آخر جملة — مراحل الليل تنتظره. */
  const say = useCallback((lines: VoiceLine[]): Promise<void> => {
    lastLines.current = lines;
    return audioManager.play(lines);
  }, []);

  const repeat = useCallback(() => {
    if (lastLines.current.length > 0) void audioManager.play(lastLines.current);
  }, []);

  const stop = useCallback(() => {
    audioManager.stop();
    setCaption(null);
  }, []);

  return {
    script,
    caption,
    say,
    repeat,
    stop,
    ttsAvailable: AudioManager.ttsAvailable(),
  };
}
