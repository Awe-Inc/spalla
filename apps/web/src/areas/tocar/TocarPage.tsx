import type { Exercise, GameStats, PracticeSession, Score, SessionState } from "@fretless/core";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { useSettings } from "@/app/settings";
import { usePitchInput } from "@/audio/usePitchInput";
import { useCore } from "@/core/useCore";
import { recordResult, starsFor } from "@/data/db";
import { useLibrary } from "@/data/library";
import { Button, HeadphoneNotice, InlineError, Stars, StringChip } from "@/design/components";
import { Tuner } from "@/design/Tuner";
import { displayNoteName } from "@/music/noteNames";

interface Snapshot {
  state: SessionState;
  songTime: number;
  currentNoteIndex: number;
  liveCents: number | null;
  stats: GameStats;
}

const LEAD_IN_SECONDS = 2;
const UPCOMING_NOTES = 4;

function readSnapshot(session: PracticeSession): Snapshot {
  return {
    state: session.state,
    songTime: session.songTime,
    currentNoteIndex: session.currentNoteIndex,
    liveCents: session.liveCents,
    stats: session.stats,
  };
}

function useSession(exerciseId: string | undefined) {
  const core = useCore();
  const piece = useLibrary((state) => state.selected);
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (core.status !== "ready" || !exerciseId) return;
    const next = core.core.createSession();
    next.setLeadInSeconds(LEAD_IN_SECONDS);
    const fail = (message: string) => {
      next.dispose();
      setError(message);
      setExercise(null);
      setScore(null);
    };
    if (exerciseId === "musica") {
      if (!piece) return fail("Escolha uma música em Músicas antes de tocar.");
      const parsed = next.loadMusicXml(piece.bytes, { expandRepeats: true, trimSilentIntro: true, mergeTies: true });
      if (!parsed.ok) return fail(parsed.error);
      setExercise(null);
    } else {
      const found = core.core.findExercise(exerciseId);
      if (!found || !next.loadExercise(exerciseId, Date.now() >>> 0)) return fail("Esse exercício não existe.");
      setExercise(found);
    }
    setError(null);
    setScore(next.score);
    setSession(next);
    return () => {
      next.dispose();
      setSession(null);
    };
  }, [core, exerciseId, piece]);

  const resultId = exercise?.id ?? (piece ? `musica:${piece.fileName}` : null);
  return { core, session, exercise, score, error, resultId };
}

