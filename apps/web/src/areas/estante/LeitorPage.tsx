import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { db } from "@/data/db";
import { clampPage, readSheetBytes, rememberSheetPage, touchSheet } from "@/data/sheets";
import { Button, EmptyState, InlineError } from "@/design/components";
import { nextFit, pageFromTap, type PageFit } from "@/pdf/fit";
import { closePdf, openPdf, type PdfDocument } from "@/pdf/pdfDocument";

import { PaginaPdf } from "./PaginaPdf";
import { PainelFerramentas } from "./PainelFerramentas";

const FIT_LABEL: Record<PageFit, string> = { pagina: "Página inteira", largura: "Largura" };
const PANEL_ID = "leitor-ferramentas";

export function keyToPageDelta(event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey">): number {
  if (event.altKey || event.ctrlKey || event.metaKey) return 0;
  if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") return 1;
  if (event.key === "ArrowLeft" || event.key === "PageUp") return -1;
  return 0;
}

function shouldLeaveKeyToTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return true;
  return event.key === " " && target.tagName === "BUTTON";
}

function useSheetDocument(sheetId: number) {
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let opened: PdfDocument | null = null;
    let cancelled = false;
    touchSheet(sheetId).catch(() => undefined);
    readSheetBytes(sheetId)
      .then((bytes) => {
        if (!bytes) throw new Error("Essa partitura não está mais na estante.");
        return openPdf(bytes);
      })
      .then((pdf) => {
        if (cancelled) {
          void closePdf(pdf);
          return;
        }
        opened = pdf;
        setDocument(pdf);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "O PDF não abriu.");
      });
    return () => {
      cancelled = true;
      if (opened) void closePdf(opened);
    };
  }, [sheetId]);

  return { document, error };
}

function NaoEncontrada() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <EmptyState title="Essa partitura não está na estante." description="Ela pode ter sido removida." action={<Link to="/musicas/estante">Voltar para a estante</Link>} />
    </main>
  );
}

function Leitor({ sheetId }: { sheetId: number }) {
  const sheet = useLiveQuery(async () => (await db.sheets.get(sheetId)) ?? null, [sheetId]);
  const { document, error: openError } = useSheetDocument(sheetId);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const [fit, setFit] = useState<PageFit>("pagina");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const pageCount = sheet?.pageCount ?? 0;
  const currentPage = page ?? sheet?.lastPage ?? 1;
  const error = openError ?? renderError;

  const goTo = useCallback(
    (target: number) => {
      if (pageCount === 0) return;
      const clamped = clampPage(target, pageCount);
      if (clamped === currentPage) return;
      setRenderError(null);
      setPage(clamped);
      rememberSheetPage(sheetId, clamped).catch(() => undefined);
    },
    [sheetId, pageCount, currentPage],
  );

  const clearRenderError = useCallback(() => setRenderError(null), []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsPanelOpen(false);
        return;
      }
      if (shouldLeaveKeyToTarget(event)) return;
      const delta = keyToPageDelta(event);
      if (delta === 0) return;
      event.preventDefault();
      goTo(currentPage + delta);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, currentPage]);

  if (sheet === null) return <NaoEncontrada />;

  return (
    <div className="relative flex h-dvh flex-col bg-surface-soft">
      <header className="flex items-center gap-3 border-b border-hairline bg-surface px-4 py-2">
        <Link to="/musicas/estante" className="text-ink-muted hover:text-ink">
          ← Estante
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-semibold">{sheet?.title ?? "…"}</h1>
        <Button variant="ghost" onClick={() => setFit((current) => nextFit(current))} aria-label="Trocar o ajuste da página">
          {FIT_LABEL[fit]}
        </Button>
        <Button variant="ghost" className="lg:hidden" onClick={() => setIsPanelOpen((open) => !open)} aria-expanded={isPanelOpen} aria-controls={PANEL_ID}>
          Ferramentas
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          {error ? (
            <div className="p-4">
              <InlineError title="O PDF não abriu direito." nextStep={error} />
            </div>
          ) : null}
          <div className="min-h-0 flex-1 p-2">
            {document && pageCount > 0 ? (
              <PaginaPdf document={document} page={clampPage(currentPage, pageCount)} fit={fit} onTap={(xRatio) => goTo(pageFromTap(xRatio, currentPage, pageCount))} onRendered={clearRenderError} onError={setRenderError} />
            ) : (
              <p className="p-4 text-ink-muted">{error ? "" : "Abrindo o PDF…"}</p>
            )}
          </div>
          <nav aria-label="Páginas" className="flex items-center justify-center gap-4 border-t border-hairline bg-surface px-4 py-2">
            <Button variant="secondary" onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}>
              Anterior
            </Button>
            <p className="tabular-nums text-ink-muted">
              página {currentPage} de {pageCount || "…"}
            </p>
            <Button variant="secondary" onClick={() => goTo(currentPage + 1)} disabled={pageCount === 0 || currentPage >= pageCount}>
              Próxima
            </Button>
          </nav>
        </main>

        <aside id={PANEL_ID} className={`${isPanelOpen ? "absolute inset-y-0 right-0 z-10 flex w-full max-w-sm" : "hidden"} flex-col gap-4 overflow-y-auto border-l border-hairline bg-surface p-4 lg:static lg:flex lg:w-80 lg:max-w-none lg:shrink-0`} aria-label="Ferramentas">
          <div className="flex justify-end lg:hidden">
            <Button variant="ghost" onClick={() => setIsPanelOpen(false)}>
              Fechar
            </Button>
          </div>
          <PainelFerramentas />
        </aside>
      </div>
    </div>
  );
}

export function LeitorPage() {
  const params = useParams();
  const sheetId = Number(params.sheetId);
  if (!Number.isInteger(sheetId) || sheetId <= 0) return <NaoEncontrada />;
  return <Leitor key={sheetId} sheetId={sheetId} />;
}
