import { useEffect, useRef, useState } from "react";

import { useSettings } from "@/app/settings";
import { Drone } from "@/audio/drone";
import { clampBpm, TempoClock, type TempoClockSettings } from "@/audio/tempoClock";
import { usePitchInput } from "@/audio/usePitchInput";
import { useCore } from "@/core/useCore";
import { Button, InlineError } from "@/design/components";
import { Tuner } from "@/design/Tuner";
import { displayNoteName } from "@/music/noteNames";
import { tunerReading } from "@/music/tunerReading";

const PITCH_CLASSES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const DRONE_OCTAVE = 4;
const DEFAULT_PITCH_CLASS = 9;
const BEAT_OPTIONS = [2, 3, 4, 6] as const;
const BPM_STEPS = [-5, -1, 1, 5] as const;

function midiOf(pitchClass: number, octave: number): number {
  return (octave + 1) * 12 + pitchClass;
}

function pillClass(active: boolean): string {
  return `inline-flex h-9 min-w-9 items-center justify-center rounded-pill px-2 text-small font-medium transition-colors ${active ? "bg-primary-soft text-primary" : "bg-surface-soft text-ink-muted hover:text-ink"}`;
}

function PainelSecao({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-b border-hairline pb-4 last:border-b-0">
      <h2 className="text-small font-semibold text-ink-muted">{title}</h2>
      {children}
    </section>
  );
}

function AfinadorCompacto() {
  const core = useCore();
  const mic = usePitchInput();
  const naming = useSettings((state) => state.noteNaming);
  const reading = core.status === "ready" ? tunerReading(core.core, mic.frame, naming) : null;
  const isListening = mic.status.status === "listening";

  return (
    <PainelSecao title="Afinador">
      <Tuner noteLabel={reading?.note ?? null} cents={reading?.cents ?? null} frequencyHz={reading?.frequencyHz} compact />
      {mic.status.status === "error" ? <InlineError title="O microfone não abriu." nextStep={mic.status.message} /> : null}
      <Button variant={isListening ? "secondary" : "primary"} onClick={() => void (isListening ? mic.stop() : mic.start())} disabled={mic.status.status === "starting"}>
        {isListening ? "Parar de ouvir" : "Ouvir"}
      </Button>
    </PainelSecao>
  );
}

function MetronomoCompacto() {
  const sound = useSettings((state) => state.metronomeSound);
  const [settings, setSettings] = useState<TempoClockSettings>({ bpm: 72, beatsPerMeasure: 4, subdivision: 1, accentFirstBeat: true, sound, progressive: null });
  const [isRunning, setIsRunning] = useState(false);
  const clockRef = useRef<TempoClock | null>(null);

  useEffect(() => {
    return () => {
      void clockRef.current?.dispose();
      clockRef.current = null;
    };
  }, []);

  useEffect(() => {
    clockRef.current?.update(settings);
  }, [settings]);

  function patch(changes: Partial<TempoClockSettings>) {
    setSettings((current) => ({ ...current, ...changes }));
  }

  async function toggle() {
    if (isRunning) {
      clockRef.current?.stop();
      setIsRunning(false);
      return;
    }
    clockRef.current ??= new TempoClock(settings);
    await clockRef.current.start();
    setIsRunning(true);
  }

  return (
    <PainelSecao title="Metrônomo">
      <div className="flex items-center justify-between gap-2">
        {BPM_STEPS.slice(0, 2).map((step) => (
          <button key={step} type="button" className={pillClass(false)} onClick={() => patch({ bpm: clampBpm(settings.bpm + step) })} aria-label={`${step} BPM`}>
            {step}
          </button>
        ))}
        <output className="font-display text-title tabular-nums" aria-live="polite">
          {settings.bpm}
        </output>
        {BPM_STEPS.slice(2).map((step) => (
          <button key={step} type="button" className={pillClass(false)} onClick={() => patch({ bpm: clampBpm(settings.bpm + step) })} aria-label={`+${step} BPM`}>
            +{step}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Tempos por compasso" className="flex flex-wrap gap-2">
        {BEAT_OPTIONS.map((beats) => (
          <button key={beats} type="button" aria-pressed={settings.beatsPerMeasure === beats} className={pillClass(settings.beatsPerMeasure === beats)} onClick={() => patch({ beatsPerMeasure: beats })}>
            {beats}/4
          </button>
        ))}
      </div>
      <Button variant={isRunning ? "secondary" : "primary"} onClick={() => void toggle()}>
        {isRunning ? "Parar" : "Começar"}
      </Button>
    </PainelSecao>
  );
}

function PedalCompacto() {
  const core = useCore();
  const naming = useSettings((state) => state.noteNaming);
  const volume = useSettings((state) => state.droneVolume);
  const [pitchClass, setPitchClass] = useState<number>(DEFAULT_PITCH_CLASS);
  const [isOn, setIsOn] = useState(false);
  const droneRef = useRef<{ context: AudioContext; drone: Drone } | null>(null);
  const midi = midiOf(pitchClass, DRONE_OCTAVE);

  useEffect(() => {
    return () => {
      const current = droneRef.current;
      if (!current) return;
      current.drone.dispose();
      void current.context.close();
      droneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isOn) droneRef.current?.drone.start(midi);
  }, [midi, isOn]);

  useEffect(() => {
    droneRef.current?.drone.setVolume(volume);
  }, [volume]);

  function toggle() {
    if (isOn) {
      droneRef.current?.drone.stop();
      setIsOn(false);
      return;
    }
    if (!droneRef.current) {
      const context = new AudioContext();
      droneRef.current = { context, drone: new Drone(context, volume) };
    }
    void droneRef.current.context.resume();
    droneRef.current.drone.start(midi);
    setIsOn(true);
  }

  function pitchLabel(candidate: number): string {
    return core.status === "ready" ? displayNoteName(core.core.noteName(midiOf(candidate, DRONE_OCTAVE)), naming).replace(/\d+$/, "") : String(candidate);
  }

  return (
    <PainelSecao title="Nota pedal">
      <div role="group" aria-label="Nota do pedal" className="grid grid-cols-6 gap-1">
        {PITCH_CLASSES.map((candidate) => (
          <button key={candidate} type="button" aria-pressed={pitchClass === candidate} className={pillClass(pitchClass === candidate)} onClick={() => setPitchClass(candidate)}>
            {pitchLabel(candidate)}
          </button>
        ))}
      </div>
      <Button variant={isOn ? "secondary" : "primary"} onClick={toggle}>
        {isOn ? "Parar pedal" : "Soar pedal"}
      </Button>
    </PainelSecao>
  );
}

export function PainelFerramentas() {
  return (
    <div className="grid gap-4">
      <AfinadorCompacto />
      <MetronomoCompacto />
      <PedalCompacto />
    </div>
  );
}
