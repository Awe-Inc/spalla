import type { ReactNode } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";

import { useApplyTheme } from "@/app/Shell";
import { ButtonLink } from "@/design/actions";
import { Wordmark } from "@/design/brand";

function StandalonePanel({ code, title, description, children }: { code: string; title: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="grid w-full max-w-md justify-items-start gap-6 rounded-xl bg-surface p-8 shadow-raised ring-1 ring-hairline/60 md:p-10">
        <Wordmark size="heading" />
        <div className="grid gap-3">
          <p className="font-mono text-small text-ink-subtle tabular">{code}</p>
          <h1 className="font-display text-title">{title}</h1>
          <p className="text-body text-ink-muted">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    </main>
  );
}

export function NaoEncontradaPage() {
  useApplyTheme();
  return (
    <StandalonePanel code="404" title="Esta página não existe." description="O endereço pode ter mudado de lugar. Volte para a sessão de hoje ou procure a peça no repertório.">
      <ButtonLink to="/" variant="primary" icon="hoje">
        Ir para Hoje
      </ButtonLink>
      <ButtonLink to="/repertorio" variant="secondary">
        Abrir o repertório
      </ButtonLink>
    </StandalonePanel>
  );
}

export function ErroDeRotaPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NaoEncontradaPage />;
  return <ErroInesperado />;
}

function ErroInesperado() {
  useApplyTheme();
  return (
    <StandalonePanel code="Erro" title="Esta tela não abriu." description="Algo falhou ao montar a página. Seu progresso fica guardado no aparelho; recarregue para tentar de novo.">
      <ButtonLink to="/" variant="primary" icon="hoje" reloadDocument>
        Recarregar em Hoje
      </ButtonLink>
    </StandalonePanel>
  );
}
