import { useEffect, useRef, useState } from "react";

import type { Subdivision } from "@/audio/clickTrack";
import { CLICK_SOUNDS, type ClickSound } from "@/audio/metronome";
import { clampBpm, TEMPO_MAX_BPM, TEMPO_MIN_BPM, TempoClock, type ProgressivePlan, type TempoClockSettings } from "@/audio/tempoClock";
import { Button, Card, PageTitle } from "@/design/components";

const BEATS_OPTIONS = [2, 3, 4, 6] as const;
const SUBDIVISIONS: { value: Subdivision; label: string }[] = [
  { value: 1, label: "Semínima" },
  { value: 2, label: "Colcheias" },
  { value: 3, label: "Tercinas" },
  { value: 4, label: "Semicolcheias" },
];
const DEFAULT_PLAN: ProgressivePlan = { fromBpm: 60, toBpm: 90, stepBpm: 4, everyMeasures: 8 };
const FIELD_CLASS = "h-10 rounded-md border border-hairline bg-surface px-3 text-body";

const MAX_EVERY_MEASURES = 64;

function clampPlanField(key: keyof ProgressivePlan, raw: number): number {
  if (key === "everyMeasures") return Math.min(MAX_EVERY_MEASURES, Math.max(1, Math.round(raw) || 1));
  if (key === "stepBpm") return Math.max(1, Math.round(raw) || 1);
  return clampBpm(raw || TEMPO_MIN_BPM);
}

function pillClass(active: boolean): string {
  return `inline-flex h-10 items-center rounded-pill px-4 font-medium transition-colors ${active ? "bg-primary-soft text-primary" : "bg-surface-soft text-ink-muted hover:text-ink"}`;
}

export function MetronomoPage() {
  const [settings, setSettings] = useState<TempoClockSettings>({ bpm: 72, beatsPerMeasure: 4, subdivision: 1, accentFirstBeat: true, sound: "madeira", progressive: null });
  const [plan, setPlan] = useState<ProgressivePlan>(DEFAULT_PLAN);
  const [isRunning, setIsRunning] = useState(false);
  const [live, setLive] = useState<{ measure: number; bpm: number } | null>(null);
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
      setLive(null);
      return;
    }
    if (!clockRef.current) {
      const clock = new TempoClock(settings);
      clock.onMeasure((measure, bpm) => setLive({ measure, bpm }));
      clockRef.current = clock;
    }
    await clockRef.current.start();
    setIsRunning(true);
  }

  const isProgressive = settings.progressive !== null;

  return (
    <>
      <PageTitle title="Metrônomo" eyebrow="Ferramentas" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="grid place-items-center gap-5">
          <div className="grid place-items-center gap-1">
            <span className="font-mono text-display tabular">{isProgressive && live ? live.bpm : settings.bpm}</span>
            <span className="text-caption text-ink-subtle">{isProgressive && live ? `bpm · compasso ${live.measure + 1}` : "bpm"}</span>
          </div>
          <input type="range" min={TEMPO_MIN_BPM} max={TEMPO_MAX_BPM} value={settings.bpm} className="w-full accent-primary" aria-label="Andamento" onChange={(event) => patch({ bpm: clampBpm(Number(event.target.value)) })} disabled={isProgressive} />
          <div className="flex gap-2">
            {[-5, -1, 1, 5].map((delta) => (
              <Button key={delta} className="h-10 w-14 md:h-10" onClick={() => patch({ bpm: clampBpm(settings.bpm + delta) })} disabled={isProgressive}>
                {delta > 0 ? `+${delta}` : delta}
              </Button>
            ))}
          </div>
          <Button variant="primary" onClick={() => void toggle()}>
            {isRunning ? "Parar" : "Começar"}
          </Button>
        </Card>
        <div className="grid content-start gap-6">
          <Card title="Compasso" className="grid gap-3">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tempos por compasso">
              {BEATS_OPTIONS.map((beats) => (
                <button key={beats} type="button" role="radio" aria-checked={settings.beatsPerMeasure === beats} className={pillClass(settings.beatsPerMeasure === beats)} onClick={() => patch({ beatsPerMeasure: beats })}>
                  {beats}/4
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Subdivisão">
              {SUBDIVISIONS.map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={settings.subdivision === option.value} className={pillClass(settings.subdivision === option.value)} onClick={() => patch({ subdivision: option.value })}>
                  {option.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-5 accent-primary" checked={settings.accentFirstBeat} onChange={(event) => patch({ accentFirstBeat: event.target.checked })} />
              Acentuar o primeiro tempo
            </label>
            <select className={FIELD_CLASS} value={settings.sound} aria-label="Som" onChange={(event) => patch({ sound: event.target.value as ClickSound })}>
              {(Object.keys(CLICK_SOUNDS) as ClickSound[]).map((sound) => (
                <option key={sound} value={sound}>
                  {CLICK_SOUNDS[sound].label}
                </option>
              ))}
            </select>
          </Card>
          <Card title="Andamento progressivo" className="grid gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-5 accent-primary" checked={isProgressive} onChange={(event) => patch({ progressive: event.target.checked ? plan : null })} />
              Subir aos poucos, do jeito que se estuda escala de velocidade
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["fromBpm", "De"],
                  ["toBpm", "Até"],
                  ["stepBpm", "Passo"],
                  ["everyMeasures", "A cada N compassos"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="grid gap-1 text-caption text-ink-subtle">
                  {label}
                  <input
                    type="number"
                    className={FIELD_CLASS}
                    value={plan[key]}
                    min={key === "everyMeasures" || key === "stepBpm" ? 1 : TEMPO_MIN_BPM}
                    max={key === "everyMeasures" ? MAX_EVERY_MEASURES : TEMPO_MAX_BPM}
                    onChange={(event) => {
                      const next = { ...plan, [key]: clampPlanField(key, Number(event.target.value)) };
                      setPlan(next);
                      if (isProgressive) patch({ progressive: next });
                    }}
                  />
                </label>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
