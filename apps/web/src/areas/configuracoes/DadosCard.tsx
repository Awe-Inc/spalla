import { useEffect, useState, type ChangeEvent } from "react";

import { useCore } from "@/core/useCore";
import { useSettings } from "@/app/settings";
import { clearAppCache, downloadBlob, exportBackup, parseBackup, resetProgress, restoreBackup, restoreSentence, type Backup } from "@/data/backup";
import { db } from "@/data/db";
import { csvFileName, resultsToCsv } from "@/data/exportCsv";
import { importNativeProgress, nativeImportSentence } from "@/data/nativeProgress";
import { readStorageUsage, storageUsageSentence, type StorageUsage } from "@/data/storageUsage";
import { Button, buttonClass, Card, ConfirmButton } from "@/design/components";

const NATIVE_PROGRESS_PATH = "%APPDATA%\\Fretless\\progress.txt";

export function DadosCard() {
  const core = useCore();
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [pendingBackup, setPendingBackup] = useState<Backup | null>(null);

  useEffect(() => {
    let active = true;
    readStorageUsage().then(
      (next) => {
        if (active) setUsage(next);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [message]);

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

  async function onBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPendingBackup(null);
    await run(async () => {
      setPendingBackup(parseBackup(await file.text()));
      return `Backup lido: ${file.name}. Confirme para restaurar.`;
    });
  }

  function confirmRestore(backup: Backup) {
    void run(async () => {
      const summary = await restoreBackup(backup);
      await useSettings.persist.rehydrate();
      setPendingBackup(null);
      return restoreSentence(summary);
    });
  }

  return (
    <Card title="Seus dados" className="grid gap-4">
      <p className="text-small text-ink-muted">Tudo fica só neste aparelho. O backup é um arquivo .json com resultados, rotinas, dias e conquistas; o histórico é uma planilha CSV.</p>
      {usage ? <p className="text-small text-ink-muted">{storageUsageSentence(usage)}</p> : null}
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
        <p className="text-small text-ink-muted">Trocou de aparelho ou de navegador? Restaure um backup exportado antes. O que está aqui é substituído pelo que veio no arquivo.</p>
        {pendingBackup ? (
          <div className="flex flex-wrap items-center gap-2">
            <ConfirmButton label="Restaurar backup" confirmLabel="Substituir tudo" question="Os dados deste aparelho saem. Restaurar?" onConfirm={() => confirmRestore(pendingBackup)} />
            <Button variant="ghost" onClick={() => setPendingBackup(null)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <label className={`${buttonClass("secondary")} w-fit cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus`}>
            Escolher backup (.json)
            <input type="file" accept=".json,application/json" className="sr-only" onChange={(event) => void onBackupFile(event)} />
          </label>
        )}
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
