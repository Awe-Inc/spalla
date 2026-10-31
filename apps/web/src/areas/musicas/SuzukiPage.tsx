import { useLiveQuery } from "dexie-react-hooks";
import { Link, useSearchParams } from "react-router";

import { CoreErrorNotice } from "@/core/CoreErrorNotice";
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
import { Button, ButtonLink, Card, Menu } from "@/design/components";
import { Badge, ChoiceChips, type BadgeTone } from "@/design/fields";
import { List, ListRow, PageHeader, Section, SkeletonList } from "@/design/layout";

import { RepertorioTabs } from "./RepertorioTabs";

const BOOK_PARAM = "livro";

const STATUS_LABELS: Record<SuzukiPieceStatus, string> = {
  nova: "Não iniciada",
  "em-revisao": "Em revisão",
  "revisar-hoje": "Revisar hoje",
};

const STATUS_TONE: Record<SuzukiPieceStatus, BadgeTone> = {
  nova: "neutral",
  "em-revisao": "good",
  "revisar-hoje": "warn",
};

function WorkTitle({ children }: { children: string }) {
  return <span className="font-display text-heading font-normal italic">{children}</span>;
}

interface PieceRowProps {
  book: number;
  piece: SuzukiPiece;
  stored: StoredSuzukiPiece | undefined;
  today: string;
}

function PieceActions({ book, piece, status }: { book: number; piece: SuzukiPiece; status: SuzukiPieceStatus }) {
  if (status === "nova") {
    return (
      <Button variant="ghost" onClick={() => void markLearned(book, piece.name)} aria-label={`Aprendi na aula: ${piece.name}`}>
        Aprendi na aula
      </Button>
    );
  }
  return (
    <>
      {status === "revisar-hoje" ? (
        <Button variant="primary" onClick={() => void markReviewed(piece.key)} aria-label={`Revisei hoje: ${piece.name}`}>
          Revisei hoje
        </Button>
      ) : null}
      <Menu label={`Ações de ${piece.name}`} items={[{ label: "Desfazer aprendida", onSelect: () => void unmarkLearned(piece.key) }]} />
    </>
  );
}

function PieceRow({ book, piece, stored, today }: PieceRowProps) {
  const status = pieceStatus(stored, today);
  return (
    <ListRow
      title={<WorkTitle>{piece.name}</WorkTitle>}
      meta={<Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>}
      current={status === "revisar-hoje"}
      trailing={
        <>
          <PieceActions book={book} piece={piece} status={status} />
          {piece.exerciseId ? (
            <ButtonLink to={`/tocar/${piece.exerciseId}`} icon="play" aria-label={`Tocar ${piece.name}`}>
              <span className="hidden sm:inline">Tocar</span>
            </ButtonLink>
          ) : null}
        </>
      }
    />
  );
}

function BookProgress({ learned, total }: { learned: number; total: number }) {
  return (
    <div className="grid gap-1.5" aria-hidden>
      <span className="h-1.5 overflow-hidden rounded-pill bg-surface-soft">
        <span className="block h-full origin-left rounded-pill bg-primary transition-transform duration-slow ease-spalla" style={{ transform: `scaleX(${total === 0 ? 0 : learned / total})` }} />
      </span>
    </div>
  );
}

function BookView({ book, storedByKey, today }: { book: SuzukiBook; storedByKey: ReadonlyMap<string, StoredSuzukiPiece>; today: string }) {
  const learned = learnedCount(book, new Set(storedByKey.keys()));
  return (
    <Section
      title={`Livro ${book.number}`}
      description={
        <>
          Nível <span className="font-mono tabular">{book.level}</span>. <span className="font-mono tabular">{learned}</span> de{" "}
          <span className="font-mono tabular">{book.pieces.length}</span> aprendidas. {book.focus}
        </>
      }
    >
      <div className="grid gap-4">
        <BookProgress learned={learned} total={book.pieces.length} />
        <Card tone="inset" className="text-small text-ink-muted">
          {book.howTo}
        </Card>
        <List label={`Peças do livro ${book.number}`}>
          {book.pieces.map((piece) => (
            <PieceRow key={piece.key} book={book.number} piece={piece} stored={storedByKey.get(piece.key)} today={today} />
          ))}
        </List>
      </div>
    </Section>
  );
}

function ReviewToday({ due }: { due: readonly StoredSuzukiPiece[] }) {
  if (due.length === 0) {
    return (
      <p className="rounded-md bg-surface-sunken/60 px-4 py-3 text-small text-ink-muted ring-1 ring-inset ring-hairline">
        Nada para revisar hoje. Quando o professor passar uma peça, marque "Aprendi na aula" no livro dela.
      </p>
    );
  }
  return (
    <Section title="Revisão de hoje" description="Toque cada uma com o afinador aberto e marque quando terminar.">
      <List label="Peças para revisar hoje">
        {due.map((piece) => (
          <ListRow
            key={piece.key}
            title={<WorkTitle>{piece.name}</WorkTitle>}
            meta={`Livro ${piece.book}`}
            trailing={
              <Button variant="primary" onClick={() => void markReviewed(piece.key)} aria-label={`Revisei hoje: ${piece.name}`}>
                Revisei hoje
              </Button>
            }
          />
        ))}
      </List>
    </Section>
  );
}

function defaultBook(books: readonly SuzukiBook[], learnedKeys: ReadonlySet<string>): number | undefined {
  return (books.find((book) => learnedCount(book, learnedKeys) < book.pieces.length) ?? books[0])?.number;
}

export function SuzukiPage() {
  const core = useCore();
  const stored = useLiveQuery(() => db.suzukiPieces.toArray(), []) ?? [];
  const [params, setParams] = useSearchParams();
  const today = localDayKey(new Date());
  const books = core.status === "ready" ? suzukiBooks(core.core.exercises) : [];
  const storedByKey = new Map(stored.map((piece) => [piece.key, piece] as const));
  const requested = Number(params.get(BOOK_PARAM));
  const selected = books.find((book) => book.number === requested) ?? books.find((book) => book.number === defaultBook(books, new Set(storedByKey.keys())));

  return (
    <>
      <PageHeader
        title="Repertório"
        description={
          <>
            As edições Suzuki são protegidas, então as peças ficam com o seu livro. A revisão volta em 1, 3, 7, 14 e depois a cada 30 dias, de preferência com o{" "}
            <Link to="/ferramentas/afinador" className="font-semibold text-primary underline-offset-4 hover:underline">
              afinador
            </Link>{" "}
            aberto.
          </>
        }
      />
      <RepertorioTabs />

      <div className="grid gap-8">
        <ReviewToday due={dueReviews(stored, today)} />

        {core.status !== "ready" ? <SkeletonList rows={4} label="Carregando os livros…" /> : null}

        {selected ? (
          <div className="grid gap-6">
            <ChoiceChips
              name="livro-suzuki"
              label="Livro"
              value={selected.number}
              options={books.map((book) => ({ value: book.number, label: `Livro ${book.number}` }))}
              onChange={(number) => setParams({ [BOOK_PARAM]: String(number) }, { replace: true })}
            />
            <BookView book={selected} storedByKey={storedByKey} today={today} />
          </div>
        ) : null}
      </div>
    </>
  );
}
