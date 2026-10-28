import { COMBO_MULTIPLIER_AT } from "@/data/gamification";

interface ComboBarProps {
  combo: number;
}

export function ComboBar({ combo }: ComboBarProps) {
  const ratio = Math.min(combo / COMBO_MULTIPLIER_AT, 1);
  const doubled = combo >= COMBO_MULTIPLIER_AT;
  return (
    <div className="grid gap-1" aria-label={`Sequência de ${combo} notas`}>
      <div className="flex items-baseline justify-between text-caption">
        <span className="text-ink-subtle">Sequência</span>
        <span className={`font-mono tabular ${doubled ? "text-primary" : "text-ink"}`}>{doubled ? `${combo} · XP em dobro` : combo}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
        <div
          className={`h-full rounded-pill transition-transform duration-fast ease-fretless ${doubled ? "bg-primary" : "bg-in-tune"}`}
          style={{ transform: `scaleX(${ratio})`, transformOrigin: "left" }}
        />
      </div>
    </div>
  );
}
