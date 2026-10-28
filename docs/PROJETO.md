# Fretless: o projeto inteiro em um documento

Atualizado em 28/10/2026, commit `f2256e0`. Serve de base para o planejamento: o que é, o que já roda, como é
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
| Core em WASM (`pnpm build:core`) | os mesmos 99 casos passam no Node (o de threads é pulado) |
| `packages/core` (bindings TypeScript) | 12 testes vitest |
| `apps/web` | 89 testes vitest, typecheck limpo, `vite build` gera a PWA (e `404.html` para hospedagem estática) |
| CI (`.github/workflows/ci.yml`) | compila o core com o Emscripten 6.0.13, typecheck, testes e build web a cada push na `main`; deploy no Pages desligado (ver §11, item 6) |
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
tests/                        100 casos (sem framework) + tests/data (MusicXML, .mxl)
CMakeLists.txt, build.bat, test.bat

packages/core/                Emscripten build (scripts/build.mjs), bindings (src/index.ts, types.ts),
                              harness que roda os 100 casos em WASM, vitest
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
| **Praticar** | `/praticar` | Cartões dos 9 módulos com progresso (melhor resultado por exercício), lista de exercícios com estrelas, detalhe e "Tocar" | Rotinas (lista, editor, metas), sessão em execução com repetições, gerador de rotina com espaçamento, filtros, histórico por exercício |
| **Músicas** | `/musicas` | Importar `.musicxml`/`.mxl` (limite 8 MB), lista com título, compositor, bpm, notas e duração; Tocar; Remover. Aba **Estante** (`/musicas/estante`): importar PDF (64 MB), ler página a página em `/estante/:id` com afinador, metrônomo e pedal do lado, sem nota nem XP | Persistir as músicas (hoje somem ao recarregar), trilha Suzuki (10 livros como cartões, "aprendi na aula"), biblioteca CC0, detalhe com trechos, loop e andamento, gravador |
| **Tocar** | `/tocar/:id` | Tela cheia escura. Countdown, pauta rolando (canvas próprio, notas vêm da direita até a linha de agora, veredito colore a nota), nota atual (nome, corda, compasso), afinador (−50..+50 cents), precisão, combo, perfeitas/erros, Resultado com estrelas (salvo no Dexie), Tocar de novo, Sair. Pede microfone no Começar; erros do mic em PT-BR | Highway (canvas) como modo alternativo, metrônomo e drone, loop A-B, controle de andamento, auto-slowdown, Resultado com mapa de compassos e "repetir os difíceis" |
| **Ferramentas** | `/ferramentas` | Índice; **Teste de latência** (12 cliques no alto-falante, mede chegada no mic, média/jitter/mín/máx, veredito aprovado/limite/reprovado) | Afinador tela cheia com modo ressonância, Metrônomo progressivo, Drone com aviso de fone |
| **Progresso** | `/progresso` | Sequência atual, últimos 7 dias com minutos, resultados recentes | Calendário, por módulo, histórico, exportar, migração do `progress.txt` do app nativo |
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
| IndexedDB via Dexie | `routines`, `settings` | tabelas criadas, sem uso ainda |
| localStorage via Zustand persist | dispositivo de entrada, nomenclatura das notas | em uso |
| Memória (`library.ts`) | músicas importadas (bytes + partitura parseada) | **somem ao recarregar** |
| Nada | conta, sincronização, professora | fase 7, não começou |

A sequência de dias usa o dia do calendário local (`localDayKey`); UTC quebrava a sequência depois das 21h.

## 8. Qualidade e verificação

- `pnpm test`: harness WASM (99) + vitest core (12) + vitest web (20). `test.bat`: 100 nativos.
- `pnpm typecheck`, `pnpm --filter @fretless/web build`.
- Regra do repo: bug que chegou ao usuário deixa um teste que falha sem o fix e uma entrada em "Armadilhas" na
  skill (`.claude/skills/fretless-web/SKILL.md` já tem 10 entradas).
- Ainda não existe: teste e2e (Playwright) com o jogador sintético no navegador, CI, teste visual.

## 9. O que falta para o "sistema completo"

Seguindo as fases de `docs/replanejamento/README.md` (0 → 1 → 2 em ordem fixa; de 3 em diante a ordem é
escolha).

