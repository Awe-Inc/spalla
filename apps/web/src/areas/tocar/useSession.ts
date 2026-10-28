import type { Exercise, MeasureRange, PracticeSession, Score } from "@fretless/core";
import { useCallback, useEffect, useState } from "react";

import { useCore } from "@/core/useCore";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "@/data/db";

import { clampBpm, tempoLimits, tempoScaleFor, type TempoLimits } from "./tempo";

export const LEAD_IN_SECONDS = 2;

export interface SessionHandle {
  session: PracticeSession | null;
  exercise: Exercise | null;
  score: Score | null;
  error: string | null;
  resultId: string | null;
  limits: TempoLimits | null;
  bpm: number;
  loop: MeasureRange | null;
  setBpm: (bpm: number) => void;
  setLoop: (range: MeasureRange | null) => void;
}

export function useSession(exerciseId: string | undefined, pieceId: string | undefined): SessionHandle & { coreStatus: ReturnType<typeof useCore> } {
  const core = useCore();
  const storedId = pieceId === undefined ? Number.NaN : Number(pieceId);
  const piece = useLiveQuery(async () => (Number.isFinite(storedId) ? ((await db.pieces.get(storedId)) ?? null) : null), [storedId]);
  const isPieceLoading = pieceId !== undefined && piece === undefined;
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [limits, setLimits] = useState<TempoLimits | null>(null);
  const [loop, setLoopState] = useState<MeasureRange | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (core.status !== "ready" || isPieceLoading || (!exerciseId && !pieceId)) return;
    const next = core.core.createSession();
    next.setLeadInSeconds(LEAD_IN_SECONDS);
    const fail = (message: string) => {
      next.dispose();
      setError(message);
      setExercise(null);
      setScore(null);
      setLimits(null);
    };
    let found: Exercise | null = null;
    if (pieceId !== undefined) {
      if (!piece) return fail("Essa música não está mais na biblioteca. Escolha outra em Músicas.");
      const parsed = next.loadMusicXml(piece.bytes, { expandRepeats: true, trimSilentIntro: true, mergeTies: true });
      if (!parsed.ok) return fail(parsed.error);
    } else {
      found = exerciseId ? (core.core.findExercise(exerciseId) ?? null) : null;
      if (!found || !exerciseId || !next.loadExercise(exerciseId, Date.now() >>> 0)) return fail("Esse exercício não existe.");
    }
    const loaded = next.score;
    setExercise(found);
    setError(null);
    setScore(loaded);
    setLimits(tempoLimits(loaded, found));
    setLoopState(null);
    setSession(next);
    return () => {
      next.dispose();
      setSession(null);
    };
  }, [core, exerciseId, pieceId, piece, isPieceLoading]);

  const setBpm = useCallback(
    (requested: number) => {
      if (!session || !limits) return;
      const bpm = clampBpm(requested, limits);
      session.setTempoScale(tempoScaleFor(bpm, limits));
      setScore(session.score);
    },
    [session, limits],
  );

  const setLoop = useCallback(
    (range: MeasureRange | null) => {
      if (!session) return;
      session.setMeasureRange(range);
      setLoopState(session.measureRange);
      setScore(session.score);
    },
    [session],
  );

  const resultId = exercise?.id ?? (piece ? `musica:${piece.fileName}` : null);
  const bpm = score ? Math.round(score.beatsPerMinute) : 0;
  return { coreStatus: core, session, exercise, score, error, resultId, limits, bpm, loop, setBpm, setLoop };
}
