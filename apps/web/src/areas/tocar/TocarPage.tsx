import type { MeasureRange, PracticeSession } from "@fretless/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import { completeAssignmentsAfterRun } from "@/account/classAssignments";
import { syncPracticeInBackground } from "@/account/practiceSync";
import { externalValue } from "@/app/externalValue";
import { useSettings } from "@/app/settings";
import { useTodayBlock } from "@/areas/hoje/useTodayPlan";
import { DRONE_A4_MIDI } from "@/audio/drone";
import { usePitchInput } from "@/audio/usePitchInput";
import { useListen } from "@/audio/useListen";
import { CoreErrorNotice } from "@/core/CoreErrorNotice";
import { db, recordSectionRun } from "@/data/db";
import { recordLoopCompleted, saveRun, type RunOutcome } from "@/data/progress";
import { lastCleanBpm } from "@/data/repetitions";
import { readPracticeRequest } from "@/data/sections";
import { Button, ConfirmButton, HeadphoneNotice, InlineError } from "@/design/components";
import { displayNoteName } from "@/music/noteNames";

import { fromState, offersNextBlock, tocarOrigin } from "./origin";
import { autoSlowdown, slowdownSentence, type Slowdown } from "./autoSlowdown";
import { ListenSoundPicker } from "./ListenSoundPicker";
import { LiveClock, LiveRunPanel } from "./LiveRunPanel";
import { readLiveRun, type LiveRun } from "./liveRun";
import { ResultScreen } from "./ResultScreen";
import { ScoreView } from "./ScoreView";
import { isTypingTarget, shortcutFor } from "./shortcuts";
import { BPM_STEP } from "./tempo";
import { TocarControls } from "./TocarControls";
import { useAccompaniment } from "./useAccompaniment";
import { LEAD_IN_SECONDS, useSession } from "./useSession";
import { advanceWithSyntheticPlayer, isSyntheticPlayerRequested, useSyntheticPlayer } from "./useSyntheticPlayer";

const LOOP_RESTART_DELAY_MS = 1200;

