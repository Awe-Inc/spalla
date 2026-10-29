import { useEffect, useRef, useState } from "react";

import { useSettings } from "@/app/settings";
import { Drone, type DroneTimbre, midiToHz } from "@/audio/drone";
import { useCore } from "@/core/useCore";
import { Button, Card, HeadphoneNotice } from "@/design/components";
import { displayNoteName } from "@/music/noteNames";

import { ToolLayout } from "./ToolLayout";

const OCTAVES = [3, 4, 5] as const;
const PITCH_CLASSES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const DEFAULT_PITCH_CLASS = 9;
const DEFAULT_OCTAVE = 4;
const TIMBRES: { value: DroneTimbre; label: string }[] = [
  { value: "corda", label: "Corda" },
  { value: "senoidal", label: "Senoidal" },
];

function midiOf(pitchClass: number, octave: number): number {
  return (octave + 1) * 12 + pitchClass;
}

function pillClass(active: boolean): string {
  return `inline-flex h-10 items-center justify-center rounded-pill px-3 font-medium transition-colors ${active ? "bg-primary-soft text-primary" : "bg-surface-soft text-ink-muted hover:text-ink"}`;
}

export function PedalPage() {
  const core = useCore();
  const naming = useSettings((state) => state.noteNaming);
  const droneVolume = useSettings((state) => state.droneVolume);
  const [pitchClass, setPitchClass] = useState<number>(DEFAULT_PITCH_CLASS);
  const [octave, setOctave] = useState<number>(DEFAULT_OCTAVE);
  const [timbre, setTimbre] = useState<DroneTimbre>("corda");
  const [volume, setVolume] = useState(droneVolume);
  const [isOn, setIsOn] = useState(false);
  const [headphonesConfirmed, setHeadphonesConfirmed] = useState(false);
  const droneRef = useRef<{ context: AudioContext; drone: Drone } | null>(null);
  const midi = midiOf(pitchClass, octave);

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
    droneRef.current?.drone.setTimbre(timbre);
  }, [timbre]);

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
      const drone = new Drone(context, volume);
      drone.setTimbre(timbre);
      droneRef.current = { context, drone };
    }
    void droneRef.current.context.resume();
    droneRef.current.drone.start(midi);
    setIsOn(true);
  }

  const noteLabel = core.status === "ready" ? displayNoteName(core.core.noteName(midi), naming) : "…";

  return (
    <ToolLayout title="Nota pedal" description="Um bordão contínuo para afinar cada nota por cima até o som parar de bater." isWide>
      {!headphonesConfirmed ? <HeadphoneNotice onConfirm={() => setHeadphonesConfirmed(true)} /> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="grid place-items-center gap-5">
          <div className="grid place-items-center gap-1">
            <span className="font-display text-display">{noteLabel}</span>
            <span className="font-mono text-caption text-ink-subtle tabular">{Math.round(midiToHz(midi))} Hz</span>
          </div>
          <Button variant="primary" onClick={toggle}>
            {isOn ? "Parar" : "Soar"}
          </Button>
          <p className="max-w-prose text-center text-caption text-ink-subtle">Afine cada nota contra o pedal até o som parar de bater. Fica ligado enquanto esta tela estiver aberta.</p>
        </Card>
        <div className="grid content-start gap-6">
          <Card title="Nota" className="grid gap-3">
            <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Nota">
              {PITCH_CLASSES.map((candidate) => (
                <button key={candidate} type="button" role="radio" aria-checked={pitchClass === candidate} className={pillClass(pitchClass === candidate)} onClick={() => setPitchClass(candidate)}>
                  {core.status === "ready" ? displayNoteName(core.core.noteName(midiOf(candidate, DEFAULT_OCTAVE)), naming).replace(/\d+$/, "") : candidate}
                </button>
              ))}
            </div>
            <div className="flex gap-2" role="radiogroup" aria-label="Oitava">
              {OCTAVES.map((candidate) => (
                <button key={candidate} type="button" role="radio" aria-checked={octave === candidate} className={pillClass(octave === candidate)} onClick={() => setOctave(candidate)}>
                  Oitava {candidate}
                </button>
              ))}
            </div>
          </Card>
          <Card title="Som" className="grid gap-3">
            <div className="flex gap-2" role="radiogroup" aria-label="Timbre">
              {TIMBRES.map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={timbre === option.value} className={pillClass(timbre === option.value)} onClick={() => setTimbre(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
            <label className="grid gap-1 text-caption text-ink-subtle">
              Volume
              <input type="range" min={0} max={1} step={0.05} value={volume} className="accent-primary" onChange={(event) => setVolume(Number(event.target.value))} />
            </label>
          </Card>
        </div>
      </div>
    </ToolLayout>
  );
}
