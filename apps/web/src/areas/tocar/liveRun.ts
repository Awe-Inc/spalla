import type { GameStats, NoteJudgement, PracticeSession, SessionState } from "@fretless/core";
import { useSyncExternalStore } from "react";

export interface ScoreFrame {
  songTime: number;
  currentNoteIndex: number;
  judgements: NoteJudgement[];
}

export interface LiveRun extends ScoreFrame {
  state: SessionState;
  liveCents: number | null;
  stats: GameStats;
}

export interface FrameSource<T extends ScoreFrame = ScoreFrame> {
  get: () => T | null;
  subscribe: (listener: () => void) => () => void;
}

export function readLiveRun(session: PracticeSession, previous: LiveRun | null): LiveRun {
  const stats = session.stats;
  return {
    state: session.state,
    songTime: session.songTime,
    currentNoteIndex: session.currentNoteIndex,
    liveCents: session.liveCents,
    stats,
    judgements: previous && previous.stats.judgedNotes === stats.judgedNotes ? previous.judgements : session.judgements,
  };
}

export function useLiveValue<T extends ScoreFrame, V>(source: FrameSource<T>, select: (run: T | null) => V): V {
  const read = () => select(source.get());
  return useSyncExternalStore(source.subscribe, read, read);
}
