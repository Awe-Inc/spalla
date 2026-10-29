import { useEffect, useRef, useState } from "react";

import { OnsetDetector, playClick, summarize, verdict, type LatencySample } from "@/audio/latency";
import { usePitchInput } from "@/audio/usePitchInput";
import { useCore } from "@/core/useCore";
import { Button, Card, InlineError, PageHeader } from "@/design/components";

const CLICK_COUNT = 12;
const CLICK_INTERVAL_SEC = 0.8;

const VERDICT_LABEL = {
  aprovado: { text: "Aprovado: dá para jogar no tempo.", className: "text-in-tune" },
  limite: { text: "No limite: jogável, mas o retorno vai parecer um pouco atrasado.", className: "text-close" },
  reprovado: { text: "Reprovado: a latência é alta demais para julgar no tempo.", className: "text-off" },
} as const;

export function LatenciaPage() {
  const core = useCore();
  const mic = usePitchInput();
  const [samples, setSamples] = useState<LatencySample[]>([]);
  const [running, setRunning] = useState(false);
  const detectorRef = useRef(new OnsetDetector());
  const pendingClickRef = useRef<number | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (mic.status.status !== "listening") return;
    const input = mic.input.current;
    if (!input) return;
    return input.onFrame((frame) => {
      const heardAt = detectorRef.current.feed(frame);
      const clickAt = pendingClickRef.current;
      if (heardAt !== null && clickAt !== null && heardAt >= clickAt) {
        pendingClickRef.current = null;
        setSamples((previous) => [...previous, { clickAtSec: clickAt, heardAtSec: heardAt }]);
      }
    });
  }, [mic.status.status, mic.input]);

  async function run() {
    if (mic.status.status !== "listening" && !(await mic.start())) return;
    const input = mic.input.current;
    const context = input?.context;
    if (!input || !context) return;
    setSamples([]);
    setRunning(true);
    try {
      for (let index = 0; index < CLICK_COUNT; index += 1) {
        if (unmountedRef.current || input.context !== context || context.state === "closed") return;
        const at = context.currentTime + 0.15;
        pendingClickRef.current = at;
        playClick(context, at);
        await new Promise((resolve) => setTimeout(resolve, CLICK_INTERVAL_SEC * 1000));
      }
    } finally {
      pendingClickRef.current = null;
      if (!unmountedRef.current) setRunning(false);
    }
  }

  const report = summarize(samples);
  const info = mic.status.status === "listening" ? mic.status.info : null;

  return (
    <>
      <PageHeader back={{ to: "/voce/ajustes", label: "Ajustes" }} title="Atraso do som" description="Mede quanto tempo o som leva do violino até o app, para o julgamento das notas não atrasar." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Como funciona" className="grid gap-4">
          <p className="max-w-prose text-ink-muted">
            O app toca {CLICK_COUNT} cliques curtos no alto-falante e mede quando cada um chega ao microfone. Deixe o volume médio, sem fone, em um
            ambiente silencioso.
          </p>
          {mic.status.status === "error" ? <InlineError title="O microfone não abriu." nextStep={mic.status.message} /> : null}
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => void run()} disabled={running || core.status !== "ready" || mic.status.status === "starting"}>
              {running ? "Medindo…" : "Começar o teste"}
            </Button>
            {mic.status.status === "listening" ? <Button onClick={() => void mic.stop()}>Fechar microfone</Button> : null}
          </div>
          {info ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-caption text-ink-subtle">
              <dt>Taxa de amostragem</dt>
              <dd className="font-mono tabular">{info.sampleRate} Hz</dd>
              <dt>Latência base do navegador</dt>
              <dd className="font-mono tabular">{(info.baseLatencySec * 1000).toFixed(1)} ms</dd>
              <dt>Latência de saída</dt>
              <dd className="font-mono tabular">{(info.outputLatencySec * 1000).toFixed(1)} ms</dd>
              <dt>Janela de análise</dt>
              <dd className="font-mono tabular">{info.requiredSamples} amostras</dd>
            </dl>
          ) : null}
        </Card>

        <Card title="Resultado" className="grid gap-4">
          {report ? (
            <>
              <p className="font-mono text-numeric tabular">{report.meanMs.toFixed(1)} ms</p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-body">
                <dt className="text-ink-muted">Variação (jitter)</dt>
                <dd className="font-mono tabular">{report.jitterMs.toFixed(1)} ms</dd>
                <dt className="text-ink-muted">Mínimo / máximo</dt>
                <dd className="font-mono tabular">
                  {report.minMs.toFixed(1)} / {report.maxMs.toFixed(1)} ms
                </dd>
                <dt className="text-ink-muted">Cliques detectados</dt>
                <dd className="font-mono tabular">
                  {report.samples} de {CLICK_COUNT}
                </dd>
              </dl>
              {!running ? <p className={`font-semibold ${VERDICT_LABEL[verdict(report)].className}`}>{VERDICT_LABEL[verdict(report)].text}</p> : null}
            </>
          ) : (
            <p className="text-ink-muted">{running ? "Ouvindo os cliques…" : "Rode o teste para ver o número."}</p>
          )}
        </Card>
      </div>
    </>
  );
}
