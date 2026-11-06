import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { rememberSheetScrollPlan } from "@/data/sheets";
import { Button } from "@/design/components";
import { COMPACT_FIELD_CLASS } from "@/design/fields";
import { bumpBpm, DEFAULT_SCROLL_PLAN, formatPieceDuration, isFieldValid, isPlanReady, keyToRollAction, pageAtY, pieceSeconds, PLAN_LIMITS, stackPages, type ScrollPlan } from "@/pdf/autoScroll";
import type { Box } from "@/pdf/fit";
import { cancelRender, isRenderCancelled, pdfPageSizes, renderPdfPage, type PdfDocument } from "@/pdf/pdfDocument";

import { shouldLeaveKeyToTarget } from "./teclas";
import { useAutoScroll } from "./useAutoScroll";

const PAGE_GAP_PX = 8;
const BPM_STEP = 2;
const NEAR_PAGES_MARGIN = "100% 0px";

interface PartituraRolanteProps {
  document: PdfDocument;
  sheetId: number;
  startPage: number;
  savedPlan: ScrollPlan | undefined;
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
  field: keyof ScrollPlan;
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

export function PartituraRolante({ document, sheetId, startPage, savedPlan, onPage, onError }: PartituraRolanteProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<HTMLDivElement | null>(null);
  const seededRef = useRef(false);
  const [plan, setPlan] = useState<ScrollPlan>(savedPlan ?? DEFAULT_SCROLL_PLAN);
  const sizes = usePageSizes(document, onError);
  const box = useElementBox(containerRef);
  const stack = useMemo(() => stackPages(sizes ?? [], box.width, PAGE_GAP_PX), [sizes, box.width]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const lastPageRef = useRef(startPage);
  const isReady = isPlanReady(plan);

  const onReadingY = useCallback(
    (readingY: number) => {
      if (!seededRef.current) return;
      const page = pageAtY(stackRef.current, readingY);
      if (page === lastPageRef.current) return;
      lastPageRef.current = page;
      onPage(page);
    },
    [onPage],
  );

  const roll = useAutoScroll({ containerRef, markerRef, viewHeight: box.height, contentHeight: stack.contentHeight, plan, onReadingY });
  const { seek, toggle, nudge, status, countdown } = roll;

  useEffect(() => {
    if (seededRef.current || stack.contentHeight === 0 || box.height === 0) return;
    seek(stack.tops[startPage - 1] ?? 0);
    seededRef.current = true;
  }, [stack, box.height, startPage, seek]);

  const changePlan = useCallback(
    (next: ScrollPlan) => {
      setPlan(next);
      if (isPlanReady(next)) rememberSheetScrollPlan(sheetId, next).catch(() => undefined);
    },
    [sheetId],
  );

  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (shouldLeaveKeyToTarget(event)) return;
      const action = keyToRollAction(event);
      if (!action || !isPlanReady(planRef.current)) return;
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
            if (isReady) toggle();
          }}
        >
          <div className="flex flex-col" style={{ gap: PAGE_GAP_PX }}>
            {stack.heights.map((height, index) => (
              <PaginaEmpilhada key={index} document={document} page={index + 1} width={box.width} height={height} rootRef={containerRef} onError={onError} />
            ))}
          </div>
        </div>
        <div ref={markerRef} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary/40" />
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
          <PlanField field="measures" label="Compassos" value={plan.measures} onCommit={(measures) => changePlan({ ...plan, measures })} />
          <PlanField field="beatsPerMeasure" label="Tempos por compasso" value={plan.beatsPerMeasure} onCommit={(beatsPerMeasure) => changePlan({ ...plan, beatsPerMeasure })} />
          <PlanField field="bpm" label="Bpm" value={plan.bpm} onCommit={(bpm) => changePlan({ ...plan, bpm })} />
          <Button variant="secondary" onClick={() => changePlan(bumpBpm(plan, -BPM_STEP))} aria-label={`Diminuir ${BPM_STEP} bpm`}>
            −
          </Button>
          <Button variant="secondary" onClick={() => changePlan(bumpBpm(plan, BPM_STEP))} aria-label={`Aumentar ${BPM_STEP} bpm`}>
            +
          </Button>
          {isReady ? <p className="tabular-nums text-ink-muted">Duração {formatPieceDuration(pieceSeconds(plan))}</p> : null}
        </div>
        <p className="text-caption text-ink-subtle">
          {isReady ? "Espaço começa e pausa. ↑ ↓ mudam o andamento. ← → ou o pedal andam um compasso. Rolar com o dedo reposiciona a leitura." : "Diga quantos compassos a peça tem para calcular a velocidade."}
        </p>
      </section>
    </>
  );
}
