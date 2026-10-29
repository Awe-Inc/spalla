import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { useSettings } from "@/app/settings";
import { Drone, midiToHz } from "@/audio/drone";
import { usePitchInput } from "@/audio/usePitchInput";
import { useCore } from "@/core/useCore";
import { Button, InlineError, STRING_NAMES, StringChip } from "@/design/components";
import { Tuner } from "@/design/Tuner";
import { tunerReading } from "@/music/tunerReading";

export const OPEN_STRING_MIDI = [55, 62, 69, 76] as const;

export function stringIndexForMidi(midi: number): number {
  let index = 0;
  OPEN_STRING_MIDI.forEach((open, candidate) => {
    if (midi >= open) index = candidate;
  });
  return index;
}

export function AfinadorPage() {
  const core = useCore();
  const mic = usePitchInput();
  const naming = useSettings((state) => state.noteNaming);
  const [reference, setReference] = useState<number | null>(null);
  const droneRef = useRef<{ context: AudioContext; drone: Drone } | null>(null);

  useEffect(() => {
    return () => {
      const current = droneRef.current;
      if (!current) return;
      current.drone.dispose();
      void current.context.close();
      droneRef.current = null;
    };
  }, []);

  function toggleReference(midi: number) {
    if (reference === midi) {
      droneRef.current?.drone.stop();
      setReference(null);
      return;
    }
    if (!droneRef.current) {
      const context = new AudioContext();
      droneRef.current = { context, drone: new Drone(context, 0.3) };
    }
    void droneRef.current.context.resume();
    droneRef.current.drone.start(midi);
    setReference(midi);
  }

  const reading = core.status === "ready" ? tunerReading(core.core, mic.frame, naming) : null;

  return (
    <div className="grid min-h-dvh content-start gap-8 bg-canvas px-4 py-6 text-ink md:px-10">
      <header className="flex items-center justify-between">
        <Link to="/ferramentas" className="font-semibold text-primary">
          ← Ferramentas
        </Link>
        <h1 className="text-heading font-semibold">Afinador</h1>
        <span className="w-24" />
      </header>
      <div className="mx-auto grid w-full max-w-2xl gap-6">
        <Tuner noteLabel={reading?.note ?? null} cents={reading?.cents ?? null} frequencyHz={reading?.frequencyHz} />
        <div className="flex items-center justify-center gap-2 text-caption text-ink-subtle">
          {reading ? (
            <>
              Corda provável <StringChip index={stringIndexForMidi(reading.midi)} />
            </>
          ) : (
            "Toque uma corda solta para ver a nota."
          )}
        </div>
        {mic.status.status === "error" ? <InlineError title="O microfone não abriu." nextStep={mic.status.message} /> : null}
        {mic.frame?.clipped ? <p className="text-center text-caption text-off">O sinal está saturando. Afaste o microfone ou baixe a sensibilidade.</p> : null}
        <div className="flex justify-center">
          {mic.status.status === "listening" ? (
            <Button onClick={() => void mic.stop()}>Parar</Button>
          ) : (
            <Button variant="primary" onClick={() => void mic.start()} disabled={mic.status.status === "starting" || core.status !== "ready"}>
              {mic.status.status === "starting" ? "Abrindo microfone…" : "Ouvir"}
            </Button>
          )}
        </div>
        <section className="grid gap-2" aria-label="Nota de referência">
          <p className="text-center text-caption text-ink-subtle">Toque a referência de uma corda e afine por cima dela.</p>
          <div className="grid grid-cols-4 gap-2">
            {OPEN_STRING_MIDI.map((midi, index) => {
              const active = reference === midi;
              return (
                <button
                  key={midi}
                  type="button"
                  aria-pressed={active}
                  className={`grid h-16 place-items-center rounded-md font-semibold transition-colors duration-fast ease-spalla ${active ? "bg-primary-soft text-primary" : "bg-surface-soft hover:bg-surface-sunken"}`}
                  onClick={() => toggleReference(midi)}
                >
                  <span className="text-heading">{STRING_NAMES[index]}</span>
                  <span className="font-mono text-caption text-ink-subtle tabular">{Math.round(midiToHz(midi))} Hz</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
