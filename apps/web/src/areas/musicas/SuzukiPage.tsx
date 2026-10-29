import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router";

import { useCore } from "@/core/useCore";
import { db, localDayKey, type StoredSuzukiPiece } from "@/data/db";
import {
  dueReviews,
  learnedCount,
  markLearned,
  markReviewed,
  pieceStatus,
  suzukiBooks,
  unmarkLearned,
  type SuzukiBook,
  type SuzukiPiece,
  type SuzukiPieceStatus,
} from "@/data/suzuki";
import { Button, Card, PageTitle } from "@/design/components";

import { RepertorioTabs } from "./RepertorioTabs";

const STATUS_LABELS: Record<SuzukiPieceStatus, string> = {
  nova: "Não iniciada",
  "em-revisao": "Em revisão",
  "revisar-hoje": "Revisar hoje",
};

const STATUS_CLASSES: Record<SuzukiPieceStatus, string> = {
  nova: "bg-surface-soft text-ink-muted",
  "em-revisao": "bg-in-tune/20 text-ink",
  "revisar-hoje": "bg-close/20 text-ink",
};

const PLAY_LINK_CLASS =
  "inline-flex h-11 items-center rounded-pill bg-surface-soft px-5 font-semibold transition-colors hover:bg-surface-sunken md:h-10";

interface PieceRowProps {
  book: number;
  piece: SuzukiPiece;
  stored: StoredSuzukiPiece | undefined;
  today: string;
}

function PieceRow({ book, piece, stored, today }: PieceRowProps) {
  const status = pieceStatus(stored, today);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="min-w-0 flex-1 font-medium">{piece.name}</span>
      <span className={`rounded-pill px-3 py-1 text-caption ${STATUS_CLASSES[status]}`}>{STATUS_LABELS[status]}</span>
      {piece.exerciseId ? (
        <Link to={`/tocar/${piece.exerciseId}`} className={PLAY_LINK_CLASS} aria-label={`Tocar ${piece.name}`}>
          Tocar
        </Link>
      ) : null}
      {status === "nova" ? (
        <Button onClick={() => void markLearned(book, piece.name)} aria-label={`Aprendi na aula: ${piece.name}`}>
          Aprendi na aula
        </Button>
      ) : (
        <>
          {status === "revisar-hoje" ? (
            <Button variant="primary" onClick={() => void markReviewed(piece.key)} aria-label={`Revisei hoje: ${piece.name}`}>
              Revisei hoje
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => void unmarkLearned(piece.key)} aria-label={`Desfazer: ${piece.name}`}>
            Desfazer
          </Button>
        </>
      )}
    </li>
  );
}

function BookCard({ book, storedByKey, today }: { book: SuzukiBook; storedByKey: ReadonlyMap<string, StoredSuzukiPiece>; today: string }) {
  const learned = learnedCount(book, new Set(storedByKey.keys()));
  return (
    <Card as="article" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-heading font-semibold">Livro {book.number}</h2>
        <span className="text-caption text-ink-subtle">
          Nível {book.level} · {learned} de {book.pieces.length} aprendidas
        </span>
      </div>
      <p className="text-ink-muted">{book.focus}</p>
      <details className="group">
        <summary className="cursor-pointer text-caption font-semibold text-primary">Peças e preparação</summary>
        <p className="mt-3 text-body text-ink-muted">{book.howTo}</p>
        <ul className="mt-2 divide-y divide-hairline">
          {book.pieces.map((piece) => (
            <PieceRow key={piece.key} book={book.number} piece={piece} stored={storedByKey.get(piece.key)} today={today} />
          ))}
        </ul>
      </details>
    </Card>
  );
}

function ReviewToday({ due }: { due: readonly StoredSuzukiPiece[] }) {
  return (
    <Card title="Revisão de hoje" className="grid gap-2">
      {due.length === 0 ? (
        <p className="text-ink-muted">Nada para revisar hoje. Quando o professor passar uma peça, marque "Aprendi na aula" no livro dela.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {due.map((piece) => (
            <li key={piece.key} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{piece.name}</span>
                <span className="ml-2 text-caption text-ink-subtle">Livro {piece.book}</span>
              </span>
              <Button variant="primary" onClick={() => void markReviewed(piece.key)} aria-label={`Revisei hoje: ${piece.name}`}>
                Revisei hoje
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SuzukiPage() {
  const core = useCore();
  const stored = useLiveQuery(() => db.suzukiPieces.toArray(), []) ?? [];
  const today = localDayKey(new Date());
  const books = core.status === "ready" ? suzukiBooks(core.core.exercises) : [];
  const storedByKey = new Map(stored.map((piece) => [piece.key, piece] as const));

  return (
    <>
      <PageTitle title="Repertório" />
      <RepertorioTabs />

      <div className="grid gap-6">
        <ReviewToday due={dueReviews(stored, today)} />

        <p className="text-caption text-ink-subtle">
          As edições Suzuki são protegidas, então as peças ficam com o seu livro. Marque o que aprendeu na aula e revise tocando com o{" "}
          <Link to="/ferramentas/afinador" className="font-semibold text-primary">
            afinador
          </Link>{" "}
          aberto. A revisão volta em 1, 3, 7, 14 e depois a cada 30 dias.
        </p>

        {core.status !== "ready" ? <p className="text-ink-muted">Carregando os livros…</p> : null}
        <div className="grid gap-4">
          {books.map((book) => (
            <BookCard key={book.number} book={book} storedByKey={storedByKey} today={today} />
          ))}
        </div>
      </div>
    </>
  );
}
