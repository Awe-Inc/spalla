import { useState } from "react";

import { clearAppCache, exportBackup, resetProgress } from "@/data/backup";
import { Button, Card } from "@/design/components";

type Pending = "reset" | null;

export function DadosCard() {
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<void>, done: string) {
    try {
      await action();
      setMessage(done);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Não deu certo. Tente de novo.");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card title="Seus dados" className="grid gap-4">
      <p className="text-ink-muted">Tudo fica só neste aparelho. O backup é um arquivo .json com resultados, rotinas, dias e conquistas.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void run(exportBackup, "Backup baixado.")}>Exportar backup</Button>
        <Button onClick={() => void run(clearAppCache, "Cache limpo. Recarregue a página para baixar a versão nova.")}>Apagar cache</Button>
        {pending === "reset" ? (
          <>
            <Button variant="primary" className="bg-off hover:bg-off" onClick={() => void run(resetProgress, "Progresso zerado. Rotinas e músicas ficaram.")}>
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
      {message ? (
        <p className="text-caption text-ink-muted" role="status">
          {message}
        </p>
      ) : null}
    </Card>
  );
}
