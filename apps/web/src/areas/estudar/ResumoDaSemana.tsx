import { useEffect, useState } from "react";

import { weekSummaryLines, type WeekSummary } from "@/data/weekSummary";

const COPIED_FEEDBACK_MS = 2000;

export function ResumoDaSemana({ summary, titleOf }: { summary: WeekSummary; titleOf: (exerciseId: string) => string | null }) {
  const [period, ...lines] = weekSummaryLines(summary, titleOf);
  const [copied, setCopied] = useState(false);
  const canCopy = typeof navigator !== "undefined" && navigator.clipboard !== undefined;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText([`Resumo da semana · ${period}`, ...lines].join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="resumo-da-semana" className="grid gap-2 border-t border-hairline pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="resumo-da-semana" className="font-medium">
          Resumo da semana <span className="text-caption font-normal text-ink-subtle">{period}</span>
        </h3>
        {canCopy ? (
          <button type="button" className="text-caption font-semibold text-primary" onClick={() => void copy()}>
            {copied ? "Copiado" : "Copiar para a professora"}
          </button>
        ) : null}
      </div>
      <ul className="grid gap-1 text-body text-ink-muted">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
