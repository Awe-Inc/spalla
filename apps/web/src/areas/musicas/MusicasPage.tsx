import { useLiveQuery } from "dexie-react-hooks";
import { useState, type ChangeEvent } from "react";

import { CoreErrorNotice } from "@/core/CoreErrorNotice";
import { useCore } from "@/core/useCore";
import { bestResultsByExercise, db } from "@/data/db";
import { importPieceFile, removePiece } from "@/data/importPiece";
import { catalogFromLibrary, LIBRARY_GENRE, LIBRARY_SOURCE_URL } from "@/data/library";
import {
  catalogFromCurriculum,
  catalogFromStored,
  distinctSorted,
  EMPTY_FILTERS,
  filterPieces,
  PIECE_STATUS_LABELS,
  statusByPiece,
  type CatalogPiece,
  type PieceFilters,
  type PieceStatus,
} from "@/data/pieces";
import { detailPath } from "@/data/sections";
import { describeStorageError, isQuotaError } from "@/data/storageErrors";
import { buttonClass, ButtonLink, EmptyState, InlineError, Menu, Stars } from "@/design/components";
import { Badge, type BadgeTone } from "@/design/fields";
import { Icon } from "@/design/icons";
import { List, ListRow, PageHeader, SkeletonList } from "@/design/layout";

import { PieceFiltersBar } from "./PieceFilters";
import { RepertorioTabs } from "./RepertorioTabs";

const PAGE_SIZE = 20;

const STATUS_TONE: Record<PieceStatus, BadgeTone> = {
  "nao-iniciada": "neutral",
  "em-estudo": "accent",
  dominada: "good",
};

interface PieceRowProps {
  piece: CatalogPiece;
  status: PieceStatus;
  stars: 0 | 1 | 2 | 3;
  onRemove: (id: number) => void;
}

function PieceRow({ piece, status, stars, onRemove }: PieceRowProps) {
  const storedId = piece.storedId;
  return (
    <ListRow
      to={detailPath(piece.playTo)}
      title={<span className="font-display text-heading font-normal italic">{piece.title}</span>}
      meta={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{piece.composer}</span>
          <span aria-hidden className="text-ink-subtle">/</span>
          <span>{piece.genre}</span>
          <span aria-hidden className="text-ink-subtle">/</span>
          <span>
            nível <span className="font-mono tabular">{piece.level}</span>
          </span>
          {status !== "nao-iniciada" ? <Badge tone={STATUS_TONE[status]}>{PIECE_STATUS_LABELS[status]}</Badge> : null}
        </span>
      }
      trailing={
        <>
          {stars > 0 ? (
            <span className="hidden sm:inline-flex">
              <Stars count={stars} label={`${stars} de 3 estrelas`} />
            </span>
          ) : null}
          {storedId !== null ? <Menu label={`Ações de ${piece.title}`} items={[{ label: "Apagar música", icon: "apagar", tone: "danger", onSelect: () => onRemove(storedId) }]} /> : null}
          <ButtonLink to={piece.playTo} icon="play" aria-label={`Tocar ${piece.title}`}>
            <span className="hidden sm:inline">Tocar</span>
          </ButtonLink>
        </>
      }
    />
  );
}

function ImportButton({ disabled, busy, onFile }: { disabled: boolean; busy: boolean; onFile: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className={`${buttonClass("secondary")} cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      <Icon name="importar" className="size-5" />
      {busy ? "Lendo…" : "Importar MusicXML"}
      <input type="file" accept=".xml,.musicxml,.mxl" className="sr-only" onChange={onFile} disabled={disabled} />
    </label>
  );
}

const LIBRARY_CATALOG = catalogFromLibrary();

export function MusicasPage() {
  const core = useCore();
  const stored = useLiveQuery(() => db.pieces.orderBy("importedAt").reverse().toArray(), []) ?? [];
  const results = useLiveQuery(() => db.results.toArray(), []) ?? [];
  const [filters, setFilters] = useState<PieceFilters>(EMPTY_FILTERS);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const catalog = [...catalogFromStored(stored), ...(core.status === "ready" ? catalogFromCurriculum(core.core.curriculum) : []), ...LIBRARY_CATALOG];
  const statuses = statusByPiece(catalog, results);
  const best = bestResultsByExercise(results);
  const visible = filterPieces(catalog, statuses, filters);
  const page = visible.slice(0, shown);
  const remaining = visible.length - page.length;

  function changeFilters(next: PieceFilters) {
    setFilters(next);
    setShown(PAGE_SIZE);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || core.status !== "ready") return;
    setIsImporting(true);
    try {
      const outcome = await importPieceFile(core.core, file);
      setError(outcome.ok ? null : outcome.error);
    } catch (cause: unknown) {
      setError(isQuotaError(cause) ? describeStorageError(cause, "a música") : "Tente outro arquivo MusicXML (.xml, .musicxml ou .mxl).");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Repertório"
        description="Peças do método, canções em domínio público e as partituras que você importar."
        actions={<ImportButton disabled={core.status !== "ready" || isImporting} busy={isImporting} onFile={(event) => void onFile(event)} />}
      />
      <RepertorioTabs />

      <div className="grid gap-4">
        {error ? <InlineError title="Esse arquivo não abriu." nextStep={error} /> : null}

        <PieceFiltersBar
          filters={filters}
          levels={distinctSorted(catalog.map((piece) => piece.level))}
          composers={distinctSorted(catalog.map((piece) => piece.composer))}
          genres={distinctSorted(catalog.map((piece) => piece.genre))}
          onChange={changeFilters}
        />

        {core.status !== "ready" && stored.length === 0 ? <SkeletonList rows={5} label="Carregando o catálogo…" /> : null}

        {visible.length === 0 && catalog.length > 0 ? (
          <EmptyState title="Nenhuma música com esses filtros." description="Limpe um filtro ou importe uma partitura .musicxml ou .mxl exportada do MuseScore." />
        ) : null}

        {page.length > 0 ? (
          <>
            <p className="text-small text-ink-muted" aria-live="polite">
              <span className="font-mono tabular">{visible.length}</span> {visible.length === 1 ? "peça" : "peças"}
            </p>
            <List label="Peças do repertório">
              {page.map((piece) => (
                <PieceRow key={piece.key} piece={piece} status={statuses.get(piece.key) ?? "nao-iniciada"} stars={best.get(piece.resultId)?.stars ?? 0} onRemove={(id) => void removePiece(id)} />
              ))}
            </List>
            {remaining > 0 ? (
              <button type="button" className={`${buttonClass("ghost")} w-full`} onClick={() => setShown((value) => value + PAGE_SIZE)}>
                Mostrar mais {Math.min(PAGE_SIZE, remaining)} de {remaining}
              </button>
            ) : null}
          </>
        ) : null}

        {page.some((piece) => piece.genre === LIBRARY_GENRE) ? (
          <p className="max-w-prose text-caption text-ink-subtle">
            As canções da {LIBRARY_GENRE} são do{" "}
            <a href={LIBRARY_SOURCE_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
              OpenScore Lieder
            </a>
            : partituras digitadas por voluntários e liberadas em domínio público (CC0). Só ficaram as que cabem no violino do Sol solto à terceira posição, sem transpor.
          </p>
        ) : null}
      </div>
    </>
  );
}
