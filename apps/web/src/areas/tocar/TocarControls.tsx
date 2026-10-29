import type { MeasureRange, Score } from "@fretless/core";

import { useSettings } from "@/app/settings";
import type { Subdivision } from "@/audio/clickTrack";
import { CLICK_SOUNDS, type ClickSound } from "@/audio/metronome";
import { Button } from "@/design/components";

import { HARD_MEASURE_ACCURACY_PCT } from "./measureMap";
import { BPM_STEP, type TempoLimits } from "./tempo";
import { PAGE_STYLE_OPTIONS, READING_GUIDE_OPTIONS, VIEW_OPTIONS } from "./viewOptions";

interface TocarControlsProps {
  score: Score;
  fullMeasureCount: number;
  limits: TempoLimits;
  bpm: number;
  loop: MeasureRange | null;
  droneOn: boolean;
  droneLabel: string;
  onBpm: (bpm: number) => void;
  onLoop: (range: MeasureRange | null) => void;
  onDrone: (on: boolean) => void;
}

const SUBDIVISIONS: { value: Subdivision; label: string }[] = [
  { value: 1, label: "Tempo" },
  { value: 2, label: "Colcheias" },
  { value: 3, label: "Tercinas" },
  { value: 4, label: "Semicolcheias" },
];

const toggleClass =(on: boolean) =>
  `inline-flex h-9 items-center gap-2 rounded-pill px-4 text-caption font-semibold transition-colors duration-fast ease-spalla ${
    on ? "bg-primary text-on-primary" : "bg-surface-soft text-ink-muted hover:text-ink"
  }`;

export function TocarControls({ score, fullMeasureCount, limits, bpm, loop, droneOn, droneLabel, onBpm, onLoop, onDrone }: TocarControlsProps) {
  const prefs = useSettings();
  const first = loop?.firstIndex ?? 0;
  const last = loop?.lastIndex ?? fullMeasureCount - 1;
  const measureOptions = Array.from({ length: fullMeasureCount }, (_, index) => index);

  return (
    <section className="grid gap-4 rounded-lg bg-surface p-4 shadow-card md:grid-cols-[auto_1fr_auto] md:items-start" aria-label="Controles da prática">
      <div className="grid gap-1">
        <span className="text-caption text-ink-subtle">Andamento</span>
        <div className="flex items-center gap-2">
          <Button aria-label={`Diminuir ${BPM_STEP} bpm`} className="h-9 w-9 px-0 md:h-9" onClick={() => onBpm(bpm - BPM_STEP)} disabled={bpm <= limits.minBpm}>
            −
          </Button>
          <span className="w-20 text-center font-mono text-numeric tabular">{bpm}</span>
          <Button aria-label={`Aumentar ${BPM_STEP} bpm`} className="h-9 w-9 px-0 md:h-9" onClick={() => onBpm(bpm + BPM_STEP)} disabled={bpm >= limits.maxBpm}>
            +
          </Button>
        </div>
        <span className="text-caption text-ink-subtle">
          {bpm === limits.writtenBpm ? "Andamento escrito" : `Escrito: ${limits.writtenBpm} bpm`}
        </span>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={prefs.metronomeOn} className={toggleClass(prefs.metronomeOn)} onClick={() => prefs.setPracticeAudio({ metronomeOn: !prefs.metronomeOn })}>
            Metrônomo
          </button>
          <button type="button" aria-pressed={droneOn} className={toggleClass(droneOn)} onClick={() => onDrone(!droneOn)}>
            Nota pedal {droneLabel}
          </button>
          <button type="button" aria-pressed={loop !== null} className={toggleClass(loop !== null)} onClick={() => onLoop(loop ? null : { firstIndex: first, lastIndex: last })} disabled={fullMeasureCount < 2}>
            Repetir trecho
          </button>
          <button
            type="button"
            aria-pressed={prefs.autoSlowdown}
            title={`Quando um compasso sai com menos de ${HARD_MEASURE_ACCURACY_PCT}% de acerto, a próxima tentativa fica mais lenta`}
            className={toggleClass(prefs.autoSlowdown)}
            onClick={() => prefs.setPracticeAudio({ autoSlowdown: !prefs.autoSlowdown })}
          >
            Diminuir ao errar
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Vista">
          <span className="text-caption text-ink-subtle">Vista</span>
          {VIEW_OPTIONS.map((view) => (
            <button key={view.value} type="button" aria-pressed={prefs.playView === view.value} className={toggleClass(prefs.playView === view.value)} onClick={() => prefs.setPlayView(view.value)}>
              {view.label}
            </button>
          ))}
        </div>
        {prefs.playView === "pagina" ? (
          <>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Papel">
              <span className="text-caption text-ink-subtle">Papel</span>
              {PAGE_STYLE_OPTIONS.map((option) => (
                <button key={option.value} type="button" aria-pressed={prefs.pageStyle === option.value} className={toggleClass(prefs.pageStyle === option.value)} onClick={() => prefs.setPageStyle(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Guia de leitura">
              <span className="text-caption text-ink-subtle">Guia de leitura</span>
              {READING_GUIDE_OPTIONS.map((option) => (
                <button key={option.value} type="button" aria-pressed={prefs.readingGuide === option.value} className={toggleClass(prefs.readingGuide === option.value)} onClick={() => prefs.setReadingGuide(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {prefs.metronomeOn ? (
          <div className="flex flex-wrap items-center gap-3 text-caption">
            <label className="flex items-center gap-2">
              <span className="text-ink-subtle">Divisão</span>
              <select
                className="h-8 rounded-sm bg-surface-soft px-2 text-ink"
                value={prefs.metronomeSubdivision}
                onChange={(event) => prefs.setPracticeAudio({ metronomeSubdivision: Number(event.target.value) as Subdivision })}
              >
                {SUBDIVISIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-ink-subtle">Som</span>
              <select className="h-8 rounded-sm bg-surface-soft px-2 text-ink" value={prefs.metronomeSound} onChange={(event) => prefs.setPracticeAudio({ metronomeSound: event.target.value as ClickSound })}>
                {(Object.keys(CLICK_SOUNDS) as ClickSound[]).map((sound) => (
                  <option key={sound} value={sound}>
                    {CLICK_SOUNDS[sound].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-ink-subtle">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={prefs.metronomeVolume}
                className="accent-primary"
                onChange={(event) => prefs.setPracticeAudio({ metronomeVolume: Number(event.target.value) })}
              />
            </label>
          </div>
        ) : null}
        {loop ? (
          <div className="flex flex-wrap items-center gap-3 text-caption">
            <label className="flex items-center gap-2">
              <span className="text-ink-subtle">Do compasso</span>
              <select
                className="h-8 rounded-sm bg-surface-soft px-2 font-mono text-ink tabular"
                value={first}
                onChange={(event) => onLoop({ firstIndex: Number(event.target.value), lastIndex: Math.max(last, Number(event.target.value)) })}
              >
                {measureOptions.map((index) => (
                  <option key={index} value={index}>
                    {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-ink-subtle">ao</span>
              <select
                className="h-8 rounded-sm bg-surface-soft px-2 font-mono text-ink tabular"
                value={last}
                onChange={(event) => onLoop({ firstIndex: Math.min(first, Number(event.target.value)), lastIndex: Number(event.target.value) })}
              >
                {measureOptions.map((index) => (
                  <option key={index} value={index}>
                    {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-ink-subtle">
              {score.noteCount} notas · o trecho recomeça sozinho
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
