import { useState, type ChangeEvent } from "react";

import { useCore } from "@/core/useCore";
import { clearAppCache, downloadBlob, exportBackup, resetProgress } from "@/data/backup";
import { db } from "@/data/db";
import { csvFileName, resultsToCsv } from "@/data/exportCsv";
import { importNativeProgress, nativeImportSentence } from "@/data/nativeProgress";
import { Button, buttonClass, Card, ConfirmButton } from "@/design/components";

const NATIVE_PROGRESS_PATH = "%APPDATA%\\Fretless\\progress.txt";

export function DadosCard() {
  const core = useCore();
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<string>) {
    try {
      setMessage(await action());
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Não deu certo. Tente de novo.");
    }
  }

  function writtenBpmOf(exerciseId: string): number | null {
    if (core.status !== "ready") return null;
    return core.core.exercises.find((exercise) => exercise.id === exerciseId)?.defaultBpm ?? null;
  }

  async function exportCsv(): Promise<string> {
    const results = await db.results.toArray();
    const exercises = core.status === "ready" ? core.core.exercises : [];
    const modules = core.status === "ready" ? core.core.curriculum : [];
    downloadBlob(csvFileName(), new Blob([resultsToCsv(results, exercises, modules)], { type: "text/csv;charset=utf-8" }));
    return "Histórico baixado.";
  }

  async function onProgressFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    await run(async () => nativeImportSentence(await importNativeProgress(await file.text(), writtenBpmOf)));
    setImporting(false);
  }

  return (
    <Card title="Seus dados" className="grid gap-4">
      <p className="text-small text-ink-muted">Tudo fica só neste aparelho. O backup é um arquivo .json com resultados, rotinas, dias e conquistas; o histórico é uma planilha CSV.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void run(async () => (await exportBackup(), "Backup baixado."))}>
          Exportar backup
        </Button>
        <Button variant="secondary" disabled={core.status !== "ready"} onClick={() => void run(exportCsv)}>
          Exportar histórico (CSV)
        </Button>
        <Button variant="ghost" onClick={() => void run(async () => (await clearAppCache(), "Cache limpo. Recarregue a página para baixar a versão nova."))}>
          Apagar cache
        </Button>
      </div>
      <div className="grid justify-items-start gap-2 border-t border-hairline pt-4">
        <p className="text-small text-ink-muted">
          Usava o app de computador? Traga as estrelas e os dias de prática do arquivo <code className="font-mono text-caption">{NATIVE_PROGRESS_PATH}</code>. O que já existe aqui fica como está.
        </p>
        <label className={`${buttonClass("secondary")} w-fit cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus`}>
          {importing ? "Lendo…" : "Importar progress.txt"}
          <input type="file" accept=".txt,text/plain" className="sr-only" onChange={(event) => void onProgressFile(event)} disabled={core.status !== "ready" || importing} />
        </label>
      </div>
      <div className="grid justify-items-start gap-2 border-t border-hairline pt-4">
        <p className="text-small text-ink-muted">Zerar o progresso apaga resultados, XP, dias e conquistas. Rotinas e músicas ficam.</p>
        <ConfirmButton
          label="Zerar progresso"
          confirmLabel="Zerar tudo"
          question="Não dá para desfazer. Zerar?"
          onConfirm={() => void run(async () => (await resetProgress(), "Progresso zerado. Rotinas e músicas ficaram."))}
        />
      </div>
      {message ? (
        <p className="text-caption text-ink-muted" role="status">
          {message}
        </p>
      ) : null}
    </Card>
  );
}
