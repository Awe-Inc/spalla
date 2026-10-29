# Plataforma com professores — arquitetura e plano

Pedido do dono (29/10): "vários perfis com várias permissões diferentes, que tenha backend para armazenar essas
informações, que tem perfil de professor e de aluno e um sistema de admin completo para fazer um gerenciamento
completo do sistema"; "quero começar uma parceria com professores de violino para utilizarem essa plataforma para
ensino"; "Professores podem passar exercícios, estruturar formas de estudo, anexar PDFs, seja o que for".

## Princípios

1. **O app continua funcionando sem conta.** Tudo que existe hoje (Dexie no aparelho, offline, PWA) segue igual. A
   conta acrescenta: professor, tarefas, materiais, planos e o envio da prática para o professor ver.
2. **O servidor é a fonte da verdade do que é compartilhado** (turmas, tarefas, materiais, planos, papéis). A prática
   continua sendo gravada primeiro no aparelho e é *enviada* ao servidor (idempotente por `clientId`).
3. **Permissão é verificada no servidor, sempre.** A interface só esconde o que o usuário não pode usar.
4. **Professor só enxerga os próprios alunos.** O escopo vem da turma: aluno em turma do professor.
5. **Dado de menor é tratado com cuidado (LGPD art. 14).** Menor de 12 anos só entra com e-mail e consentimento do
   responsável registrados; nada além do necessário é pedido; o usuário exporta e apaga a própria conta.

## Pesquisa (o que plataformas de ensino de música oferecem)

