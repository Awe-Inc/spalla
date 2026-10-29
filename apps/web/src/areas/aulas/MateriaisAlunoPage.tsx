import { useState } from "react";

import { api, errorMessage } from "@/api/client";
import type { Lessons, StudentMaterial } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { fetchPdf, openPdf } from "@/account/files";
import { Badge, formatDate, FormError, LINK_SECONDARY_CLASS, LoadState, Notice } from "@/account/ui";
import { importSheetFile } from "@/data/sheets";
import { Button, EmptyState, PageTitle } from "@/design/components";
import { countPdfPages } from "@/pdf/pdfDocument";

import { formatBytes, MATERIAL_KIND_LABELS } from "../professor/teaching";
import { pdfFileName, safeExternalUrl } from "./lessons";

function MaterialItem({ material }: { material: StudentMaterial }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const url = safeExternalUrl(material.url);
  const fileId = material.fileId;

  async function saveToShelf(id: string) {
    setPending(true);
    setError(null);
    try {
      const blob = await fetchPdf(id);
      const outcome = await importSheetFile(new File([blob], pdfFileName(material.fileName ?? material.title), { type: "application/pdf" }), countPdfPages);
      if (outcome.ok) setSaved(true);
      else setError(outcome.error);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="grid gap-3 rounded-lg bg-surface p-5 shadow-card">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{MATERIAL_KIND_LABELS[material.kind]}</Badge>
          <h2 className="text-heading font-semibold text-ink">{material.title}</h2>
        </div>
        <p className="text-caption text-ink-muted">
          {material.teacherName}, {formatDate(material.createdAt)}
          {material.fileSize ? `. ${formatBytes(material.fileSize)}` : ""}
        </p>
      </div>
      {material.body ? <p className="whitespace-pre-line text-body text-ink">{material.body}</p> : null}
      <div className="flex flex-wrap gap-2">
        {material.kind === "pdf" && fileId ? (
          <>
            <Button variant="primary" onClick={() => openPdf(fileId).catch((cause: unknown) => setError(errorMessage(cause)))}>
              Abrir PDF
            </Button>
            <Button variant="secondary" disabled={pending || saved} onClick={() => void saveToShelf(fileId)}>
              {saved ? "Na estante" : pending ? "Guardando…" : "Guardar na estante"}
            </Button>
          </>
        ) : null}
        {material.kind === "link" && url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className={LINK_SECONDARY_CLASS}>
            Abrir link
          </a>
        ) : null}
      </div>
      {saved ? <Notice>Guardado na estante. Abre sem internet, com virada de página pelo pedal.</Notice> : null}
      <FormError message={error} />
    </li>
  );
}

export function MateriaisAlunoPage() {
  const lessons = useApiData((signal) => api.get<Lessons>("/me/lessons", signal), []);
  return (
    <div className="grid gap-6">
      <PageTitle title="Materiais" eyebrow="Minhas aulas" />
      <LoadState {...lessons}>
        {({ materials }) =>
          materials.length === 0 ? (
            <EmptyState title="Nenhum material ainda" description="Partituras, apostilas e links que o professor compartilhar com a sua turma aparecem aqui." />
          ) : (
            <ul className="grid gap-3">
              {materials.map((material) => (
                <MaterialItem key={material.id} material={material} />
              ))}
            </ul>
          )
        }
      </LoadState>
    </div>
  );
}
