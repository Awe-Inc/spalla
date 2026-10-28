import { type ReactNode, useState } from "react";

import { AccuracyBars, Button, Card, EmptyState, GoalDots, HeadphoneNotice, InlineError, PageTitle, ProgressRing, Stars, StringChip } from "@/design/components";

const FIELD_CLASS = "h-10 rounded-md border border-hairline bg-surface px-3 text-body";
const STAR_COUNTS = [0, 1, 2, 3] as const;
const SAMPLE_BARS = [
  { key: 1, accuracyPct: 62, bpm: 60 },
  { key: 2, accuracyPct: 78, bpm: 66 },
  { key: 3, accuracyPct: 91, bpm: 72 },
  { key: 4, accuracyPct: 96, bpm: 80 },
];

function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-hairline pt-4">
      <h3 className="font-mono text-caption text-ink">{title}</h3>
      {children}
    </section>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 stroke-current" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function ComponentesSection() {
  const [headphonesConfirmed, setHeadphonesConfirmed] = useState(false);
  return (
    <Card title="Componentes" className="grid gap-6">
      <p className="max-w-prose text-body text-ink-muted">Tudo o que a interface monta vem daqui. Antes de criar um componente novo, procure o equivalente nesta lista.</p>

      <Example title="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Começar</Button>
          <Button>Ver histórico</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="primary" icon={<PlusIcon />}>
            Adicionar bloco
          </Button>
          <Button disabled>Indisponível</Button>
        </div>
      </Example>

      <Example title="Card">
        <Card title="Título do cartão" as="div" className="bg-surface-soft shadow-none">
          <p className="text-body text-ink-muted">O cartão agrupa um assunto. Título em heading, conteúdo em body.</p>
        </Card>
      </Example>

      <Example title="Campo de formulário">
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-caption text-ink-subtle">
            Minutos
            <input type="number" className={FIELD_CLASS} defaultValue={25} min={1} max={30} />
          </label>
          <label className="grid gap-1 text-caption text-ink-subtle">
            Meta
            <select className={FIELD_CLASS} defaultValue="repeticoes-limpas">
              <option value="uma-vez">Tocar uma vez</option>
              <option value="repeticoes-limpas">Repetições limpas seguidas</option>
            </select>
          </label>
        </div>
      </Example>

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

      <Example title="HeadphoneNotice">
        {headphonesConfirmed ? <p className="text-caption text-ink-muted">Confirmado. O aviso some até o próximo exercício com pedal.</p> : <HeadphoneNotice onConfirm={() => setHeadphonesConfirmed(true)} />}
      </Example>

      <Example title="InlineError">
        <InlineError title="O microfone não respondeu." nextStep="Confira a permissão do navegador e tente de novo." />
      </Example>

      <Example title="EmptyState">
        <EmptyState title="Nenhuma música na estante" description="Importe um MusicXML ou escolha uma música da biblioteca para começar." action={<Button variant="primary">Escolher música</Button>} />
      </Example>

      <Example title="PageTitle">
        <div className="rounded-md bg-surface-soft px-4 pt-4">
          <PageTitle eyebrow="Rotina e módulos do método" title="Praticar">
            <Button>Ação da página</Button>
          </PageTitle>
        </div>
      </Example>
    </Card>
  );
}
