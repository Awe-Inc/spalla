import { PIECE_STATUS_LABELS, type PieceFilters, type PieceStatus } from "@/data/pieces";

interface PieceFiltersBarProps {
  filters: PieceFilters;
  levels: readonly number[];
  composers: readonly string[];
  genres: readonly string[];
  onChange: (filters: PieceFilters) => void;
}

const STATUSES: PieceStatus[] = ["nao-iniciada", "em-estudo", "dominada"];
const SELECT_CLASS = "h-10 min-w-36 rounded-md border border-hairline bg-surface px-3 text-body";

export function PieceFiltersBar({ filters, levels, composers, genres, onChange }: PieceFiltersBarProps) {
  const isActive = filters.level !== null || filters.composer !== null || filters.genre !== null || filters.status !== null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros">
      <select className={SELECT_CLASS} aria-label="Nível" value={filters.level ?? ""} onChange={(event) => onChange({ ...filters, level: event.target.value === "" ? null : Number(event.target.value) })}>
        <option value="">Todos os níveis</option>
        {levels.map((level) => (
          <option key={level} value={level}>
            Nível {level}
          </option>
        ))}
      </select>
      <select className={SELECT_CLASS} aria-label="Compositor" value={filters.composer ?? ""} onChange={(event) => onChange({ ...filters, composer: event.target.value || null })}>
        <option value="">Todos os compositores</option>
        {composers.map((composer) => (
          <option key={composer} value={composer}>
            {composer}
          </option>
        ))}
      </select>
      <select className={SELECT_CLASS} aria-label="Gênero" value={filters.genre ?? ""} onChange={(event) => onChange({ ...filters, genre: event.target.value || null })}>
        <option value="">Todos os gêneros</option>
        {genres.map((genre) => (
          <option key={genre} value={genre}>
            {genre}
          </option>
        ))}
      </select>
      <select className={SELECT_CLASS} aria-label="Situação" value={filters.status ?? ""} onChange={(event) => onChange({ ...filters, status: (event.target.value || null) as PieceStatus | null })}>
        <option value="">Qualquer situação</option>
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {PIECE_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      {isActive ? (
        <button type="button" className="h-10 rounded-pill px-3 font-medium text-primary hover:bg-primary-soft" onClick={() => onChange({ level: null, composer: null, genre: null, status: null })}>
          Limpar
        </button>
      ) : null}
    </div>
  );
}
