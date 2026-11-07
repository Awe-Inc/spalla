import { useState, type FormEvent } from "react";

import { api, errorMessage } from "@/api/client";
import type { Me } from "@/api/types";
import { MIN_PASSWORD_LENGTH } from "@/account/forms";
import { syncPracticeOnce } from "@/account/practiceSync";
import { isTeacherUser, useAccount } from "@/account/store";
import { FormError, Notice } from "@/account/ui";
import { Badge, TextAreaField, TextField } from "@/design/fields";
import { Button, Card } from "@/design/components";

const APPLICATION_TEXT: Record<NonNullable<Me["teacherApplication"]>, { label: string; tone: "warn" | "good" | "bad"; text: string }> = {
  pending: { label: "Em análise", tone: "warn", text: "A equipe está analisando seu pedido de conta de professor. Você recebe acesso às turmas assim que for aprovado." },
  approved: { label: "Aprovado", tone: "good", text: "Sua conta de professor está liberada." },
  rejected: { label: "Não aprovado", tone: "bad", text: "O pedido de conta de professor não foi aprovado. Fale com o suporte se quiser rever." },
};

export function ProfileCard({ user }: { user: Me }) {
  const setUser = useAccount((state) => state.setUser);
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.teacherBio ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const showBio = user.teacherApplication !== null || isTeacherUser(user);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      setUser(await api.patch<Me>("/auth/me", { name: name.trim(), ...(showBio ? { teacherBio: bio.trim() } : {}) }));
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  const application = user.teacherApplication ? APPLICATION_TEXT[user.teacherApplication] : null;
  return (
    <Card title="Perfil">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-body text-ink-muted">{user.email}</p>
        {application ? (
          <div className="grid gap-2 rounded-md bg-surface-soft p-4">
            <span className="flex items-center gap-2 text-body font-medium">
              Conta de professor <Badge tone={application.tone}>{application.label}</Badge>
            </span>
            <p className="text-caption text-ink-muted">{application.text}</p>
          </div>
        ) : null}
        <TextField label="Nome" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        {showBio ? <TextAreaField label="Sobre suas aulas" value={bio} maxLength={1000} onChange={(event) => setBio(event.target.value)} /> : null}
        <FormError message={error} />
        {saved ? <Notice>Perfil salvo.</Notice> : null}
        <div>
          <Button type="submit" variant="primary" disabled={pending || name.trim().length < 2}>
            Salvar perfil
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function SyncCard({ user }: { user: Me }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const outcome = await syncPracticeOnce(user.id);
      setMessage(outcome.sent === 0 ? "Nada novo para enviar." : `${outcome.inserted} sessões novas enviadas ao professor.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Prática enviada ao professor">
      <div className="grid gap-4">
        <p className="text-body text-ink-muted">
          Sua prática fica guardada neste aparelho. Envie o resumo das sessões para que seu professor acompanhe afinação, andamento e constância. O áudio nunca é enviado.
        </p>
        <FormError message={error} />
        {message ? <Notice>{message}</Notice> : null}
        <div>
          <Button variant="primary" onClick={run} disabled={pending}>
            {pending ? "Enviando…" : "Enviar prática agora"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await api.post("/auth/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Senha">
      <form onSubmit={submit} className="grid gap-4">
        <TextField label="Senha atual" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        <TextField
          label="Senha nova"
          type="password"
          autoComplete="new-password"
          hint={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres. As outras sessões serão encerradas.`}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <FormError message={error} />
        {saved ? <Notice>Senha trocada.</Notice> : null}
        <div>
          <Button type="submit" disabled={pending || !currentPassword || newPassword.length < MIN_PASSWORD_LENGTH}>
            Trocar senha
          </Button>
        </div>
      </form>
    </Card>
  );
}
