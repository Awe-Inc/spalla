import type { PracticeDay } from "@/data/db";
import { heatLevel, heatmapWeeks } from "@/data/calendar";
import { Card } from "@/design/components";

const LEVEL_CLASS = ["bg-surface-sunken", "bg-primary-soft", "bg-primary/60", "bg-primary"] as const;
const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

export function Heatmap({ days, today }: { days: readonly PracticeDay[]; today: Date }) {
  const weeks = heatmapWeeks(days, today);
  const activeDays = days.filter((day) => day.minutes > 0).length;
  return (
    <Card title="Últimas 12 semanas" className="grid gap-3">
      <div className="flex gap-2">
        <ul className="grid grid-rows-7 gap-1 text-caption text-ink-subtle" aria-hidden>
          {WEEKDAY_LABELS.map((label, index) => (
            <li key={index} className="flex h-4 items-center">
              {index % 2 === 1 ? label : ""}
            </li>
          ))}
        </ul>
        <ol className="flex flex-1 gap-1 overflow-x-auto" aria-label="Dias praticados">
          {weeks.map((week) => (
            <li key={week[0]!.day} className="grid grid-rows-7 gap-1">
              {week.map((cell) => (
                <span
                  key={cell.day}
                  className={`size-4 rounded-sm ${cell.isFuture ? "opacity-0" : LEVEL_CLASS[heatLevel(cell)]}`}
                  title={cell.isFuture ? undefined : `${cell.day}: ${Math.round(cell.minutes)} min · ${cell.xp} XP`}
                  role="img"
                  aria-label={cell.isFuture ? undefined : `${cell.day}: ${Math.round(cell.minutes)} minutos`}
                />
              ))}
            </li>
          ))}
        </ol>
      </div>
      <p className="text-caption text-ink-subtle">
        {activeDays} {activeDays === 1 ? "dia praticado" : "dias praticados"} · quadrado cheio é meta batida
      </p>
    </Card>
  );
}
