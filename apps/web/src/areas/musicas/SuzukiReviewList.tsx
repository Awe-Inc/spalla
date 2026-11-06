import type { StoredSuzukiPiece } from "@/data/db";
import { markLapsed, markReviewed } from "@/data/suzuki";
import { Button } from "@/design/components";
import { List, ListRow, Section } from "@/design/layout";

export function WorkTitle({ children }: { children: string }) {
  return <span className="font-display text-heading font-normal italic">{children}</span>;
}

function laterSentence(later: number): string {
  return later === 1 ? "Mais 1 peça fica para amanhã." : `Mais ${later} peças ficam para amanhã.`;
}

export function SuzukiReviewList({ pieces, later }: { pieces: readonly StoredSuzukiPiece[]; later: number }) {
  const lead = pieces.length > 0 ? "Toque cada uma com o afinador aberto e marque como foi." : "As revisões de hoje já foram feitas.";
  const description = later > 0 ? `${lead} ${laterSentence(later)}` : lead;
  return (
    <Section title="Revisão de hoje" description={description}>
      {pieces.length > 0 ? (
        <List label="Peças para revisar hoje">
          {pieces.map((piece) => (
            <ListRow
              key={piece.key}
              title={<WorkTitle>{piece.name}</WorkTitle>}
              meta={`Livro ${piece.book}`}
              trailing={
                <>
                  <Button variant="ghost" onClick={() => void markLapsed(piece.key)} aria-label={`Esqueci: ${piece.name}`}>
                    Esqueci
                  </Button>
                  <Button variant="primary" onClick={() => void markReviewed(piece.key)} aria-label={`Revisei hoje: ${piece.name}`}>
                    Revisei hoje
                  </Button>
                </>
              }
            />
          ))}
        </List>
      ) : null}
    </Section>
  );
}
