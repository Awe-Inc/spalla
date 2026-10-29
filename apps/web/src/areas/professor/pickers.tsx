import { useId, useMemo, useState } from "react";

import { api } from "@/api/client";
import type { TeacherClass, TeacherStudent } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { FIELD_CLASS, SelectField } from "@/account/ui";
import { useCore } from "@/core/useCore";
import { LIBRARY } from "@/data/library";

import { ITEM_KIND_LABELS, searchItems, teachableItems, type AudienceChoice, type TeachableItem } from "./teaching";

export function useTeachableItems(): { items: TeachableItem[]; loading: boolean } {
  const core = useCore();
  const items = useMemo(() => (core.status === "ready" ? teachableItems(core.core.exercises, LIBRARY) : teachableItems([], LIBRARY)), [core]);
  return { items, loading: core.status === "loading" };
}

export function useAudienceOptions() {
  const classes = useApiData((signal) => api.get<TeacherClass[]>("/teacher/classes", signal), []);
  const students = useApiData((signal) => api.get<TeacherStudent[]>("/teacher/students", signal), []);
  return {
    classes: (classes.data ?? []).filter((klass) => !klass.archivedAt),
    students: students.data ?? [],
    error: classes.error ?? students.error,
    loading: classes.loading || students.loading,
  };
}

interface AudienceSelectProps {
  value: AudienceChoice;
  onChange: (value: AudienceChoice) => void;
  error?: string | undefined;
  disabled?: boolean;
}

export function AudienceSelect({ value, onChange, error, disabled = false }: AudienceSelectProps) {
  const options = useAudienceOptions();
  return (
    <SelectField
      label="Para quem"
      hint={options.error ?? (options.classes.length === 0 && !options.loading ? "Crie uma turma primeiro, ou espere um aluno entrar." : undefined)}
      error={error}
      value={value}
      disabled={disabled || options.loading}
      onChange={(event) => onChange(event.target.value as AudienceChoice)}
    >
      <option value="">Escolha uma turma ou um aluno</option>
      {options.classes.length > 0 ? (
        <optgroup label="Turmas">
          {options.classes.map((klass) => (
            <option key={klass.id} value={`turma:${klass.id}`}>
              {klass.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {options.students.length > 0 ? (
        <optgroup label="Alunos">
          {options.students.map((student) => (
            <option key={student.id} value={`aluno:${student.id}`}>
              {student.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </SelectField>
  );
}

interface ItemPickerProps {
  onPick: (item: TeachableItem) => void;
  onCancel: () => void;
}

export function ItemPicker({ onPick, onCancel }: ItemPickerProps) {
  const { items, loading } = useTeachableItems();
  const [query, setQuery] = useState("");
  const inputId = useId();
  const results = searchItems(items, query);

  return (
    <div className="grid gap-3 rounded-md border border-hairline bg-surface-soft p-4">
      <label htmlFor={inputId} className="text-caption font-medium text-ink">
        Buscar exercício ou peça
      </label>
      <input
        id={inputId}
        type="search"
        autoFocus
        className={FIELD_CLASS}
        placeholder="Ex.: Lá maior, Minueto, cordas soltas"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {loading ? <p className="text-caption text-ink-muted">Carregando o currículo…</p> : null}
      <ul className="grid max-h-80 gap-1 overflow-y-auto" aria-label="Resultados">
        {results.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className="grid w-full gap-0.5 rounded-md px-3 py-2 text-left transition-colors duration-fast ease-fretless hover:bg-surface"
              onClick={() => onPick(item)}
            >
              <span className="text-body font-medium text-ink">{item.title}</span>
              <span className="text-caption text-ink-muted">
                {ITEM_KIND_LABELS[item.kind]} · nível {item.level}
                {item.detail ? ` · ${item.detail}` : ""}
              </span>
            </button>
          </li>
        ))}
        {results.length === 0 && !loading ? <li className="px-3 py-2 text-caption text-ink-muted">Nada encontrado.</li> : null}
      </ul>
      <div>
        <button type="button" className="text-caption text-ink-muted hover:text-ink" onClick={onCancel}>
          Fechar busca
        </button>
      </div>
    </div>
  );
}

export function ReorderButtons({ index, count, onMove, onRemove, label }: { index: number; count: number; onMove: (delta: -1 | 1) => void; onRemove: () => void; label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" aria-label={`Subir ${label}`} disabled={index === 0} className="size-9 rounded-md text-ink-muted hover:bg-surface-soft disabled:opacity-30" onClick={() => onMove(-1)}>
        ↑
      </button>
      <button type="button" aria-label={`Descer ${label}`} disabled={index === count - 1} className="size-9 rounded-md text-ink-muted hover:bg-surface-soft disabled:opacity-30" onClick={() => onMove(1)}>
        ↓
      </button>
      <button type="button" aria-label={`Remover ${label}`} className="size-9 rounded-md text-ink-muted hover:bg-off-soft hover:text-off" onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}
