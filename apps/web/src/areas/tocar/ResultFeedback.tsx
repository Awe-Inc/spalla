import type { MeasureRange } from "@fretless/core";
import { useState } from "react";

import type { NoteNaming } from "@/app/settings";
import { Button } from "@/design/components";

import { ERROR_KIND_LABELS, errorGroupSentence, groupErrors, measureSentence, measureTitle, type NoteError } from "./feedback";
import { measureTone, type MeasureStat } from "./measureMap";

const toneClass: Record<ReturnType<typeof measureTone>, string> = {
  unplayed: "bg-surface-soft text-ink-subtle",
  clean: "bg-in-tune-soft text-in-tune",
  shaky: "bg-close-soft text-close",
  hard: "bg-off-soft text-off",
};

export function ErrorSummary({ errors, naming }: { errors: readonly NoteError[]; naming: NoteNaming }) {
  const groups = groupErrors(errors);
  if (groups.length === 0) return null;
  return (
    <section className="grid w-full gap-2 text-left" aria-label="O que pegou nesta passada">
      <h3 className="text-small font-semibold text-ink-muted">O que pegou</h3>
      <dl className="grid gap-2">
        {groups.map((group) => (
          <div key={group.kind} className="grid gap-0.5">
            <dt className="text-small font-semibold text-ink">
              {ERROR_KIND_LABELS[group.kind]}: <span className="font-mono tabular">{group.count}</span> {group.count === 1 ? "nota" : "notas"}
            </dt>
            <dd className="text-small text-ink-muted">{errorGroupSentence(group, naming)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

interface MeasureMapProps {
  perMeasure: readonly MeasureStat[];
  errors: readonly NoteError[];
  naming: NoteNaming;
  onRepeat?: (range: MeasureRange) => void;
}

export function MeasureMap({ perMeasure, errors, naming, onRepeat }: MeasureMapProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selected = perMeasure.find((stat) => stat.measureIndex === selectedIndex) ?? null;
  return (
    <div className="grid w-full gap-2 text-left">
      <h3 className="text-small font-semibold text-ink-muted">Por compasso</h3>
      <ol className="flex flex-wrap gap-1.5" aria-label="Precisão por compasso">
        {perMeasure.map((stat) => (
          <li key={stat.measureIndex}>
            <button
              type="button"
              aria-pressed={stat.measureIndex === selectedIndex}
              aria-label={measureTitle(stat)}
              title={measureTitle(stat)}
              className={`grid h-12 w-12 place-content-center rounded-sm text-center font-mono text-caption tabular aria-pressed:ring-2 aria-pressed:ring-inset aria-pressed:ring-primary ${toneClass[measureTone(stat)]}`}
              onClick={() => setSelectedIndex(stat.measureIndex === selectedIndex ? null : stat.measureIndex)}
            >
              <span className="font-semibold">{stat.measureNumber}</span>
              <span aria-hidden>{stat.accuracyPct === null ? "—" : `${Math.round(stat.accuracyPct)}%`}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="text-small text-ink-muted" aria-live="polite">
        {selected ? measureSentence(selected, errors, naming) : "Toque num compasso para ver o que aconteceu nele."}
      </p>
      {selected && onRepeat && selected.accuracyPct !== null ? (
        <span>
          <Button icon="trecho" onClick={() => onRepeat({ firstIndex: selected.measureIndex, lastIndex: selected.measureIndex })}>
            Repetir o compasso {selected.measureNumber}
          </Button>
        </span>
      ) : null}
    </div>
  );
}
