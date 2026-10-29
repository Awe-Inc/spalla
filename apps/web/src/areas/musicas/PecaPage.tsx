import type { MeasureRange } from "@fretless/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";

import { useSettings } from "@/app/settings";
import { useListen, type Listen } from "@/audio/useListen";
import { RecordingAudio, recordingDate } from "@/areas/ferramentas/RecordingPlayer";
import { AddToRoutine } from "@/areas/musicas/AddToRoutine";
import { HistoricoExercicio } from "@/areas/estudar/HistoricoExercicio";
import { BPM_STEP, clampBpm, type TempoLimits } from "@/areas/tocar/tempo";
import { useSession } from "@/areas/tocar/useSession";
import { db, type StoredSection } from "@/data/db";
import { formatClock, newestFirst, recorderPath } from "@/data/recordings";
import { addSection, phraseSections, practicePath, removeSection, sectionLabel, sortedSections } from "@/data/sections";
import { Button, Card, InlineError, PageTitle } from "@/design/components";
import { formatDuration, majorKeyName } from "@/music/noteNames";

const SELECT_CLASS = "h-10 rounded-md border border-hairline bg-surface px-3 font-mono text-body tabular";
const SECONDARY_LINK_CLASS =
  "inline-flex h-11 items-center rounded-pill bg-surface-soft px-5 font-semibold transition-colors hover:bg-surface-sunken md:h-10";

function playPathFor(exerciseId: string | undefined, pieceId: string | undefined, librarySlug: string | undefined): string {
  if (pieceId !== undefined) return `/tocar/musica/${pieceId}`;
  if (librarySlug !== undefined) return `/tocar/biblioteca/${librarySlug}`;
  return `/tocar/${exerciseId ?? ""}`;
}

interface ListenRequest {
  key: string;
  range: MeasureRange | null;
  bpm: number;
}

function rangeKey(range: MeasureRange | null): string {
  return range ? `${range.firstIndex}-${range.lastIndex}` : "inteira";
}

function ListenButton({ listen, isActive, label, onListen }: { listen: Listen; isActive: boolean; label: string; onListen: () => void }) {
  const isLoading = isActive && listen.status === "carregando";
  const isPlaying = isActive && listen.status === "tocando";
  return (
    <Button onClick={() => (isActive ? listen.stop() : onListen())} disabled={isLoading} aria-pressed={isPlaying} aria-label={isPlaying ? `Parar: ${label}` : `Ouvir: ${label}`}>
      {isLoading ? "Carregando…" : isPlaying ? "Parar" : "Ouvir"}
    </Button>
  );
}

function SectionRow({
  range,
  bpm,
  playTo,
  listen,
  isListening,
  onListen,
  onRemove,
}: {
  range: MeasureRange;
  bpm: number;
  playTo: string;
  listen: Listen;
  isListening: boolean;
  onListen: () => void;
  onRemove?: () => void;
}) {
  const label = sectionLabel(range);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      <span className="font-mono text-caption text-ink-subtle tabular">{bpm} bpm</span>
      <ListenButton listen={listen} isActive={isListening} label={label} onListen={onListen} />
      <Link to={practicePath(playTo, bpm, range)} className={SECONDARY_LINK_CLASS} aria-label={`Praticar em loop: ${label}`}>
        Praticar em loop
      </Link>
      {onRemove ? (
        <Button variant="ghost" onClick={onRemove} aria-label={`Apagar trecho: ${label}`}>
          Apagar
        </Button>
      ) : null}
    </li>
  );
}

