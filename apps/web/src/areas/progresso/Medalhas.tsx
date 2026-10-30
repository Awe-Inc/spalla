import {
  MAX_MEDAL_TIERS,
  MEDAL_GROUPS,
  medalSentence,
  medalShare,
  medalsEarnedCount,
  missingSentence,
  nearestMedals,
  rankOf,
  rankSentence,
  TIER_NAMES,
  type MedalProgress,
  type MedalTier,
} from "@/data/medals";
import { Card } from "@/design/components";

const TIER_CLASS: Record<MedalTier, string> = {
  0: "bg-surface-sunken text-ink-subtle",
  1: "bg-close-soft text-ink",
  2: "bg-surface-soft text-ink",
  3: "bg-primary-soft text-primary",
};

const NEAREST_SHOWN = 3;

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

function ShareBar({ medal }: { medal: MedalProgress }) {
  const percent = Math.round(medalShare(medal) * 100);
  return (
    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunken" aria-hidden>
      <span className="block h-full rounded-pill bg-primary" style={{ width: `${percent}%` }} />
    </span>
  );
}

function RankBanner({ medals }: { medals: readonly MedalProgress[] }) {
  const rank = rankOf(medalsEarnedCount(medals));
  const nearest = nearestMedals(medals, NEAREST_SHOWN);
  return (
    <div className="grid gap-3 rounded-lg bg-primary-soft p-4 sm:grid-cols-2" aria-label="Sua patente" role="group">
      <div className="grid content-start gap-1">
        <span className="text-caption text-ink-muted">Sua patente na orquestra</span>
        <span className="font-display text-title text-ink">{rank.current.title}</span>
        <span className="text-small text-ink-muted">{rank.current.description}</span>
        <span className="text-small font-semibold text-primary">{rankSentence(rank)}</span>
      </div>
      {nearest.length > 0 ? (
        <div className="grid content-start gap-1">
          <span className="text-caption text-ink-muted">Mais perto da próxima</span>
          <ul className="grid gap-1" aria-label="Medalhas mais perto">
            {nearest.map((medal) => (
              <li key={medal.definition.id} className="text-small text-ink">
                {missingSentence(medal)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function Medalhas({ medals }: { medals: readonly MedalProgress[] }) {
  return (
    <Card title="Medalhas" className="grid gap-4">
      <p className="max-w-prose text-body text-ink-muted">
        Cada medalha tem bronze, prata e ouro. Cada nível conquistado sobe sua patente. Nada fica trancado: é lembrança do caminho.
      </p>
      <RankBanner medals={medals} />
      {MEDAL_GROUPS.map((group) => (
        <section key={group.id} className="grid gap-2" aria-labelledby={`medalhas-${group.id}`}>
          <div className="grid gap-0.5">
            <h3 id={`medalhas-${group.id}`} className="text-heading font-semibold text-ink">
              {group.title}
            </h3>
            <p className="text-small text-ink-subtle">{group.description}</p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label={group.title}>
            {medals
              .filter((medal) => medal.definition.group === group.id)
              .map((medal) => (
                <li key={medal.definition.id} className="flex items-start gap-3 rounded-md bg-surface-soft p-3" aria-label={`${medal.definition.name}: ${tierLabel(medal.tier)}`}>
                  <MedalBadge tier={medal.tier} />
                  <span className="grid w-full gap-0.5">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className={`font-semibold ${medal.tier === 0 ? "text-ink-muted" : "text-ink"}`}>{medal.definition.name}</span>
                      <span className="text-caption text-ink-subtle">{tierLabel(medal.tier)}</span>
                    </span>
                    <span className="text-caption text-ink-subtle">{medal.definition.description}</span>
                    <span className="text-caption text-ink-muted">{medalSentence(medal)}</span>
                    <ShareBar medal={medal} />
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <p className="text-caption text-ink-subtle">
        {medalsEarnedCount(medals)} de {MAX_MEDAL_TIERS} níveis de medalha
      </p>
    </Card>
  );
}
