import { useState, type ChangeEvent } from "react";

import { useCore } from "@/core/useCore";
import { clearAppCache, exportBackup, resetProgress } from "@/data/backup";
import { importNativeProgress, nativeImportSentence } from "@/data/nativeProgress";
import { Button, Card } from "@/design/components";

type Pending = "reset" | "import" | null;

const NATIVE_PROGRESS_PATH = "%APPDATA%\\Fretless\\progress.txt";

export function DadosCard() {
  const core = useCore();
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<string>, pendingKind: Pending = null) {
    setPending(pendingKind);
    try {
      setMessage(await action());
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Não deu certo. Tente de novo.");
    } finally {
      setPending(null);
    }
  }

  function writtenBpmOf(exerciseId: string): number | null {
    if (core.status !== "ready") return null;
    return core.core.exercises.find((exercise) => exercise.id === exerciseId)?.defaultBpm ?? null;
  }

  async function onProgressFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await run(async () => nativeImportSentence(await importNativeProgress(await file.text(), writtenBpmOf)), "import");
  }

  return (
    <Card title="Seus dados" className="grid gap-4">
      <p className="text-ink-muted">Tudo fica só neste aparelho. O backup é um arquivo .json com resultados, rotinas, dias e conquistas.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void run(async () => (await exportBackup(), "Backup baixado."))}>Exportar backup</Button>
        <Button onClick={() => void run(async () => (await clearAppCache(), "Cache limpo. Recarregue a página para baixar a versão nova."))}>Apagar cache</Button>
        {pending === "reset" ? (
          <>
            <Button variant="primary" className="bg-off hover:bg-off" onClick={() => void run(async () => (await resetProgress(), "Progresso zerado. Rotinas e músicas ficaram."))}>
              Confirmar: zerar tudo
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setPending("reset")}>
            Resetar progresso
          </Button>
        )}
      </div>
      <div className="grid gap-2 border-t border-hairline pt-4">
        <p className="text-ink-muted">
          Já usava o Fretless no computador? Traga as estrelas e os dias de prática do arquivo <code className="text-caption">{NATIVE_PROGRESS_PATH}</code>. O que já existe aqui fica como está.
        </p>
        <label className="inline-flex h-11 w-fit cursor-pointer items-center rounded-pill bg-surface-soft px-5 font-semibold text-ink transition-colors hover:bg-surface-sunken has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus md:h-10">
          {pending === "import" ? "Lendo…" : "Importar progress.txt"}
          <input type="file" accept=".txt,text/plain" className="sr-only" onChange={(event) => void onProgressFile(event)} disabled={core.status !== "ready" || pending === "import"} />
        </label>
      </div>
      {message ? (
        <p className="text-caption text-ink-muted" role="status">
          {message}
        </p>
      ) : null}
    </Card>
  );
}
