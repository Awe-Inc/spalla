import { Link } from "react-router";

import { useSettings } from "@/app/settings";
import { usePitchInput } from "@/audio/usePitchInput";
import { useCore } from "@/core/useCore";
import { Button, Card, InlineError, PageTitle } from "@/design/components";
import { Tuner } from "@/design/Tuner";
import { displayNoteName } from "@/music/noteNames";

export function FerramentasPage() {
  const core = useCore();
  const mic = usePitchInput();
  const naming = useSettings((state) => state.noteNaming);

  const reading = (() => {
    if (core.status !== "ready" || !mic.frame || mic.frame.silent || mic.frame.lowConfidence) return null;
    const midi = Math.round(69 + 12 * Math.log2(mic.frame.frequencyHz / 440));
    const reference = core.core.midiToFrequency(midi);
    return {
      note: displayNoteName(core.core.noteName(midi), naming),
      cents: core.core.centsBetween(mic.frame.frequencyHz, reference),
      frequencyHz: mic.frame.frequencyHz,
    };
  })();

  return (
    <>
      <PageTitle title="Ferramentas" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Afinador" className="grid gap-5">
          <Tuner noteLabel={reading?.note ?? null} cents={reading?.cents ?? null} frequencyHz={reading?.frequencyHz} />
          {mic.status.status === "error" ? <InlineError title="O microfone não abriu." nextStep={mic.status.message} /> : null}
          {mic.frame?.clipped ? <p className="text-caption text-off">O sinal está saturando. Afaste o microfone ou baixe o ganho.</p> : null}
          <div>
            {mic.status.status === "listening" ? (
              <Button onClick={() => void mic.stop()}>Parar</Button>
            ) : (
              <Button variant="primary" onClick={() => void mic.start()} disabled={mic.status.status === "starting" || core.status !== "ready"}>
                {mic.status.status === "starting" ? "Abrindo microfone…" : "Ouvir"}
              </Button>
            )}
          </div>
        </Card>

        <Card title="Teste de latência" className="grid gap-4">
          <p className="max-w-prose text-ink-muted">
            Mede quanto tempo o som leva do alto-falante até a detecção. Precisa ficar abaixo de 30 ms para o jogo responder no tempo.
          </p>
          <Link to="/ferramentas/latencia" className="font-semibold text-primary">
            Abrir o teste
          </Link>
        </Card>
      </div>
    </>
  );
}
