import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { useSettings } from "@/app/settings";
import { listInputDevices } from "@/audio/PitchInput";
import { usePitchInput } from "@/audio/usePitchInput";
import { useCore } from "@/core/useCore";
import { setDailyGoal } from "@/data/progress";
import { DEFAULT_ROUTINE_MINUTES } from "@/data/routines";
import { requestPersistentStorage } from "@/data/storageUsage";
import { Wordmark } from "@/design/brand";
import { Button, InlineError } from "@/design/components";
import { FIELD_CLASS } from "@/design/fields";
import { Tuner } from "@/design/Tuner";
import { tunerReading } from "@/music/tunerReading";

const STEPS = ["Boas-vindas", "Tempo", "Microfone", "Meta", "Pronto"] as const;
const GOAL_OPTIONS = [
  { xp: 30, label: "Leve", hint: "Um exercício bem feito por dia." },
  { xp: 60, label: "Constante", hint: "A sessão inteira, quase todo dia." },
  { xp: 100, label: "Intensa", hint: "Sessão completa e mais uma música." },
] as const;

function choiceClass(active: boolean): string {
  return `grid gap-1 rounded-md p-4 text-left transition-colors duration-fast ease-spalla ${active ? "bg-primary-soft text-primary" : "bg-surface-soft text-ink hover:bg-surface-sunken"}`;
}

function StepList({ current }: { current: number }) {
  return (
    <ol className="hidden gap-1 lg:grid" aria-label="Etapas">
      {STEPS.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "next";
        return (
          <li key={step} aria-current={state === "current" ? "step" : undefined} className={`flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-fast ease-spalla ${state === "current" ? "bg-surface text-ink shadow-card" : "text-ink-muted"}`}>
            <span
              aria-hidden
              className={`grid size-7 place-items-center rounded-pill font-mono text-caption tabular ${state === "next" ? "ring-1 ring-inset ring-hairline-strong" : "bg-primary text-on-primary"}`}
            >
              {state === "done" ? "✓" : index + 1}
            </span>
            <span className={state === "current" ? "font-semibold" : ""}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

function StepBar({ current }: { current: number }) {
  return (
    <div className="grid gap-2 lg:hidden">
      <p className="text-small text-ink-muted">
        Passo {current + 1} de {STEPS.length}: <span className="text-ink">{STEPS[current]}</span>
      </p>
      <div className="flex gap-1.5" aria-hidden>
        {STEPS.map((step, index) => (
          <span key={step} className={`h-1 flex-1 rounded-pill ${index <= current ? "bg-primary" : "bg-surface-sunken"}`} />
        ))}
      </div>
    </div>
  );
}

function MicStep() {
  const core = useCore();
  const mic = usePitchInput();
  const settings = useSettings();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (mic.status.status !== "listening" || !navigator.mediaDevices) return;
    listInputDevices()
      .then(setDevices)
      .catch(() => setDevices([]));
  }, [mic.status.status]);

  const reading = core.status === "ready" ? tunerReading(core.core, mic.frame, settings.noteNaming) : null;

  return (
    <div className="grid gap-4">
      <p className="text-ink-muted">Toque uma corda solta. Se a agulha se mexer, o Spalla está ouvindo você.</p>
      <Tuner noteLabel={reading?.note ?? null} cents={reading?.cents ?? null} />
      {mic.status.status === "error" ? <InlineError title="O microfone não abriu." nextStep={mic.status.message} /> : null}
      {devices.length > 1 ? (
        <select
          className={FIELD_CLASS}
          value={settings.inputDeviceId ?? ""}
          onChange={(event) => settings.setInputDevice(event.target.value || null)}
          aria-label="Microfone"
        >
          <option value="">Padrão do sistema</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || "Microfone sem nome"}
            </option>
          ))}
        </select>
      ) : null}
      <div>
        {mic.status.status === "listening" ? (
          <Button onClick={() => void mic.stop()}>Parar</Button>
        ) : (
          <Button variant="primary" onClick={() => void mic.start()} disabled={mic.status.status === "starting" || core.status !== "ready"}>
            {mic.status.status === "starting" ? "Abrindo microfone…" : "Ligar o microfone"}
          </Button>
        )}
      </div>
    </div>
  );
}

