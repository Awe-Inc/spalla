import { Button } from "@/design/components";
import { canMergeWithNext, mergeWithNext, splitAt, toggleEnding, toggleFlag, type MeasureFlag } from "@/pdf/omr/corrections";
import type { ScoreMeasure } from "@/pdf/omr/structure";
import type { PlacedMeasure } from "@/pdf/scorePath";

export interface MeasureSelection {
  index: number;
  x: number;
}

const FLAG_LABELS: ReadonlyArray<{ flag: MeasureFlag; label: string; short: string }> = [
  { flag: "repeatStart", label: "Início de repetição", short: "𝄆" },
  { flag: "repeatEnd", label: "Fim de repetição", short: "𝄇" },
  { flag: "segno", label: "Segno", short: "𝄋" },
  { flag: "coda", label: "Coda", short: "𝄌" },
  { flag: "toCoda", label: "Vai para a Coda", short: "→𝄌" },
  { flag: "dalSegno", label: "D.S.", short: "D.S." },
  { flag: "daCapo", label: "D.C.", short: "D.C." },
  { flag: "fine", label: "Fine", short: "Fine" },
];
const ENDINGS = [1, 2] as const;

function measureTags(measure: ScoreMeasure): string {
  const flags = FLAG_LABELS.filter(({ flag }) => measure[flag]).map(({ short }) => short);
  const endings = (measure.endings ?? []).map((ending) => `${ending}ª`);
  return [...endings, ...flags].join(" ");
}

interface MeasureOverlayProps {
  measures: readonly ScoreMeasure[];
  placed: readonly PlacedMeasure[];
  selected: number | null;
  onSelect: (selection: MeasureSelection) => void;
  pageWidth: number;
}

export function MeasureOverlay({ measures, placed, selected, onSelect, pageWidth }: MeasureOverlayProps) {
  return (
    <>
      {placed.map((box, index) => {
        const measure = measures[index];
        if (!measure) return null;
        return (
          <button
            key={`${measure.page}-${measure.system}-${measure.x0}`}
            type="button"
            aria-label={`Compasso ${index + 1}`}
            aria-pressed={selected === index}
            className={`absolute border text-left align-top text-caption font-semibold text-primary ${selected === index ? "border-primary bg-primary/20" : "border-primary/40 bg-primary/5 hover:bg-primary/10"}`}
            style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }}
            onClick={(event) => {
              event.stopPropagation();
              const bounds = event.currentTarget.getBoundingClientRect();
              onSelect({ index, x: (box.left + event.clientX - bounds.left) / pageWidth });
            }}
          >
            <span className="absolute left-1 top-0 tabular-nums">{index + 1}</span>
            <span className="absolute right-1 top-0">{measureTags(measure)}</span>
          </button>
        );
      })}
    </>
  );
}

interface MeasureEditorProps {
  measures: readonly ScoreMeasure[];
  selection: MeasureSelection;
  onChange: (measures: readonly ScoreMeasure[]) => void;
  onClose: () => void;
}

function pillClass(isOn: boolean): string {
  return `inline-flex h-9 items-center rounded-pill px-3 text-small font-medium transition-colors ${isOn ? "bg-primary-soft text-primary" : "bg-surface-soft text-ink-muted hover:text-ink"}`;
}

export function MeasureEditor({ measures, selection, onChange, onClose }: MeasureEditorProps) {
  const { index, x } = selection;
  const measure = measures[index];
  if (!measure) return null;
  return (
    <div role="group" aria-label={`Marcações do compasso ${index + 1}`} className="grid gap-2">
      <p className="text-small font-semibold">Compasso {index + 1}</p>
      <div className="flex flex-wrap gap-2">
        {FLAG_LABELS.map(({ flag, label }) => (
          <button key={flag} type="button" className={pillClass(Boolean(measure[flag]))} aria-pressed={Boolean(measure[flag])} onClick={() => onChange(toggleFlag(measures, index, flag))}>
            {label}
          </button>
        ))}
        {ENDINGS.map((ending) => {
          const isOn = Boolean(measure.endings?.includes(ending));
          return (
            <button key={ending} type="button" className={pillClass(isOn)} aria-pressed={isOn} onClick={() => onChange(toggleEnding(measures, index, ending))}>
              {ending}ª casa
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={!canMergeWithNext(measures, index)}
          onClick={() => {
            onChange(mergeWithNext(measures, index));
            onClose();
          }}
        >
          Juntar com o próximo
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            onChange(splitAt(measures, index, x));
            onClose();
          }}
        >
          Dividir onde toquei
        </Button>
      </div>
    </div>
  );
}
