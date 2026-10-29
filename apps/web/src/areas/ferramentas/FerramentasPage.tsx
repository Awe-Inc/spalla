import { Link } from "react-router";

import { ButtonLink, Card } from "@/design/components";
import { Icon, type IconName } from "@/design/icons";
import { List, ListRow, PageHeader } from "@/design/layout";

const TUNER_PATH = "/ferramentas/afinador";

const TOOLS: readonly { to: string; title: string; description: string; icon: IconName }[] = [
  { to: "/ferramentas/metronomo", title: "Metrônomo", description: "Compasso, subdivisão, acento e andamento progressivo.", icon: "metronomo" },
  { to: "/ferramentas/pedal", title: "Nota pedal", description: "Um bordão para afinar por cima: nota, oitava, timbre e volume.", icon: "nota" },
  { to: "/ferramentas/gravador", title: "Gravador", description: "Grave uma passada, ouça logo depois e compare com a anterior.", icon: "gravar" },
];

function ToolIcon({ name }: { name: IconName }) {
  return (
    <span className="grid size-10 place-items-center rounded-sm bg-surface-soft text-ink-muted ring-1 ring-inset ring-hairline">
      <Icon name={name} className="size-5" />
    </span>
  );
}

function TunerHero() {
  return (
    <Card tone="hero" as="article" className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
      <span className="grid size-16 place-items-center rounded-lg bg-primary-soft text-primary" aria-hidden>
        <Icon name="ferramentas" className="size-8" />
      </span>
      <div className="grid min-w-0 gap-1">
        <h2 className="font-display text-title">
          <Link to={TUNER_PATH} className="hover:text-primary focus-visible:outline-none">
            Afinador
          </Link>
        </h2>
        <p className="max-w-prose text-ink-muted">Nota grande, mostrador de cents e a referência de cada corda para afinar por cima.</p>
      </div>
      <ButtonLink to={TUNER_PATH} variant="primary" size="lg" icon="ouvir">
        Abrir afinador
      </ButtonLink>
    </Card>
  );
}

export function FerramentasPage() {
  return (
    <>
      <PageHeader title="Ferramentas" description="Para usar junto com o estudo, com ou sem rotina." />
      <div className="grid max-w-3xl gap-6">
        <TunerHero />
        <List label="Outras ferramentas">
          {TOOLS.map((tool) => (
            <ListRow key={tool.to} to={tool.to} leading={<ToolIcon name={tool.icon} />} title={tool.title} meta={tool.description} />
          ))}
        </List>
      </div>
    </>
  );
}
