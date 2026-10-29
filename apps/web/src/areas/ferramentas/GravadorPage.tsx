import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import type { FinishedRecording } from "@/audio/recorder";
import { useRecorder, type RecorderStatus } from "@/audio/useRecorder";
import { db } from "@/data/db";
import {
  comparablePair,
  defaultRecordingName,
  formatClock,
  MAX_RECORDING_MS,
  newestFirst,
  readRecordingPiece,
  recordedPieces,
  removeRecording,
  saveRecording,
  toggleCompared,
  type RecordingPiece,
} from "@/data/recordings";
import { Button, Card, InlineError } from "@/design/components";

import { CompareRecordings, RecordingRow, useObjectUrl } from "./RecordingPlayer";

import { ToolLayout } from "./ToolLayout";

const FIELD_CLASS = "h-10 rounded-md border border-hairline bg-surface px-3 text-body text-ink";
const NO_PIECE = "";
const ALL_RECORDINGS = "todas";
const UNLINKED_RECORDINGS = "sem-peca";
const NAME_MAX_LENGTH = 80;

interface TakeFormProps {
  take: FinishedRecording;
  piece: RecordingPiece | null;
  onSaved: () => void;
  onDiscard: () => void;
}

function TakeForm({ take, piece, onSaved, onDiscard }: TakeFormProps) {
  const [name, setName] = useState(() => defaultRecordingName(new Date(), piece?.title ?? null));
  const blob = useMemo(() => new Blob([new Uint8Array(take.bytes)], { type: take.mimeType }), [take]);
  const url = useObjectUrl(blob);
  return (
    <form
      className="grid gap-3 rounded-md bg-surface-soft p-4"
      aria-label="Guardar gravação"
      onSubmit={(event) => {
        event.preventDefault();
        void saveRecording({ ...take, name, piece }).then(onSaved);
      }}
    >
      <p className="font-medium">Gravação de {formatClock(take.durationMs)}</p>
      {url ? <audio controls src={url} className="w-full" aria-label="Ouvir a gravação nova" /> : null}
      <label className="grid gap-1 text-caption text-ink-subtle">
        Nome
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={NAME_MAX_LENGTH} className={FIELD_CLASS} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary">
          Guardar gravação
        </Button>
        <Button variant="ghost" onClick={onDiscard}>
          Descartar
        </Button>
      </div>
    </form>
  );
}

interface RecordButtonProps {
  status: RecorderStatus;
  elapsedMs: number;
  onStart: () => void;
  onStop: () => void;
}

function RecordButton({ status, elapsedMs, onStart, onStop }: RecordButtonProps) {
  const isRecording = status === "recording";
  const note = isRecording ? `Gravando, até ${formatClock(MAX_RECORDING_MS)}` : status === "starting" ? "Abrindo o microfone…" : "";
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button variant="primary" onClick={isRecording ? onStop : onStart} disabled={status === "starting" || status === "stopping"}>
        {isRecording ? "Parar" : "Gravar"}
      </Button>
      <span className="font-mono text-numeric tabular" role="timer" aria-label="Tempo de gravação">
        {formatClock(elapsedMs)}
      </span>
      <span className="text-caption text-ink-subtle" aria-live="polite">
        {note}
      </span>
    </div>
  );
}

function piecesWith(pieces: readonly RecordingPiece[], extra: RecordingPiece | null): RecordingPiece[] {
  if (!extra || pieces.some((piece) => piece.key === extra.key)) return [...pieces];
  return [extra, ...pieces];
}

function matchesFilter(pieceKey: string | null, filter: string): boolean {
  if (filter === ALL_RECORDINGS) return true;
  if (filter === UNLINKED_RECORDINGS) return pieceKey === null;
  return pieceKey === filter;
}

