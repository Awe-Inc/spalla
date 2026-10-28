import { useState, type ChangeEvent } from "react";
import { Link } from "react-router";

import { useCore } from "@/core/useCore";
import { useLibrary } from "@/data/library";
import { Button, Card, EmptyState, InlineError, PageTitle } from "@/design/components";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function MusicasPage() {
  const core = useCore();
  const { pieces, add, select, remove } = useLibrary();
  const [error, setError] = useState<string | null>(null);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || core.status !== "ready") return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`O arquivo tem ${Math.round(file.size / 1024 / 1024)} MB; o limite é ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = core.core.parseMusicXml(bytes, { expandRepeats: true, trimSilentIntro: true, mergeTies: true });
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      setError(null);
      add({ fileName: file.name, bytes, score: parsed.score, importedAt: Date.now() });
    } catch {
      setError("Não deu para ler esse arquivo. Exporte de novo como MusicXML sem compactar e tente outra vez.");
    }
  }

  return (
    <>
      <PageTitle title="Músicas" eyebrow="Suas partituras">
        <label className="inline-flex h-11 cursor-pointer items-center rounded-pill bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover md:h-10">
          Importar MusicXML
          <input type="file" accept=".xml,.musicxml,.mxl" className="sr-only" onChange={onFile} disabled={core.status !== "ready"} />
        </label>
      </PageTitle>

      {error ? <InlineError title="Esse arquivo não abriu." nextStep={error} /> : null}

      {pieces.length === 0 ? (
        <EmptyState
          title="Nenhuma música ainda."
          description="Importe um arquivo .musicxml ou .mxl exportado do MuseScore e toque com a partitura na tela."
        />
      ) : (
        <ul className="grid gap-4">
          {pieces.map((piece) => (
            <li key={piece.fileName}>
              <Card as="article" className="flex flex-wrap items-center justify-between gap-4">
                <div className="grid gap-0.5">
                  <h2 className="text-heading font-semibold">{piece.score.title || piece.fileName}</h2>
                  <p className="text-ink-muted">
                    {piece.score.composer || "Compositor desconhecido"} · {piece.score.beatsPerMinute} bpm · {piece.score.noteCount} notas ·{" "}
                    {formatDuration(piece.score.durationSeconds)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => remove(piece.fileName)}>
                    Remover
                  </Button>
                  <Link
                    to="/tocar/musica"
                    onClick={() => select(piece)}
                    className="inline-flex h-11 items-center rounded-pill bg-surface-soft px-5 font-semibold transition-colors hover:bg-surface-sunken md:h-10"
                  >
                    Tocar
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
