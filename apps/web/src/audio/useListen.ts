import type { MeasureRange, Score } from "@fretless/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useSettings } from "@/app/settings";

import { buildClickTrack } from "./clickTrack";
import { Metronome } from "./metronome";
import { eventIndexAt, notesBetween, playableNotes, playbackWindow, type PlayableNote, type PlaybackWindow } from "./scorePlayback";
import { ViolinSampler } from "./violinSampler";

export type ListenStatus = "parado" | "carregando" | "tocando";

export const LISTEN_LEAD_SEC = 0.4;
const SCHEDULE_AHEAD_SEC = 1.5;
const SCHEDULER_INTERVAL_MS = 200;
const TAIL_SEC = 0.3;

export interface Listen {
  status: ListenStatus;
  songTime: number;
  currentNoteIndex: number;
  progress: number;
  usesSamples: boolean;
  play: (range?: MeasureRange | null) => Promise<void>;
  stop: () => void;
}

interface Run {
  notes: readonly PlayableNote[];
  window: PlaybackWindow;
  songStartSec: number;
  contextStartSec: number;
  cursorSec: number;
  timer: number;
  frame: number;
}

interface Voices {
  context: AudioContext;
  sampler: ViolinSampler;
  metronome: Metronome;
}

export function useListen(score: Score | null): Listen {
  const prefs = useSettings(
    useShallow((state) => ({
      listenVolume: state.listenVolume,
      metronomeOn: state.metronomeOn,
      metronomeSubdivision: state.metronomeSubdivision,
      metronomeVolume: state.metronomeVolume,
      metronomeSound: state.metronomeSound,
    })),
  );
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const voicesRef = useRef<Voices | null>(null);
  const runRef = useRef<Run | null>(null);
  const tokenRef = useRef(0);
  const [status, setStatus] = useState<ListenStatus>("parado");
  const [songTime, setSongTime] = useState(-LISTEN_LEAD_SEC);
  const [progress, setProgress] = useState(0);
  const [usesSamples, setUsesSamples] = useState(true);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    const run = runRef.current;
    if (run) {
      window.clearInterval(run.timer);
      cancelAnimationFrame(run.frame);
    }
    runRef.current = null;
    voicesRef.current?.sampler.stopAll();
    setStatus("parado");
    setSongTime(-LISTEN_LEAD_SEC);
    setProgress(0);
  }, []);

  const play = useCallback(
    async (range: MeasureRange | null = null) => {
      if (!score) return;
      stop();
      const token = tokenRef.current;
      setStatus("carregando");
      let voices: Voices;
      let hasSamples: boolean;
      try {
        voices = voicesRef.current ?? createVoices(prefsRef.current.listenVolume, prefsRef.current.metronomeVolume);
        voicesRef.current = voices;
        await voices.context.resume();
        hasSamples = voices.sampler.hasSamples || (await voices.sampler.load(import.meta.env.BASE_URL));
      } catch {
        if (token === tokenRef.current) stop();
        return;
      }
      if (token !== tokenRef.current) return;
      setUsesSamples(hasSamples);
      const { context, sampler, metronome } = voices;
      const current = prefsRef.current;
      metronome.setTrack(buildClickTrack(score, current.metronomeSubdivision, 0));
      metronome.setEnabled(current.metronomeOn);
      metronome.setSound(current.metronomeSound);
      const playWindow = playbackWindow(score, range);
      const songStartSec = playWindow.startSec - LISTEN_LEAD_SEC;
      metronome.rewind(songStartSec);
      const run: Run = {
        notes: playableNotes(score, range),
        window: playWindow,
        songStartSec,
        contextStartSec: context.currentTime,
        cursorSec: songStartSec,
        timer: 0,
        frame: 0,
      };
      const songTimeNow = () => run.songStartSec + (context.currentTime - run.contextStartSec);
      const schedule = () => {
        const horizon = Math.min(songTimeNow() + SCHEDULE_AHEAD_SEC, run.window.endSec);
        for (const note of notesBetween(run.notes, run.cursorSec, horizon)) {
          const atSec = run.contextStartSec + (note.startSec - run.songStartSec);
          sampler.playNote(note.midi, Math.max(atSec, context.currentTime), Math.min(note.durationSec, run.window.endSec - note.startSec));
        }
        run.cursorSec = Math.max(run.cursorSec, horizon);
      };
      const tick = () => {
        if (token !== tokenRef.current) return;
        const now = songTimeNow();
        metronome.sync(now);
        setSongTime(now);
        setProgress(Math.min(1, Math.max(0, (now - run.window.startSec) / Math.max(0.001, run.window.endSec - run.window.startSec))));
        if (now >= run.window.endSec + TAIL_SEC) {
          stop();
          return;
        }
        run.frame = requestAnimationFrame(tick);
      };
      runRef.current = run;
      schedule();
      run.timer = window.setInterval(schedule, SCHEDULER_INTERVAL_MS);
      run.frame = requestAnimationFrame(tick);
      setStatus("tocando");
    },
    [score, stop],
  );

  useEffect(() => {
    voicesRef.current?.sampler.setVolume(prefs.listenVolume);
  }, [prefs.listenVolume]);

  useEffect(() => {
    voicesRef.current?.metronome.setVolume(prefs.metronomeVolume);
  }, [prefs.metronomeVolume]);

  useEffect(() => stop, [score, stop]);

  useEffect(
    () => () => {
      const voices = voicesRef.current;
      voicesRef.current = null;
      if (!voices) return;
      voices.sampler.dispose();
      voices.metronome.dispose();
      void voices.context.close();
    },
    [],
  );

  const currentNoteIndex = score ? eventIndexAt(score.events, songTime) : 0;
  return { status, songTime, currentNoteIndex, progress, usesSamples, play, stop };
}

function createVoices(listenVolume: number, metronomeVolume: number): Voices {
  const context = new AudioContext();
  return { context, sampler: new ViolinSampler(context, listenVolume), metronome: new Metronome(context, metronomeVolume) };
}
