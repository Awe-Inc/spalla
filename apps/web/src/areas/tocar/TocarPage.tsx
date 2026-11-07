import type { MeasureRange, PracticeSession } from "@fretless/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import { externalValue } from "@/app/externalValue";
import { useSettings } from "@/app/settings";
import { useTodayBlock } from "@/areas/hoje/useTodayPlan";
import { DRONE_A4_MIDI } from "@/audio/drone";
import { usePitchInput } from "@/audio/usePitchInput";
import { useListen } from "@/audio/useListen";
import { CoreErrorNotice } from "@/core/CoreErrorNotice";
import { db } from "@/data/db";
import { lastCleanBpm } from "@/data/repetitions";
import { readPracticeRequest } from "@/data/sections";
import { HeadphoneNotice, InlineError } from "@/design/components";
import { displayNoteName } from "@/music/noteNames";

import { fromState, offersNextBlock, tocarOrigin } from "./origin";
import { slowdownSentence } from "./autoSlowdown";
import { LiveClock, LiveRunPanel } from "./LiveRunPanel";
import { readLiveRun, type LiveRun } from "./liveRun";
import { ResultScreen } from "./ResultScreen";
import { BPM_STEP } from "./tempo";
import { TocarControls } from "./TocarControls";
import { TocarHeader } from "./TocarHeader";
import { TocarIdle } from "./TocarIdle";
import { useAccompaniment } from "./useAccompaniment";
import { LEAD_IN_SECONDS, useSession } from "./useSession";
import { useRunRecording } from "./useRunRecording";
import { useRunTicker } from "./useRunTicker";
import { isSyntheticPlayerRequested, useSyntheticPlayer } from "./useSyntheticPlayer";
import { useTocarShortcuts } from "./useTocarShortcuts";

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
  const [live] = useState(() => externalValue<LiveRun | null>(null));
  const [snapshot, setSnapshot] = useState<LiveRun | null>(null);
  const { goal, nextBlock } = useTodayBlock(resultId ?? null);
  const origin = tocarOrigin(useLocation().state, Boolean(exercise));
  const [droneOn, setDroneOn] = useState(false);
  const [fromMemory, setFromMemory] = useState(false);
  const tempoAppliedRef = useRef<PracticeSession | null>(null);
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

  useRunTicker({
    session,
    isListening,
    isSynthetic,
    takeFrames,
    onFrame: (songTime) => accompaniment.sync(songTime),
    onPublish: (running) => publishRun(running, live.get()),
  });

  const { slowdown, clearSlowdown, outcome, completedTasks, saveError, startRun } = useRunRecording({
    session,
    score,
    resultId: resultId ?? null,
    limits,
    snapshot,
    loop,
    bpm,
    setBpm,
    droneOn,
    fromMemory,
    accompaniment,
    stopInput,
    onLoopRestart: (running) => publishRun(running, null),
  });

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

  async function begin() {
    if (!session) return;
    listen.stop();
    if (!isListening && !(isSynthetic ? startSynthetic() : await startMic())) return;
    session.restart();
    startRun();
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
    clearSlowdown();
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

  useTocarShortcuts({ isRunning, isFinished }, (action) => {
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
  });

  return (
    <div data-theme="dark" className="grid min-h-dvh grid-rows-[auto_1fr_auto] gap-4 bg-canvas px-4 py-4 text-ink md:px-8">
      <TocarHeader
        title={exercise?.title ?? score?.title ?? "Carregando…"}
        subtitle={exercise?.subtitle ?? null}
        loop={loop}
        bpm={bpm}
        isRunning={isRunning}
        isFinished={isFinished}
        hasRun={snapshot !== null}
        onStopLoop={stopLoop}
        onRestart={() => void begin()}
        onStop={stopRun}
        onLeave={leave}
      />

      <main className="grid content-center gap-6">
        {error ? <InlineError title="Não dá para tocar isso agora." nextStep={error} /> : null}
        <CoreErrorNotice title="O núcleo não carregou." />
        {mic.status.status === "error" ? <InlineError title="O microfone não abriu." nextStep={mic.status.message} /> : null}

        {needsHeadphones ? <HeadphoneNotice onConfirm={confirmHeadphones} /> : null}

        {score && isRunning ? <LiveRunPanel score={score} live={live} fromMemory={fromMemory} /> : null}

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
          <TocarIdle
            score={score}
            howTo={exercise?.howTo ?? null}
            listen={listen}
            bpm={bpm}
            cleanBpm={cleanBpm ?? null}
            canStart={!needsHeadphones && mic.status.status !== "starting"}
            isOpeningMic={mic.status.status === "starting"}
            onBegin={() => void begin()}
          />
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
            fromMemory={fromMemory}
            onBpm={setBpm}
            onLoop={setLoop}
            onDrone={setDroneOn}
            onFromMemory={setFromMemory}
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
