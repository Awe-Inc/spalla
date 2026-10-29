import type { MeasureRange } from "@fretless/core";
import { useState, type FormEvent } from "react";

import type { Listen } from "@/audio/useListen";
import { BPM_STEP, type TempoLimits } from "@/areas/tocar/tempo";
import { practicePath, sectionLabel } from "@/data/sections";
import { Button, ButtonLink, IconButton } from "@/design/components";
import { FIELD_CLASS } from "@/design/fields";
import { ListRow } from "@/design/layout";

const MEASURE_SELECT_CLASS = `${FIELD_CLASS} w-24 cursor-pointer pr-8 font-mono tabular`;

interface ListenButtonProps {
  listen: Listen;
  isActive: boolean;
  label: string;
  onListen: () => void;
  variant?: "secondary" | "ghost";
}

export function ListenButton({ listen, isActive, label, onListen, variant = "secondary" }: ListenButtonProps) {
  const isLoading = isActive && listen.status === "carregando";
  const isPlaying = isActive && listen.status === "tocando";
  return (
    <Button
      variant={variant}
      icon={isPlaying ? "pausar" : "ouvir"}
      onClick={() => (isActive ? listen.stop() : onListen())}
      disabled={isLoading}
      aria-pressed={isPlaying}
      aria-label={isPlaying ? `Parar: ${label}` : `Ouvir: ${label}`}
    >
      <span className={variant === "ghost" ? "hidden sm:inline" : undefined}>{isLoading ? "Carregando…" : isPlaying ? "Parar" : "Ouvir"}</span>
    </Button>
  );
}

interface SectionRowProps {
  range: MeasureRange;
  bpm: number;
  playTo: string;
  listen: Listen;
  isListening: boolean;
  onListen: () => void;
  onRemove?: () => void;
}

export function SectionRow({ range, bpm, playTo, listen, isListening, onListen, onRemove }: SectionRowProps) {
  const label = sectionLabel(range);
  return (
    <ListRow
      title={label}
      meta={
        <>
          <span className="font-mono tabular">{bpm}</span> bpm
        </>
      }
      current={isListening}
      trailing={
        <>
          <ListenButton listen={listen} isActive={isListening} label={label} onListen={onListen} variant="ghost" />
          <ButtonLink to={practicePath(playTo, bpm, range)} icon="trecho" aria-label={`Treinar trecho: ${label}`}>
            <span className="hidden sm:inline">Treinar trecho</span>
          </ButtonLink>
          {onRemove ? <IconButton icon="apagar" variant="danger" label={`Apagar trecho: ${label}`} onClick={onRemove} /> : null}
        </>
      }
    />
  );
}

export function TempoPicker({ bpm, limits, onChange }: { bpm: number; limits: TempoLimits; onChange: (bpm: number) => void }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button className="w-11 px-0 font-mono text-heading" aria-label={`Diminuir ${BPM_STEP} bpm`} onClick={() => onChange(bpm - BPM_STEP)} disabled={bpm <= limits.minBpm}>
          −
        </Button>
        <output className="grid justify-items-center" aria-live="polite">
          <span className="font-mono text-numeric tabular text-ink">{bpm}</span>
          <span className="text-caption text-ink-subtle">bpm de estudo</span>
        </output>
        <Button className="w-11 px-0 font-mono text-heading" aria-label={`Aumentar ${BPM_STEP} bpm`} onClick={() => onChange(bpm + BPM_STEP)} disabled={bpm >= limits.maxBpm}>
          +
        </Button>
      </div>
      <p className="text-center text-small text-ink-muted">
        Escrito: <span className="font-mono tabular">{limits.writtenBpm}</span> bpm
      </p>
    </div>
  );
}

function MeasureSelect({ label, value, count, onChange }: { label: string; value: number; count: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-1.5 text-small font-medium text-ink-muted">
      {label}
      <select className={MEASURE_SELECT_CLASS} value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {Array.from({ length: count }, (_, index) => (
          <option key={index} value={index}>
            {index + 1}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MarkSectionForm({ measureCount, onSave }: { measureCount: number; onSave: (range: MeasureRange) => void }) {
  const [first, setFirst] = useState(0);
  const [last, setLast] = useState(Math.min(3, measureCount - 1));

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ firstIndex: Math.min(first, last), lastIndex: Math.max(first, last) });
  }

  return (
    <form className="flex flex-wrap items-end gap-3 rounded-md bg-surface-sunken/60 p-3 ring-1 ring-inset ring-hairline" onSubmit={submit} aria-label="Marcar trecho">
      <MeasureSelect label="Do compasso" value={first} count={measureCount} onChange={setFirst} />
      <MeasureSelect label="ao" value={last} count={measureCount} onChange={setLast} />
      <Button type="submit" icon="mais">
        Guardar trecho
      </Button>
    </form>
  );
}
