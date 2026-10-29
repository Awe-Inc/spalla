import { useLiveQuery } from "dexie-react-hooks";
import { useState, type ChangeEvent } from "react";

import { db, type StoredSheet } from "@/data/db";
import { describeStorageError, importSheetFile, pageCountLabel, removeSheet } from "@/data/sheets";
import { buttonClass, ButtonLink, EmptyState, InlineError, Menu } from "@/design/components";
import { Icon } from "@/design/icons";
import { List, ListRow, PageHeader, SkeletonList } from "@/design/layout";
import { countPdfPages } from "@/pdf/pdfDocument";

import { RepertorioTabs } from "../musicas/RepertorioTabs";

async function importOne(file: File): Promise<string | null> {
  try {
    const outcome = await importSheetFile(file, countPdfPages);
    return outcome.ok ? null : outcome.error;
  } catch (cause: unknown) {
    return describeStorageError(cause);
  }
}

function sheetPath(sheet: StoredSheet): string {
  return `/repertorio/estante/${sheet.id}`;
}

function SheetRow({ sheet, onRemove }: { sheet: StoredSheet; onRemove: (sheet: StoredSheet) => void }) {
  return (
    <ListRow
      to={sheetPath(sheet)}
      leading={
        <span className="grid size-10 place-items-center rounded-sm bg-surface-soft text-ink-muted ring-1 ring-inset ring-hairline">
          <Icon name="repertorio" className="size-5" />
        </span>
      }
      title={<span className="font-display text-heading font-normal italic">{sheet.title}</span>}
      meta={
        <>
          {pageCountLabel(sheet.pageCount)}
          {sheet.lastPage > 1 ? (
            <>
              , parou na página <span className="font-mono tabular">{sheet.lastPage}</span>
            </>
          ) : null}
        </>
      }
      trailing={
        <>
          <Menu label={`Ações de ${sheet.title}`} items={[{ label: "Apagar da estante", icon: "apagar", tone: "danger", onSelect: () => onRemove(sheet) }]} />
          <ButtonLink to={sheetPath(sheet)} variant="primary" aria-label={`Abrir ${sheet.title}`}>
            Abrir
          </ButtonLink>
        </>
      }
    />
  );
}

function ImportPdfButton({ busy, onFiles }: { busy: boolean; onFiles: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className={`${buttonClass("secondary")} cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus ${busy ? "pointer-events-none opacity-50" : ""}`}>
      <Icon name="importar" className="size-5" />
      {busy ? "Guardando…" : "Importar PDF"}
      <input type="file" accept=".pdf,application/pdf" multiple className="sr-only" onChange={onFiles} disabled={busy} />
    </label>
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
    if (sheet.id !== undefined && window.confirm(`Apagar "${sheet.title}" da estante? O PDF sai do aparelho.`)) void removeSheet(sheet.id);
  }

  return (
    <>
      <PageHeader
        title="Repertório"
        description="Métodos e partituras em PDF para tocar lendo a página, com afinador, metrônomo e nota pedal do lado."
        actions={<ImportPdfButton busy={isImporting} onFiles={(event) => void onFiles(event)} />}
      />
      <RepertorioTabs />

      <div className="grid gap-4">
        {error ? <InlineError title="Algum PDF não entrou." nextStep={error} /> : null}

        {sheets === undefined ? <SkeletonList rows={3} label="Abrindo a estante…" /> : null}

        {sheets !== undefined && sheets.length === 0 ? (
          <EmptyState title="A estante está vazia." description="Importe um método ou uma partitura em PDF. Nada aqui vale XP: é só estudo com a página aberta." />
        ) : null}

        {sheets !== undefined && sheets.length > 0 ? (
          <List label="PDFs da estante">
            {sheets.map((sheet) => (
              <SheetRow key={sheet.id} sheet={sheet} onRemove={confirmRemove} />
            ))}
          </List>
        ) : null}
      </div>
    </>
  );
}