export function TocarPage() {
  const { exerciseId, pieceId, librarySlug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { coreStatus, session, exercise, score, error, resultId, limits, bpm, loop, setBpm, setLoop } = useSession(exerciseId, pieceId, librarySlug);
  const mic = usePitchInput({ publishesFrames: false });
  const listen = useListen(score);
  const isHearing = listen.status !== "parado";
  const { takeFrames, stop: stopMic, start: startMic } = mic;
  const isSynthetic = isSyntheticPlayerRequested(searchParams, import.meta.env.VITE_JOGADOR_SINTETICO);
  const synthetic = useSyntheticPlayer(session);
  const { start: startSynthetic, stop: stopSynthetic } = synthetic;
  const isListening = isSynthetic ? synthetic.isPlaying : mic.status.status === "listening";
  const stopInput = useCallback(() => {
    if (isSynthetic) stopSynthetic();
    else void stopMic();
  }, [isSynthetic, stopSynthetic, stopMic]);
  const naming = useSettings((state) => state.noteNaming);
  const headphonesConfirmedAt = useSettings((state) => state.headphonesConfirmedAt);
  const confirmHeadphones = useSettings((state) => state.confirmHeadphones);
  const isAutoSlowdownOn = useSettings((state) => state.autoSlowdown);
  const [live] = useState(() => externalValue<LiveRun | null>(null));
  const [snapshot, setSnapshot] = useState<LiveRun | null>(null);
  const [slowdown, setSlowdown] = useState<Slowdown | null>(null);
  const slowedRunRef = useRef(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const { goal, nextBlock } = useTodayBlock(resultId ?? null);
  const origin = tocarOrigin(useLocation().state, Boolean(exercise));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [droneOn, setDroneOn] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const savedRunRef = useRef(false);
  const savedLoopRef = useRef(false);
  const tempoAppliedRef = useRef<PracticeSession | null>(null);
  const shortcutRef = useRef<((event: KeyboardEvent) => void) | null>(null);
  const pastResults = useLiveQuery(() => (resultId ? db.results.where("exerciseId").equals(resultId).toArray() : []), [resultId]);
  const cleanBpm = pastResults === undefined ? undefined : lastCleanBpm(pastResults);

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

  const publishRun = useCallback(
    (running: PracticeSession, previous: LiveRun | null) => {
      const next = readLiveRun(running, previous);
      live.set(next);
      setSnapshot((current) => (current?.state === next.state ? current : next));
    },
    [live],
  );

  useEffect(() => {
    setDroneOn(exerciseDrone > 0);
  }, [exerciseDrone]);

  useEffect(() => {
    if (!session) return;
    const request = readPracticeRequest(searchParams, session.measureCount);
    if (request.range) setLoop(request.range);
    if (request.bpm !== null) setBpm(request.bpm);
  }, [session, searchParams, setLoop, setBpm]);

  useEffect(() => {
    if (!session || cleanBpm === undefined || tempoAppliedRef.current === session) return;
    tempoAppliedRef.current = session;
    const request = readPracticeRequest(searchParams, session.measureCount);
    if (request.bpm === null && cleanBpm !== null) setBpm(cleanBpm);
  }, [session, cleanBpm, searchParams, setBpm]);

  useEffect(() => {
    if (!session || !isListening) return;
    let handle = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
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
      if (state === "countdown" || state === "playing") accompaniment.sync(session.songTime);
      publishRun(session, live.get());
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [session, isListening, isSynthetic, takeFrames, accompaniment, live, publishRun]);

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
      publishRun(session, null);
    }, LOOP_RESTART_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [snapshot?.state, session, loop, accompaniment, resultId, publishRun]);

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
      fromMemory: false,
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
  }, [snapshot, score, resultId, limits, bpm, loop, droneOn, stopInput, accompaniment]);

  async function begin() {
    if (!session) return;
    listen.stop();
    if (!isListening && !(isSynthetic ? startSynthetic() : await startMic())) return;
    session.restart();
    startedAtRef.current = Date.now();
    savedRunRef.current = false;
    savedLoopRef.current = false;
    slowedRunRef.current = false;
    setSlowdown(null);
    setOutcome(null);
    setCompletedTasks([]);
    setSaveError(null);
    accompaniment.rewind(-LEAD_IN_SECONDS);
    accompaniment.startDrone();
    session.start();
    publishRun(session, null);
  }

  function stopRun() {
    if (!session) return;
    session.stop();
    accompaniment.stopDrone();
    stopInput();
    live.set(null);
    setSnapshot(null);
  }

  function stopLoop() {
    stopRun();
    setLoop(null);
  }

  function keepTempo(previous: number) {
    setBpm(previous);
    setSlowdown(null);
  }

  function repeatHardest(range: MeasureRange) {
    setLoop(range);
    void begin();
  }

  function leave() {
    listen.stop();
    accompaniment.stopDrone();
    stopInput();
    void navigate(origin.to);
  }

  const isRunning = snapshot !== null && snapshot.state !== "finished" && snapshot.state !== "idle";
  const isIdle = score !== null && (!snapshot || snapshot.state === "idle") && !error;
  const fullMeasureCount = session?.measureCount ?? 0;
  const isFinished = snapshot?.state === "finished";
  const canBegin = score !== null && !needsHeadphones && mic.status.status !== "starting";

  useEffect(() => {
    shortcutRef.current = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      const action = shortcutFor(event.key, { isRunning, isFinished });
      if (!action) return;
      event.preventDefault();
      if (action === "toggle") {
        if (isRunning) stopRun();
        else if (canBegin) void begin();
      } else if (action === "again") {
        if (canBegin) void begin();
      } else if (action === "listen") {
        if (isHearing) listen.stop();
        else void listen.play();
      } else {
        setBpm(bpm + (action === "faster" ? BPM_STEP : -BPM_STEP));
      }
    };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => shortcutRef.current?.(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div data-theme="dark" className="grid min-h-dvh grid-rows-[auto_1fr_auto] gap-4 bg-canvas px-4 py-4 text-ink md:px-8">
      <header className="flex items-center justify-between gap-4">
        <div className="grid gap-0.5">
          <p className="sr-only" aria-live="polite">
            {isRunning ? `Passada começou a ${bpm} bpm.` : snapshot?.state === "finished" ? "Passada terminada." : ""}
          </p>
          <h1 className="text-heading font-semibold">{exercise?.title ?? score?.title ?? "Carregando…"}</h1>
          {exercise ? <p className="text-caption text-ink-subtle">{exercise.subtitle}</p> : null}
          {loop ? (
            <p className="text-caption text-primary">
              Repetindo compassos {loop.firstIndex + 1}–{loop.lastIndex + 1}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {loop && snapshot ? <Button onClick={stopLoop}>Parar repetição</Button> : null}
          {isRunning && !loop ? (
            <>
              <Button icon="voltar" onClick={() => void begin()}>
                Recomeçar
              </Button>
              <Button onClick={stopRun}>Parar</Button>
            </>
          ) : null}
          {isRunning ? (
            <ConfirmButton label="Sair" variant="ghost" question="Descartar esta passada?" confirmLabel="Sair" onConfirm={leave} />
          ) : (
            <Button variant="ghost" onClick={leave}>
              Sair
            </Button>
          )}
        </div>
      </header>

      <main className="grid content-center gap-6">
        {error ? <InlineError title="Não dá para tocar isso agora." nextStep={error} /> : null}
        <CoreErrorNotice title="O núcleo não carregou." />
        {mic.status.status === "error" ? <InlineError title="O microfone não abriu." nextStep={mic.status.message} /> : null}

        {needsHeadphones ? <HeadphoneNotice onConfirm={confirmHeadphones} /> : null}

        {score && isRunning ? <LiveRunPanel score={score} live={live} /> : null}

        {snapshot?.state === "finished" && score && limits && loop ? (
          <section className="grid justify-items-center gap-3 text-center" aria-label="Trecho concluído">
            <p className="font-display text-display">{Math.round(snapshot.stats.accuracyPct)}%</p>
            <p className="text-ink-muted">{slowdown ? slowdownSentence(slowdown) : "Recomeçando o trecho…"}</p>
          </section>
        ) : null}

        {snapshot?.state === "finished" && score && limits && !loop ? (
          <ResultScreen
            score={score}
            stats={snapshot.stats}
            judgements={snapshot.judgements}
            outcome={outcome}
            goal={goal}
            bpm={bpm}
            limits={limits}
            loop={loop}
            slowdown={slowdown}
            saveError={saveError}
            completedTasks={completedTasks}
            back={origin}
            next={offersNextBlock(origin) && nextBlock ? { title: nextBlock.title, to: nextBlock.playPath, state: fromState(origin.to) } : null}
            onPlayAgain={() => void begin()}
            onRepeatHardest={repeatHardest}
            onChangeTempo={(next) => {
              setBpm(next);
              void begin();
            }}
            onKeepTempo={keepTempo}
          />
        ) : null}

        {isIdle && score ? (
          <section className="grid justify-items-center gap-4 text-center">
            <ScoreView
              score={score}
              songTime={listen.status === "tocando" ? listen.songTime : -LEAD_IN_SECONDS}
              currentNoteIndex={listen.status === "tocando" ? listen.currentNoteIndex : 0}
              judgements={[]}
            />
            {exercise ? <p className="max-w-prose text-ink-muted">{exercise.howTo}</p> : null}
            <p className="text-caption text-ink-subtle">
              {score.noteCount} notas · {bpm} bpm
              {cleanBpm ? ` · último limpo: ${cleanBpm} bpm` : ""}
            </p>
            <p className="hidden text-caption text-ink-subtle lg:block">Espaço começa e para · R toca de novo · L ouve · setas mudam o bpm</p>
            <div className="flex flex-wrap justify-center gap-3">
              <ListenSoundPicker />
              <Button variant="secondary" onClick={() => (isHearing ? listen.stop() : void listen.play())} disabled={listen.status === "carregando"} aria-pressed={listen.status === "tocando"}>
                {listen.status === "carregando" ? "Carregando…" : listen.status === "tocando" ? "Parar" : "Ouvir"}
              </Button>
              <Button variant="primary" onClick={() => void begin()} disabled={needsHeadphones || mic.status.status === "starting"}>
                {mic.status.status === "starting" ? "Abrindo microfone…" : "Começar"}
              </Button>
            </div>
            {!listen.usesSamples ? <p className="text-caption text-ink-subtle">Sem internet para baixar o violino: tocando com um som sintético.</p> : null}
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
        <span>{isSynthetic ? "Jogador sintético" : mic.status.status === "listening" ? "Microfone ligado" : "Microfone desligado"}</span>
        {mic.isClipped ? <span className="text-off">Sinal saturando</span> : null}
        <LiveClock live={live} />
      </footer>
    </div>
  );
}
