import type { MeasureRange, Score } from "@fretless/core";

import { useLiveQuery } from "dexie-react-hooks";

import { useSettings } from "@/app/settings";
import type { Subdivision } from "@/audio/clickTrack";
import { CLICK_SOUNDS, type ClickSound } from "@/audio/metronome";
import { db, DEFAULT_USER_STATS } from "@/data/db";
import { Button } from "@/design/components";

import { BPM_STEP, type TempoLimits } from "./tempo";

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

const FREE_CLICK_SOUND: ClickSound = "madeira";

const toggleClass = (on: boolean) =>
  `inline-flex h-9 items-center gap-2 rounded-pill px-4 text-caption font-semibold transition-colors duration-fast ease-fretless ${
    on ? "bg-primary text-on-primary" : "bg-surface-soft text-ink-muted hover:text-ink"
  }`;

export function TocarControls({ score, fullMeasureCount, limits, bpm, loop, droneOn, droneLabel, onBpm, onLoop, onDrone }: TocarControlsProps) {
  const prefs = useSettings();
  const unlockedItems = useLiveQuery(() => db.userStats.get("me"), [])?.unlockedItems ?? DEFAULT_USER_STATS.unlockedItems;
  const soundUnlocked = (sound: ClickSound) => sound === FREE_CLICK_SOUND || unlockedItems.includes(`sound:${sound}`);
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
        </div>
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
                  <option key={sound} value={sound} disabled={!soundUnlocked(sound)}>
                    {CLICK_SOUNDS[sound].label}
                    {soundUnlocked(sound) ? "" : " (na loja)"}
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
