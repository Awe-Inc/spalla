import type { GameStats, MeasureRange, NoteJudgement, PracticeSession, SessionState } from "@fretless/core";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { useSettings } from "@/app/settings";
import { DRONE_A4_MIDI } from "@/audio/drone";
import { usePitchInput } from "@/audio/usePitchInput";
import { recordResult, starsFor } from "@/data/db";
import { Button, HeadphoneNotice, InlineError, StringChip } from "@/design/components";
import { Tuner } from "@/design/Tuner";
import { displayNoteName } from "@/music/noteNames";

import { ResultScreen } from "./ResultScreen";
import { ScrollingStaff } from "./ScrollingStaff";
import { TocarControls } from "./TocarControls";
import { useAccompaniment } from "./useAccompaniment";
import { LEAD_IN_SECONDS, useSession } from "./useSession";

interface Snapshot {
  state: SessionState;
  songTime: number;
  currentNoteIndex: number;
  liveCents: number | null;
  stats: GameStats;
  judgements: NoteJudgement[];
}

const LOOP_RESTART_DELAY_MS = 1200;

function readSnapshot(session: PracticeSession): Snapshot {
  return {
    state: session.state,
    songTime: session.songTime,
    currentNoteIndex: session.currentNoteIndex,
    liveCents: session.liveCents,
    stats: session.stats,
    judgements: session.judgements,
  };
}

