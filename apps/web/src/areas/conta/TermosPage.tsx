import { Card, PageTitle } from "@/design/components";

const SECTIONS: readonly { title: string; paragraphs: readonly string[] }[] = [
  {
    title: "O que guardamos",
    paragraphs: [
      "Nome, e-mail, a senha protegida por hash e, quando você informa, o ano de nascimento. Para quem tem até 12 anos, também o nome e o e-mail do responsável que autorizou a conta.",
      "As turmas em que você está, as tarefas e os materiais que o professor passou, suas marcações de tarefa feita e o resumo das suas sessões de prática que você escolher enviar: exercício, data, afinação, andamento e estrelas.",
      "O áudio do microfone nunca sai do aparelho. A análise de afinação acontece no navegador.",
    ],
  },
  {
    title: "Quem vê o quê",
    paragraphs: [
      "Seu professor vê o progresso dos alunos das turmas dele e as tarefas que ele passou. Outros alunos não veem nada seu.",
      "A equipe da plataforma pode ver os dados da conta para dar suporte e aprovar professores. Toda ação administrativa fica registrada na auditoria.",
    ],
  },
  {
    title: "Seus direitos",
    paragraphs: [
      "Em Minha conta você baixa todos os seus dados num arquivo, encerra sessões abertas e apaga a conta. Apagar a conta remove os dados pessoais e o histórico enviado.",
      "Materiais em PDF que um professor anexa são responsabilidade dele: só envie arquivos que você tem o direito de compartilhar com seus alunos.",
    ],
  },
];

export function TermosPage() {
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageTitle title="Termos e privacidade" eyebrow="Aulas com professor" />
      <p className="text-body text-ink-muted">Versão provisória. O texto jurídico definitivo será publicado antes da abertura para o público.</p>
      {SECTIONS.map((section) => (
        <Card key={section.title} title={section.title}>
          <div className="grid gap-3 text-body text-ink">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
