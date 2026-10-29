import { useState, type FormEvent } from "react";

import { signupLink } from "@/account/links";
import { api, errorMessage } from "@/api/client";
import type { Invite, Role } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { Badge, formatDate, FormError, LoadState, Notice, RequireAccount, SelectField, TextField } from "@/account/ui";
import { Button, Card, EmptyState, PageTitle } from "@/design/components";

import { INVITE_STATE_LABELS, inviteState, type InviteState } from "./admin";

const STATE_TONES: Record<InviteState, "good" | "neutral" | "warn" | "bad"> = { active: "good", used: "neutral", expired: "warn", revoked: "bad" };

async function copyText(text: string): Promise<string> {
  try {
    await navigator.clipboard.writeText(text);
    return "Copiado.";
  } catch {
    return "Não deu para copiar. Selecione o texto e copie à mão.";
  }
}

function CreateInvite({ onCreated }: { onCreated: (invite: { code: string; roleName: string }) => void }) {
  const roles = useApiData((signal) => api.get<Role[]>("/admin/roles", signal), []);
  const [role, setRole] = useState("professor");
  const [note, setNote] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [days, setDays] = useState("14");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await api.post<{ code: string }>("/admin/invites", { role, note: note.trim(), maxUses: Number(maxUses), days: Number(days) });
      setNote("");
      onCreated({ code: created.code, roleName: roles.data?.find((item) => item.key === role)?.name ?? role });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Novo convite">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-body text-ink-muted">Quem cria a conta com o convite já entra com o papel escolhido. Use para trazer professores parceiros sem esperar aprovação.</p>
        <div className="grid gap-4 md:grid-cols-4">
          <SelectField label="Papel" value={role} onChange={(event) => setRole(event.target.value)}>
            {(roles.data ?? []).map((item) => (
              <option key={item.key} value={item.key}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <TextField label="Usos" type="number" min={1} max={500} required value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
          <TextField label="Vale por (dias)" type="number" min={1} max={90} required value={days} onChange={(event) => setDays(event.target.value)} />
          <TextField label="Anotação" maxLength={200} placeholder="Para quem é" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <FormError message={error} />
        <div>
          <Button type="submit" variant="primary" disabled={pending || !roles.data}>
            {pending ? "Criando…" : "Criar convite"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function CreatedInvite({ code, roleName }: { code: string; roleName: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const link = signupLink({ convite: code });
  return (
    <div className="grid gap-3 rounded-lg bg-primary-soft p-5">
      <p className="text-body text-ink">Convite para {roleName} criado. Mande o link para a pessoa.</p>
      <p className="font-mono text-title tracking-[0.15em] text-ink select-all">{code}</p>
      <p className="break-all text-caption text-ink-muted select-all">{link}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void copyText(link).then(setMessage)}>
          Copiar link
        </Button>
        <Button variant="ghost" onClick={() => void copyText(code).then(setMessage)}>
          Copiar código
        </Button>
      </div>
      {message ? <p className="text-caption text-ink-muted">{message}</p> : null}
    </div>
  );
}

function InviteRow({ invite, onChanged }: { invite: Invite; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const state = inviteState(invite);

  async function revoke() {
    setError(null);
    try {
      await api.delete(`/admin/invites/${invite.id}`);
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <li className="grid gap-2 border-b border-hairline py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold text-ink">{invite.code}</span>
          <Badge tone={STATE_TONES[state]}>{INVITE_STATE_LABELS[state]}</Badge>
          <Badge>{invite.roleName}</Badge>
        </span>
        {state === "active" ? (
          <span className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => void copyText(signupLink({ convite: invite.code })).then(setMessage)}>
              Copiar link
            </Button>
            <Button variant="ghost" onClick={() => void revoke()}>
              Revogar
            </Button>
          </span>
        ) : null}
      </div>
      <p className="text-caption text-ink-muted">
        {invite.uses} de {invite.maxUses} {invite.maxUses === 1 ? "uso" : "usos"}. Criado em {formatDate(invite.createdAt)}, vale até {formatDate(invite.expiresAt)}.
        {invite.createdBy ? ` Por ${invite.createdBy}.` : ""}
      </p>
      {invite.note ? <p className="text-body text-ink">{invite.note}</p> : null}
      {message ? <p className="text-caption text-ink-muted">{message}</p> : null}
      <FormError message={error} />
    </li>
  );
}

function Invites() {
  const invites = useApiData((signal) => api.get<Invite[]>("/admin/invites", signal), []);
  const [created, setCreated] = useState<{ code: string; roleName: string } | null>(null);

  return (
    <div className="grid gap-6">
      <CreateInvite
        onCreated={(invite) => {
          setCreated(invite);
          invites.reload();
        }}
      />
      {created ? <CreatedInvite key={created.code} {...created} /> : null}
      <Card title="Convites">
        <LoadState {...invites}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState title="Nenhum convite ainda" description="Os convites que você criar aparecem aqui, com quantas vezes foram usados." />
            ) : (
              <ul>
                {list.map((invite) => (
                  <InviteRow key={`${invite.id}-${invite.uses}-${invite.revokedAt ?? ""}`} invite={invite} onChanged={invites.reload} />
                ))}
              </ul>
            )
          }
        </LoadState>
      </Card>
      <Notice>O link de convite abre a tela de criar conta já com o código preenchido.</Notice>
    </div>
  );
}

export function ConvitesPage() {
  return (
    <div className="grid gap-6">
      <PageTitle title="Convites" eyebrow="Administração" />
      <RequireAccount permissions={["invites.manage"]}>
        <Invites />
      </RequireAccount>
    </div>
  );
}
