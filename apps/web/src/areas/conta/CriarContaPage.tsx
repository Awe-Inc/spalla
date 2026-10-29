import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";

import { ApiError, errorMessage, isPlatformEnabled } from "@/api/client";
import { EMPTY_SIGNUP, MIN_PASSWORD_LENGTH, needsGuardian, toSignupInput, validateSignup, type SignupDraft, type SignupErrors } from "@/account/forms";
import { homePathFor, signup, useAccount } from "@/account/store";
import { FormError } from "@/account/ui";
import { TextAreaField, TextField } from "@/design/fields";
import { Button, Card, EmptyState, PageHeader } from "@/design/components";

const ACCOUNT_TYPES: readonly { value: SignupDraft["accountType"]; title: string; description: string }[] = [
  { value: "aluno", title: "Sou aluno", description: "Entro na turma do meu professor, recebo tarefas e mostro meu progresso." },
  { value: "professor", title: "Sou professor", description: "Monto turmas, passo tarefas, anexo materiais e acompanho os alunos." },
];

function errorProps(errors: SignupErrors, key: keyof SignupDraft): { error?: string } {
  const message = errors[key];
  return message ? { error: message } : {};
}

export function CriarContaPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const user = useAccount((state) => state.user);
  const [draft, setDraft] = useState<SignupDraft>(() => ({
    ...EMPTY_SIGNUP,
    classCode: params.get("turma") ?? "",
    inviteCode: params.get("convite") ?? "",
    accountType: params.get("tipo") === "professor" ? "professor" : "aluno",
  }));
  const [errors, setErrors] = useState<SignupErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!isPlatformEnabled()) {
    return <EmptyState title="Plataforma de aulas desligada" description="Esta instalação do Spalla funciona só no aparelho, sem contas." />;
  }
  if (user) return <Navigate to={homePathFor(user)} replace />;

  const patch = (changes: Partial<SignupDraft>) => setDraft((current) => ({ ...current, ...changes }));
  const birthYear = draft.birthYear.trim() === "" ? undefined : Number(draft.birthYear);
  const showGuardian = Number.isInteger(birthYear) && needsGuardian(birthYear);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateSignup(draft);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    try {
      const session = await signup(toSignupInput(draft));
      const target = homePathFor(session.user);
      navigate(target === "/voce/conta" ? "/voce/conta?nova=1" : target, { replace: true });
    } catch (cause) {
      setServerError(errorMessage(cause));
      if (cause instanceof ApiError) setErrors(cause.fields as SignupErrors);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <PageHeader title="Criar conta" />
      <form onSubmit={submit} className="grid gap-6" noValidate>
        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="mb-3 text-heading font-semibold">Como você vai usar o Spalla?</legend>
          {ACCOUNT_TYPES.map((option) => {
            const selected = draft.accountType === option.value;
            return (
              <label
                key={option.value}
                className={`grid cursor-pointer gap-1 rounded-lg border-2 bg-surface p-4 transition-colors duration-fast ease-spalla ${
                  selected ? "border-primary" : "border-hairline hover:border-hairline-strong"
                }`}
              >
                <span className="flex items-center gap-2 text-body font-semibold text-ink">
                  <input type="radio" name="tipo" value={option.value} checked={selected} onChange={() => patch({ accountType: option.value })} className="accent-primary" />
                  {option.title}
                </span>
                <span className="text-caption text-ink-muted">{option.description}</span>
              </label>
            );
          })}
        </fieldset>

        <Card title="Seus dados">
          <div className="grid gap-4">
            <TextField label="Nome" autoComplete="name" value={draft.name} onChange={(event) => patch({ name: event.target.value })} {...errorProps(errors, "name")} />
            <TextField label="E-mail" type="email" autoComplete="email" value={draft.email} onChange={(event) => patch({ email: event.target.value })} {...errorProps(errors, "email")} />
            <TextField
              label="Senha"
              type="password"
              autoComplete="new-password"
              hint={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres. Uma frase curta funciona bem.`}
              value={draft.password}
              onChange={(event) => patch({ password: event.target.value })}
              {...errorProps(errors, "password")}
            />
            <TextField
              label={draft.accountType === "professor" ? "Ano de nascimento" : "Ano de nascimento (opcional)"}
              inputMode="numeric"
              maxLength={4}
              hint={draft.accountType === "professor" ? "Conta de professor é para maiores de 18 anos." : "Para crianças de até 12 anos, pedimos a autorização do responsável."}
              value={draft.birthYear}
              onChange={(event) => patch({ birthYear: event.target.value.replace(/\D/g, "") })}
              {...errorProps(errors, "birthYear")}
            />
          </div>
        </Card>

        {showGuardian ? (
          <Card title="Responsável">
            <div className="grid gap-4">
              <p className="text-body text-ink-muted">Quem tem até 12 anos precisa que um responsável autorize a conta.</p>
              <TextField label="Nome do responsável" value={draft.guardianName} onChange={(event) => patch({ guardianName: event.target.value })} {...errorProps(errors, "guardianName")} />
              <TextField
                label="E-mail do responsável"
                type="email"
                value={draft.guardianEmail}
                onChange={(event) => patch({ guardianEmail: event.target.value })}
                {...errorProps(errors, "guardianEmail")}
              />
              <label className="flex items-start gap-3 text-body text-ink">
                <input type="checkbox" className="mt-1 size-4 accent-primary" checked={draft.guardianConsent} onChange={(event) => patch({ guardianConsent: event.target.checked })} />
                Sou o responsável e autorizo esta conta.
              </label>
              {errors.guardianConsent ? <p className="text-caption font-medium text-off">{errors.guardianConsent}</p> : null}
            </div>
          </Card>
        ) : null}

        <Card title={draft.accountType === "aluno" ? "Turma" : "Sobre você"}>
          <div className="grid gap-4">
            {draft.accountType === "aluno" ? (
              <TextField
                label="Código da turma (opcional)"
                hint="O professor passa esse código. Dá para entrar na turma depois também."
                autoCapitalize="characters"
                value={draft.classCode}
                onChange={(event) => patch({ classCode: event.target.value.toUpperCase() })}
                {...errorProps(errors, "classCode")}
              />
            ) : (
              <TextAreaField
                label="Conte sobre suas aulas"
                hint="Formação, há quanto tempo ensina, onde dá aula. A equipe usa isso para aprovar a conta de professor."
                maxLength={1000}
                value={draft.teacherBio}
                onChange={(event) => patch({ teacherBio: event.target.value })}
                {...errorProps(errors, "teacherBio")}
              />
            )}
            <TextField
              label="Código de convite (opcional)"
              hint="Recebeu um convite da equipe? Ele libera a conta na hora."
              value={draft.inviteCode}
              onChange={(event) => patch({ inviteCode: event.target.value })}
              {...errorProps(errors, "inviteCode")}
            />
          </div>
        </Card>

        <div className="grid gap-2">
          <label className="flex items-start gap-3 text-body text-ink">
            <input type="checkbox" className="mt-1 size-4 accent-primary" checked={draft.acceptTerms} onChange={(event) => patch({ acceptTerms: event.target.checked })} />
            <span>
              Li e aceito os{" "}
              <Link to="/termos" className="text-primary underline underline-offset-4">
                termos de uso e a política de privacidade
              </Link>
              .
            </span>
          </label>
          {errors.acceptTerms ? <p className="text-caption font-medium text-off">{errors.acceptTerms}</p> : null}
        </div>

        <FormError message={serverError} />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Criando…" : "Criar conta"}
          </Button>
          <Link to="/entrar" className="text-body text-primary underline-offset-4 hover:underline">
            Já tenho conta
          </Link>
        </div>
      </form>
    </div>
  );
}
