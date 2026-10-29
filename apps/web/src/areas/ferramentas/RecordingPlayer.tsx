import { useEffect, useState } from "react";

import type { StoredRecording } from "@/data/db";
import { readRecordingBlob, formatClock, renameRecording } from "@/data/recordings";
import { Button } from "@/design/components";
import { FIELD_CLASS } from "@/design/fields";

const NAME_FIELD_CLASS = `${FIELD_CLASS} min-w-0 flex-1`;
const NAME_MAX_LENGTH = 80;

export function recordingDate(createdAt: number): string {
  return new Date(createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function useObjectUrl(source: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!source) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(source);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [source]);
  return url;
}

function useRecordingBlob(id: number | undefined, mimeType: string): Blob | null {
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readRecordingBlob(id, mimeType).then((next) => {
      if (!cancelled) setBlob(next);
    });
    return () => {
      cancelled = true;
    };
  }, [id, mimeType]);
  return blob;
}

export function RecordingAudio({ recording }: { recording: StoredRecording }) {
  const url = useObjectUrl(useRecordingBlob(recording.id, recording.mimeType));
  if (!url) return <p className="text-caption text-ink-subtle">Carregando o áudio…</p>;
  return <audio controls preload="metadata" src={url} className="w-full" aria-label={`Ouvir ${recording.name}`} />;
}

function RenameForm({ recording, onDone }: { recording: StoredRecording; onDone: () => void }) {
  const [name, setName] = useState(recording.name);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      aria-label={`Renomear ${recording.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (recording.id !== undefined) void renameRecording(recording.id, name).then(onDone);
      }}
    >
      <input value={name} onChange={(event) => setName(event.target.value)} maxLength={NAME_MAX_LENGTH} name="nome-gravacao" autoComplete="off" className={NAME_FIELD_CLASS} aria-label="Nome da gravação" />
      <Button type="submit" variant="primary">
        Guardar nome
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Cancelar
      </Button>
    </form>
  );
}

interface RecordingRowProps {
  recording: StoredRecording;
  isCompared: boolean;
  onCompare: () => void;
  onRemove: () => void;
}

export function RecordingRow({ recording, isCompared, onCompare, onRemove }: RecordingRowProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const details = [recordingDate(recording.createdAt), formatClock(recording.durationMs), recording.pieceTitle ?? "Sem peça"];
  return (
    <li className="grid gap-3 py-4">
      {isRenaming ? (
        <RenameForm recording={recording} onDone={() => setIsRenaming(false)} />
      ) : (
        <div className="grid gap-0.5">
          <span className="font-medium">{recording.name}</span>
          <span className="text-caption text-ink-subtle">{details.join(" · ")}</span>
        </div>
      )}
      <RecordingAudio recording={recording} />
      <div className="flex flex-wrap gap-2">
        {recording.pieceKey ? (
          <Button aria-pressed={isCompared} variant={isCompared ? "primary" : "secondary"} onClick={onCompare} aria-label={`Comparar: ${recording.name}`}>
            Comparar
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => setIsRenaming(true)} aria-label={`Renomear: ${recording.name}`}>
          Renomear
        </Button>
        <Button variant="ghost" onClick={onRemove} aria-label={`Apagar gravação: ${recording.name}`}>
          Apagar
        </Button>
      </div>
    </li>
  );
}

export function CompareRecordings({ pair }: { pair: readonly [StoredRecording, StoredRecording] }) {
  const labels = ["Antes", "Depois"] as const;
  return (
    <div className="grid gap-4 md:grid-cols-2" role="group" aria-label="Comparação">
      {pair.map((recording, index) => (
        <div key={recording.id} className="grid content-start gap-2 rounded-md bg-surface-soft p-4">
          <h3 className="text-heading font-semibold">{labels[index]}</h3>
          <p className="grid gap-0.5">
            <span className="font-medium">{recording.name}</span>
            <span className="text-caption text-ink-subtle">
              {recordingDate(recording.createdAt)} · {formatClock(recording.durationMs)}
            </span>
          </p>
          <RecordingAudio recording={recording} />
        </div>
      ))}
    </div>
  );
}
