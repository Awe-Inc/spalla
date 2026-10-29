# Fretless: o projeto inteiro em um documento

Atualizado em 29/10/2026. Serve de base para o planejamento: o que é, o que já roda, como é
construído, o que falta e o que precisa ser decidido. Os detalhes de cada área estão nas skills do repo e em
`docs/replanejamento/`; este arquivo é o mapa.

## 1. O que é

Plataforma de estudo de violino para uma pessoa estudando em casa, com um tablet na estante e o violino na mão.
O app ouve o microfone, descobre a nota tocada em tempo real, compara com a partitura e dá um veredito por nota
(afinação e tempo). Em volta disso: aquecimento, escalas, afinação, leitura, ritmo, Método Suzuki, músicas
importadas e progresso.

Princípios que já decidiram empates (de `docs/replanejamento/README.md`):

- Tocar pede uma decisão só: "Começar". O resto é o app que escolhe.
- A interface diz o que fazer ("18 cents baixo"), não só o que aconteceu ("errou").
- Nada depende de servidor: funciona offline, dados ficam no aparelho.
- Interface em português do Brasil, notas em Dó Ré Mi; código e comentários em inglês.

## 2. Onde está hoje

Desde 28/10 o projeto é **web-first**: o motor C++ continua, compilado também para WebAssembly, e a interface é
um app React instalável como PWA. O app nativo (SDL2 + OpenGL) ainda compila e serve de referência visual e de
teste, mas não recebe mais interface nova.

O que roda agora, verificado nesta data:

