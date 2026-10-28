import type { PitchFrame, PracticeSession } from "@fretless/core";
import { useCallback, useState } from "react";

export const SYNTHETIC_PLAYER_PARAM = "jogador";
export const SYNTHETIC_PLAYER_VALUE = "sintetico";
export const SYNTHETIC_PLAYER_FLAG = "VITE_JOGADOR_SINTETICO";

export function isSyntheticPlayerRequested(search: URLSearchParams, flagValue: string | undefined): boolean {
  return flagValue === "1" && search.get(SYNTHETIC_PLAYER_PARAM) === SYNTHETIC_PLAYER_VALUE;
}

export function advanceWithSyntheticPlayer(session: PracticeSession, deltaSeconds: number): PitchFrame[] {
  const from = session.songTime;
  session.update(deltaSeconds, null);
  const frames = session.synthesize(from, session.songTime);
  for (const frame of frames) session.update(0, frame);
  return frames;
}

export function useSyntheticPlayer(session: PracticeSession | null) {
  const [isPlaying, setPlaying] = useState(false);

  const start = useCallback((): boolean => {
    if (!session) return false;
    session.configureSyntheticPlayer();
    setPlaying(true);
    return true;
  }, [session]);

  const stop = useCallback(() => setPlaying(false), []);

  return { isPlaying, start, stop };
}
