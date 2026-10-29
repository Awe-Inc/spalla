import { Link } from "react-router";

import { recordingDate } from "@/areas/ferramentas/RecordingPlayer";
import type { StoredRecording } from "@/data/db";
import { piecesSummary, recorderPath } from "@/data/recordings";
import { Card } from "@/design/components";

export function Gravacoes({ recordings }: { recordings: readonly StoredRecording[] }) {
  return (
    <Card title="Gravações" className="grid gap-2">
      <ul className="divide-y divide-hairline">
        {piecesSummary(recordings).map(({ piece, count, latestAt }) => (
          <li key={piece?.key ?? "sem-peca"} className="flex flex-wrap items-center gap-3 py-3">
            <Link to={recorderPath(piece)} className="min-w-0 flex-1 font-medium text-primary">
              {piece?.title ?? "Sem peça"}
            </Link>
            <span className="text-caption text-ink-subtle">
              {count === 1 ? "1 gravação" : `${count} gravações`} · última em {recordingDate(latestAt)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
