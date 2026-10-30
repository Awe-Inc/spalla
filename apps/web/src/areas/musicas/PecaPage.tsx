import type { MeasureRange } from "@fretless/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { useSettings } from "@/app/settings";
import { useListen } from "@/audio/useListen";
import { RecordingAudio, recordingDate } from "@/areas/ferramentas/RecordingPlayer";
import { AddToRoutine } from "@/areas/musicas/AddToRoutine";
import { HistoricoExercicio } from "@/areas/estudar/HistoricoExercicio";
import { ListenSoundPicker } from "@/areas/tocar/ListenSoundPicker";
import { clampBpm } from "@/areas/tocar/tempo";
import { useSession } from "@/areas/tocar/useSession";
import { db } from "@/data/db";
import { formatClock, newestFirst, recorderPath } from "@/data/recordings";
import { addSection, phraseSections, practicePath, removeSection, sortedSections } from "@/data/sections";
import { ButtonLink, Card, InlineError } from "@/design/components";
import { ChoiceChips } from "@/design/fields";
import { List, PageHeader, Section, SkeletonList, Stat, Stats } from "@/design/layout";
import { formatDuration, majorKeyName } from "@/music/noteNames";

import { ListenButton, MarkSectionForm, SectionRow, TempoPicker } from "./PecaTrechos";

const BACK = { to: "/repertorio", label: "Repertório" };
const RECENT_PIECE_RECORDINGS = 3;

type SectionView = "seus" | "frases";

const SECTION_VIEWS: { value: SectionView; label: string }[] = [
  { value: "seus", label: "Seus trechos" },
  { value: "frases", label: "Frases automáticas" },
];

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

function PieceRecordings({ pieceKey, title }: { pieceKey: string; title: string }) {
  const recordings = useLiveQuery(async () => newestFirst(await db.recordings.where("pieceKey").equals(pieceKey).toArray()), [pieceKey]) ?? [];
  const recent = recordings.slice(0, RECENT_PIECE_RECORDINGS);
  return (
    <Card title="Gravações" className="grid gap-3">
      {recent.length === 0 ? (
        <p className="text-small text-ink-muted">Grave uma passada hoje. Daqui a algumas semanas, compare com a próxima e escute o que mudou.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {recent.map((recording) => (
            <li key={recording.id} className="grid gap-2 py-3 first:pt-0">
              <span className="grid gap-0.5">
                <span className="font-medium">{recording.name}</span>
                <span className="text-caption text-ink-subtle">
                  {recordingDate(recording.createdAt)}, <span className="font-mono tabular">{formatClock(recording.durationMs)}</span>
                </span>
              </span>
              <RecordingAudio recording={recording} />
            </li>
          ))}
        </ul>
      )}
      <ButtonLink to={recorderPath({ key: pieceKey, title })} icon="gravar" className="w-full">
        {recordings.length >= 2 ? "Gravar e comparar" : "Gravar esta peça"}
      </ButtonLink>
    </Card>
  );
}

function ListeningStatus({ progress, isWhole, bpm, usesSamples }: { progress: number; isWhole: boolean; bpm: number; usesSamples: boolean }) {
  return (
    <div className="grid gap-1.5" role="status">
      <div className="h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
        <div className="h-full origin-left bg-primary" style={{ transform: `scaleX(${progress})` }} />
      </div>
      <span className="text-small text-ink-muted">
        Ouvindo {isWhole ? "a peça inteira" : "o trecho"} a <span className="font-mono tabular">{bpm}</span> bpm
        {usesSamples ? "" : ", com som sintético (sem internet para baixar o violino)"}
      </span>
    </div>
  );
}

