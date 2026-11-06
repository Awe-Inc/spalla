import { useCallback, useEffect, useState } from "react";

import { rememberSheetStructure } from "@/data/sheets";
import { analyzePdf } from "@/pdf/omr/analyzePdf";
import type { ScoreMeasure, ScoreStructure } from "@/pdf/omr/structure";
import type { PdfDocument } from "@/pdf/pdfDocument";

export type StructureReading = { status: "lendo"; done: number; total: number } | { status: "pronta"; structure: ScoreStructure } | { status: "falhou" };

export interface ScoreStructureState {
  reading: StructureReading;
  correct: (measures: readonly ScoreMeasure[]) => void;
}

export function useScoreStructure(document: PdfDocument, sheetId: number, saved: ScoreStructure | undefined): ScoreStructureState {
  const [reading, setReading] = useState<StructureReading>(saved ? { status: "pronta", structure: saved } : { status: "lendo", done: 0, total: document.numPages });
  const needsReading = !saved;

  useEffect(() => {
    if (!needsReading) return;
    const controller = new AbortController();
    analyzePdf(document, (done, total) => setReading({ status: "lendo", done, total }), controller.signal)
      .then((structure) => {
        if (controller.signal.aborted) return;
        setReading({ status: "pronta", structure });
        rememberSheetStructure(sheetId, structure).catch(() => undefined);
      })
      .catch(() => {
        if (!controller.signal.aborted) setReading({ status: "falhou" });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, sheetId]);

  const correct = useCallback(
    (measures: readonly ScoreMeasure[]) => {
      setReading((current) => {
        if (current.status !== "pronta") return current;
        const structure = { ...current.structure, measures };
        rememberSheetStructure(sheetId, structure).catch(() => undefined);
        return { status: "pronta", structure };
      });
    },
    [sheetId],
  );

  return { reading, correct };
}