export function BoasVindasPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [step, setStep] = useState(0);
  const [goalXp, setGoalXp] = useState<number>(60);
  const isLast = step === STEPS.length - 1;

  async function finish() {
    try {
      void requestPersistentStorage();
      await setDailyGoal(goalXp);
    } finally {
      settings.completeOnboarding();
      await navigate("/", { replace: true });
    }
  }

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-canvas text-ink lg:grid-cols-[18rem_1fr] lg:grid-rows-none">
      <aside className="flex flex-col gap-10 border-hairline bg-surface-sunken px-4 py-6 lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:px-6 lg:py-10">
        <Wordmark />
        <StepList current={step} />
        <p className="mt-auto hidden max-w-[28ch] text-small text-ink-subtle lg:block">Tudo fica neste aparelho. Dá para mudar cada escolha depois.</p>
      </aside>
      <main className="grid min-w-0 items-start justify-items-center px-4 py-8 md:px-10 lg:items-center">
        <section key={step} className="grid w-full max-w-xl animate-rise gap-8 rounded-xl bg-surface p-6 shadow-card ring-1 ring-hairline/60 md:p-10">
          <StepBar current={step} />
          {step === 0 ? (
            <div className="grid gap-3">
              <h1 className="font-display text-display">Bem-vindo ao Spalla.</h1>
              <p className="max-w-prose text-ink-muted">
                Um método de estudo de violino que ouve você tocar. Cada dia tem uma sessão curta, montada a partir do que você já tocou: aquecimento, afinação, escalas,
                técnica e música. Leva dois minutos para configurar.
              </p>
            </div>
          ) : null}
          {step === 1 ? (
            <div className="grid gap-3">
              <h1 className="font-display text-title">Quanto tempo por dia?</h1>
              <p className="text-ink-muted">Isso define a rotina padrão. Dá para trocar depois em Estudar.</p>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Minutos por dia">
                {([15, 25, 45] as const).map((minutes) => {
                  const active = settings.routineId === -minutes;
                  const blocks = Object.values(DEFAULT_ROUTINE_MINUTES[minutes]).filter(Boolean).length;
                  return (
                    <button key={minutes} type="button" role="radio" aria-checked={active} className={choiceClass(active)} onClick={() => settings.setRoutine(-minutes)}>
                      <span className="font-mono text-numeric tabular">{minutes}</span>
                      <span className="text-caption text-ink-subtle">min · {blocks} blocos</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {step === 2 ? (
            <div className="grid gap-3">
              <h1 className="font-display text-title">Vamos ouvir o violino.</h1>
              <MicStep />
              <p className="text-caption text-ink-subtle">
                Nada aparece? Dá para pular e ajustar depois em Você, na aba Ajustes, onde também fica o{" "}
                <Link to="/voce/ajustes/atraso" className="font-semibold text-primary underline-offset-4 hover:underline">
                  teste de atraso do som
                </Link>
                .
              </p>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="grid gap-3">
              <h1 className="font-display text-title">Sua meta diária</h1>
              <p className="text-ink-muted">Cada nota afinada vale XP. Bater a meta mantém a sequência de dias viva.</p>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Meta diária">
                {GOAL_OPTIONS.map((option) => (
                  <button key={option.xp} type="button" role="radio" aria-checked={goalXp === option.xp} className={choiceClass(goalXp === option.xp)} onClick={() => setGoalXp(option.xp)}>
                    <span className="font-semibold">{option.label}</span>
                    <span className="font-mono text-caption tabular">{option.xp} XP</span>
                    <span className="text-caption text-ink-subtle">{option.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {step === 4 ? (
            <div className="grid gap-3">
              <h1 className="font-display text-title">Tudo pronto.</h1>
              <p className="max-w-prose text-ink-muted">A sessão de hoje já está montada na tela Hoje. Pegue o violino, use fone quando houver nota pedal e comece pelo aquecimento.</p>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 border-t border-hairline pt-6">
            <Button variant="ghost" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>
              Voltar
            </Button>
            {isLast ? (
              <Button variant="primary" onClick={() => void finish()}>
                Começar agora
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setStep((current) => current + 1)}>
                {step === 2 ? "Continuar" : "Próximo"}
              </Button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
