import { formatCents } from "@/music/noteNames";

interface TunerProps {
  noteLabel: string | null;
  cents: number | null;
  frequencyHz?: number;
  compact?: boolean;
}

const RANGE_CENTS = 50;

function toneClass(cents: number): string {
  const magnitude = Math.abs(cents);
  if (magnitude <= 5) return "bg-in-tune";
  if (magnitude <= 15) return "bg-close";
  return "bg-off";
}

export function Tuner({ noteLabel, cents, frequencyHz, compact = false }: TunerProps) {
  const clamped = cents === null ? 0 : Math.max(-RANGE_CENTS, Math.min(RANGE_CENTS, cents));
  const position = 50 + (clamped / RANGE_CENTS) * 50;
  return (
    <div className="grid gap-3" role="group" aria-label="Afinador">
      <div className="flex items-baseline justify-between gap-4">
        <span className={`font-display ${compact ? "text-title" : "text-display"}`}>{noteLabel ?? "—"}</span>
        <span className={`text-body text-ink-muted tabular ${cents === null ? "" : "font-mono"}`}>
          {cents === null ? "toque uma nota" : formatCents(cents)}
          {frequencyHz && cents !== null ? ` · ${frequencyHz.toFixed(1)} Hz` : ""}
        </span>
      </div>
      <div className="relative h-3 rounded-pill bg-surface-sunken">
        <span className="absolute inset-y-0 left-1/2 w-px bg-hairline-strong" aria-hidden />
        <span className="absolute inset-y-0 left-[45%] w-[10%] rounded-pill bg-in-tune-soft" aria-hidden />
        {cents !== null ? (
          <span
            className={`absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-raised transition-[left] duration-fast ease-spalla ${toneClass(cents)}`}
            style={{ left: `${position}%` }}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}