| Peça | Estado |
|---|---|
| Core C++ nativo (`build.bat`, `test.bat`) | 100 testes, 0 falhas |
| Core em WASM (`pnpm build:core`) | os mesmos 100 casos passam no Node (o de threads é pulado) |
| `packages/core` (bindings TypeScript) | 12 testes vitest |
| `apps/web` | 243 testes vitest em 45 arquivos, typecheck limpo, `vite build` gera a PWA (213 entradas no precache, com fontes e assets do pdf.js) e o `404.html` para hospedagem estática; 6 testes e2e Playwright (`pnpm --filter @fretless/web test:e2e`): um toca um exercício inteiro com o jogador sintético no Chromium e confere o Resultado, com a vista "As duas" ligada; outro abre uma canção da biblioteca CC0 por Músicas e toca até o Resultado; o terceiro marca uma peça Suzuki como aprendida e confere que ela continua em revisão depois de recarregar; o quarto marca um trecho no detalhe de uma canção, recarrega e confere que "Praticar em loop" abre o Tocar com o trecho repetindo e o andamento escolhido; o quinto grava duas passadas da mesma peça com o microfone falso do Chromium, recarrega, compara as duas lado a lado e confere que o detalhe da peça lista as gravações; o sexto põe uma canção da biblioteca no bloco de Revisão da rotina de 25 minutos, confere que a Hoje usa a cópia nova com a peça ligada ao Tocar e que "Soltar peça" devolve o bloco ao app |
| CI (`.github/workflows/ci.yml`) | compila o core com o Emscripten 6.0.13, typecheck, testes e build web a cada push na `main`, e publica o site no GitHub Pages (https://henriquerl55.github.io/fretless/) |
| Dev server | `http://localhost:5180` (porta fixa; preview em 4180) |
| Afinador no AudioWorklet | WASM carrega dentro do worklet e detecta 440,02 Hz de um oscilador com confiança 0,99999 (testado sem microfone) |
| Microfone real no Chrome | **ainda não medido**: o bug de hoje (InvalidStateError) impedia; corrigido em `26e05f1`, falta rodar `/ferramentas/latencia` numa máquina com microfone |

Bugs corrigidos hoje, todos com teste ou armadilha registrada:

1. O worklet nunca registrava o processador: `AudioWorkletGlobalScope` não tem `URL`, e o glue do Emscripten 4
   ignora `Module.wasmBinary`. Agora `coreWasmUrl` é guardado e `loadCore` passa os bytes por `instantiateWasm`.
2. Caixas de erro ilegíveis no tema escuro: os tons suaves de status ganharam variante dark.
3. Preview do app não subia: `pnpm.cmd` global está quebrado no Windows; o preview chama `pnpm.mjs` pelo Node.

## 3. Arquitetura

```
                    ┌──────────────────────────────────────────────┐
                    │  C++20 core (src/, include/fretless)          │
                    │  score · curriculum · game · audio/PitchDetector│
                    └───────────┬──────────────────────┬───────────┘
                     CMake nativo                 Emscripten + embind
                                │                      │
                    ┌───────────▼─────────┐  ┌─────────▼──────────────────────┐
                    │ Fretless.exe (SDL2, │  │ packages/core                   │
                    │ OpenGL, PortAudio)  │  │ dist/fretless_core.{js,wasm}    │
                    │ referência e testes │  │ src/index.ts: loadCore(),       │
                    └─────────────────────┘  │ PitchTracker, PracticeSession,  │
                                             │ parseMusicXml, curriculum        │
                                             └─────────┬───────────────────────┘
                                                       │
                    ┌──────────────────────────────────▼───────────────────────┐
                    │ apps/web (React 19 · Vite 7 · Tailwind v4 · Router 7)     │
                    │                                                          │
                    │  main thread: páginas, GameEngine (sessão) via WASM,     │
                    │               Zustand (ajustes), Dexie/IndexedDB (dados)  │
                    │  AudioWorklet: pitch-worklet.ts roda o YIN em WASM,       │
                    │               posta um PitchFrame a cada 512 amostras     │
                    │  PWA: vite-plugin-pwa + workbox, instalável, offline      │
                    └──────────────────────────────────────────────────────────┘
```

Decisões estruturais que valem a pena conhecer:

- **O motor não mudou de linguagem.** Partitura, currículo, julgamento e YIN são o mesmo código nos dois mundos,
  com os mesmos testes. A web consome por `@fretless/core`.
- **Tempo real fica no worklet.** O worklet recebe os bytes do WASM pelo `processorOptions` (não tem `fetch`
  lá), não aloca por bloco e só posta frames. A interpretação musical (nome da nota, cents, corda) é no main
  thread, igual ao engine nativo.
- **Um buffer, um consumidor.** `usePitchInput` guarda a fila de frames para o game loop (`takeFrames`) e um
  `latest` separado para o estado React. Listener registrado uma vez, no mount.
- **Julgamento é um veredito por nota**, medido contra a nota escrita (nota errada afinada é erro), com fração
  mínima de tempo afinado, onset separado de afinação, e o número mais útil é o desvio com sinal ("18 cents
  baixo").
- **Dedilhado**: nota vai para a corda mais aguda cuja corda solta ela alcança (`stringForMidi`).

## 4. Mapa do repositório

```
CLAUDE.md                     índice: qual skill carregar para cada área
DESIGN.md                     design system (tokens, componentes, do's and don'ts)
README.md                     comandos nativos e web
docs/replanejamento/          README (fases, riscos, decisões), arquitetura-da-informacao,
                              pedagogia-e-rotina, stack
docs/PROJETO.md               este arquivo
.claude/skills/               fretless-web · fretless-engine · fretless-curriculum · violin-pedagogy
.claude/launch.json           preview "web" (vite na 5180)

include/fretless, src/        core C++: app/ audio/ core/ curriculum/ game/ platform/ render/ score/ view/
tests/                        101 casos (sem framework) + tests/data (MusicXML, .mxl)
CMakeLists.txt, build.bat, test.bat

packages/core/                Emscripten build (scripts/build.mjs), bindings (src/index.ts, types.ts),
                              harness que roda os 101 casos em WASM, vitest
apps/web/src/
  app/        Shell (sidebar ≥ lg, barra inferior abaixo), router, settings (Zustand persist)
  design/     tokens.css (única fonte de cor/fonte/raio), components.tsx, Tuner.tsx
  areas/      hoje · praticar · musicas · ferramentas (+ latencia) · progresso · configuracoes · tocar
  audio/      PitchInput (mic + AudioContext), pitch-worklet, usePitchInput, latency (teste de latência)
  data/       db.ts (Dexie), library.ts (músicas importadas, em memória)
  core/       useCore (carrega o WASM uma vez no main thread)
  music/      nomes Dó Ré Mi e formatação de cents
```

## 5. As telas, como estão

| Área | Rota | O que faz hoje | O que a IA (`arquitetura-da-informacao.md`) ainda pede |
|---|---|---|---|
| **Hoje** | `/` | Saudação, minutos de hoje em anel ("de 20 min"), sequência de dias, "Próximo passo" (um exercício do plano) com estrelas e bpm, botão Começar | Sessão do dia inteira (blocos), revisão pendente, atalhos, caderno da aula |
| **Praticar** | `/praticar` | Cartões dos 9 módulos com progresso (melhor resultado por exercício), lista de exercícios com estrelas, detalhe e "Tocar"; rotinas padrão e próprias; blocos de escalas, técnica e estudo com meta de 3 repetições limpas seguidas (pontos na Hoje e no resultado do Tocar); editor de rotina com blocos arrastáveis (ou Subir/Descer), minutos e meta por bloco, edição das rotinas próprias, blocos com peça fixada ("Revisão: título") e "Soltar peça"; histórico por exercício (vezes e dias, última vez, melhor resultado, barras das últimas execuções, tendência, andamento seguro, deriva, séries fechadas) | — |
| **Músicas** | `/musicas` | Importar `.musicxml`/`.mxl` (limite 8 MB), lista com título, compositor, bpm, notas e duração; Tocar; Remover; 110 canções CC0 do OpenScore Lieder junto, com crédito. Aba **Estante** (`/musicas/estante`): importar PDF (64 MB), ler página a página em `/estante/:id` com afinador, metrônomo e pedal do lado, sem nota nem XP. Aba **Suzuki** (`/musicas/suzuki`): os 10 livros como cartões (foco, nível, peças, preparação), "Aprendi na aula" põe a peça em revisão espaçada (1, 3, 7, 14 e depois a cada 30 dias), "Revisei hoje", Tocar nas peças de domínio público; a Hoje avisa das peças vencidas. **Detalhe da peça** (`/musicas/peca/...`, pelo título ou "Trechos"): armadura, compasso, andamento, duração, compassos e notas; andamento de estudo ±5; frases de 4 em 4 compassos e trechos próprios ("compassos 9–16", guardados com o andamento), cada um com "Praticar em loop", que abre o Tocar com o trecho repetindo e o andamento já posto (`?de=&ate=&bpm=`); histórico da peça; últimas gravações da peça com "Gravar esta peça"; "Tocar inteira"; **Adicionar à rotina** (escolhe a rotina e o bloco Peça nova ou Revisão; a peça ocupa o bloco desse tipo que o app escolheria, ou ganha um bloco de 5 min no fim; rotina pronta vira uma cópia "Minha rotina de N minutos", que passa a ser a do dia) | — |
| **Tocar** | `/tocar/:id` | Tela cheia escura. Countdown, pauta rolando (canvas próprio, notas vêm da direita até a linha de agora, veredito colore a nota) ou, na escolha "Vista", pistas das cordas (highway: uma pista por corda, Mi em cima, nota na cor da corda) ou as duas juntas, nota atual (nome, corda, compasso), afinador (−50..+50 cents), precisão, combo, perfeitas/erros, Resultado com estrelas (salvo no Dexie), Tocar de novo, Sair. Pede microfone no Começar; erros do mic em PT-BR | Metrônomo e drone, loop A-B, controle de andamento, auto-slowdown ("Diminuir ao errar": compasso < 70% ou execução < 60% baixa 15% na próxima, com desfazer), Resultado com mapa de compassos e "repetir os difíceis" |
| **Ferramentas** | `/ferramentas` | Índice; **Teste de latência** (12 cliques no alto-falante, mede chegada no mic, média/jitter/mín/máx, veredito aprovado/limite/reprovado); **Gravador** (`/ferramentas/gravador`, 29/10): grava até 15 min com o microfone escolhido, ouve antes de guardar, nomeia, liga a uma peça (`?peca=&titulo=`), renomeia, apaga, filtra por peça e compara duas gravações da mesma peça lado a lado (antes e depois); fica só no aparelho, fora do backup | Afinador tela cheia com modo ressonância, Metrônomo progressivo, Drone com aviso de fone |
| **Progresso** | `/progresso` | Sequência atual, últimos 7 dias com minutos, resultados recentes, gravações por peça (quantas e a data da última, com link para o Gravador) | Calendário, por módulo, histórico, exportar |
| **Configurações** | `/configuracoes` | Dispositivo de entrada, nomes das notas, ajustes persistidos | Calibração, tema, conta |
| **Onboarding** | (não existe) | | 6 passos com calibração do microfone |

## 6. Conteúdo que já existe no core

- **9 módulos** (`src/curriculum/Curriculum.cpp`): Aquecimento, Golpes de arco, Uma corda por vez, Escalas e
  arpejos, Afinação, Leitura, Ritmo, Método Suzuki, Melodias. **160+ exercícios** gerados por receita
  (`Recipe`/`Generator`), ids como `warmup.longtone.G`, `scales.G.major.1oct`.
- **Plano de prática** (`PracticePlan.cpp`): monta a sessão de hoje por slots com módulo de fallback; o nível
  (1–7) escala as receitas.
- **Parser MusicXML** (`.musicxml` e `.mxl`, repetições expandidas, ligaduras fundidas, introdução silenciosa
  cortada), com beaming e armadura.
- **Pedagogia escrita** (`violin-pedagogy` e `pedagogia-e-rotina.md`): trilha N1–N7, modelo de rotina (blocos
  intercalados e espaçados), o que cada bloco mede, Suzuki "com os limites certos" (só melodias de domínio
  público tocáveis; o resto como referência e "aprendi na aula"), três ferramentas de afinação com uma regra.
- **Jogador sintético** (`SyntheticPlayer`): simula um violinista para testes do engine sem microfone.

## 7. Dados no aparelho

| Onde | O quê | Estado |
|---|---|---|
| IndexedDB via Dexie (`db.ts`) | `results` (exercício, estrelas, precisão, desvio médio, bpm, data), `practiceDays` (minutos por dia local) | em uso |
| IndexedDB via Dexie | `routines` (rotinas próprias), `pieces` (MusicXML importado), `sheets` + `sheetFiles` (PDFs da estante), `recordings` + `recordingFiles` (gravador, v8; fora do backup e do reset), `userStats`, `achievements`, `lessonTasks` | em uso |
| localStorage via Zustand persist | dispositivo de entrada, nomenclatura das notas, acento, onboarding | em uso; o id do microfone volta ao padrão quando o aparelho some |
| Nada | conta, sincronização, professora | fase 7, não começou |

A sequência de dias usa o dia do calendário local (`localDayKey`); UTC quebrava a sequência depois das 21h.

## 8. Qualidade e verificação

- `pnpm test`: harness WASM (99) + vitest core (12) + vitest web (20). `test.bat`: 100 nativos.
- `pnpm typecheck`, `pnpm --filter @fretless/web build`.
- Regra do repo: bug que chegou ao usuário deixa um teste que falha sem o fix e uma entrada em "Armadilhas" na
  skill (`.claude/skills/fretless-web/SKILL.md` já tem 10 entradas).
- E2E (Playwright, `apps/web/e2e/`): o `SyntheticPlayer` nativo é exposto pelo WASM (`Session.configureSyntheticPlayer` + `synthesize`) e a página Tocar o usa no lugar do microfone quando a URL traz `?jogador=sintetico` e o build tem `VITE_JOGADOR_SINTETICO=1` (só o `webServer` do Playwright liga isso). O teste abre `/tocar/scales.1oct.69`, confirma o fone, clica em Começar, espera a região "Resultado" (~30 s) e confere precisão > 70% e o XP salvo.
- Ainda não existe: CI, teste visual.

## 9. O que falta para o "sistema completo"

Seguindo as fases de `docs/replanejamento/README.md` (0 → 1 → 2 em ordem fixa; de 3 em diante a ordem é
escolha).

| Fase | Status | Falta |
|---|---|---|
| 0. Spike de latência | **quase**: pipeline funciona, teste pronto | medir no PC/tablet: meta ≤ 30 ms, jitter < 5 ms, ≤ 1 cent nas 4 cordas; reprovou → Capacitor/Tauri com a mesma UI |
| 1. Fundação | **feita**: monorepo, core nos dois mundos, tokens em código, 5 áreas, PWA, Dexie, página `/componentes` com todos os tokens e componentes (28/10); app conferido offline no navegador com o servidor desligado (28/10): raiz, Praticar, Músicas, Progresso, Metrônomo e `/componentes` servidos pelo service worker, core WASM vindo do cache, sem erro no console | — |
| 2. Tocar | **feita (28/10)**: pauta rolando, metrônomo com subdivisão e 3 sons, drone, andamento ±5, loop A-B, mapa de compassos, "repetir os difíceis", XP e maestria por execução, e2e Playwright com jogador sintético, auto-slowdown com desfazer, pistas das cordas (highway) como vista alternativa (29/10) | — |
| 3. Praticar | **feita (28/10)**: rotinas padrão 15/25/45 e rotinas próprias, blocos ↔ tipo de exercício, planejador do dia com revisão espaçada e semente diária, filtros por módulo, contador de repetições limpas (≥ 90%, erro zera, bloco fecha com 3 seguidas; 3 séries em dias diferentes pedem andamento novo), editor de rotina com blocos arrastáveis (ou Subir/Descer no teclado), minutos e meta por bloco, edição das rotinas próprias, histórico por exercício | — |
| 4. Hoje, onboarding, Progresso | **feita (28/10)**: onboarding em 5 passos, sessão do dia na Hoje, nível e XP, heatmap de 12 semanas, histórico de precisão, conquistas, medalhas de constância em bronze/prata/ouro (só lembrança, sem desbloquear nada; a loja de resinas saiu em 28/10 e sons e paleta sépia ficaram livres); configurações com teste de microfone, sensibilidade, tamanho da partitura, backup `.json`, limpar cache, resetar, importar o `progress.txt` do app nativo (28/10: melhor resultado de cada exercício vira um resultado, a linha `days` vira dias de prática; o que já existe fica) | — |
| 5. Músicas | **feita (28/10)**: catálogo do core + importações persistidas no Dexie (8 MB), filtros por nível, compositor, gênero e status (não iniciada, em estudo, dominada), tocar em `/tocar/musica/:id`; **estante de PDF (28/10)**: métodos e partituras em PDF lidos dentro do app (pdf.js), com afinador, metrônomo e pedal ao lado, sem julgamento nem XP; **biblioteca CC0 (29/10)**: 110 canções do OpenScore Lieder (domínio público) no catálogo, offline, tocadas em `/tocar/biblioteca/:slug`; **trilha Suzuki (29/10)**: livros como escada, "aprendi na aula" com revisão espaçada de no máximo 30 dias no Dexie, lembrete na Hoje; **detalhe da peça (29/10)**: frases e trechos próprios com loop e andamento de estudo, histórico; **gravador com comparação (29/10)**: gravar, ouvir, nomear, ligar à peça, comparar duas gravações da mesma peça lado a lado | — |
| 6. Caderno da aula e Ferramentas | **feita (28/10)**: caderno na Hoje (tarefa → bloco "Da aula", dia da aula), afinador tela cheia com corda provável e referência, metrônomo progressivo, nota pedal, teste de latência; resumo da semana no caderno (28/10: desde a última aula, minutos, dias, execuções, tarefas, onde errou mais, tendência de afinação, botão de copiar para a professora) | — |
| 7. Publicação | **Feita (29/10)**: repo público, site em https://henriquerl55.github.io/fretless/ publicado pelo CI | Conta e sync (Supabase) e acesso da professora seguem pausados |

## 10. Dívidas conhecidas (achados do review ainda abertos)

Nenhuma aberta em 28/10. O highway, que era o modo opcional da fase 2, foi feito em 29/10.

Fechadas em 28/10: músicas importadas agora ficam no Dexie (`pieces`); o select de microfone zera um id que não
existe mais (`audio/devices.ts`); foco visível nos radios `sr-only` e nos botões de importar (`has-focus-visible:`);
o título do módulo em Praticar é `<h2>` com `<button>` dentro; fontes auto-hospedadas (Fontsource, `design/fonts.css`)
e no precache, sem Google Fonts; tabela `settings` do Dexie removida (versão 5), `routines` está em uso; `StringChip`
passou a chip neutro com bolinha na cor da corda (o branco sobre a cor dava ~3:1); `Stars` tem `role="img"`; os
tamanhos soltos do Tailwind viraram tokens (`text-note`, `max-w-page`, `grid-cols-shell`). Os grids
`[auto_1fr]` e afins são declarativos e ficam.

## 11. Decisões que o planejamento precisa tomar

1. ~~Qual tablet~~ **Decidido em 28/10: Chrome no Android** é o alvo de estabilidade inicial. O teste de latência
   precisa passar lá; Safari/iPad fica para depois.
2. ~~Depois da fase 2, o que vem primeiro~~ **Resolvido em 28/10**: as fases 3 a 7 foram feitas em sequência num
   só dia ("faça todos os planos, só pare quando finalizar tudo").
3. ~~Tocar precisa mostrar a partitura vindo~~ **Feito em 28/10** ("o design deve fazer com que seja possível ver
   a partitura vindo"): pauta rolando em canvas próprio, portada do `StaffView` nativo, com a linha de agora fixa
   a 20% da largura e 6 s à frente (`ScrollingStaff.tsx`). VexFlow foi descartado. O highway veio em 29/10
   como vista alternativa ("Pauta", "Pistas das cordas" ou "As duas", guardada nas preferências).
4. ~~Metrônomo e drone~~ **Feito dos dois jeitos em 28/10**: dentro do Tocar (presos ao contexto do microfone) e
   como ferramentas separadas (`/ferramentas/metronomo` com andamento progressivo, `/ferramentas/pedal`).
5. ~~Conta e sincronização~~ **Decidido em 28/10: pausado.** Só local até a fundação offline estar impecável.
6. ~~Publicação~~ **Feita em 29/10.** O plano gratuito não oferece Pages para repositório privado, então o repo
   ficou público. Pages no modo workflow, variável `DEPLOY_PAGES=true`; cada push na `main` publica
   https://henriquerl55.github.io/fretless/. Loja (Capacitor) só se o teste de latência reprovar no Chrome Android.
7. ~~Professora~~ **Pausado junto com a conta (28/10).** O Caderno da aula é só do aluno por enquanto.
8. ~~Gravação de áudio~~ **Decidido em 29/10: entra na fase 5.** Gravador em Ferramentas, ligado à peça, com
   comparação antes/depois; as gravações ficam só no aparelho (IndexedDB) e fora do backup `.json`.
9. **Nome e idioma das áreas**: Hoje · Praticar · Músicas · Ferramentas · Progresso está bom?
10. ~~Steam/Electron~~ **Decidido em 28/10: o app nativo vira harness de testes.** SDL2/OpenGL deixa de ter
    prioridade de UI; `test.bat` continua rodando a suíte C++. Steam/Electron saem do plano.

## 12. Como rodar

```bash
pnpm install                       # pnpm 12, Node >= 22
pnpm build:core                    # Emscripten (precisa de C:\Users\Usuario\emsdk)
pnpm test
pnpm typecheck
pnpm dev                           # http://localhost:5180
pnpm --filter @fretless/web build  # apps/web/dist
MSYS2_ENV_CONV_EXCL=BASE_PATH BASE_PATH=/fretless/ pnpm --filter @fretless/web build  # site para o sub-caminho do Pages; o prefixo MSYS2_ evita a conversão de caminho do Git Bash
```

O CI (`.github/workflows/ci.yml`) roda a mesma sequência a cada push na `main` e em pull requests, com o Emscripten
6.0.13 (a mesma versão do `~/emsdk` local). O deploy só acontece com a variável `DEPLOY_PAGES=true` no repositório.

No Windows, fora do Git Bash, `pnpm` precisa ser chamado como
`node %APPDATA%\npm\node_modules\pnpm\bin\pnpm.mjs` (o `pnpm.cmd` está quebrado). Teste de latência:
`/ferramentas/latencia`, Chrome, sem fone, volume médio.

## 13. Referências

- `docs/plano-de-acao.md`: plano de ação de 28/10 (princípios, mecânicas, app, decisões, roadmap).
- `docs/replanejamento/README.md`: pedido reescrito, princípios, fases, riscos, decisões.
- `docs/replanejamento/arquitetura-da-informacao.md`: cada tela e os 5 fluxos de ponta a ponta.
- `docs/replanejamento/pedagogia-e-rotina.md`: níveis, rotina, Suzuki, afinação, caderno.
- `docs/replanejamento/stack.md`: por que web-first, porta de saída medida, modelo de dados.
- `DESIGN.md`: tokens e regras visuais. `.claude/skills/*`: convenções vivas e armadilhas.
