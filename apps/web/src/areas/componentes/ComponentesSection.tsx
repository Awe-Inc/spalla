import { type ReactNode, useState } from "react";

import type { PlayView } from "@/app/settings";
import { VIEW_OPTIONS } from "@/areas/tocar/viewOptions";
import { Button, ButtonLink, ConfirmButton, IconButton, Menu } from "@/design/actions";
import { AccuracyBars, Card, EmptyState, GoalDots, HeadphoneNotice, InlineError, ProgressRing, Stars, StringChip } from "@/design/components";
import { Badge, ChoiceChips, SelectField, TextAreaField, TextField } from "@/design/fields";
import { Icon, ICON_NAMES } from "@/design/icons";
import { List, ListRow, PageHeader, Section, SkeletonList, Stat, Stats } from "@/design/layout";

const STAR_COUNTS = [0, 1, 2, 3] as const;
const SAMPLE_BARS = [
  { key: 1, accuracyPct: 62, bpm: 60 },
  { key: 2, accuracyPct: 78, bpm: 66 },
  { key: 3, accuracyPct: 91, bpm: 72 },
  { key: 4, accuracyPct: 96, bpm: 80 },
];
function Example({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 border-t border-hairline pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono text-caption text-ink">{title}</h3>
        {note ? <p className="text-caption text-ink-muted">{note}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function AcoesSection() {
  const [deleted, setDeleted] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  return (
    <Card className="grid gap-6">
      <Example title="Button" note="primary uma vez por tela; quiet no lugar do segundo botão cheio">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon="play">
            Começar
          </Button>
          <Button>Ver histórico</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="quiet">Trocar rotina</Button>
          <Button variant="danger" icon="apagar">
            Apagar
          </Button>
          <Button disabled>Indisponível</Button>
          <Button loading>Guardando</Button>
        </div>
      </Example>
      <Example title="Button size=lg" note="o CTA da Hoje">
        <div>
          <Button variant="primary" size="lg" icon="play">
            Tocar escala de Lá maior
          </Button>
        </div>
      </Example>
      <Example title="ButtonLink">
        <div className="flex flex-wrap gap-3">
          <ButtonLink to="/componentes" variant="secondary" icon="repertorio">
            Abrir repertório
          </ButtonLink>
          <ButtonLink to="/componentes" variant="quiet">
            Ver todas as peças
          </ButtonLink>
        </div>
      </Example>
      <Example title="IconButton" note="aria-label obrigatório; alvo de 44 px">
        <div className="flex flex-wrap gap-1">
          <IconButton icon="ouvir" label="Ouvir trecho" />
          <IconButton icon="trecho" label="Treinar trecho" />
          <IconButton icon="mais" label="Adicionar à rotina" variant="secondary" />
        </div>
      </Example>
      <Example title="ConfirmButton" note="confirmação no lugar, sem modal">
        {deleted ? <p className="text-small text-ink-muted">Trecho apagado.</p> : <ConfirmButton label="Apagar trecho" confirmLabel="Apagar" icon="apagar" onConfirm={() => setDeleted(true)} />}
      </Example>
      <Example title="Menu" note="ações secundárias de uma linha">
        <div className="flex items-center gap-3">
          <Menu
            label="Ações do trecho"
            items={[
              { label: "Renomear", icon: "estudar", onSelect: () => setLastAction("Renomear") },
              { label: "Adicionar à rotina", icon: "mais", onSelect: () => setLastAction("Adicionar à rotina") },
              { label: "Apagar", icon: "apagar", tone: "danger", onSelect: () => setLastAction("Apagar") },
            ]}
          />
          {lastAction ? <span className="text-small text-ink-muted">Escolhido: {lastAction}</span> : null}
        </div>
      </Example>
      <Example title="Icon" note="traço 1,75 em 24 px, currentColor">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1">
          {ICON_NAMES.map((name) => (
            <li key={name} className="grid justify-items-center gap-2 rounded-md px-2 py-3 text-ink-muted transition-colors duration-fast ease-spalla hover:bg-surface-soft hover:text-ink">
              <Icon name={name} className="size-6" />
              <span className="font-mono text-caption">{name}</span>
            </li>
          ))}
        </ul>
      </Example>
    </Card>
  );
}

export function EstruturaSection() {
  return (
    <Card className="grid gap-6">
      <Example title="PageHeader" note="voltar opcional, título, descrição curta, ações">
        <div className="rounded-lg bg-canvas px-5 pt-5 ring-1 ring-hairline">
          <PageHeader back={{ to: "/componentes", label: "Repertório" }} title="Minueto em Sol" description="J. S. Bach (atrib.), do Livro 1 do método Suzuki." actions={<Button variant="primary" icon="play">Tocar inteira</Button>} />
        </div>
      </Example>
      <Example title="Section">
        <Section title="Trechos" description="Compassos que você guardou para treinar." action={<Button icon="mais">Guardar trecho</Button>}>
          <p className="text-small text-ink-muted">O conteúdo da seção vem aqui.</p>
        </Section>
      </Example>
      <Example title="List + ListRow" note="lista com divisória, não pilha de cards; a linha inteira navega">
        <List label="Peças de exemplo">
          <ListRow to="/componentes" leading={<Stars count={3} />} title={<span className="font-work">Brilha, Brilha, Estrelinha</span>} meta="Tradicional · nível 1" trailing={<Badge tone="good">Dominada</Badge>} />
          <ListRow to="/componentes" current leading={<Stars count={1} />} title={<span className="font-work">Minueto em Sol</span>} meta="Bach · nível 3" trailing={<IconButton icon="play" label="Tocar Minueto em Sol" variant="secondary" />} />
          <ListRow leading={<Stars count={0} />} title={<span className="font-work">Gavota</span>} meta="Gossec · nível 4" trailing={<Badge>Não iniciada</Badge>} />
        </List>
      </Example>
      <Example title="Stats + Stat">
        <Stats label="Resumo de exemplo">
          <Stat value="7" label="dias seguidos" tone="primary" />
          <Stat value="142" label="minutos na semana" />
          <Stat value="38" label="execuções" />
          <Stat value="87%" label="precisão média" />
        </Stats>
      </Example>
      <Example title="SkeletonList" note="no lugar de “Carregando…”">
        <SkeletonList rows={2} label="Carregando exemplo…" />
      </Example>
    </Card>
  );
}

export function FormularioSection() {
  const [view, setView] = useState<PlayView>("ambos");
  return (
    <Card className="grid gap-6">
      <Example title="TextField · SelectField">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nome do trecho" name="nome-trecho" placeholder="Compassos 5 a 8…" autoComplete="off" hint="Aparece na lista da peça." />
          <SelectField label="Meta do bloco" name="meta" defaultValue="repeticoes-limpas">
            <option value="uma-vez">Tocar uma vez</option>
            <option value="repeticoes-limpas">Repetições limpas seguidas</option>
          </SelectField>
          <TextField label="Minutos" name="minutos" type="number" inputMode="numeric" defaultValue={25} min={1} max={30} error="Use de 1 a 30 minutos." />
        </div>
      </Example>
      <Example title="TextAreaField">
        <TextAreaField label="Anotação da aula" name="anotacao" placeholder="O que a professora pediu…" />
      </Example>
      <Example title="ChoiceChips" note="escolha única com até 4 opções">
        <ChoiceChips name="exemplo-vista" label="Vista do Tocar" value={view} options={VIEW_OPTIONS} onChange={setView} />
      </Example>
      <Example title="Badge" note="retangular, raio sm">
        <div className="flex flex-wrap gap-2">
          <Badge>Não iniciada</Badge>
          <Badge tone="accent">Em estudo</Badge>
          <Badge tone="good">Dominada</Badge>
          <Badge tone="warn">Revisar</Badge>
          <Badge tone="bad">Atrasada</Badge>
          <Badge tone="info">Da aula</Badge>
        </div>
      </Example>
    </Card>
  );
}

export function ProgressoSection() {
  return (
    <Card className="grid gap-6">
      <Example title="StringChip">
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((index) => (
            <StringChip key={index} index={index} />
          ))}
        </div>
      </Example>
      <Example title="Stars">
        <div className="flex flex-wrap gap-4">
          {STAR_COUNTS.map((count) => (
            <Stars key={count} count={count} label={`${count} de 3`} />
          ))}
        </div>
      </Example>
      <Example title="GoalDots">
        <GoalDots recentClean={[true, true, false]} total={5} label="2 limpas de 5, uma falhou" />
      </Example>
      <Example title="AccuracyBars">
        <AccuracyBars bars={SAMPLE_BARS} label="Precisão de exemplo" className="h-24 max-w-sm" />
      </Example>
      <Example title="ProgressRing">
        <div className="flex flex-wrap gap-6">
          <ProgressRing value={18} max={25} caption="de 25 min" />
          <ProgressRing value={25} max={25} caption="meta feita" size={88} />
        </div>
      </Example>
    </Card>
  );
}

export function AvisosSection() {
  const [headphonesConfirmed, setHeadphonesConfirmed] = useState(false);
  return (
    <Card className="grid gap-6">
      <Example title="HeadphoneNotice">
        {headphonesConfirmed ? <p className="text-small text-ink-muted">Confirmado. O aviso some até o próximo exercício com nota pedal.</p> : <HeadphoneNotice onConfirm={() => setHeadphonesConfirmed(true)} />}
      </Example>
      <Example title="InlineError">
        <InlineError title="O microfone não respondeu." nextStep="Confira a permissão do navegador e tente de novo." />
      </Example>
      <Example title="EmptyState">
        <EmptyState title="Nenhuma música na estante" description="Importe um MusicXML ou escolha uma música da biblioteca para começar." action={<Button variant="primary">Escolher música</Button>} />
      </Example>
    </Card>
  );
}
