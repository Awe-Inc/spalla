import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { rememberSheetScrollPlan } from "@/data/sheets";
import { Button } from "@/design/components";
import { COMPACT_FIELD_CLASS } from "@/design/fields";
import { bumpBpm, DEFAULT_SCROLL_PLAN, formatPieceDuration, isFieldValid, isPlanReady, keyToRollAction, linearReading, pageAtY, pieceSeconds, PLAN_LIMITS, stackPages, type PlanField, type ScrollPlan } from "@/pdf/autoScroll";
import type { Box } from "@/pdf/fit";
import type { ScoreStructure } from "@/pdf/omr/structure";
import { cancelRender, isRenderCancelled, pdfPageSizes, renderPdfPage, type PdfDocument } from "@/pdf/pdfDocument";
import { buildTimeline, commonBeatsOf, currentMeasure, pathRanges, readingMapOf, totalBeatsOf, upcomingNotice, type PathNotice, type PlacedMeasure } from "@/pdf/scorePath";

import { ConversaoPartitura } from "./ConversaoPartitura";
import { MeasureEditor, MeasureOverlay, type MeasureSelection } from "./CorrecaoEstrutura";
import { shouldLeaveKeyToTarget } from "./teclas";
import { useAutoScroll } from "./useAutoScroll";
import { useScoreStructure } from "./useScoreStructure";

const PAGE_GAP_PX = 8;
const BPM_STEP = 2;
const NEAR_PAGES_MARGIN = "100% 0px";

interface PartituraRolanteProps {
  document: PdfDocument;
  sheetId: number;
  startPage: number;
  savedPlan: ScrollPlan | undefined;
  savedStructure: ScoreStructure | undefined;
  title: string;
  onPage: (page: number) => void;
  onError: (message: string) => void;
}

interface PaginaEmpilhadaProps {
  document: PdfDocument;
  page: number;
  width: number;
  height: number;
  rootRef: RefObject<HTMLElement | null>;
  onError: (message: string) => void;
}

function PaginaEmpilhada({ document, page, width, height, rootRef, onError }: PaginaEmpilhadaProps) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const observer = new IntersectionObserver(([entry]) => setIsNear(entry?.isIntersecting ?? false), { root: rootRef.current, rootMargin: NEAR_PAGES_MARGIN });
    observer.observe(slot);
    return () => observer.disconnect();
  }, [rootRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isNear || width === 0) return;
    const controller = new AbortController();
    renderPdfPage(document, page, canvas, { width, height: 0 }, "largura", window.devicePixelRatio || 1, controller.signal).catch((error: unknown) => {
      if (controller.signal.aborted || isRenderCancelled(error)) return;
      onError(error instanceof Error ? error.message : "A página não desenhou.");
    });
    return () => {
      controller.abort();
      cancelRender(canvas);
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [document, page, width, isNear, onError]);

  return (
    <div ref={slotRef} className="flex shrink-0 justify-center bg-surface shadow-card" style={{ height }}>
      <canvas ref={canvasRef} role="img" aria-label={`Página ${page}`} />
    </div>
  );
}

function usePageSizes(document: PdfDocument, onError: (message: string) => void): Box[] | null {
  const [sizes, setSizes] = useState<Box[] | null>(null);
  useEffect(() => {
    let isCurrent = true;
    pdfPageSizes(document)
      .then((next) => {
        if (isCurrent) setSizes(next);
      })
      .catch((error: unknown) => {
        if (isCurrent) onError(error instanceof Error ? error.message : "O PDF não abriu.");
      });
    return () => {
      isCurrent = false;
    };
  }, [document, onError]);
  return sizes;
}