export function TocarPage() {
  const { exerciseId } = useParams();
  const navigate = useNavigate();
  const { core, session, exercise, score, error, resultId } = useSession(exerciseId);
  const mic = usePitchInput();
  const { takeFrames, stop: stopMic, start: startMic } = mic;
  const isListening = mic.status.status === "listening";
  const naming = useSettings((state) => state.noteNaming);
  const headphonesConfirmedAt = useSettings((state) => state.headphonesConfirmedAt);
  const confirmHeadphones = useSettings((state) => state.confirmHeadphones);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [saved, setSaved] = useState<{ stars: 0 | 1 | 2 | 3 } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const savedRunRef = useRef(false);

  const needsHeadphones = (exercise?.droneMidi ?? 0) > 0 && headphonesConfirmedAt === null;

  useEffect(() => {
    if (!session || !isListening) return;
    let handle = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const frames = takeFrames();
      if (frames.length === 0) {
        session.update(dt, null);
      } else {
        const slice = dt / frames.length;
        for (const frame of frames) session.update(slice, frame);
      }
      setSnapshot(readSnapshot(session));
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [session, isListening, takeFrames]);

  useEffect(() => {
    if (!score || !resultId || snapshot?.state !== "finished" || savedRunRef.current || startedAtRef.current === null) return;
    savedRunRef.current = true;
    const bpm = Math.round(score.beatsPerMinute * score.tempoScale);
    const stars = starsFor(snapshot.stats.accuracyPct, bpm, exercise?.defaultBpm ?? score.beatsPerMinute);
    const durationSeconds = (Date.now() - startedAtRef.current) / 1000;
    recordResult({
      exerciseId: resultId,
      playedAt: Date.now(),
      accuracyPct: snapshot.stats.accuracyPct,
      meanSignedCents: snapshot.stats.meanSignedCents,
      bpm,
      stars,
      durationSeconds,
    })
      .then(() => setSaved({ stars }))
      .catch(() => setSaveError("O resultado não foi salvo neste aparelho. As estrelas valem só por agora."));
    void stopMic();
  }, [snapshot, score, exercise, resultId, stopMic]);

  async function begin() {
    if (!session) return;
    if (!isListening && !(await startMic())) return;
    session.restart();
    startedAtRef.current = Date.now();
    savedRunRef.current = false;
    setSaved(null);
    setSaveError(null);
    session.start();
    setSnapshot(readSnapshot(session));
  }

  function leave() {
    void stopMic();
    void navigate(exercise ? "/praticar" : "/musicas");
  }

  const currentEvent = score && snapshot ? score.events[snapshot.currentNoteIndex] : undefined;
  const upcoming = score && snapshot ? score.events.slice(snapshot.currentNoteIndex + 1, snapshot.currentNoteIndex + 1 + UPCOMING_NOTES) : [];

  return (
    <div data-theme="dark" className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-canvas px-4 py-4 text-ink md:px-8">
      <header className="flex items-center justify-between gap-4">
        <div className="grid gap-0.5">
          <h1 className="text-heading font-semibold">{exercise?.title ?? score?.title ?? "Carregando…"}</h1>
          {exercise ? <p className="text-caption text-ink-subtle">{exercise.subtitle}</p> : null}
        </div>
        <Button variant="ghost" onClick={leave}>
          Sair
        </Button>
      </header>

      <main className="grid content-center gap-8">
        {error ? <InlineError title="Não dá para tocar isso agora." nextStep={error} /> : null}
        {core.status === "error" ? <InlineError title="O núcleo não carregou." nextStep={core.message} /> : null}
        {mic.status.status === "error" ? <InlineError title="O microfone não abriu." nextStep={mic.status.message} /> : null}

        {needsHeadphones ? <HeadphoneNotice onConfirm={confirmHeadphones} /> : null}

        {score && snapshot && snapshot.state !== "finished" && snapshot.state !== "idle" ? (
          <section className="grid gap-6" aria-label="Nota atual">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="grid gap-2">
                <span className="text-caption text-ink-subtle">
                  {snapshot.state === "countdown" ? "Prepare o arco" : `Compasso ${currentEvent?.measure ?? "—"}`}
                </span>
                <span className="font-display text-[72px] leading-none">
                  {currentEvent && !currentEvent.isRest ? displayNoteName(currentEvent.noteName, naming) : "pausa"}
                </span>
                {currentEvent && !currentEvent.isRest ? <StringChip index={currentEvent.string} /> : null}
              </div>
              <ol className="flex gap-3" aria-label="Próximas notas">
                {upcoming.map((event, index) => (
                  <li key={`${event.startQuarters}-${index}`} className="grid gap-1 text-center">
                    <span className="font-display text-title text-ink-muted">{event.isRest ? "·" : displayNoteName(event.noteName, naming)}</span>
                    {!event.isRest ? <StringChip index={event.string} /> : <span className="h-7" />}
                  </li>
                ))}
              </ol>
            </div>
            <Tuner
              compact
              noteLabel={snapshot.liveCents === null ? null : displayNoteName(currentEvent?.noteName ?? "", naming)}
              cents={snapshot.liveCents}
            />
            <dl className="grid grid-cols-3 gap-4 text-center md:grid-cols-5">
              <div>
                <dt className="text-caption text-ink-subtle">Precisão</dt>
                <dd className="font-mono text-numeric tabular">{Math.round(snapshot.stats.accuracyPct)}%</dd>
              </div>
              <div>
                <dt className="text-caption text-ink-subtle">Sequência</dt>
                <dd className="font-mono text-numeric tabular">{snapshot.stats.combo}</dd>
              </div>
              <div>
                <dt className="text-caption text-ink-subtle">Notas</dt>
                <dd className="font-mono text-numeric tabular">
                  {snapshot.stats.judgedNotes}/{score.noteCount}
                </dd>
              </div>
              <div className="hidden md:block">
                <dt className="text-caption text-ink-subtle">Perfeitas</dt>
                <dd className="font-mono text-numeric tabular text-in-tune">{snapshot.stats.perfect}</dd>
              </div>
              <div className="hidden md:block">
                <dt className="text-caption text-ink-subtle">Erradas</dt>
                <dd className="font-mono text-numeric tabular text-off">{snapshot.stats.miss}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {snapshot?.state === "finished" && score ? (
          <section className="grid justify-items-center gap-4 text-center" aria-label="Resultado">
            <Stars count={saved?.stars ?? 0} />
            <p className="font-display text-display">{Math.round(snapshot.stats.accuracyPct)}% de precisão</p>
            {saveError ? <p className="text-caption text-off">{saveError}</p> : null}
            <p className="text-ink-muted">
              {snapshot.stats.meanSignedCents > 3
                ? `Tendência de ${Math.round(snapshot.stats.meanSignedCents)} cents alto.`
                : snapshot.stats.meanSignedCents < -3
                  ? `Tendência de ${Math.round(-snapshot.stats.meanSignedCents)} cents baixo.`
                  : "Afinação centrada."}
            </p>
            <div className="flex gap-3">
              <Button variant="primary" onClick={() => void begin()}>
                Tocar de novo
              </Button>
              <Link to={exercise ? "/praticar" : "/musicas"} className="inline-flex h-11 items-center rounded-pill bg-surface-soft px-5 font-semibold md:h-10">
                Voltar
              </Link>
            </div>
          </section>
        ) : null}

        {score && (!snapshot || snapshot.state === "idle") && !error ? (
          <section className="grid justify-items-center gap-4 text-center">
            {exercise ? <p className="max-w-prose text-ink-muted">{exercise.howTo}</p> : null}
            <p className="text-caption text-ink-subtle">
              {score.noteCount} notas · {Math.round(score.beatsPerMinute * score.tempoScale)} bpm
            </p>
            <Button variant="primary" onClick={() => void begin()} disabled={needsHeadphones || mic.status.status === "starting"}>
              {mic.status.status === "starting" ? "Abrindo microfone…" : "Começar"}
            </Button>
          </section>
        ) : null}
      </main>

      <footer className="flex items-center justify-between text-caption text-ink-subtle">
        <span>{mic.status.status === "listening" ? "Microfone ligado" : "Microfone desligado"}</span>
        {mic.frame?.clipped ? <span className="text-off">Sinal saturando</span> : null}
        {snapshot ? <span className="font-mono tabular">{snapshot.songTime.toFixed(1)} s</span> : null}
      </footer>
    </div>
  );
}