- [Vivid Practice](https://colourfulkeys.ie/piano-practice-apps/): biblioteca de tarefas, tarefas com mídia, registro
  de prática com cronômetro, sequência e autoavaliação, análise de frequência e conclusão de tarefas, grupos e avisos.
- [My Music Staff](https://www.mymusicstaff.com/?p=64549): portal do aluno com horas praticadas, notas da aula e
  repertório designado.
- [Nova Music](https://trynovamusic.com/for/violin-teachers): voltado a violino/Suzuki: notas de aula, tarefas,
  prática com sequência, portal do aluno, mensagens aos pais.
- LGPD ([Confidata](https://confidata.com.br/blog/lgpd-comentada-10-criancas-adolescentes)): melhor interesse,
  consentimento específico do responsável para criança (< 12, pelo ECA), não condicionar participação a dado além do
  necessário.

O Fretless já tem o que esses apps não têm: correção de afinação e ritmo nota a nota. A plataforma junta isso ao
fluxo do professor: o professor passa a tarefa, o aluno toca no Fretless e o professor vê **como** foi (precisão,
andamento, deriva), não só "quantos minutos".

## Papéis e permissões (RBAC)

Permissões são chaves fixas no código (`apps/api/src/auth/permissions.ts`); papéis são dados, editáveis pelo admin.
Papéis de sistema (não apagáveis, permissões editáveis menos as do admin):

| Papel | Para quem | Permissões |
|---|---|---|
| `admin` | dono da plataforma | todas |
| `suporte` | atendimento | `users.read`, `teachers.approve`, `audit.read`, `reports.read` |
| `professor` | professor parceiro (aprovado) | `classes.manage`, `assignments.manage`, `materials.manage`, `plans.manage`, `students.progress.read` |
| `aluno` | estudante | `lessons.read`, `practice.sync` |

Permissões: `users.read`, `users.manage`, `roles.manage`, `invites.manage`, `teachers.approve`, `audit.read`,
`reports.read`, `settings.manage`, `classes.manage`, `assignments.manage`, `materials.manage`, `plans.manage`,
`students.progress.read`, `lessons.read`, `practice.sync`. O admin cria papéis novos (ex.: "coordenador") marcando
permissões numa matriz. Um usuário pode ter vários papéis (professor que também estuda).

## Fluxos

- **Professor parceiro:** cria conta como professor → fica "aguardando aprovação" → admin (ou suporte) aprova →
  ganha o papel `professor`. O admin também pode convidar por código.
- **Aluno:** cria conta com o **código da turma** que o professor passou (ou sem código, e entra numa turma depois).
- **Turma:** professor cria, recebe um código de 6 letras (renovável), vê membros, publica avisos.
- **Tarefa:** para a turma ou para um aluno; título, instruções, prazo, itens (exercício do core, canção da
  biblioteca, material, ou texto livre) com meta e andamento; o aluno marca feita com um comentário; o professor
  devolve um retorno.
- **Plano de estudo:** rotina de blocos (o mesmo modelo de `RoutineBlock`) que o professor publica; o aluno adota com
  um toque e ela vira uma rotina `origin: "professor"` no aparelho.
- **Material:** PDF (até 20 MB, conferido pelos bytes `%PDF`), link ou texto. O aluno abre o PDF na Estante.
- **Prática:** o aparelho envia os resultados (`ExerciseResult`) ao servidor; o professor vê por aluno: minutos por
  dia, última prática, precisão por exercício e o andamento das tarefas.
- **Admin:** painel com números, usuários (buscar, filtrar, papéis, suspender, aprovar professor, encerrar sessões),
  papéis e permissões, convites, auditoria (quem fez o quê), configurações (cadastro aberto, professor precisa de
  aprovação).

## Stack

- `apps/api`: Fastify 5 + TypeScript, Zod nas fronteiras, SQL puro com migrações numeradas (o mesmo jeito do
  UniPath). Banco: Postgres em produção (`pg`), **PGlite** (Postgres em WASM) nos testes e no dev sem Docker.
- Sessão: token opaco aleatório (32 bytes) enviado como `Authorization: Bearer`; só o hash SHA-256 fica no banco;
  expira em 30 dias; o admin e o próprio usuário encerram sessões. Cookie entre domínios (Pages ↔ API) é bloqueado
  por navegador, por isso não é cookie.
- Senha: `scrypt` do Node (sem dependência nativa), comparação em tempo constante, mínimo 10 caracteres.
- Proteções: helmet, CORS só para as origens configuradas, rate limit (geral e mais duro em login/cadastro),
  tamanho de corpo limitado, auditoria das ações administrativas.
- Arquivos: interface `FileStore`; em dev e testes grava em disco (`FILES_DIR`). Em produção, um bucket S3 compatível
  — **decisão do dono** (ver abaixo).
- Web: `src/api/` (cliente tipado, `useApiData`), `src/account/` (sessão em Zustand, `can()`, componentes de
  formulário e `RequireAccount`), áreas `conta/` (entrar, criar conta, termos, minha conta), `aulas/` (aluno),
  `professor/`, `admin/`.
  Sem `VITE_API_URL` (build do Pages de hoje), as áreas de conta mostram que as contas ainda não estão no ar e o
  resto do app segue igual.

## Portas (faixa do Fretless)

5180 web dev · 4180 web e2e · **3400 API dev** · **3410 API e2e** · **5460 Postgres local** (se usar Docker).

## Fases

Estado em 29/10: as cinco fases estão feitas (API com 42 testes de integração; web com 255 testes, typecheck e build
limpos). O e2e do fluxo inteiro com a API ainda não existe: os testes de integração cobrem as rotas e o escopo
professor/aluno, e as telas foram conferidas por tipo e build, sem abrir o navegador.

| Área | Rota web | Permissão de entrada |
|---|---|---|
| Minha conta | `/conta` | estar logado |
| Minhas aulas (aluno) | `/aulas`, `/aulas/planos`, `/aulas/materiais`, `/aulas/turmas` | `lessons.read` |
| Professor | `/professor` (turmas), `tarefas`, `planos`, `materiais`, `alunos` | `classes.manage` e afins |
| Administração | `/admin`, `usuarios`, `professores`, `papeis`, `convites`, `auditoria`, `configuracoes` | qualquer permissão de admin; cada aba pede a sua |

Rodar local: `cp apps/api/.env.example apps/api/.env`, `pnpm --filter @fretless/api dev` (3400, PGlite em
`apps/api/.data`), `ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_PASSWORD=… pnpm --filter @fretless/api admin:create`, e o web com
`VITE_API_URL=http://127.0.0.1:3400` em `apps/web/.env.local` (`pnpm dev`).

1. API: banco, migrações, auth, sessões, RBAC, auditoria, admin de usuários/papéis/convites/configurações.
2. Professor: turmas, códigos, avisos, tarefas, materiais com PDF, planos de estudo, progresso dos alunos.
3. Aluno: entrar em turma, aulas (tarefas, avisos, materiais, planos), marcar feita, envio da prática.
4. Web: contas, as três áreas, navegação por permissão, responsivo.
5. Qualidade: testes de integração da API (todas as rotas e o escopo professor/aluno), e2e do fluxo inteiro,
   review de segurança, docs.

## Fica para o dono confirmar (nada disso foi feito)

- **Hospedagem da API e do banco** (ex.: Render + Postgres, como no UniPath) e **bucket dos PDFs** (ex.: Cloudflare
  R2): criam conta/cobrança. O código está pronto para `DATABASE_URL`, `FILES_DIR`/bucket e `CORS_ORIGINS`.
- **Primeiro admin de produção:** `pnpm --filter @fretless/api admin:create` com o e-mail do dono.
- **Texto de termos de uso e política de privacidade** (há um rascunho nas telas; precisa de revisão jurídica).
- **E-mail transacional** (recuperar senha, avisar responsável): sem provedor, a recuperação é feita pelo admin, que
  gera um código de redefinição.
