import { useLiveQuery } from "dexie-react-hooks";
import { useState, type ChangeEvent } from "react";
import { Link } from "react-router";

import { useCore } from "@/core/useCore";
import { bestResultsByExercise, db } from "@/data/db";
import { importPieceFile, removePiece } from "@/data/importPiece";
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
import { Button, Card, EmptyState, InlineError, PageTitle, Stars } from "@/design/components";

import { PieceFiltersBar } from "./PieceFilters";

const STATUS_CLASS: Record<PieceStatus, string> = {
  "nao-iniciada": "bg-surface-soft text-ink-muted",
  "em-estudo": "bg-close/20 text-ink",
  dominada: "bg-in-tune/20 text-ink",
};

function PieceRow({ piece, status, stars, onRemove }: { piece: CatalogPiece; status: PieceStatus; stars: 0 | 1 | 2 | 3; onRemove: (id: number) => void }) {
  return (
    <li>
      <Card as="article" className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-heading font-semibold">{piece.title}</h2>
            <span className={`rounded-pill px-2 py-0.5 text-caption font-medium ${STATUS_CLASS[status]}`}>{PIECE_STATUS_LABELS[status]}</span>
          </div>
          <p className="text-ink-muted">
            {piece.composer} · {piece.genre} · nível {piece.level}
          </p>
          {stars > 0 ? <Stars count={stars} label={`${stars} de 3 estrelas`} /> : null}
        </div>
        <div className="flex gap-2">
          {piece.storedId !== null ? (
            <Button variant="ghost" onClick={() => onRemove(piece.storedId!)}>
              Remover
            </Button>
          ) : null}
          <Link to={piece.playTo} className="inline-flex h-11 items-center rounded-pill bg-surface-soft px-5 font-semibold transition-colors hover:bg-surface-sunken md:h-10">
            Tocar
          </Link>
        </div>
      </Card>
    </li>
  );
}

export function MusicasPage() {
  const core = useCore();
  const stored = useLiveQuery(() => db.pieces.orderBy("importedAt").reverse().toArray(), []) ?? [];
  const results = useLiveQuery(() => db.results.toArray(), []) ?? [];
  const [filters, setFilters] = useState<PieceFilters>(EMPTY_FILTERS);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const catalog = [...catalogFromStored(stored), ...(core.status === "ready" ? catalogFromCurriculum(core.core.curriculum) : [])];
  const statuses = statusByPiece(catalog, results);
  const best = bestResultsByExercise(results);
  const visible = filterPieces(catalog, statuses, filters);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || core.status !== "ready") return;
    setIsImporting(true);
    const outcome = await importPieceFile(core.core, file);
    setIsImporting(false);
    setError(outcome.ok ? null : outcome.error);
  }

  return (
    <>
      <PageTitle title="Músicas" eyebrow="Catálogo e suas partituras">
        <label className="inline-flex h-11 cursor-pointer items-center rounded-pill bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover md:h-10">
          {isImporting ? "Lendo…" : "Importar MusicXML"}
          <input type="file" accept=".xml,.musicxml,.mxl" className="sr-only" onChange={(event) => void onFile(event)} disabled={core.status !== "ready" || isImporting} />
        </label>
      </PageTitle>

      {error ? <InlineError title="Esse arquivo não abriu." nextStep={error} /> : null}

      <PieceFiltersBar
        filters={filters}
        levels={distinctSorted(catalog.map((piece) => piece.level))}
        composers={distinctSorted(catalog.map((piece) => piece.composer))}
        genres={distinctSorted(catalog.map((piece) => piece.genre))}
        onChange={setFilters}
      />

      {core.status !== "ready" && stored.length === 0 ? <p className="text-ink-muted">Carregando o catálogo…</p> : null}

      {visible.length === 0 && catalog.length > 0 ? (
        <EmptyState title="Nenhuma música com esses filtros." description="Limpe um filtro ou importe uma partitura .musicxml ou .mxl exportada do MuseScore." />
      ) : (
        <ul className="grid gap-4">
          {visible.map((piece) => (
            <PieceRow key={piece.key} piece={piece} status={statuses.get(piece.key) ?? "nao-iniciada"} stars={best.get(piece.resultId)?.stars ?? 0} onRemove={(id) => void removePiece(id)} />
          ))}
        </ul>
      )}
    </>
  );
}
