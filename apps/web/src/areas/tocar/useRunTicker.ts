import type { PitchFrame, PracticeSession } from "@fretless/core";
import { useEffect, useRef } from "react";

import { advanceWithSyntheticPlayer } from "./useSyntheticPlayer";

const MAX_TICK_SECONDS = 0.1;

interface RunTickerOptions {
  session: PracticeSession | null;
  isListening: boolean;
  isSynthetic: boolean;
  takeFrames: () => PitchFrame[];
  onFrame: (songTime: number) => void;
  onPublish: (session: PracticeSession) => void;
}

export function useRunTicker({ session, isListening, isSynthetic, takeFrames, onFrame, onPublish }: RunTickerOptions): void {
  const callbacks = useRef({ onFrame, onPublish });
  useEffect(() => {
    callbacks.current = { onFrame, onPublish };
  });

  useEffect(() => {
    if (!session || !isListening) return;
    let handle = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(MAX_TICK_SECONDS, (now - last) / 1000);
      last = now;
      if (isSynthetic) {
        advanceWithSyntheticPlayer(session, dt);
      } else {
        const frames = takeFrames();
        if (frames.length === 0) {
          session.update(dt, null);
        } else {
          const slice = dt / frames.length;
          for (const frame of frames) session.update(slice, frame);
        }
      }
      const state = session.state;
      if (state === "countdown" || state === "playing") callbacks.current.onFrame(session.songTime);
      callbacks.current.onPublish(session);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [session, isListening, isSynthetic, takeFrames]);
}
