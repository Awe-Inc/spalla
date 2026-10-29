import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";

import { api, ApiError, errorMessage, isPlatformEnabled } from "@/api/client";
import { MIN_PASSWORD_LENGTH, safeReturnPath } from "@/account/forms";
import { ACCOUNT_BACK } from "@/account/links";
import { homePathFor, login, useAccount } from "@/account/store";
import { FormError, Notice } from "@/account/ui";
import { TextField } from "@/design/fields";
import { Button, ButtonLink, Card, EmptyState, PageHeader } from "@/design/components";

function LoginForm({ onForgot }: { onForgot: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const user = await login(email.trim(), password);
      navigate(safeReturnPath(params.get("voltar")) ?? homePathFor(user), { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <TextField label="E-mail" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      <TextField label="Senha" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      <FormError message={error} />
      <Button type="submit" variant="primary" disabled={pending || !email || !password}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-body">
        <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={onForgot}>
          Esqueci a senha
        </button>
        <Link to="/criar-conta" className="text-primary underline-offset-4 hover:underline">
          Criar conta
        </Link>
      </div>
    </form>
  );
}

function ResetForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    try {
      await api.post("/auth/reset", { email: email.trim(), code: code.trim(), newPassword });
      setDone(true);
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError) setFields(cause.fields);
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="grid gap-4">
        <Notice>Senha trocada. Entre com a senha nova; as outras sessões foram encerradas.</Notice>
        <Button variant="primary" onClick={onDone}>
          Voltar para entrar
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <p className="text-body text-ink-muted">
        Peça o código de troca de senha ao suporte da plataforma. Ele vale por pouco tempo e só pode ser usado uma vez.
      </p>
      <TextField label="E-mail" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} {...(fields.email ? { error: fields.email } : {})} />
      <TextField label="Código" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} {...(fields.code ? { error: fields.code } : {})} />
      <TextField
        label="Senha nova"
        type="password"
        autoComplete="new-password"
        hint={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`}
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        {...(fields.newPassword ? { error: fields.newPassword } : {})}
      />
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending || !email || !code || newPassword.length < MIN_PASSWORD_LENGTH}>
          {pending ? "Trocando…" : "Trocar senha"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function EntrarPage() {
  const user = useAccount((state) => state.user);
  const [mode, setMode] = useState<"entrar" | "trocar">("entrar");
  if (!isPlatformEnabled()) {
    return <EmptyState title="Plataforma de aulas desligada" description="Esta instalação do Spalla funciona só no aparelho, sem contas." action={<ButtonLink to={ACCOUNT_BACK.to} variant="secondary">Voltar para {ACCOUNT_BACK.label}</ButtonLink>} />;
  }
  if (user) return <Navigate to={homePathFor(user)} replace />;
  return (
    <div className="mx-auto grid max-w-md gap-6">
      <PageHeader back={ACCOUNT_BACK} title={mode === "entrar" ? "Entrar" : "Trocar a senha"} />
      <Card>{mode === "entrar" ? <LoginForm onForgot={() => setMode("trocar")} /> : <ResetForm onDone={() => setMode("entrar")} />}</Card>
      <p className="text-body text-ink-muted">
        O Spalla continua funcionando sem conta. A conta serve para entrar numa turma, receber tarefas do professor e mostrar seu progresso a ele.
      </p>
    </div>
  );
}