export function TocarPage() {
  const { exerciseId } = useParams();
  const navigate = useNavigate();
  const { coreStatus, session, exercise, score, error, resultId, limits, bpm, loop, setBpm, setLoop } = useSession(exerciseId);
  const mic = usePitchInput();
  const { takeFrames, stop: stopMic, start: startMic } = mic;
  const isListening = mic.status.status === "listening";
  const naming = useSettings((state) => state.noteNaming);
  const headphonesConfirmedAt = useSettings((state) => state.headphonesConfirmedAt);
  const confirmHeadphones = useSettings((state) => state.confirmHeadphones);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [saved, setSaved] = useState<{ stars: 0 | 1 | 2 | 3 } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [droneOn, setDroneOn] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const savedRunRef = useRef(false);

  const exerciseDrone = exercise?.droneMidi ?? 0;
  const droneMidi = exerciseDrone > 0 ? exerciseDrone : DRONE_A4_MIDI;
  const droneLabel = displayNoteName(coreStatus.status === "ready" ? coreStatus.core.noteName(droneMidi, score?.keyFifths ?? 0) : "A4", naming);
  const needsHeadphones = (exerciseDrone > 0 || droneOn) && headphonesConfirmedAt === null;
  const accompaniment = useAccompaniment({
    input: mic.input.current,
    isListening,
    score,
    leadInSeconds: LEAD_IN_SECONDS,
    droneMidi: droneOn ? droneMidi : null,
  });

  useEffect(() => {
    setDroneOn(exerciseDrone > 0);
  }, [exerciseDrone]);

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
      const state = session.state;
      if (state === "countdown" || state === "playing") accompaniment.sync(session.songTime);
      setSnapshot(readSnapshot(session));
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [session, isListening, takeFrames, accompaniment]);

  useEffect(() => {
    if (!session || snapshot?.state !== "finished" || !loop) return;
    const timer = window.setTimeout(() => {
      session.restart();
      accompaniment.rewind(-LEAD_IN_SECONDS);
      session.start();
      setSnapshot(readSnapshot(session));
    }, LOOP_RESTART_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [snapshot?.state, session, loop, accompaniment]);

  useEffect(() => {
    if (!score || !resultId || !limits || loop || snapshot?.state !== "finished" || savedRunRef.current || startedAtRef.current === null) return;
    savedRunRef.current = true;
    const stars = starsFor(snapshot.stats.accuracyPct, bpm, limits.writtenBpm);
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
    accompaniment.stopDrone();
    void stopMic();
  }, [snapshot, score, resultId, limits, bpm, loop, stopMic, accompaniment]);

  async function begin() {
    if (!session) return;
    if (!isListening && !(await startMic())) return;
    session.restart();
    startedAtRef.current = Date.now();
    savedRunRef.current = false;
    setSaved(null);
    setSaveError(null);
    accompaniment.rewind(-LEAD_IN_SECONDS);
    accompaniment.startDrone();
    session.start();
    setSnapshot(readSnapshot(session));
  }

  function stopLoop() {
    if (!session) return;
    session.stop();
    setLoop(null);
    accompaniment.stopDrone();
    void stopMic();
    setSnapshot(null);
  }

  function repeatHardest(range: MeasureRange) {
    setLoop(range);
    void begin();
  }

  function leave() {
    accompaniment.stopDrone();
    void stopMic();
    void navigate(exercise ? "/praticar" : "/musicas");
  }

  const backTo = exercise ? "/praticar" : "/musicas";
  const currentEvent = score && snapshot ? score.events[snapshot.currentNoteIndex] : undefined;
  const isRunning = snapshot !== null && snapshot.state !== "finished" && snapshot.state !== "idle";
  const isIdle = score !== null && (!snapshot || snapshot.state === "idle") && !error;
  const fullMeasureCount = session?.measureCount ?? 0;

  return (
    <div data-theme="dark" className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-canvas px-4 py-4 text-ink md:px-8">
      <header className="flex items-center justify-between gap-4">
        <div className="grid gap-0.5">
          <h1 className="text-heading font-semibold">{exercise?.title ?? score?.title ?? "Carregando…"}</h1>
          {exercise ? <p className="text-caption text-ink-subtle">{exercise.subtitle}</p> : null}
          {loop ? (
            <p className="text-caption text-primary">
              Repetindo compassos {loop.firstIndex + 1}–{loop.lastIndex + 1}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {loop && snapshot ? <Button onClick={stopLoop}>Parar repetição</Button> : null}
          <Button variant="ghost" onClick={leave}>
            Sair
          </Button>
        </div>
      </header>

      <main className="grid content-center gap-6">
        {error ? <InlineError title="Não dá para tocar isso agora." nextStep={error} /> : null}
        {coreStatus.status === "error" ? <InlineError title="O núcleo não carregou." nextStep={coreStatus.message} /> : null}
        {mic.status.status === "error" ? <InlineError title="O microfone não abriu." nextStep={mic.status.message} /> : null}

        {needsHeadphones ? <HeadphoneNotice onConfirm={confirmHeadphones} /> : null}

        {score && snapshot && isRunning ? (
          <section className="grid gap-6" aria-label="Nota atual">
            <ScrollingStaff
              score={score}
              songTime={snapshot.songTime}
              currentNoteIndex={snapshot.currentNoteIndex}
              judgements={snapshot.judgements}
              className="h-44 md:h-56"
            />
            <div className="grid gap-2">
              <span className="text-caption text-ink-subtle">
                {snapshot.state === "countdown" ? "Prepare o arco" : `Compasso ${currentEvent?.measure ?? "—"}`}
              </span>
              <span className="font-display text-[72px] leading-none">
                {currentEvent && !currentEvent.isRest ? displayNoteName(currentEvent.noteName, naming) : "pausa"}
              </span>
              {currentEvent && !currentEvent.isRest ? <StringChip index={currentEvent.string} /> : null}
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

        {snapshot?.state === "finished" && score && limits && loop ? (
          <section className="grid justify-items-center gap-3 text-center" aria-label="Trecho concluído">
            <p className="font-display text-display">{Math.round(snapshot.stats.accuracyPct)}%</p>
            <p className="text-ink-muted">Recomeçando o trecho…</p>
          </section>
        ) : null}

        {snapshot?.state === "finished" && score && limits && !loop ? (
          <ResultScreen
            score={score}
            stats={snapshot.stats}
            judgements={snapshot.judgements}
            stars={saved?.stars ?? 0}
            bpm={bpm}
            limits={limits}
            loop={loop}
            saveError={saveError}
            backTo={backTo}
            onPlayAgain={() => void begin()}
            onRepeatHardest={repeatHardest}
            onChangeTempo={(next) => {
              setBpm(next);
              void begin();
            }}
          />
        ) : null}

        {isIdle && score ? (
          <section className="grid justify-items-center gap-4 text-center">
            <ScrollingStaff score={score} songTime={-LEAD_IN_SECONDS} currentNoteIndex={0} judgements={[]} className="h-44 w-full md:h-56" />
            {exercise ? <p className="max-w-prose text-ink-muted">{exercise.howTo}</p> : null}
            <p className="text-caption text-ink-subtle">
              {score.noteCount} notas · {bpm} bpm
            </p>
            <Button variant="primary" onClick={() => void begin()} disabled={needsHeadphones || mic.status.status === "starting"}>
              {mic.status.status === "starting" ? "Abrindo microfone…" : "Começar"}
            </Button>
          </section>
        ) : null}

        {score && limits && !isRunning ? (
          <TocarControls
            score={score}
            fullMeasureCount={fullMeasureCount}
            limits={limits}
            bpm={bpm}
            loop={loop}
            droneOn={droneOn}
            droneLabel={droneLabel}
            onBpm={setBpm}
            onLoop={setLoop}
            onDrone={setDroneOn}
          />
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
