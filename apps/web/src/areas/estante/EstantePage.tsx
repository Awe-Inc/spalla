import { useLiveQuery } from "dexie-react-hooks";
import { useState, type ChangeEvent } from "react";
import { Link } from "react-router";

import { db, type StoredSheet } from "@/data/db";
import { describeStorageError, importSheetFile, pageCountLabel, removeSheet } from "@/data/sheets";
import { Button, Card, EmptyState, InlineError, PageTitle } from "@/design/components";
import { countPdfPages } from "@/pdf/pdfDocument";

import { MusicasTabs } from "../musicas/MusicasTabs";

async function importOne(file: File): Promise<string | null> {
  try {
    const outcome = await importSheetFile(file, countPdfPages);
    return outcome.ok ? null : outcome.error;
  } catch (cause: unknown) {
    return describeStorageError(cause);
  }
}

function SheetRow({ sheet, onRemove }: { sheet: StoredSheet; onRemove: (sheet: StoredSheet) => void }) {
  return (
    <li>
      <Card as="article" className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-1">
          <h2 className="text-heading font-semibold">{sheet.title}</h2>
          <p className="text-ink-muted">
            {pageCountLabel(sheet.pageCount)}
            {sheet.lastPage > 1 ? ` · parou na página ${sheet.lastPage}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onRemove(sheet)}>
            Remover
          </Button>
          <Link to={`/estante/${sheet.id}`} className="inline-flex h-11 items-center rounded-pill bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover md:h-10">
            Abrir
          </Link>
        </div>
      </Card>
    </li>
  );
}

export function EstantePage() {
  const sheets = useLiveQuery(() => db.sheets.orderBy("openedAt").reverse().toArray(), []);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setIsImporting(true);
    const failures: string[] = [];
    for (const file of files) {
      const failure = await importOne(file);
      if (failure) failures.push(`${file.name}: ${failure}`);
    }
    setError(failures.length > 0 ? failures.join(" ") : null);
    setIsImporting(false);
  }

  function confirmRemove(sheet: StoredSheet) {
    if (window.confirm(`Remover "${sheet.title}" da estante? O PDF sai do aparelho.`)) void removeSheet(sheet.id!);
  }

  return (
    <>
      <PageTitle title="Músicas" eyebrow="Catálogo e suas partituras">
        <label className="inline-flex h-11 cursor-pointer items-center rounded-pill bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover md:h-10">
          {isImporting ? "Guardando…" : "Importar PDF"}
          <input type="file" accept=".pdf,application/pdf" multiple className="sr-only" onChange={(event) => void onFiles(event)} disabled={isImporting} />
        </label>
      </PageTitle>
      <MusicasTabs />

      {error ? <InlineError title="Algum PDF não entrou." nextStep={error} /> : null}

      {sheets === undefined ? <p className="text-ink-muted">Abrindo a estante…</p> : null}

      {sheets !== undefined && sheets.length === 0 ? (
        <EmptyState title="A estante está vazia." description="Importe um método ou uma partitura em PDF para tocar lendo a página, com afinador, metrônomo e nota pedal do lado. Nada aqui vale XP: é só estudo." />
      ) : null}

      {sheets !== undefined && sheets.length > 0 ? (
        <ul className="grid gap-4">
          {sheets.map((sheet) => (
            <SheetRow key={sheet.id} sheet={sheet} onRemove={confirmRemove} />
          ))}
        </ul>
      ) : null}
    </>
  );
}