| Fase | Status | Falta |
|---|---|---|
| 0. Spike de latência | **quase**: pipeline funciona, teste pronto | medir no PC/tablet: meta ≤ 30 ms, jitter < 5 ms, ≤ 1 cent nas 4 cordas; reprovou → Capacitor/Tauri com a mesma UI |
| 1. Fundação | **feita**: monorepo, core nos dois mundos, tokens em código, 5 áreas, PWA, Dexie | página de componentes com todos os tokens; conferir o app aberto offline |
| 2. Tocar | **feita (28/10)**: pauta rolando, metrônomo com subdivisão e 3 sons, drone, andamento ±5, loop A-B, mapa de compassos, "repetir os difíceis", XP e maestria por execução | highway como modo alternativo, auto-slowdown, e2e com jogador sintético |
| 3. Praticar | **feita (28/10)**: rotinas padrão 15/25/45 e rotinas próprias, blocos ↔ tipo de exercício, planejador do dia com revisão espaçada e semente diária, filtros por módulo | editor arrastável de rotina, contador de repetições |
| 4. Hoje, onboarding, Progresso | **feita (28/10)**: onboarding em 5 passos, sessão do dia na Hoje, nível e XP, heatmap de 12 semanas, histórico de precisão, conquistas, loja (congelador, sons, paleta sépia); configurações com teste de microfone, sensibilidade, tamanho da partitura, backup `.json`, limpar cache, resetar | migração do `progress.txt` do app nativo |
| 5. Músicas | **feita (28/10)**: catálogo do core + importações persistidas no Dexie (8 MB), filtros por nível, compositor, gênero e status (não iniciada, em estudo, dominada), tocar em `/tocar/musica/:id`; **estante de PDF (28/10)**: métodos e partituras em PDF lidos dentro do app (pdf.js), com afinador, metrônomo e pedal ao lado, sem julgamento nem XP | biblioteca CC0 maior, gravador com comparação (decisão 8 em §11) |
| 6. Caderno da aula e Ferramentas | **feita (28/10)**: caderno na Hoje (tarefa → bloco "Da aula", dia da aula), afinador tela cheia com corda provável e referência, metrônomo progressivo, nota pedal, teste de latência | resumo da semana no caderno |
| 7. Publicação | **CI feita (28/10)**; deploy aguarda decisão | Pages exige repo público ou plano Pro (§11, item 6); Render é a alternativa. Conta e sync (Supabase) e acesso da professora seguem pausados |

## 10. Dívidas conhecidas (achados do review ainda abertos)

Todas pequenas; nenhuma bloqueia uso.

- Músicas importadas só em memória (seção 7).
- Select de microfone em Configurações pode mostrar um id que já não existe.
- Foco de teclado invisível nos radios `sr-only` e no input de arquivo; `<button>` contendo `<h2>` em Praticar.
- Google Fonts não entra no precache: offline cai na fonte de sistema.
- Tabelas `routines` e `settings` do Dexie sem uso; alguns valores arbitrários do Tailwind; `aria-label` em
  spans genéricos; contraste do `StringChip`.
- Highway e pauta não desenhados (é a fase 2, não dívida).

## 11. Decisões que o planejamento precisa tomar

1. ~~Qual tablet~~ **Decidido em 28/10: Chrome no Android** é o alvo de estabilidade inicial. O teste de latência
   precisa passar lá; Safari/iPad fica para depois.
2. ~~Depois da fase 2, o que vem primeiro~~ **Resolvido em 28/10**: as fases 3 a 7 foram feitas em sequência num
   só dia ("faça todos os planos, só pare quando finalizar tudo").
3. ~~Tocar precisa mostrar a partitura vindo~~ **Feito em 28/10** ("o design deve fazer com que seja possível ver
   a partitura vindo"): pauta rolando em canvas próprio, portada do `StaffView` nativo, com a linha de agora fixa
   a 20% da largura e 6 s à frente (`ScrollingStaff.tsx`). VexFlow foi descartado. O highway fica como modo
   alternativo opcional.
4. ~~Metrônomo e drone~~ **Feito dos dois jeitos em 28/10**: dentro do Tocar (presos ao contexto do microfone) e
   como ferramentas separadas (`/ferramentas/metronomo` com andamento progressivo, `/ferramentas/pedal`).
5. ~~Conta e sincronização~~ **Decidido em 28/10: pausado.** Só local até a fundação offline estar impecável.
6. **Publicação**: o CI já gera o site com `BASE_PATH=/fretless/` e o job de deploy no GitHub Pages existe, mas a
   API respondeu em 28/10 que **o plano atual não oferece Pages para repositório privado**. Para publicar: tornar o
   repo público (ou assinar o Pro) e criar a variável `DEPLOY_PAGES=true` em Settings → Secrets and variables →
   Actions; ou apontar um Static Site do Render para `apps/web/dist` (build `pnpm install && pnpm build:core &&
   pnpm --filter @fretless/web build`, que precisa do emsdk na imagem). PWA basta por enquanto; loja (Capacitor)
   só se o teste de latência reprovar no Chrome Android.
7. ~~Professora~~ **Pausado junto com a conta (28/10).** O Caderno da aula é só do aluno por enquanto.
8. **Gravação de áudio** das sessões (comparar antes/depois): entra na fase 5 ou fica fora?
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
pnpm --filter @fretless/web build  # apps/web/dist; com BASE_PATH=/fretless/ gera o site para o sub-caminho do Pages
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