function CompareHint({ selectedCount }: { selectedCount: number }) {
  const message = selectedCount === 1 ? "Escolha mais uma gravação da mesma peça para comparar." : "Só dá para comparar duas gravações da mesma peça.";
  return <p className="text-caption text-ink-subtle">{message}</p>;
}

function PieceOptions({ pieces }: { pieces: readonly RecordingPiece[] }) {
  return (
    <>
      {pieces.map((piece) => (
        <option key={piece.key} value={piece.key}>
          {piece.title}
        </option>
      ))}
    </>
  );
}

export function GravadorPage() {
  const [searchParams] = useSearchParams();
  const requestedPiece = readRecordingPiece(searchParams);
  const recorder = useRecorder();
  const recordings = useLiveQuery(() => db.recordings.toArray(), []) ?? [];
  const pieces = piecesWith(recordedPieces(recordings), requestedPiece);
  const [pieceKey, setPieceKey] = useState(requestedPiece?.key ?? NO_PIECE);
  const [filter, setFilter] = useState(requestedPiece?.key ?? ALL_RECORDINGS);
  const [compared, setCompared] = useState<number[]>([]);
  const piece = pieces.find((candidate) => candidate.key === pieceKey) ?? null;
  const shown = newestFirst(recordings).filter((recording) => matchesFilter(recording.pieceKey, filter));
  const pair = comparablePair(recordings, compared);

  function forget(id: number) {
    setCompared((selected) => selected.filter((existing) => existing !== id));
    void removeRecording(id);
  }

  return (
    <ToolLayout title="Gravador" description="Grave uma passada, ouça logo depois e compare duas gravações da mesma peça.">
      <div className="grid gap-6">
        <Card className="grid gap-4">
          <label className="grid max-w-md gap-1 text-caption text-ink-subtle">
            Ligar à peça
            <select className={FIELD_CLASS} value={pieceKey} onChange={(event) => setPieceKey(event.target.value)} disabled={recorder.status === "recording"}>
              <option value={NO_PIECE}>Nenhuma</option>
              <PieceOptions pieces={pieces} />
            </select>
          </label>
          {pieces.length === 0 ? <p className="text-caption text-ink-subtle">Para ligar a uma peça, abra a peça no Repertório e toque em Gravar.</p> : null}
          <RecordButton status={recorder.status} elapsedMs={recorder.elapsedMs} onStart={() => void recorder.start()} onStop={() => void recorder.stop()} />
          {recorder.error ? <InlineError title="O gravador não abriu." nextStep={recorder.error} /> : null}
          {recorder.take ? <TakeForm take={recorder.take} piece={piece} onSaved={recorder.discard} onDiscard={recorder.discard} /> : null}
          <p className="text-caption text-ink-subtle">As gravações ficam só neste aparelho e não entram no backup.</p>
        </Card>

        {compared.length > 0 ? (
          <Card title="Comparar" className="grid gap-3">
            {pair ? <CompareRecordings pair={pair} /> : <CompareHint selectedCount={compared.length} />}
          </Card>
        ) : null}

        <Card title="Gravações" className="grid gap-2">
          <label className="grid max-w-md gap-1 text-caption text-ink-subtle">
            Mostrar
            <select className={FIELD_CLASS} value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value={ALL_RECORDINGS}>Todas</option>
              <PieceOptions pieces={pieces} />
              <option value={UNLINKED_RECORDINGS}>Sem peça</option>
            </select>
          </label>
          {shown.length === 0 ? (
            <p className="text-ink-muted">Nenhuma gravação aqui ainda. Grave uma passada e ouça logo depois: o ouvido percebe o que a mão não sente.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {shown.map((recording) => {
                const id = recording.id;
                if (id === undefined) return null;
                return (
                  <RecordingRow
                    key={id}
                    recording={recording}
                    isCompared={compared.includes(id)}
                    onCompare={() => setCompared((selected) => toggleCompared(selected, id))}
                    onRemove={() => forget(id)}
                  />
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </ToolLayout>
  );
}
