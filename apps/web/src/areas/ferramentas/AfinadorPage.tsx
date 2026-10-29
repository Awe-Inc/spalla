import { useEffect, useRef, useState } from "react";

import { useSettings } from "@/app/settings";
import { Drone, midiToHz } from "@/audio/drone";
import { usePitchInput } from "@/audio/usePitchInput";
import { useCore } from "@/core/useCore";
import { Button, Card, InlineError, STRING_NAMES, StringChip } from "@/design/components";
import { Section } from "@/design/layout";
import { Tuner } from "@/design/Tuner";
import { tunerReading } from "@/music/tunerReading";

import { ToolLayout } from "./ToolLayout";

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

  const isListening = mic.status.status === "listening";
  const listenButton = isListening ? (
    <Button icon="pausar" onClick={() => void mic.stop()}>
      Parar
    </Button>
  ) : (
    <Button variant="primary" icon="ouvir" onClick={() => void mic.start()} disabled={mic.status.status === "starting" || core.status !== "ready"} loading={mic.status.status === "starting"}>
      {mic.status.status === "starting" ? "Abrindo microfone…" : "Ouvir"}
    </Button>
  );

  return (
    <ToolLayout title="Afinador" description="Toque uma corda solta. A nota, os cents e a corda provável aparecem na hora." actions={listenButton}>
      <Card tone="hero" className="grid gap-5">
        <Tuner noteLabel={reading?.note ?? null} cents={reading?.cents ?? null} frequencyHz={reading?.frequencyHz} />
        <p className="flex min-h-8 items-center justify-center gap-2 text-small text-ink-muted" aria-live="polite">
          {reading ? (
            <>
              Corda provável <StringChip index={stringIndexForMidi(reading.midi)} />
            </>
          ) : isListening ? (
            "Ouvindo. Toque uma corda solta."
          ) : (
            "Toque em Ouvir e libere o microfone."
          )}
        </p>
        {mic.frame?.clipped ? <p className="text-center text-small text-off">O sinal está saturando. Afaste o microfone ou baixe a sensibilidade em Ajustes.</p> : null}
      </Card>
      {mic.status.status === "error" ? <InlineError title="O microfone não abriu." nextStep={mic.status.message} /> : null}
      <Section title="Nota de referência" description="Toque a referência de uma corda e afine por cima dela até o som parar de bater.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {OPEN_STRING_MIDI.map((midi, index) => {
            const isActive = reference === midi;
            return (
              <button
                key={midi}
                type="button"
                aria-pressed={isActive}
                className={`grid h-18 place-items-center gap-0.5 rounded-md ring-1 ring-inset transition-colors duration-fast ease-spalla focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[.98] ${isActive ? "bg-primary-soft text-primary ring-primary" : "bg-surface-soft ring-hairline hover:bg-surface"}`}
                onClick={() => toggleReference(midi)}
              >
                <span className="text-heading font-semibold">{STRING_NAMES[index]}</span>
                <span className="font-mono text-caption text-ink-subtle tabular">{Math.round(midiToHz(midi))} Hz</span>
              </button>
            );
          })}
        </div>
      </Section>
    </ToolLayout>
  );
}