function useElementBox(ref: RefObject<HTMLElement | null>): Box {
  const [box, setBox] = useState<Box>({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      setBox((current) => (current.width === next.width && current.height === next.height ? current : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [ref]);
  return box;
}

interface PlanFieldProps {
  field: PlanField;
  label: string;
  value: number;
  onCommit: (value: number) => void;
}

function PlanField({ field, label, value, onCommit }: PlanFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value > 0 ? String(value) : "");
  return (
    <label className="grid gap-1 text-caption text-ink-subtle">
      {label}
      <input
        type="number"
        inputMode="numeric"
        className={`${COMPACT_FIELD_CLASS} w-20`}
        min={PLAN_LIMITS[field].min}
        max={PLAN_LIMITS[field].max}
        value={shown}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number(event.target.value);
          if (isFieldValid(field, next)) onCommit(next);
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}

const STATUS_ACTION = { parada: "Começar", contando: "Cancelar", rolando: "Pausar" } as const;

function placeBox(element: HTMLElement | null, box: PlacedMeasure | undefined): void {
  if (!element) return;
  element.style.display = box ? "block" : "none";
  if (!box) return;
  element.style.transform = `translate(${box.left}px, ${box.top}px)`;
  element.style.width = `${box.right - box.left}px`;
  element.style.height = `${box.bottom - box.top}px`;
}

export function PartituraRolante({ document, sheetId, startPage, savedPlan, savedStructure, title, onPage, onError }: PartituraRolanteProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<HTMLDivElement | null>(null);
  const currentBoxRef = useRef<HTMLDivElement | null>(null);
  const targetBoxRef = useRef<HTMLDivElement | null>(null);
  const noticeTextRef = useRef<string | null>(null);
  const [notice, setNotice] = useState<PathNotice | null>(null);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [selection, setSelection] = useState<MeasureSelection | null>(null);
  const { reading: structureReading, correct } = useScoreStructure(document, sheetId, savedStructure);
  const seededRef = useRef(false);
  const [plan, setPlan] = useState<ScrollPlan>(savedPlan ?? DEFAULT_SCROLL_PLAN);
  const sizes = usePageSizes(document, onError);
  const box = useElementBox(containerRef);
  const stack = useMemo(() => stackPages(sizes ?? [], box.width, PAGE_GAP_PX), [sizes, box.width]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const lastPageRef = useRef(startPage);
  const measures = structureReading.status === "pronta" ? structureReading.structure.measures : [];
  const timeline = useMemo(() => (measures.length > 0 && box.width > 0 ? buildTimeline(measures, stack, box.width) : null), [measures, stack, box.width]);
  const readBpm = structureReading.status === "pronta" ? structureReading.structure.bpm : undefined;
  useEffect(() => {
    if (readBpm === undefined || savedPlan) return;
    setPlan((current) => (current.bpm === DEFAULT_SCROLL_PLAN.bpm ? { ...current, bpm: readBpm } : current));
  }, [readBpm, savedPlan]);
  const readBeats = timeline && !plan.beatsTyped ? commonBeatsOf(timeline) : null;
  const shownPlan = useMemo(() => (readBeats === null ? plan : { ...plan, beatsPerMeasure: readBeats }), [plan, readBeats]);
  const effectivePlan = useMemo(() => (timeline ? { ...shownPlan, measures: timeline.order.length, totalBeats: plan.beatsTyped ? null : totalBeatsOf(timeline) } : shownPlan), [timeline, shownPlan, plan.beatsTyped]);
  const readingMap = useMemo(() => (timeline ? readingMapOf(timeline, shownPlan.beatsPerMeasure) : linearReading(stack.contentHeight)), [timeline, shownPlan.beatsPerMeasure, stack.contentHeight]);
  const isReadingScore = structureReading.status === "lendo";
  const isReady = isPlanReady(effectivePlan) && !isReadingScore;
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  const onReadingY = useCallback(
    (readingY: number, progress: number) => {
      const path = timelineRef.current;
      const next = path ? upcomingNotice(path, progress) : null;
      if (path) {
        placeBox(currentBoxRef.current, path.placed[currentMeasure(path, progress)]);
        placeBox(targetBoxRef.current, next?.target !== null && next?.target !== undefined ? path.placed[next.target] : undefined);
      }
      const nextText = next?.text ?? null;
      if (nextText !== noticeTextRef.current) {
        noticeTextRef.current = nextText;
        setNotice(next);
      }
      if (!seededRef.current) return;
      const page = pageAtY(stackRef.current, readingY);
      if (page === lastPageRef.current) return;
      lastPageRef.current = page;
      onPage(page);
    },
    [onPage],
  );

  const roll = useAutoScroll({ containerRef, markerRef, viewHeight: box.height, contentHeight: stack.contentHeight, plan: effectivePlan, reading: readingMap, onReadingY });
  const { seek, toggle, nudge, status, countdown } = roll;

  useEffect(() => {
    if (seededRef.current || stack.contentHeight === 0 || box.height === 0 || isReadingScore) return;
    seek(stack.tops[startPage - 1] ?? 0);
    seededRef.current = true;
  }, [stack, box.height, startPage, seek, isReadingScore]);

  const changePlan = useCallback(
    (next: ScrollPlan) => {
      setPlan(next);
      const pathLength = timelineRef.current?.order.length;
      const toKeep = pathLength ? { ...next, measures: pathLength } : next;
      if (isPlanReady(toKeep)) rememberSheetScrollPlan(sheetId, toKeep).catch(() => undefined);
    },
    [sheetId],
  );

  const planRef = useRef(plan);
  planRef.current = plan;
  const isReadyRef = useRef(isReady);
  isReadyRef.current = isReady;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (shouldLeaveKeyToTarget(event)) return;
      const action = keyToRollAction(event);
      if (!action || !isReadyRef.current) return;
      event.preventDefault();
      if (action === "toggle") toggle();
      else if (action === "faster") changePlan(bumpBpm(planRef.current, BPM_STEP));
      else if (action === "slower") changePlan(bumpBpm(planRef.current, -BPM_STEP));
      else nudge(action === "forward" ? 1 : -1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, nudge, changePlan]);

  return (
    <>
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          data-testid="partitura-rolante"
          className="h-full overflow-y-auto"
          onClick={() => {
            if (isReady && !isCorrecting) toggle();
          }}
        >
          <div className="relative flex flex-col" style={{ gap: PAGE_GAP_PX }}>
            {stack.heights.map((height, index) => (
              <PaginaEmpilhada key={index} document={document} page={index + 1} width={box.width} height={height} rootRef={containerRef} onError={onError} />
            ))}
            {timeline ? (
              <div className={isCorrecting ? "hidden" : "contents"}>
                <div ref={currentBoxRef} data-testid="compasso-atual" aria-hidden="true" className="pointer-events-none absolute left-0 top-0 hidden rounded-sm border-2 border-primary bg-primary/10" />
                <div ref={targetBoxRef} data-testid="compasso-destino" aria-hidden="true" className="pointer-events-none absolute left-0 top-0 hidden rounded-sm border-2 border-dashed border-primary" />
              </div>
            ) : null}
            {timeline && isCorrecting ? <MeasureOverlay measures={timeline.measures} placed={timeline.placed} selected={selection?.index ?? null} pageWidth={box.width} onSelect={setSelection} /> : null}
          </div>
        </div>
        {timeline ? null : <div ref={markerRef} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary/40" />}
        {notice && !isCorrecting ? (
          <p role="status" className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-pill bg-primary px-4 py-2 font-semibold text-on-primary shadow-card">
            {notice.text}
          </p>
        ) : null}
        {status === "contando" ? (
          <p role="status" className="pointer-events-none absolute inset-x-0 top-1/3 text-center font-display text-note text-ink">
            Começa em {countdown}
          </p>
        ) : null}
      </div>
      <section aria-label="Rolagem automática" className="grid gap-2 border-t border-hairline bg-surface px-4 py-2">
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="primary" onClick={toggle} disabled={!isReady}>
            {STATUS_ACTION[status]}
          </Button>
          {timeline ? null : <PlanField field="measures" label="Compassos" value={plan.measures} onCommit={(typed) => changePlan({ ...plan, measures: typed })} />}
          <PlanField field="beatsPerMeasure" label="Tempos por compasso" value={shownPlan.beatsPerMeasure} onCommit={(beatsPerMeasure) => changePlan({ ...plan, beatsPerMeasure, beatsTyped: true })} />
          <PlanField field="bpm" label="Bpm" value={plan.bpm} onCommit={(bpm) => changePlan({ ...plan, bpm })} />
          <Button variant="secondary" onClick={() => changePlan(bumpBpm(plan, -BPM_STEP))} aria-label={`Diminuir ${BPM_STEP} bpm`}>
            −
          </Button>
          <Button variant="secondary" onClick={() => changePlan(bumpBpm(plan, BPM_STEP))} aria-label={`Aumentar ${BPM_STEP} bpm`}>
            +
          </Button>
          {isReady ? <p className="tabular-nums text-ink-muted">Duração {formatPieceDuration(pieceSeconds(effectivePlan))}</p> : null}
          {timeline ? (
            <Button
              variant="ghost"
              aria-pressed={isCorrecting}
              onClick={() => {
                if (status !== "parada") toggle();
                setSelection(null);
                setIsCorrecting((current) => !current);
              }}
            >
              {isCorrecting ? "Terminar a correção" : "Corrigir marcações"}
            </Button>
          ) : null}
        </div>
        {structureReading.status === "lendo" ? (
          <p role="status" className="text-small text-ink-muted">
            Lendo a partitura… página {Math.min(structureReading.done + 1, structureReading.total)} de {structureReading.total}
          </p>
        ) : null}
        {structureReading.status === "falhou" ? <p className="text-small text-ink-muted">Não consegui ler os compassos deste PDF. Diga quantos são e a rolagem segue em linha reta.</p> : null}
        {structureReading.status === "pronta" && !timeline ? <p className="text-small text-ink-muted">Não achei pautas neste PDF. Diga quantos compassos ele tem e a rolagem segue em linha reta.</p> : null}
        {timeline ? (
          <p data-testid="percurso" className="text-small text-ink-muted">
            {timeline.measures.length} compassos lidos, {timeline.order.length} tocados. Percurso: {pathRanges(timeline.order)}.
          </p>
        ) : null}
        {timeline && structureReading.status === "pronta" && !structureReading.structure.hasTextLayer ? (
          <p className="text-small text-ink-muted">{structureReading.structure.ocrRead ? "Este PDF é uma imagem: D.S., D.C. e Fine foram lidos por OCR, que pode errar ou deixar passar." : "Este PDF é uma imagem e o OCR não pôde rodar: D.S., D.C. e Fine escritos não foram lidos."} Confira o percurso e marque o que faltar em “Corrigir marcações”.</p>
        ) : null}
        {timeline && structureReading.status === "pronta" ? <ConversaoPartitura document={document} structure={structureReading.structure} title={title} onShowMeasure={(measure) => seek(timeline.placed[measure]?.top ?? 0)} /> : null}
        {isCorrecting && !selection ? <p className="text-small text-ink-muted">Toque em um compasso para corrigir as marcações dele.</p> : null}
        {isCorrecting && selection ? <MeasureEditor measures={measures} selection={selection} onChange={correct} onClose={() => setSelection(null)} /> : null}
        <p className="text-caption text-ink-subtle">
          {isReady || isReadingScore ? "Espaço começa e pausa. ↑ ↓ mudam o andamento. ← → ou o pedal andam um compasso. Rolar com o dedo reposiciona a leitura." : "Diga quantos compassos a peça tem para calcular a velocidade."}
        </p>
      </section>
    </>
  );
}