export function PecaPage() {
  const { exerciseId, pieceId, librarySlug } = useParams();
  const { coreStatus, session, exercise, score, error, resultId, limits, bpm: sessionBpm, setBpm } = useSession(exerciseId, pieceId, librarySlug);
  const naming = useSettings((state) => state.noteNaming);
  const [chosenBpm, setChosenBpm] = useState<number | null>(null);
  const [view, setView] = useState<SectionView>("seus");
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
        <PageHeader back={BACK} title="Peça" />
        <InlineError title="Essa música não abriu." nextStep={error} />
      </>
    );
  }
  if (coreStatus.status !== "ready" || !score || !limits || !session || !resultId) {
    return (
      <>
        <PageHeader back={BACK} title="Abrindo a partitura…" />
        <SkeletonList rows={4} label="Abrindo a partitura…" />
      </>
    );
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
  const hasPhrases = measureCount > 1;
  const shownView = hasPhrases ? view : "seus";

  return (
    <>
      <PageHeader
        back={BACK}
        title={title}
        isWorkTitle
        description={composer}
        actions={
          <>
            <ListenSoundPicker />
            <ListenButton listen={listen} isActive={isListeningTo(null)} label="a peça inteira" onListen={() => listenTo(null, bpm)} />
            <ButtonLink to={practicePath(playTo, bpm)} variant="primary" icon="play">
              Tocar inteira
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-8">
        <Stats label="Sobre a peça" className="rounded-lg bg-surface-sunken/60 p-5 ring-1 ring-inset ring-hairline">
          <Stat label="Tom" value={<span className="font-sans text-heading font-semibold">{majorKeyName(score.keyFifths, naming)}</span>} />
          <Stat label="Compasso" value={`${score.beatsPerMeasure}/${score.beatUnit}`} />
          <Stat label="Andamento escrito" value={limits.writtenBpm} />
          <Stat label="Duração" value={formatDuration((score.durationSeconds * sessionBpm) / limits.writtenBpm)} />
          <Stat label="Compassos" value={measureCount} />
        </Stats>

        {listen.status === "tocando" ? <ListeningStatus progress={listen.progress} isWhole={listeningKey === "inteira"} bpm={bpm} usesSamples={listen.usesSamples} /> : null}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
          <Section
            title="Trechos"
            description={shownView === "seus" ? "O trecho que o professor pediu, guardado com o andamento de agora." : "A peça dividida de 4 em 4 compassos, no andamento de estudo."}
            action={hasPhrases ? <ChoiceChips name="vista-trechos" label="Quais trechos" value={shownView} options={SECTION_VIEWS} onChange={setView} /> : undefined}
          >
            <div className="grid min-w-0 gap-4">
              {shownView === "seus" && sections.length === 0 ? (
                <p className="rounded-md bg-surface-sunken/60 px-4 py-3 text-small text-ink-muted ring-1 ring-inset ring-hairline">Nenhum trecho ainda. Escolha os compassos abaixo e guarde.</p>
              ) : null}
              {shownView === "seus" && sections.length > 0 ? (
                <List label="Seus trechos">
                  {sections.map((section) => (
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
                </List>
              ) : null}
              {shownView === "seus" && hasPhrases ? <MarkSectionForm measureCount={measureCount} onSave={(range) => void addSection(resultId, range, bpm)} /> : null}
              {shownView === "frases" ? (
                <List label="Frases automáticas">
                  {phraseSections(measureCount).map((range) => (
                    <SectionRow key={range.firstIndex} range={range} bpm={bpm} playTo={playTo} listen={listen} isListening={isListeningTo(range)} onListen={() => listenTo(range, bpm)} />
                  ))}
                </List>
              ) : null}
            </div>
          </Section>

          <aside className="grid min-w-0 gap-4" aria-label="Estudo da peça">
            <Card title="Andamento de estudo">
              <TempoPicker bpm={bpm} limits={limits} onChange={(next) => setChosenBpm(clampBpm(next, limits))} />
            </Card>
            <AddToRoutine item={{ id: resultId, title, playPath: playTo }} />
            <PieceRecordings pieceKey={resultId} title={title} />
          </aside>
        </div>

        <Section title="Histórico">
          <HistoricoExercicio exercise={{ id: resultId, title, defaultBpm: limits.writtenBpm }} results={results} />
        </Section>
      </div>
    </>
  );
}