function TempoPicker({ bpm, limits, onChange }: { bpm: number; limits: TempoLimits; onChange: (bpm: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-caption text-ink-subtle">Andamento de estudo</span>
      <Button aria-label={`Diminuir ${BPM_STEP} bpm`} className="h-9 w-9 px-0 md:h-9" onClick={() => onChange(bpm - BPM_STEP)} disabled={bpm <= limits.minBpm}>
        −
      </Button>
      <span className="w-16 text-center font-mono text-numeric tabular">{bpm}</span>
      <Button aria-label={`Aumentar ${BPM_STEP} bpm`} className="h-9 w-9 px-0 md:h-9" onClick={() => onChange(bpm + BPM_STEP)} disabled={bpm >= limits.maxBpm}>
        +
      </Button>
      <span className="text-caption text-ink-subtle">Escrito: {limits.writtenBpm} bpm</span>
    </div>
  );
}

function MarkSectionForm({ measureCount, onSave }: { measureCount: number; onSave: (range: MeasureRange) => void }) {
  const [first, setFirst] = useState(0);
  const [last, setLast] = useState(Math.min(3, measureCount - 1));
  const options = Array.from({ length: measureCount }, (_, index) => index);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ firstIndex: Math.min(first, last), lastIndex: Math.max(first, last) });
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={submit} aria-label="Marcar trecho">
      <label className="grid gap-1 text-caption text-ink-subtle">
        Do compasso
        <select className={SELECT_CLASS} value={first} onChange={(event) => setFirst(Number(event.target.value))}>
          {options.map((index) => (
            <option key={index} value={index}>
              {index + 1}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-caption text-ink-subtle">
        ao
        <select className={SELECT_CLASS} value={last} onChange={(event) => setLast(Number(event.target.value))}>
          {options.map((index) => (
            <option key={index} value={index}>
              {index + 1}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit">Guardar trecho</Button>
    </form>
  );
}

const RECENT_PIECE_RECORDINGS = 3;

function PieceRecordings({ pieceKey, title }: { pieceKey: string; title: string }) {
  const recordings = useLiveQuery(async () => newestFirst(await db.recordings.where("pieceKey").equals(pieceKey).toArray()), [pieceKey]) ?? [];
  const recent = recordings.slice(0, RECENT_PIECE_RECORDINGS);
  return (
    <Card title="Gravações" className="grid gap-3">
      {recent.length === 0 ? (
        <p className="text-ink-muted">Grave uma passada da peça hoje. Daqui a algumas semanas, compare com a próxima e escute o que mudou.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {recent.map((recording) => (
            <li key={recording.id} className="grid gap-2 py-3">
              <span className="grid gap-0.5">
                <span className="font-medium">{recording.name}</span>
                <span className="text-caption text-ink-subtle">
                  {recordingDate(recording.createdAt)} · {formatClock(recording.durationMs)}
                </span>
              </span>
              <RecordingAudio recording={recording} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Link to={recorderPath({ key: pieceKey, title })} className={SECONDARY_LINK_CLASS}>
          {recordings.length >= 2 ? "Gravar e comparar" : "Gravar esta peça"}
        </Link>
      </div>
    </Card>
  );
}

export function PecaPage() {
  const { exerciseId, pieceId, librarySlug } = useParams();
  const { coreStatus, session, exercise, score, error, resultId, limits, bpm: sessionBpm, setBpm } = useSession(exerciseId, pieceId, librarySlug);
  const naming = useSettings((state) => state.noteNaming);
  const [chosenBpm, setChosenBpm] = useState<number | null>(null);
  const listen = useListen(score);
  const [listenRequest, setListenRequest] = useState<ListenRequest | null>(null);
  const [listeningKey, setListeningKey] = useState<string | null>(null);
  const studyBpm = limits ? clampBpm(chosenBpm ?? limits.writtenBpm, limits) : null;

  useEffect(() => {
    if (studyBpm !== null) setBpm(studyBpm);
  }, [studyBpm, setBpm]);

  useEffect(() => {
    if (!listenRequest || sessionBpm !== listenRequest.bpm) return;
    setListenRequest(null);
    setListeningKey(listenRequest.key);
    void listen.play(listenRequest.range);
  }, [listenRequest, sessionBpm, listen]);
  const sections = useLiveQuery(async () => (resultId ? sortedSections(await db.pieceSections.where("pieceKey").equals(resultId).toArray()) : []), [resultId]) ?? [];
  const results = useLiveQuery(async () => (resultId ? db.results.where("exerciseId").equals(resultId).toArray() : []), [resultId]) ?? [];
  const playTo = playPathFor(exerciseId, pieceId, librarySlug);

  if (error) {
    return (
      <>
        <PageTitle title="Música" />
        <InlineError title="Essa música não abriu." nextStep={error} />
      </>
    );
  }
  if (coreStatus.status !== "ready" || !score || !limits || !session || !resultId) {
    return <p className="text-ink-muted">Abrindo a partitura…</p>;
  }

  const title = exercise?.title ?? (score.title || "Sem título");
  const composer = exercise?.subtitle ?? (score.composer || "Compositor desconhecido");
  const bpm = clampBpm(chosenBpm ?? limits.writtenBpm, limits);
  const isListeningTo = (range: MeasureRange | null) => listen.status !== "parado" && listeningKey === rangeKey(range);
  const listenTo = (range: MeasureRange | null, atBpm: number) => {
    const target = clampBpm(atBpm, limits);
    setChosenBpm(target);
    setListenRequest({ key: rangeKey(range), range, bpm: target });
  };
  const measureCount = session.measureCount;
  const facts: [string, string][] = [
    ["Armadura", majorKeyName(score.keyFifths, naming)],
    ["Compasso", `${score.beatsPerMeasure}/${score.beatUnit}`],
    ["Andamento", `${limits.writtenBpm} bpm`],
    ["Duração", formatDuration((score.durationSeconds * sessionBpm) / limits.writtenBpm)],
    ["Compassos", String(measureCount)],
    ["Notas", String(score.noteCount)],
  ];

  return (
    <>
      <PageTitle eyebrow={composer} title={title}>
        <div className="flex flex-wrap gap-2">
          <ListenButton listen={listen} isActive={isListeningTo(null)} label="a peça inteira" onListen={() => listenTo(null, bpm)} />
          <Link
          to={practicePath(playTo, bpm)}
          className="inline-flex h-11 items-center rounded-pill bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover md:h-10"
        >
          Tocar inteira
          </Link>
        </div>
      </PageTitle>

      <div className="grid gap-6">
        <Card className="grid gap-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label} className="grid gap-0.5">
                <dt className="text-caption text-ink-subtle">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <TempoPicker bpm={bpm} limits={limits} onChange={(next) => setChosenBpm(clampBpm(next, limits))} />
          {listen.status === "tocando" ? (
            <div className="grid gap-1" role="status">
              <div className="h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
                <div className="h-full origin-left bg-primary" style={{ transform: `scaleX(${listen.progress})` }} />
              </div>
              <span className="text-caption text-ink-subtle">
                Ouvindo {listeningKey === "inteira" ? "a peça inteira" : "o trecho"} a {bpm} bpm{listen.usesSamples ? "" : ", com som sintético (sem internet para baixar o violino)"}
              </span>
            </div>
          ) : null}
        </Card>

        <Card title="Seus trechos" className="grid gap-3">
          {sections.length === 0 ? (
            <p className="text-ink-muted">Marque o trecho que o professor pediu para estudar. Ele fica guardado com o andamento de agora.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {sections.map((section: StoredSection) => (
                <SectionRow
                  key={section.id}
                  range={section}
                  bpm={clampBpm(section.bpm, limits)}
                  playTo={playTo}
                  listen={listen}
                  isListening={isListeningTo(section)}
                  onListen={() => listenTo(section, section.bpm)}
                  onRemove={section.id === undefined ? undefined : () => void removeSection(section.id!)}
                />
              ))}
            </ul>
          )}
          {measureCount > 1 ? <MarkSectionForm measureCount={measureCount} onSave={(range) => void addSection(resultId, range, bpm)} /> : null}
        </Card>

        {measureCount > 1 ? (
          <Card title="Frases" className="grid gap-2">
            <p className="text-caption text-ink-subtle">A peça dividida de 4 em 4 compassos, no andamento de estudo.</p>
            <ul className="divide-y divide-hairline">
              {phraseSections(measureCount).map((range) => (
                <SectionRow
                  key={range.firstIndex}
                  range={range}
                  bpm={bpm}
                  playTo={playTo}
                  listen={listen}
                  isListening={isListeningTo(range)}
                  onListen={() => listenTo(range, bpm)}
                />
              ))}
            </ul>
          </Card>
        ) : null}

        <Card title="Histórico">
          <HistoricoExercicio exercise={{ id: resultId, title, defaultBpm: limits.writtenBpm }} results={results} />
        </Card>

        <AddToRoutine item={{ id: resultId, title, playPath: playTo }} />

        <PieceRecordings pieceKey={resultId} title={title} />

      </div>
    </>
  );
}
