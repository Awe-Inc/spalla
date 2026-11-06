import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { useSettings } from "@/app/settings";
import { useCore } from "@/core/useCore";
import { importPieceFile } from "@/data/importPiece";
import { describeStorageError } from "@/data/storageErrors";
import { Button, ConfirmButton, InlineError } from "@/design/components";
import { displayNoteName } from "@/music/noteNames";
import { readScoreNotes } from "@/pdf/omr/analyzePdf";
import type { TimedMeasure } from "@/pdf/omr/meter";
import { musicXmlFromReading } from "@/pdf/omr/musicXmlWriter";
import { EDITABLE_QUARTERS, measuresToReview, shiftedPitch, withDuration, withoutNote } from "@/pdf/omr/noteEdits";
import type { ScoreStructure } from "@/pdf/omr/structure";
import type { PdfDocument } from "@/pdf/pdfDocument";

type PitchNamer = (midi: number, fifths: number) => string;

type Conversion = { step: "parada" } | { step: "lendo"; done: number; total: number } | { step: "revisando"; measures: readonly TimedMeasure[] } | { step: "salva"; pieceId: number } | { step: "falhou"; message: string };

const SAVE_FAILED_STEP = "Suas correções continuam aqui. Tente salvar de novo.";

interface ConversaoPartituraProps {
  document: PdfDocument;
  structure: ScoreStructure;
  title: string;
  onShowMeasure: (measure: number) => void;
}

function isEditableDuration(quarters: number): boolean {
  return (EDITABLE_QUARTERS as readonly number[]).includes(quarters);
}

interface MeasureEditorProps {
  measure: TimedMeasure;
  nameOf: PitchNamer;
  onChange: (measure: TimedMeasure) => void;
}

function NotasDoCompasso({ measure, nameOf, onChange }: MeasureEditorProps) {
  return (
    <ul className="grid gap-1">
      {measure.notes.map((note, index) => (
        <li key={`${note.x}-${index}`} className="flex flex-wrap items-center gap-2 text-small">
          <span className="min-w-20 tabular-nums">{note.isRest ? "Pausa" : note.midi.map((midi) => nameOf(midi, measure.fifths)).join(" + ")}</span>
          {note.isRest ? null : (
            <>
              <Button variant="ghost" aria-label="Meio tom abaixo" onClick={() => onChange(shiftedPitch(measure, index, -1))}>
                −
              </Button>
              <Button variant="ghost" aria-label="Meio tom acima" onClick={() => onChange(shiftedPitch(measure, index, 1))}>
                +
              </Button>
            </>
          )}
          <label className="flex items-center gap-1 text-caption text-ink-subtle">
            Tempos
            <select
              className="rounded-md border border-hairline bg-surface px-1 py-0.5 text-ink"
              value={isEditableDuration(note.quarters) ? note.quarters : ""}
              onChange={(event) => onChange(withDuration(measure, index, Number(event.target.value)))}
            >
              {isEditableDuration(note.quarters) ? null : <option value="">{note.quarters.toFixed(2)}</option>}
              {EDITABLE_QUARTERS.map((quarters) => (
                <option key={quarters} value={quarters}>
                  {quarters}
                </option>
              ))}
            </select>
          </label>
          <Button variant="ghost" onClick={() => onChange(withoutNote(measure, index))}>
            Tirar
          </Button>
        </li>
      ))}
    </ul>
  );
}

interface CompassosParaRevisarProps {
  measures: readonly TimedMeasure[];
  nameOf: PitchNamer;
  onChange: (index: number, measure: TimedMeasure) => void;
  onShowMeasure: (measure: number) => void;
}

