# Testes do Spalla

Quatro camadas, da mais rápida à mais completa. Todas rodam sem som: o e2e abre o Chromium com `--mute-audio` e
quem toca é o jogador sintético (o motor WASM gera as notas, sem microfone nem alto-falante).

| Camada | Comando (na raiz) | O que prova | Tempo |
|---|---|---|---|
| Core C++ nativo | `test.bat` | partitura, currículo, julgamento, YIN | ~1 min |
| Core em WASM + vitest do core | `pnpm test` (parte do core) | os mesmos casos do nativo dentro do WebAssembly | ~20 s |
| Unitários da web | `pnpm --filter @fretless/web test` | lógica pura (`data/`, `audio/`, `notation/`, `areas/*/*.ts`) e componentes com Testing Library | ~15 s |
| API | `pnpm --filter @fretless/api test` | rotas Fastify, permissões e migrações, cada arquivo com um PGlite em memória | ~30 s |
| E2E de prática | `pnpm --filter @fretless/web test:e2e` | uma escala e uma música da biblioteca tocadas pelo jogador sintético | ~55 s |
| E2E de aulas | `pnpm --filter @fretless/web test:e2e:aulas` | professora, coordenação e aluno conversando pela plataforma | ~45 s |

Na primeira vez: `pnpm --filter @fretless/web exec playwright install chromium`.

## E2E de aulas: professora e aluno

`apps/web/playwright.aulas.config.ts` sobe tudo do zero a cada execução:

- uma API de teste na porta **3410**, com um PGlite em pasta temporária (a conta da coordenação é criada pelo
  `adminCli` antes do servidor subir);
- a web pelo vite na **4180**, com `VITE_API_URL` apontando para essa API e o jogador sintético ligado.

As contas de teste ficam em `apps/web/e2e/aulas/contas.ts` (Marina Teixeira, professora; Tomás Andrade, aluno; a
coordenação). Cada pessoa usa um contexto de navegador próprio, então as sessões não se misturam.

O roteiro, passo a passo (`e2e/aulas/aulas.spec.ts`):

1. A professora cria a conta como professor e vê que está aguardando aprovação.
2. A coordenação entra, aprova o pedido em `/admin/professores` e o pedido some da fila.
3. A professora cria a turma e lê o código de seis letras.
4. O aluno cria a conta já com o código e vê a turma em Minhas aulas.
5. A professora publica um aviso; o aluno recarrega e lê.
6. A professora compartilha um link com a turma; o aluno vê em Materiais.
7. A professora passa uma tarefa para a turma.
8. O aluno deixa um recado, marca como feita e recebe a confirmação; a lista fica "Tudo em dia.".
9. O aluno toca uma escala (jogador sintético). O resultado mostra o XP e o quadro "Falta pouco" com as medalhas mais
   perto.
10. O aluno abre Você, segue a patente até a galeria e vê as medalhas agrupadas.
11. A professora vê a tarefa feita, o recado e a prática já sincronizada; responde com um retorno e abre o aluno.
12. O aluno aperta "Enviar prática agora" e recebe "Nada novo para enviar.": prova de que o envio automático chegou
    antes.
13. O aluno abre as feitas ("Ver as feitas (1, 1 com retorno)") e lê o retorno.

Relatório HTML com print e trace das falhas: `apps/web/e2e-relatorio/` (fora do git).
Ver o trace de uma falha: `npx playwright show-trace apps/web/test-results/<pasta>/trace.zip`.

## Medalhas e patente

São só lembrança: nada no app depende delas. Calculadas na hora a partir das execuções e dos dias praticados
(`apps/web/src/data/medals.ts`, testes em `medals.test.ts`):

- 14 medalhas, cada uma com bronze, prata e ouro, em três grupos: Constância, Técnica e afinação, Repertório e coragem;
- cada nível conquistado conta para a patente na orquestra: Primeiro arco, Aprendiz de estante, Músico de fila, Chefe
  de naipe, Spalla e Solista;
- a tela de resultado anuncia patente nova, medalha nova e conquista nova, e lista o que falta para as duas medalhas
  mais perto.
