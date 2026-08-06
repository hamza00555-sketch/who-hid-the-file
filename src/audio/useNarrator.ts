/**
 * الراوي — ربط مدير الصوت بشاشة المضيف، مع Captions متزامنة.
 * لا تُستدعى هذه الأدوات على جهاز اللاعب إطلاقًا.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SlotNaming } from '../config/game.config';
import { audioManager, AudioManager, type NarratorSource } from './AudioManager';
import type { NarratorVoice } from '../game/types';
import { buildScript, type VoiceLine } from './script.ar';

export function useNarrator(options: {
  enabled: boolean;
  rate: number;
  naming: SlotNaming;
  voice: NarratorVoice;
  source: NarratorSource;
}) {
  const { enabled, rate, naming, voice, source } = options;
  const [caption, setCaption] = useState<string | null>(null);
  const lastLines = useRef<VoiceLine[]>([]);

  const script = useMemo(() => buildScript(naming), [naming]);

  useEffect(() => {
    audioManager.configure({ enabled, rate, voice, source });
  }, [enabled, rate, voice, source]);

  /*
    ── فتح إذن الصوت ──

    ‏iOS لا يسمح بتشغيل صوت إلا لعنصرٍ فُتح إذنه **داخل لمسة مستخدم**. وجهاز
    المضيف يُلمس كثيرًا قبل أول جملة (إنشاء الجلسة، الإعدادات، «ابدأ»)، فأول
    لمسة تكفي. بلا هذا يسكت الراوي في أغلب الجمل بلا خطأ يظهر لأحد.
  */
  useEffect(() => {
    const open = () => audioManager.unlock();
    for (const event of ['pointerdown', 'touchend', 'keydown'] as const) {
      window.addEventListener(event, open, { passive: true });
    }
    open();
    return () => {
      for (const event of ['pointerdown', 'touchend', 'keydown'] as const) {
        window.removeEventListener(event, open);
      }
    };
  }, []);

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
