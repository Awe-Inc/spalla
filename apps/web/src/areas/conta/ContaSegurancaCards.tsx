import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";

import { api, apiBlob, errorMessage } from "@/api/client";
import type { AccountSession } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { useAccount } from "@/account/store";
import { FormError, formatDateTime, LoadState } from "@/account/ui";
import { Badge, TextField } from "@/design/fields";
import { downloadBlob } from "@/data/backup";
import { Button, Card } from "@/design/components";

function describeAgent(userAgent: string | null): string {
  if (!userAgent) return "Aparelho desconhecido";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Navegador";
  const system = /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Windows/.test(userAgent) ? "Windows" : /Mac OS/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "";
  return system ? `${browser} no ${system}` : browser;
}

export function SessionsCard() {
  const sessions = useApiData((signal) => api.get<AccountSession[]>("/auth/sessions", signal), []);
  const [error, setError] = useState<string | null>(null);

  async function revoke(id: string) {
    setError(null);
    try {
      await api.delete(`/auth/sessions/${id}`);
      sessions.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card title="Onde sua conta está aberta">
      <LoadState {...sessions}>
        {(list) => (
          <ul className="grid gap-2">
            {list.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-soft px-4 py-3">
                <div>
                  <p className="text-body font-medium">
                    {describeAgent(session.userAgent)} {session.current ? <Badge tone="info">Este aparelho</Badge> : null}
                  </p>
                  <p className="text-caption text-ink-muted">Último uso {formatDateTime(session.lastSeenAt)}</p>
                </div>
                {session.current ? null : (
                  <Button variant="ghost" onClick={() => revoke(session.id)}>
                    Encerrar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </LoadState>
      <FormError message={error} />
    </Card>
  );
}

export function DataCard() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function exportData() {
    setError(null);
    try {
      downloadBlob("spalla-meus-dados.json", await apiBlob("/auth/export"));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.delete("/auth/account", { password });
      useAccount.getState().clear();
      navigate("/", { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Seus dados">
      <div className="grid gap-4">
        <p className="text-body text-ink-muted">Baixe tudo o que a plataforma guarda sobre você num arquivo JSON, ou apague a conta de vez.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportData}>Baixar meus dados</Button>
          {confirming ? null : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Apagar conta
            </Button>
          )}
        </div>
        {confirming ? (
          <form onSubmit={deleteAccount} className="grid gap-3 rounded-md bg-off-soft p-4">
            <p className="text-body font-medium">Apagar a conta remove seu perfil, turmas, tarefas e prática enviada. Não dá para desfazer.</p>
            <p className="text-caption text-ink-muted">A prática guardada neste aparelho continua aqui.</p>
            <TextField label="Digite sua senha para confirmar" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={pending || !password}>
                Apagar minha conta
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}
        <FormError message={error} />
      </div>
    </Card>
  );
}
