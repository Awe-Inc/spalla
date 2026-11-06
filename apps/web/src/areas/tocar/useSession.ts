import type { Exercise, MeasureRange, PracticeSession, Score } from "@fretless/core";
import { useCallback, useEffect, useState } from "react";

import { useCore } from "@/core/useCore";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "@/data/db";
import { PARSE_OPTIONS } from "@/data/importPiece";
import { libraryResultId, loadLibraryBytes, type LibraryLoad } from "@/data/library";

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

const NO_LIBRARY_PIECE: LibraryLoad = { status: "missing" };

function useLibraryLoad(slug: string | undefined): LibraryLoad | undefined {
  const [loaded, setLoaded] = useState<{ slug: string; load: LibraryLoad } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (slug === undefined) return;
    let isCurrent = true;
    void loadLibraryBytes(slug).then((load) => {
      if (isCurrent) setLoaded({ slug, load });
    });
    return () => {
      isCurrent = false;
    };
  }, [slug, attempt]);
  const current = loaded?.slug === slug ? loaded?.load : undefined;
  const isUnreachable = current?.status === "unreachable";
  useEffect(() => {
    if (!isUnreachable) return;
    const retry = () => setAttempt((value) => value + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [isUnreachable]);
  return slug === undefined ? NO_LIBRARY_PIECE : current;
}

function musicXmlFailure(libraryLoad: LibraryLoad | undefined): string {
  if (libraryLoad?.status === "unreachable") return "Sem conexão, e essa música ainda não foi baixada neste aparelho. Ela abre sozinha quando a internet voltar.";
  return "Essa música não está mais na biblioteca. Escolha outra em Músicas.";
}

async function readStoredPiece(id: number): Promise<{ fileName: string; bytes: Uint8Array } | null> {
  if (!Number.isFinite(id)) return null;
  const [piece, file] = await Promise.all([db.pieces.get(id), db.pieceFiles.get(id)]);
  return piece && file ? { fileName: piece.fileName, bytes: file.bytes } : null;
}

export function useSession(exerciseId: string | undefined, pieceId: string | undefined, librarySlug?: string): SessionHandle & { coreStatus: ReturnType<typeof useCore> } {
  const core = useCore();
  const storedId = pieceId === undefined ? Number.NaN : Number(pieceId);
  const piece = useLiveQuery(() => readStoredPiece(storedId), [storedId]);
  const libraryLoad = useLibraryLoad(librarySlug);
  const libraryBytes = libraryLoad === undefined ? undefined : libraryLoad.status === "ok" ? libraryLoad.bytes : null;
  const isMusicXml = pieceId !== undefined || librarySlug !== undefined;
  const musicXmlBytes = pieceId !== undefined ? (piece === undefined ? undefined : (piece?.bytes ?? null)) : libraryBytes;
  const isPieceLoading = isMusicXml && musicXmlBytes === undefined;
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [limits, setLimits] = useState<TempoLimits | null>(null);
  const [loop, setLoopState] = useState<MeasureRange | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (core.status !== "ready" || isPieceLoading || (!exerciseId && !isMusicXml)) return;
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
    if (isMusicXml) {
      if (!musicXmlBytes) return fail(musicXmlFailure(libraryLoad));
      const parsed = next.loadMusicXml(musicXmlBytes, PARSE_OPTIONS);
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
  }, [core, exerciseId, isMusicXml, musicXmlBytes, isPieceLoading, libraryLoad?.status]);

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

  const resultId = exercise?.id ?? (piece ? `musica:${piece.fileName}` : librarySlug !== undefined && libraryBytes ? libraryResultId(librarySlug) : null);
  const bpm = score ? Math.round(score.beatsPerMinute) : 0;
  return { coreStatus: core, session, exercise, score, error, resultId, limits, bpm, loop, setBpm, setLoop };
}
