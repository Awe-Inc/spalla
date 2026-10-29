import { useState, type FormEvent } from "react";

import { api, errorMessage } from "@/api/client";
import type { PlatformSettings } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { FormError, LoadState, Notice, RequireAccount, TextField } from "@/account/ui";
import { Button, Card, PageTitle } from "@/design/components";

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-md bg-surface-soft px-4 py-3">
      <input type="checkbox" className="mt-1 size-4 accent-primary" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="grid gap-0.5">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-caption text-ink-muted">{hint}</span>
      </span>
    </label>
  );
}

function SettingsForm({ initial, onSaved }: { initial: PlatformSettings; onSaved: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await api.put("/admin/settings", { ...draft, platformName: draft.platformName.trim(), supportEmail: draft.supportEmail.trim() });
      setSaved(true);
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <Card title="Cadastro">
        <div className="grid gap-3">
          <Toggle
            label="Cadastro aberto"
            hint="Desligado, só entra quem tiver convite ou código de turma."
            checked={draft.signupOpen}
            onChange={(signupOpen) => setDraft({ ...draft, signupOpen })}
          />
          <Toggle
            label="Professor precisa de aprovação"
            hint="Ligado, quem pede para ser professor espera um administrador aprovar. Convites de professor não passam por isso."
            checked={draft.teacherApprovalRequired}
            onChange={(teacherApprovalRequired) => setDraft({ ...draft, teacherApprovalRequired })}
          />
        </div>
      </Card>
      <Card title="Identidade">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Nome da plataforma" required maxLength={60} value={draft.platformName} onChange={(event) => setDraft({ ...draft, platformName: event.target.value })} />
          <TextField
            label="E-mail de suporte"
            type="email"
            maxLength={254}
            hint="Aparece para quem precisa de ajuda. Pode ficar vazio."
            value={draft.supportEmail}
            onChange={(event) => setDraft({ ...draft, supportEmail: event.target.value })}
          />
        </div>
      </Card>
      <FormError message={error} />
      {saved ? <Notice>Configurações salvas.</Notice> : null}
      <div>
        <Button type="submit" variant="primary" disabled={pending || draft.platformName.trim().length === 0}>
          {pending ? "Salvando…" : "Salvar configurações"}
        </Button>
      </div>
    </form>
  );
}

function Settings() {
  const settings = useApiData((signal) => api.get<PlatformSettings>("/admin/settings", signal), []);
  return <LoadState {...settings}>{(data) => <SettingsForm initial={data} onSaved={settings.reload} />}</LoadState>;
}

export function AdminConfigPage() {
  return (
    <div className="grid gap-6">
      <PageTitle title="Configurações da plataforma" eyebrow="Administração" />
      <RequireAccount permissions={["settings.manage"]}>
        <Settings />
      </RequireAccount>
    </div>
  );
}
