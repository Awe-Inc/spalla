import type { Score } from "@fretless/core";
import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { useSettings } from "@/app/settings";
import { buildClickTrack } from "@/audio/clickTrack";
import { Drone } from "@/audio/drone";
import { Metronome } from "@/audio/metronome";
import type { PitchInput } from "@/audio/PitchInput";

interface AccompanimentOptions {
  input: PitchInput | null;
  isListening: boolean;
  score: Score | null;
  leadInSeconds: number;
  droneMidi: number | null;
}

export interface Accompaniment {
  sync: (songTimeSec: number) => void;
  rewind: (songTimeSec: number) => void;
  startDrone: () => void;
  stopDrone: () => void;
}

export function useAccompaniment({ input, isListening, score, leadInSeconds, droneMidi }: AccompanimentOptions): Accompaniment {
  const metronomeRef = useRef<Metronome | null>(null);
  const droneRef = useRef<Drone | null>(null);
  const droneMidiRef = useRef(droneMidi);
  droneMidiRef.current = droneMidi;
  const droneWantedRef = useRef(false);
  const prefs = useSettings(
    useShallow((state) => ({
      metronomeOn: state.metronomeOn,
      metronomeSubdivision: state.metronomeSubdivision,
      metronomeVolume: state.metronomeVolume,
      metronomeSound: state.metronomeSound,
      droneVolume: state.droneVolume,
    })),
  );

  useEffect(() => {
    const context = isListening ? input?.context : null;
    if (!context) return;
    const metronome = new Metronome(context, prefs.metronomeVolume);
    const drone = new Drone(context, prefs.droneVolume);
    metronomeRef.current = metronome;
    droneRef.current = drone;
    if (droneWantedRef.current && droneMidiRef.current !== null) drone.start(droneMidiRef.current);
    return () => {
      metronome.dispose();
      drone.dispose();
      metronomeRef.current = null;
      droneRef.current = null;
    };
  }, [input, isListening]);

  useEffect(() => {
    const metronome = metronomeRef.current;
    if (!metronome || !score) return;
    metronome.setTrack(buildClickTrack(score, prefs.metronomeSubdivision, leadInSeconds));
  }, [score, prefs.metronomeSubdivision, leadInSeconds, isListening]);

  useEffect(() => {
    const metronome = metronomeRef.current;
    if (!metronome) return;
    metronome.setEnabled(prefs.metronomeOn);
    metronome.setVolume(prefs.metronomeVolume);
    metronome.setSound(prefs.metronomeSound);
  }, [prefs.metronomeOn, prefs.metronomeVolume, prefs.metronomeSound, isListening]);

  useEffect(() => {
    droneRef.current?.setVolume(prefs.droneVolume);
  }, [prefs.droneVolume]);

  useEffect(() => {
    const drone = droneRef.current;
    if (!drone) return;
    if (droneMidi === null) drone.stop();
    else if (droneWantedRef.current) drone.start(droneMidi);
  }, [droneMidi]);

  return useMemo<Accompaniment>(
    () => ({
      sync: (songTimeSec) => metronomeRef.current?.sync(songTimeSec),
      rewind: (songTimeSec) => metronomeRef.current?.rewind(songTimeSec),
      startDrone: () => {
        droneWantedRef.current = true;
        const midi = droneMidiRef.current;
        if (midi !== null) droneRef.current?.start(midi);
      },
      stopDrone: () => {
        droneWantedRef.current = false;
        droneRef.current?.stop();
      },
    }),
    [],
  );
}