function CompassosParaRevisar({ measures, nameOf, onChange, onShowMeasure }: CompassosParaRevisarProps) {
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const flagged = measuresToReview(measures);
  const shown = showAll ? measures.map((_, index) => index) : flagged;
  return (
    <div className="grid max-h-64 gap-2 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2 text-small">
        <p data-testid="conversao-resumo" className="text-ink-muted">
          {measures.length - flagged.length} de {measures.length} compassos fecham a conta. Os outros pedem conferência.
        </p>
        <Button variant="ghost" aria-pressed={showAll} onClick={() => setShowAll((current) => !current)}>
          {showAll ? "Só os que não fecham" : "Ver todos os compassos"}
        </Button>
      </div>
      <ul className="grid gap-1">
        {shown.map((index) => {
          const measure = measures[index];
          if (!measure) return null;
          return (
            <li key={index} className="grid gap-1 rounded-md border border-hairline p-2">
              <div className="flex items-center gap-2 text-small">
                <button
                  type="button"
                  className="font-semibold underline-offset-2 hover:underline"
                  aria-expanded={open === index}
                  onClick={() => {
                    onShowMeasure(index);
                    setOpen((current) => (current === index ? null : index));
                  }}
                >
                  Compasso {index + 1}
                </button>
                <span className="text-ink-muted">
                  {measure.numerator}/{measure.denominator}, {measure.notes.length} {measure.notes.length === 1 ? "símbolo" : "símbolos"}
                </span>
                {measure.addsUp ? null : <span className="text-caption text-ink-subtle">não fecha</span>}
              </div>
              {open === index ? <NotasDoCompasso measure={measure} nameOf={nameOf} onChange={(next) => onChange(index, next)} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface RevisaoProps {
  initial: readonly TimedMeasure[];
  structure: ScoreStructure;
  title: string;
  onShowMeasure: (measure: number) => void;
  onSaved: (pieceId: number) => void;
  onCancel: () => void;
}

function RevisaoDaLeitura({ initial, structure, title, onShowMeasure, onSaved, onCancel }: RevisaoProps) {
  const core = useCore();
  const naming = useSettings((state) => state.noteNaming);
  const [measures, setMeasures] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async () => {
    if (core.status !== "ready") return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const xml = musicXmlFromReading({ title, bpm: structure.bpm ?? null, measures: [...measures], structure: [...structure.measures] });
      const outcome = await importPieceFile(core.core, new File([xml], `${title}.musicxml`, { type: "application/xml" }));
      if (outcome.ok && outcome.piece.id !== undefined) onSaved(outcome.piece.id);
      else setSaveError(outcome.ok ? "A peça não foi salva." : outcome.error);
    } catch (error) {
      setSaveError(describeStorageError(error, "a peça"));
    } finally {
      setIsSaving(false);
    }
  };

  const nameOf: PitchNamer = (midi, fifths) => (core.status === "ready" ? displayNoteName(core.core.noteName(midi, fifths), naming) : String(midi));

  return (
    <div data-testid="conversao" className="grid gap-2">
      <CompassosParaRevisar measures={measures} nameOf={nameOf} onChange={(index, next) => setMeasures((current) => current.map((measure, position) => (position === index ? next : measure)))} onShowMeasure={onShowMeasure} />
      {core.status === "error" ? <InlineError title="O núcleo não carregou." nextStep={core.message} /> : null}
      {saveError ? <InlineError title={saveError} nextStep={SAVE_FAILED_STEP} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={core.status !== "ready" || isSaving} onClick={() => void save()}>
          Salvar no repertório
        </Button>
        <ConfirmButton variant="ghost" label="Cancelar" confirmLabel="Descartar" question="Descartar a leitura e as correções?" onConfirm={onCancel} />
      </div>
    </div>
  );
}

export function ConversaoPartitura({ document, structure, title, onShowMeasure }: ConversaoPartituraProps) {
  const [conversion, setConversion] = useState<Conversion>({ step: "parada" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const stopReading = () => {
    controllerRef.current?.abort();
    setConversion({ step: "parada" });
  };

  const read = () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setConversion({ step: "lendo", done: 0, total: document.numPages });
    readScoreNotes(document, structure.measures, (done, total) => setConversion({ step: "lendo", done, total }), controller.signal)
      .then((measures) => {
        if (controller.signal.aborted) return;
        if (measures.length !== structure.measures.length) {
          setConversion({ step: "falhou", message: "As notas lidas não bateram com os compassos desta partitura." });
          return;
        }
        setConversion({ step: "revisando", measures });
      })
      .catch(() => {
        if (!controller.signal.aborted) setConversion({ step: "falhou", message: "Não deu para ler as notas deste PDF." });
      });
  };

  if (conversion.step === "parada") {
    return (
      <Button variant="ghost" onClick={read}>
        Converter em partitura tocável
      </Button>
    );
  }
  if (conversion.step === "lendo") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className="text-small text-ink-muted">
          Lendo as notas… página {Math.min(conversion.done + 1, conversion.total)} de {conversion.total}
        </p>
        <Button variant="ghost" onClick={stopReading}>
          Parar
        </Button>
      </div>
    );
  }
  if (conversion.step === "falhou") return <InlineError title="A conversão não deu certo." nextStep={conversion.message} action={<Button variant="secondary" onClick={read}>Tentar de novo</Button>} />;
  if (conversion.step === "salva") {
    return (
      <p role="status" className="text-small text-ink-muted">
        Salva no repertório.{" "}
        <Link className="underline" to={`/repertorio/peca/musica/${conversion.pieceId}`}>
          Abrir a peça
        </Link>
      </p>
    );
  }
  return <RevisaoDaLeitura initial={conversion.measures} structure={structure} title={title} onShowMeasure={onShowMeasure} onSaved={(pieceId) => setConversion({ step: "salva", pieceId })} onCancel={() => setConversion({ step: "parada" })} />;
}
