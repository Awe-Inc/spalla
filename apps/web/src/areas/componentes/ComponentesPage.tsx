import type { ReactNode } from "react";
import { useSearchParams } from "react-router";

import { PageHeader, Tabs } from "@/design/layout";

import { AcoesSection, AvisosSection, EstruturaSection, FormularioSection, ProgressoSection } from "./ComponentesSection";
import { CoresSection, FormaSection, TemasSection, TipografiaSection } from "./TokensSection";

const ABAS: readonly { id: string; label: string; render: () => ReactNode }[] = [
  {
    id: "cores",
    label: "Cores e temas",
    render: () => (
      <>
        <CoresSection />
        <TemasSection />
      </>
    ),
  },
  { id: "tipografia", label: "Tipografia", render: () => <TipografiaSection /> },
  { id: "forma", label: "Forma e movimento", render: () => <FormaSection /> },
  { id: "acoes", label: "Ações e ícones", render: () => <AcoesSection /> },
  { id: "estrutura", label: "Estrutura", render: () => <EstruturaSection /> },
  { id: "formulario", label: "Formulário", render: () => <FormularioSection /> },
  { id: "progresso", label: "Progresso", render: () => <ProgressoSection /> },
  { id: "avisos", label: "Avisos", render: () => <AvisosSection /> },
];

export function ComponentesPage() {
  const [params] = useSearchParams();
  const current = ABAS.find((aba) => aba.id === params.get("aba")) ?? ABAS[0]!;
  return (
    <>
      <PageHeader title="Design system" description="Tokens e componentes do Spalla. Antes de criar algo novo, procure o equivalente aqui." />
      <Tabs label="Partes do design system" items={ABAS.map((aba) => ({ to: `?aba=${aba.id}`, label: aba.label, active: aba.id === current.id }))} />
      <div className="grid gap-6">{current.render()}</div>
    </>
  );
}
