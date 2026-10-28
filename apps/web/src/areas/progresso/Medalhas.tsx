import { MAX_MEDAL_TIERS, medalSentence, medalsEarnedCount, TIER_NAMES, type MedalProgress, type MedalTier } from "@/data/medals";
import { Card } from "@/design/components";

const TIER_CLASS: Record<MedalTier, string> = {
  0: "bg-surface-sunken text-ink-subtle",
  1: "bg-close-soft text-ink",
  2: "bg-surface-soft text-ink",
  3: "bg-primary-soft text-primary",
};

function MedalBadge({ tier }: { tier: MedalTier }) {
  return (
    <span className={`grid size-12 shrink-0 place-items-center rounded-pill font-mono text-caption font-semibold tabular ${TIER_CLASS[tier]}`} aria-hidden>
      {tier === 0 ? "—" : tier}
    </span>
  );
}

function tierLabel(tier: MedalTier): string {
  return tier === 0 ? "Ainda sem medalha" : TIER_NAMES[tier];
}

export function Medalhas({ medals }: { medals: readonly MedalProgress[] }) {
  return (
    <Card title="Medalhas" className="grid gap-3">
      <p className="max-w-prose text-body text-ink-muted">Medalha é lembrança do caminho, não chave de nada: nenhuma tela ou som depende dela.</p>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Medalhas">
        {medals.map((medal) => (
          <li key={medal.definition.id} className="flex items-start gap-3 rounded-md bg-surface-soft p-3" aria-label={`${medal.definition.name}: ${tierLabel(medal.tier)}`}>
            <MedalBadge tier={medal.tier} />
            <span className="grid gap-0.5">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className={`font-semibold ${medal.tier === 0 ? "text-ink-muted" : "text-ink"}`}>{medal.definition.name}</span>
                <span className="text-caption text-ink-subtle">{tierLabel(medal.tier)}</span>
              </span>
              <span className="text-caption text-ink-subtle">{medal.definition.description}</span>
              <span className="text-caption text-ink-muted">{medalSentence(medal)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-caption text-ink-subtle">
        {medalsEarnedCount(medals)} de {MAX_MEDAL_TIERS} níveis de medalha
      </p>
    </Card>
  );
}
