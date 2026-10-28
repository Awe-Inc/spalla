# Fretless: o projeto inteiro em um documento

Atualizado em 28/10/2026, commit `26e05f1`. Serve de base para o planejamento: o que é, o que já roda, como é
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
| `apps/web` | 20 testes vitest, typecheck limpo, `vite build` gera a PWA |
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
| **Músicas** | `/musicas` | Importar `.musicxml`/`.mxl` (limite 8 MB), lista com título, compositor, bpm, notas e duração; Tocar; Remover | Persistir as músicas (hoje somem ao recarregar), trilha Suzuki (10 livros como cartões, "aprendi na aula"), biblioteca CC0, detalhe com trechos, loop e andamento, gravador |
| **Tocar** | `/tocar/:id` | Tela cheia escura. Countdown, nota atual (nome, corda, compasso), próximas notas, afinador (−50..+50 cents), precisão, combo, perfeitas/erros, Resultado com estrelas (salvo no Dexie), Tocar de novo, Sair. Pede microfone no Começar; erros do mic em PT-BR | Highway (canvas), pauta (VexFlow), metrônomo e drone, Resultado com mapa de compassos e "repetir os difíceis", controle de andamento |
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
| 2. Tocar | **parcial**: fluxo exercício → Tocar → Resultado funciona com afinador e estatísticas | **partitura vindo** (requisito de 28/10): pauta rolando em canvas ou VexFlow, highway como alternativa; metrônomo e drone em Web Audio, mapa de compassos, "repetir os difíceis", controle de andamento, e2e com jogador sintético |
| 3. Praticar | **parcial**: módulos e exercícios listados, Próximo passo na Hoje | rotinas (lista, editor arrastável, metas, variações), sessão com contador de repetições, gerador com intercalação e espaçamento (testes com data fixa), filtros e histórico |
| 4. Hoje, onboarding, Progresso | **parcial**: Hoje e Progresso básicos | onboarding de 6 passos com calibração, sessão completa na Hoje, calendário, por módulo, exportar, migração do `progress.txt` |
| 5. Músicas | **parcial**: importar e tocar MusicXML | persistir no Dexie, trilha Suzuki, biblioteca CC0, trechos/loop/andamento, gravador com comparação |
| 6. Caderno da aula e Ferramentas | **começou**: teste de latência | caderno (anotações, tarefas → rotina "Da aula", resumo da semana), afinador tela cheia, metrônomo progressivo, drone |
| 7. Conta e publicação | **não começou** | deploy (GitHub Pages ou Render), conta e sync (Supabase), acesso da professora, CI, Electron/Steam opcional |

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

1. **Qual tablet** vai para a estante: Android (Chrome) ou iPad (Safari)? Define onde o teste de latência precisa
   passar e se o worklet precisa de ajustes para WebKit.
2. **Depois da fase 2, o que vem primeiro**: Praticar (rotinas e sessão do dia) ou Músicas (Suzuki e trechos)?
3. **Tocar precisa mostrar a partitura vindo** (decidido em 28/10: "o design deve fazer com que seja possível
   ver a partitura vindo"). Hoje a tela só mostra a nota atual e as próximas em texto; isso não basta. O que
   resta escolher é a forma: pauta rolando da direita para a esquerda com a linha de "agora" fixa (como o app
   nativo faz com `StaffView`), highway por corda (como `HighwayView`), ou pauta em cima e highway embaixo. A
   recomendação é começar pela pauta rolando, porque é o que a aula usa, e deixar o highway como modo
   alternativo.
4. **Metrônomo e drone** dentro do Tocar desde o início ou como ferramentas separadas primeiro?
5. **Conta e sincronização**: quando? Só local até ter dois aparelhos, ou já na primeira publicação?
6. **Publicação**: GitHub Pages (estático, grátis) ou Render? PWA basta ou quer loja (Capacitor) também?
7. **Professora**: ela vai ver o Caderno da aula? Isso puxa conta, compartilhamento e privacidade para antes.
8. **Gravação de áudio** das sessões (comparar antes/depois): entra na fase 5 ou fica fora?
9. **Nome e idioma das áreas**: Hoje · Praticar · Músicas · Ferramentas · Progresso está bom?
10. **Steam/Electron**: mantém como anexo opcional ou encerra a linha nativa de vez (deixando só o core e os
    testes)?

## 12. Como rodar

```bash
pnpm install                       # pnpm 12, Node >= 22
pnpm build:core                    # Emscripten (precisa de C:\Users\Usuario\emsdk)
pnpm test
pnpm typecheck
pnpm dev                           # http://localhost:5180
```

No Windows, fora do Git Bash, `pnpm` precisa ser chamado como
`node %APPDATA%\npm\node_modules\pnpm\bin\pnpm.mjs` (o `pnpm.cmd` está quebrado). Teste de latência:
`/ferramentas/latencia`, Chrome, sem fone, volume médio.

## 13. Referências

- `docs/replanejamento/README.md`: pedido reescrito, princípios, fases, riscos, decisões.
- `docs/replanejamento/arquitetura-da-informacao.md`: cada tela e os 5 fluxos de ponta a ponta.
- `docs/replanejamento/pedagogia-e-rotina.md`: níveis, rotina, Suzuki, afinação, caderno.
- `docs/replanejamento/stack.md`: por que web-first, porta de saída medida, modelo de dados.
- `DESIGN.md`: tokens e regras visuais. `.claude/skills/*`: convenções vivas e armadilhas.
