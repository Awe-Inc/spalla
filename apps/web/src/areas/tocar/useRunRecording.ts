import type { MeasureRange, PracticeSession, Score } from "@fretless/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { completeAssignmentsAfterRun } from "@/account/classAssignments";
import { syncPracticeInBackground } from "@/account/practiceSync";
import { useSettings } from "@/app/settings";
import { recordSectionRun } from "@/data/db";
import { recordLoopCompleted, saveRun, type RunOutcome } from "@/data/progress";

import { autoSlowdown, type Slowdown } from "./autoSlowdown";
import type { LiveRun } from "./liveRun";
import type { TempoLimits } from "./tempo";
import { LEAD_IN_SECONDS } from "./useSession";

const LOOP_RESTART_DELAY_MS = 1200;

interface RunRecordingOptions {
  session: PracticeSession | null;
  score: Score | null;
  resultId: string | null;
  limits: TempoLimits | null;
  snapshot: LiveRun | null;
  loop: MeasureRange | null;
  bpm: number;
  setBpm: (bpm: number) => void;
  droneOn: boolean;
  fromMemory: boolean;
  accompaniment: { rewind: (songTime: number) => void; stopDrone: () => void };
  stopInput: () => void;
  onLoopRestart: (session: PracticeSession) => void;
}

interface RunRecording {
  slowdown: Slowdown | null;
  clearSlowdown: () => void;
  outcome: RunOutcome | null;
  completedTasks: string[];
  saveError: string | null;
  startRun: () => void;
}

export function useRunRecording({ session, score, resultId, limits, snapshot, loop, bpm, setBpm, droneOn, fromMemory, accompaniment, stopInput, onLoopRestart }: RunRecordingOptions): RunRecording {
  const isAutoSlowdownOn = useSettings((state) => state.autoSlowdown);
  const [slowdown, setSlowdown] = useState<Slowdown | null>(null);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const slowedRunRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const savedRunRef = useRef(false);
  const savedLoopRef = useRef(false);
  const onLoopRestartRef = useRef(onLoopRestart);
  useEffect(() => {
    onLoopRestartRef.current = onLoopRestart;
  });

  useEffect(() => {
    if (!score || !limits || snapshot?.state !== "finished" || slowedRunRef.current) return;
    slowedRunRef.current = true;
    const next = isAutoSlowdownOn ? autoSlowdown(score, snapshot.judgements, snapshot.stats, bpm, limits) : null;
    setSlowdown(next);
    if (next) setBpm(next.bpm);
  }, [snapshot, score, limits, bpm, isAutoSlowdownOn, setBpm]);

  useEffect(() => {
    if (!session || snapshot?.state !== "finished" || !loop) return;
    if (!savedLoopRef.current) {
      savedLoopRef.current = true;
      void recordLoopCompleted();
      if (resultId && startedAtRef.current !== null) {
        recordSectionRun({
          pieceKey: resultId,
          firstIndex: loop.firstIndex,
          lastIndex: loop.lastIndex,
          accuracyPct: session.stats.accuracyPct,
          bpm: Math.round(session.score.beatsPerMinute),
          durationSeconds: (Date.now() - startedAtRef.current) / 1000,
          playedAt: Date.now(),
        }).catch(() => setSaveError("O trecho não foi salvo neste aparelho."));
      }
    }
    const timer = window.setTimeout(() => {
      slowedRunRef.current = false;
      savedLoopRef.current = false;
      startedAtRef.current = Date.now();
      session.restart();
      accompaniment.rewind(-LEAD_IN_SECONDS);
      session.start();
      onLoopRestartRef.current(session);
    }, LOOP_RESTART_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [snapshot?.state, session, loop, accompaniment, resultId]);

  useEffect(() => {
    if (!score || !resultId || !limits || loop || snapshot?.state !== "finished" || savedRunRef.current || startedAtRef.current === null) return;
    savedRunRef.current = true;
    const durationSeconds = (Date.now() - startedAtRef.current) / 1000;
    saveRun({
      exerciseId: resultId,
      stats: snapshot.stats,
      judgements: snapshot.judgements,
      bpm,
      writtenBpm: limits.writtenBpm,
      durationSeconds,
      withDrone: droneOn,
      fromMemory,
      playedAt: Date.now(),
    })
      .then((saved) => {
        setOutcome(saved);
        return completeAssignmentsAfterRun(resultId)
          .then((completed) => setCompletedTasks(completed.map((assignment) => `Tarefa de ${assignment.teacherName} concluída: ${assignment.title}`)))
          .catch(() => undefined)
          .finally(() => void syncPracticeInBackground());
      })
      .catch(() => setSaveError("O resultado não foi salvo neste aparelho. As estrelas valem só por agora."));
    accompaniment.stopDrone();
    stopInput();
  }, [snapshot, score, resultId, limits, bpm, loop, droneOn, fromMemory, stopInput, accompaniment]);

  const startRun = useCallback(() => {
    startedAtRef.current = Date.now();
    savedRunRef.current = false;
    savedLoopRef.current = false;
    slowedRunRef.current = false;
    setSlowdown(null);
    setOutcome(null);
    setCompletedTasks([]);
    setSaveError(null);
  }, []);

  const clearSlowdown = useCallback(() => setSlowdown(null), []);

  return { slowdown, clearSlowdown, outcome, completedTasks, saveError, startRun };
}
