import type { Achievement } from "@/data/db";
import { ACHIEVEMENTS } from "@/data/gamification";
import { Card } from "@/design/components";

function unlockedLabel(unlockedAt: number): string {
  return new Date(unlockedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function Conquistas({ unlocked }: { unlocked: readonly Achievement[] }) {
  const byId = new Map(unlocked.map((achievement) => [achievement.id, achievement]));
  return (
    <Card title="Conquistas" className="grid gap-3">
      <ul className="grid gap-2 sm:grid-cols-2">
        {ACHIEVEMENTS.map((definition) => {
          const earned = byId.get(definition.id);
          return (
            <li key={definition.id} className={`grid gap-0.5 rounded-md p-3 ${earned ? "bg-primary-soft" : "bg-surface-soft"}`}>
              <span className={`font-semibold ${earned ? "text-primary" : "text-ink-muted"}`}>{definition.name}</span>
              <span className="text-caption text-ink-subtle">{definition.description}</span>
              {earned ? <span className="text-caption text-primary">Desbloqueada em {unlockedLabel(earned.unlockedAt)}</span> : null}
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-ink-subtle">
        {unlocked.length} de {ACHIEVEMENTS.length}
      </p>
    </Card>
  );
}
