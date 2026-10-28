import { PageTitle } from "@/design/components";

import { ComponentesSection } from "./ComponentesSection";
import { CoresSection, FormaSection, TemasSection, TipografiaSection } from "./TokensSection";

export function ComponentesPage() {
  return (
    <>
      <PageTitle eyebrow="Design system" title="Componentes e tokens" />
      <div className="grid gap-6">
        <CoresSection />
        <TemasSection />
        <TipografiaSection />
        <FormaSection />
        <ComponentesSection />
      </div>
    </>
  );
}
