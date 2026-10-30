import { EMPTY_FILTERS, hasActiveFilters, PIECE_STATUS_LABELS, type PieceFilters, type PieceStatus } from "@/data/pieces";
import { Button } from "@/design/components";
import { FIELD_CLASS } from "@/design/fields";
import { Icon } from "@/design/icons";

interface PieceFiltersBarProps {
  filters: PieceFilters;
  levels: readonly number[];
  composers: readonly string[];
  genres: readonly string[];
  onChange: (filters: PieceFilters) => void;
}

const STATUSES: PieceStatus[] = ["nao-iniciada", "em-estudo", "dominada"];
const SELECT_CLASS = `${FIELD_CLASS} w-auto min-w-0 flex-1 basis-36 pr-8 text-small`;

export function PieceFiltersBar({ filters, levels, composers, genres, onChange }: PieceFiltersBarProps) {
  return (
    <div role="search" aria-label="Filtrar o repertório" className="grid gap-2 rounded-lg bg-surface-sunken/60 p-2 ring-1 ring-inset ring-hairline">
      <label className="relative block min-w-0">
        <span className="sr-only">Buscar por título ou compositor</span>
        <Icon name="buscar" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
        <input
          type="search"
          name="busca"
          autoComplete="off"
          placeholder="Título ou compositor…"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          className={`${FIELD_CLASS} pl-9 text-small`}
        />
      </label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <select className={SELECT_CLASS} aria-label="Nível" value={filters.level ?? ""} onChange={(event) => onChange({ ...filters, level: event.target.value === "" ? null : Number(event.target.value) })}>
          <option value="">Nível</option>
          {levels.map((level) => (
            <option key={level} value={level}>
              Nível {level}
            </option>
          ))}
        </select>
        <select className={SELECT_CLASS} aria-label="Compositor" value={filters.composer ?? ""} onChange={(event) => onChange({ ...filters, composer: event.target.value || null })}>
          <option value="">Compositor</option>
          {composers.map((composer) => (
            <option key={composer} value={composer}>
              {composer}
            </option>
          ))}
        </select>
        <select className={SELECT_CLASS} aria-label="Gênero" value={filters.genre ?? ""} onChange={(event) => onChange({ ...filters, genre: event.target.value || null })}>
          <option value="">Gênero</option>
          {genres.map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
        <select className={SELECT_CLASS} aria-label="Situação" value={filters.status ?? ""} onChange={(event) => onChange({ ...filters, status: (event.target.value || null) as PieceStatus | null })}>
          <option value="">Situação</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {PIECE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        {hasActiveFilters(filters) ? (
          <Button variant="quiet" onClick={() => onChange(EMPTY_FILTERS)}>
            Limpar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
