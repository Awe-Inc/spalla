import { useState } from "react";
import { Link } from "react-router";

import { api, errorMessage } from "@/api/client";
import type { TeacherApplicationRow } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { formatDate, FormError, LoadState, Notice, RequireAccount } from "@/account/ui";
import { Button, EmptyState, PageHeader } from "@/design/components";

function ApplicationCard({ application, onDecided }: { application: TeacherApplicationRow; onDecided: (text: string) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    setPending(true);
    setError(null);
    try {
      await api.post(`/admin/teachers/${application.id}/${decision}`);
      onDecided(decision === "approve" ? `${application.name} agora é professor.` : `O pedido de ${application.name} foi recusado.`);
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <li className="grid gap-3 rounded-lg bg-surface p-5 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <Link to={`/admin/usuarios/${application.id}`} className="text-heading font-semibold text-ink hover:text-primary">
          {application.name}
        </Link>
        <span className="text-caption text-ink-muted">Pediu em {formatDate(application.createdAt)}</span>
      </header>
      <p className="text-body text-ink-muted">{application.email}</p>
      {application.teacherBio ? (
        <p className="whitespace-pre-line text-body text-ink">{application.teacherBio}</p>
      ) : (
        <p className="text-body text-ink-muted">Sem apresentação.</p>
      )}
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={pending} onClick={() => void decide("approve")}>
          Aprovar
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => void decide("reject")}>
          Recusar
        </Button>
      </div>
    </li>
  );
}

function Applications() {
  const applications = useApiData((signal) => api.get<TeacherApplicationRow[]>("/admin/teacher-applications", signal), []);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="grid gap-4">
      {message ? <Notice>{message}</Notice> : null}
      <LoadState {...applications}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState title="Nenhum pedido esperando" description="Quando alguém criar conta como professor, o pedido aparece aqui para você aprovar." />
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {list.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  onDecided={(text) => {
                    setMessage(text);
                    applications.reload();
                  }}
                />
              ))}
            </ul>
          )
        }
      </LoadState>
    </div>
  );
}

export function ProfessoresPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Pedidos de professor" description="Quem é aprovado passa a criar turmas, tarefas, planos de estudo e materiais." />
      <RequireAccount permissions={["teachers.approve"]}>
        <Applications />
      </RequireAccount>
    </div>
  );
}
