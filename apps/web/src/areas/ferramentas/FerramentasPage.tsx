import { Link } from "react-router";

import { Card, PageTitle } from "@/design/components";

const TOOLS = [
  { to: "/ferramentas/afinador", title: "Afinador", description: "Tela inteira, nota grande, mostrador de cents e referência de cada corda." },
  { to: "/ferramentas/metronomo", title: "Metrônomo", description: "Compasso, subdivisão, acento e andamento progressivo para escalas de velocidade." },
  { to: "/ferramentas/pedal", title: "Nota pedal", description: "Um bordão para afinar por cima: nota, oitava, timbre e volume." },
  { to: "/ferramentas/gravador", title: "Gravador", description: "Grave uma passada, ouça logo depois e compare duas gravações da mesma peça." },
  { to: "/ferramentas/latencia", title: "Teste de latência", description: "Mede o atraso do som até a detecção, para o jogo julgar o ritmo no tempo certo." },
] as const;

export function FerramentasPage() {
  return (
    <>
      <PageTitle title="Ferramentas" />
      <ul className="grid gap-4 md:grid-cols-2">
        {TOOLS.map((tool) => (
          <li key={tool.to}>
            <Link to={tool.to} className="block rounded-lg transition-transform duration-fast ease-spalla hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-primary">
              <Card as="article" className="grid h-full gap-2">
                <h2 className="text-heading font-semibold">{tool.title}</h2>
                <p className="text-ink-muted">{tool.description}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
