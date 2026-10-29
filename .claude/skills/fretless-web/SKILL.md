---
name: fretless-web
description: Working in the Fretless web app — the pnpm monorepo (packages/core = C++ core compiled to WebAssembly with embind; apps/web = React 19 + Vite 7 + Tailwind v4 + React Router 7 + Zustand + Dexie, installable PWA), the AudioWorklet pitch pipeline, the design tokens, the data layer and the build/test commands. Use when changing anything under apps/web or packages/core, before running pnpm, and when a change touches the WASM boundary.
---

# The Fretless web app (Spalla)

The product is called **Spalla** on screen; the repo, packages and storage keep the name Fretless (see Armadilhas,
"nomes internos legados"). Visual rules live in `DESIGN.md` at the repo root.

The C++20 core (`src/score`, `src/curriculum`, `src/game`, `src/audio/PitchDetector`) is unchanged and still builds
natively (see `fretless-engine`). The web app consumes it through `@fretless/core`, an Emscripten build with embind
bindings. Everything a player sees is React.

## Commands

```bash
pnpm install                       # once; pnpm 12, Node >= 22
pnpm build:core                    # Emscripten → packages/core/dist (needs C:\Users\Usuario\emsdk)
pnpm test                          # WASM harness (100 cases) + vitest core (14) + vitest web (290); API: 44 em apps/api
pnpm typecheck                     # tsc in both packages
pnpm --filter @fretless/web test:e2e   # Playwright: vite on 4180 with VITE_JOGADOR_SINTETICO=1, Chromium plays
                                   # scales.1oct.69 and one CC0 song from Músicas with the synthetic
                                   # player (~55 s); first run needs
                                   # `pnpm --filter @fretless/web exec playwright install chromium`
pnpm --filter @fretless/web build  # tsc -b + vite build → apps/web/dist (PWA, service worker, 404.html = SPA fallback)
BASE_PATH=/spalla/ pnpm --filter @fretless/web build   # sub-path build (GitHub Pages); from PowerShell on Windows,
                                   # Git Bash rewrites "/spalla/" into a Windows path
pnpm dev                           # vite on http://localhost:5180 (preview: 4180)
pnpm --filter @fretless/api dev    # Fastify on 3400 (PGlite em apps/api/.data; lê apps/api/.env se existir)
pnpm --filter @fretless/api test   # vitest da API, cada arquivo com um PGlite em memória
pnpm --filter @fretless/api admin:create   # ADMIN_EMAIL/ADMIN_NAME/ADMIN_PASSWORD no ambiente
```

A web fala com a API em `VITE_API_URL` (`apps/web/.env.example`); sem ela, as áreas de conta, professor, aluno e
admin mostram que a plataforma está fora do ar e o resto do app segue local.

`packages/core/scripts/build.mjs` finds `emcmake` in `%USERPROFILE%\emsdk` and Ninja through `vswhere`. The native
test binary is compiled to `dist/fretless_core_tests.cjs` too, so the same 101 cases run in both worlds (the
threaded ring-buffer case is skipped without pthreads).

Ports are fixed in `apps/web/vite.config.ts` (`strictPort`): 5180 dev, 4180 preview. Never change them to a port
another project uses.

## Layout

```
packages/core/src/index.ts       loadCore(), typed wrappers: curriculum, exerciseScore, parseMusicXml,
                                 createSession, createPitchTracker, noteName, centsBetween
apps/web/src/design/tokens.css   the only place a colour, font or radius is written (from DESIGN.md)
apps/web/src/design/fonts.css    Fontsource imports (Instrument Serif 400 + itálico, Instrument Sans Variable, Geist Mono Variable);
                                 self-hosted woff2 (and the woff fallbacks) land in the precache, no Google Fonts
.github/workflows/ci.yml          CI on main/PRs: emsdk 6.0.13 (same as ~/emsdk), pnpm build:core, typecheck, tests,
                                 web build with BASE_PATH=/<repo>/; the Pages deploy job only runs when the repo
                                 variable DEPLOY_PAGES is "true" (set; repo public since 29/10, transferred to Pataxo-Inc and renamed spalla on 29/10, site at pataxo-inc.github.io/spalla)
apps/web/src/design/components.tsx  Card (plain | inset | hero), StringChip, Stars, GoalDots (pontos da série de
                                 repetições), AccuracyBars, ProgressRing, HeadphoneNotice, EmptyState, InlineError;
                                 re-exporta actions e layout
apps/web/src/design/actions.tsx  Button (primary|secondary|ghost|quiet, md|lg, loading), buttonClass, ButtonLink,
                                 IconButton (aria-label obrigatório), ConfirmButton (confirmação inline, sem modal),
                                 Menu (popover não-modal para ações secundárias)
apps/web/src/design/layout.tsx   PageHeader (back, título, descrição, ações), Tabs (abas ligadas à URL; `active`
                                 manual para abas por query string), Section, List/ListRow, Stat/Stats, Skeleton
apps/web/src/design/fields.tsx   FIELD_CLASS, TextField, SelectField, TextAreaField, ChoiceChips, Badge
apps/web/src/design/brand.tsx    PLATFORM_NAME ("Spalla") e Wordmark; icons.tsx: Icon + ICON_NAMES (traço 1.75)
apps/web/src/design/tokenCatalog.ts nomes e papéis de todos os tokens (cores por grupo, fontes, escala de texto,
                                 raios, sombras, durações, easing, layout, temas); o teste lê tokens.css e falha
                                 se um token do `@theme inline` ficar de fora do catálogo ou sobrar nele
apps/web/src/app/                Shell (sidebar sticky h-dvh ≥ lg com marca, 5 áreas, grupo Aulas por papel e
                                 rodapé fixo; barra inferior de 5 itens abaixo), router (tela cheia por
                                 `handle: { fullscreen: true }`, LegacyRedirect das rotas antigas, 404), settings store
apps/web/src/areas/<área>/       one folder per area. As 5 áreas: hoje (`/`), estudar (`/estudar` Rotina ·
                                 `/estudar/metodo` · `/estudar/caderno`), musicas = Repertório (`/repertorio`,
                                 `/repertorio/suzuki`, `/repertorio/estante`), ferramentas, voce (`/voce` progresso,
                                 `/voce/ajustes`, `/voce/conta`). Mais tocar (tela cheia, sempre escura), boas-vindas
                                 (tela cheia, 5 passos; Shell redireciona para lá enquanto `onboardedAt` é null),
                                 sistema (404 e erro), aulas, professor, admin, conta, componentes
apps/web/src/audio/              pitch-worklet.ts (runs the WASM YIN inside an AudioWorklet),
                                 PitchInput.ts (mic + context), usePitchInput.ts, latency.ts,
                                 devices.ts (isStoredDeviceMissing: resets a stored mic id the OS no longer lists),
                                 clickTrack.ts (pure click schedule from a Score, tested), metronome.ts
                                 (Metronome: look-ahead scheduler on the mic AudioContext, 3 sounds),
                                 drone.ts (Drone: timbre "corda" = sawtooth + octave through a low-pass, ou
                                 "senoidal"; fades in and out), tempoClock.ts (TempoClock: metrônomo autônomo
                                 com AudioContext próprio, compasso, acento e andamento progressivo; puro testado),
                                 micErrors.ts (describeMicError, isStaleDevice: shared by the pitch input and the
                                 recorder), recorder.ts (AudioRecorder: MediaRecorder on the same raw-mic constraints,
                                 webm/opus → webm → mp4 → ogg), useRecorder.ts (status, elapsed, auto-stop at 15 min,
                                 retries the default mic when the stored one is gone),
                                 violinSampler.ts (ViolinSampler: 15 VSCO 2 CE samples, nearest sample + playbackRate,
                                 loop for long notes, synth fallback when the fetch fails; pure helpers tested),
                                 scorePlayback.ts (playableNotes: rests out, ties joined, excerpt kept in score time;
                                 playbackWindow, eventIndexAt), useListen.ts ("Ouvir": own AudioContext created on
                                 the click, 1.5 s look-ahead from a 200 ms interval, metronome per the prefs, cursor
                                 via songTime/currentNoteIndex)
apps/web/public/amostras/violino/ <midi>.m4a (6 s, mono AAC) + LICENSE.txt, made by tools/fetch_violin_samples.py;
                                 outside the precache, cached on first use by the workbox rule "amostras" (CacheFirst)
apps/web/src/areas/tocar/        TocarPage (orchestration), useSession (core session + bpm + loop),
                                 useSyntheticPlayer (`?jogador=sintetico` + build flag → the WASM SyntheticPlayer
                                 feeds the session instead of the mic; pure helpers tested; used by e2e/),
                                 useAccompaniment (metronome + drone bound to the mic context), TocarControls
                                 (tempo ±5, metronome, drone, loop pickers), ResultScreen (stars, measure map,
                                 tempo advice, "repetir compassos", cartão da meta do bloco com GoalDots e a
                                 frase da série), tempo.ts, measureMap.ts and autoSlowdown.ts (pure, tested; the "Diminuir ao errar" toggle lives in settings.autoSlowdown),
                                 ScoreView (picks the view from settings.playView: "pagina" | "pauta" | "pistas" | "ambos"),
                                 PageStaff.tsx ("pagina": the score as paper, systems read line by line, the page turns
                                 by itself; settings.pageStyle papel/sepia/noite themes the subtree, settings.readingGuide
                                 nota/compasso/nenhum), viewOptions.ts (labels shared by TocarControls, Ajustes and
                                 /componentes), staffPaint.ts (palette and note/beam/slur painters shared by both staves),
                                 Highway.tsx (string-lane canvas), canvas.ts (useCanvasSize + fitCanvas, shared by both canvases)
apps/web/src/data/               db.ts (Dexie v9: results, routines, practiceDays, userStats,
                                 achievements, lessonTasks, pieces, sheets + sheetFiles, suzukiPieces, pieceSections,
                                 recordings + recordingFiles, classAssignments = cópia offline das tarefas da turma de
                                 `GET /me/lessons`), moduleProgress.ts (moduleSummary: estrelas, tocados, minutos,
                                 nível firme e lista por nível de um módulo), exportCsv.ts (histórico em CSV: `;`, BOM,
                                 vírgula decimal, para o Excel em português), recordings.ts (gravador: metadados em `recordings`, bytes em
                                 `recordingFiles`, `pieceKey` = resultId, `?peca=&titulo=`, par antes/depois só da mesma
                                 peça; fora do backup e do reset), sections.ts (detalhe da peça:
                                 frases de 4 compassos, rótulo 1-based, `?de=&ate=&bpm=` de/para o Tocar, trechos por `pieceKey` = resultId), suzuki.ts (trilha
                                 Suzuki: livros do core `suzuki.book.N`, peças tocáveis por título, revisão 1/3/7/14/30 dias), sheets.ts (estante:
                                 importSheetFile valida PDF e guarda bytes em `sheetFiles`, metadados em `sheets`), gamification.ts (XP, maestria, conquistas),
                                 medals.ts (medalhas bronze/prata/ouro derivadas de results + practiceDays,
                                 sem tabela própria), spaced.ts (prioridade espaçada), routines.ts (rotinas padrão 15/25/45,
                                 blocos ↔ ExerciseKind, variações, `goalFor`: escalas/tecnica/estudo nascem com
                                 meta de 3 repetições limpas, o resto "uma-vez"; moveBlock/addBlock/removeBlock/
                                 setBlockMinutes/setBlockGoal/goalSummary: helpers puros do editor de rotina,
                                 testados em routines.test.ts; peça fixada no bloco: itemId = resultId (conta o
                                 progresso), itemTitle, itemPath = rota do Tocar (peça importada toca por id do
                                 Dexie mas grava por nome de arquivo); pinnedItem/withPinnedItem/unpinBlock/
                                 addItemToRoutine, que copia rotina padrão para "propria"), history.ts (`exerciseHistory`: runs, dias, melhor, última,
                                 andamento com ≥ 80%, deriva média, tendência, séries fechadas; frases PT-BR e
                                 `driftSentence`, usada também no ResultScreen), repetitions.ts (limpa = ≥ 90%;
                                 `cleanStreak` conta do fim e um erro zera; `goalProgress` por tipo de meta;
                                 `closedSeriesDays`/`shouldRaiseTempo`: 3 séries fechadas em dias diferentes pedem
                                 andamento novo), planner.ts (planSession: monta a sessão do dia;
                                 ordem: fixado → tarefa da turma (`classTasks`, ignora o nível, `assignmentId`) →
                                 caderno → regra;
                                 `blockProgress`/`nextOpenBlock`/`sessionProgress` recebem os runs de hoje por
                                 exercício, não um Set de ids: um bloco só fecha quando a meta fecha; cada
                                 PlannedBlock tem `item` {id,title,playPath}, que a Hoje e o progresso usam no
                                 lugar de `exercise`, nulo para peça fora do core; blocos fixados entram primeiro), progress.ts (saveRun: resultado + XP + conquistas + medalhas novas; bônus de sessão,
                                 setDailyGoal), calendar.ts (heatmap 12 semanas, tendência
                                 de precisão), backup.ts (exportar .json, resetar progresso, limpar cache + SW),
                                 nativeProgress.ts (progress.txt do app nativo → Dexie: parser puro, melhor
                                 resultado por exercício com cents assinados 0, dias com minutes 1; exercício ou
                                 dia que já existe não é tocado),
                                 pieces.ts (catálogo: peças do core + importadas, status não iniciada/em
                                 estudo/dominada, filtros), importPiece.ts (MusicXML → `db.pieces`, 8 MB, mesmo
                                 fileName substitui), library.ts (biblioteca CC0: `library.json` + URLs dos
                                 .mxl de assets/songs/community por import.meta.glob `?url`, precacheados;
                                 `/tocar/biblioteca/:librarySlug`, resultado `biblioteca:<slug>`; o json é
                                 snapshot de library.manifest.test.ts, que lê os arquivos com o core real —
                                 canção nova: `python tools/fetch_library.py --count N`, depois
                                 `pnpm --filter @fretless/web exec vitest run src/data/library.manifest.test.ts -u`), lessons.ts (caderno da aula: CRUD de `lessonTasks`,
                                 `nextLessonSentence` a partir de `settings.lessonWeekday`), weekSummary.ts (janela
                                 desde a última aula, totais, exercício mais fraco, tendência ±5 cents, linhas PT-BR
                                 para a professora) — todos os .ts puros
                                 têm teste ao lado
apps/web/src/areas/musicas/      Repertório. PecaPage (`/repertorio/peca/:exerciseId` | `musica/:pieceId` |
                                 `biblioteca/:slug`, lazy; usa useSession só para ler a partitura; PecaTrechos e
                                 AddToRoutine), SuzukiPage (`/repertorio/suzuki`), MusicasPage (catálogo em ListRow
                                 + PieceFilters); música importada toca em `/tocar/musica/:pieceId` e grava como
                                 `musica:<fileName>`; RepertorioTabs (Catálogo | Suzuki | Estante)
apps/web/src/areas/estante/      modo estante, sem nota nem XP: EstantePage (lista + Importar PDF), LeitorPage
                                 (`/repertorio/estante/:sheetId`, tela cheia, teclado e toque nas bordas, lembra `lastPage`),
                                 PaginaPdf (canvas + ResizeObserver), PainelFerramentas (afinador, metrônomo e
                                 pedal compactos, cada um com seu áudio). Rotas carregadas com `lazy` para o
                                 pdf.js ficar fora do bundle principal
apps/web/src/pdf/                pdfDocument.ts (pdfjs-dist 6: openPdf/closePdf/countPdfPages/renderPdfPage, worker
                                 via `?url`), fit.ts (escala por ajuste, toque → página; testado), assets.ts (URLs
                                 de cMaps, fontes padrão, wasm e ICC em `<base>/pdfjs/`, servidos pelo plugin
                                 `fretless:pdfjs-assets` do vite.config; testado)
apps/web/src/music/              noteNames.ts, tunerReading.ts (leitura do afinador a partir do PitchFrame; única
                                 implementação, usada em Afinador, MicrofoneCard, BoasVindas e no leitor)
apps/web/src/areas/progresso/    ProgressoPage em `/voce` (hero com nível + Stats; abas `?ver=geral|conquistas|
                                 gravacoes`) + Heatmap, HistoricoPrecisao, Conquistas, Medalhas, Gravacoes
apps/web/src/areas/componentes/  ComponentesPage em /componentes (link em Configurações › Aparência): TokensSection
                                 (cores com swatch e papel, prévia dos 4 temas via `data-theme`/`data-accent` na
                                 subárvore, tipografia, raio/sombra/movimento/layout) + ComponentesSection (cada
                                 componente de components.tsx em todas as variantes, mais o campo de formulário)
apps/web/src/areas/configuracoes/ ConfiguracoesPage em `/voce/ajustes` (duas colunas ≥ xl: Aparência com paleta
                                 Abeto/Ébano, Leitura, Prática | Áudio, Dados) + MicrofoneCard (teste ao vivo,
                                 sensibilidade → `PitchInput.setGain`) + DadosCard (backup, CSV do histórico, cache,
                                 importar progress.txt, ConfirmButton "Zerar progresso")
apps/web/src/areas/hoje/         useTodayPlan (rotina escolhida + resultados → plano do dia; `runsToday` e
                                 `useBlockGoal(exerciseId)` para o Tocar), HojePage (só a sessão do dia: anel, blocos
                                 numerados, CTA "Tocar {bloco}" e faixa de até três avisos)
apps/web/src/areas/ferramentas/  FerramentasPage (hub, Afinador em destaque) → ToolLayout comum; AfinadorPage (dentro do Shell; corda provável = corda solta
                                 mais aguda ≤ nota; referência por corda com Drone próprio), MetronomoPage
                                 (TempoClock; três sons livres), PedalPage (Drone próprio, nota/oitava/timbre),
                                 LatenciaPage (`/voce/ajustes/atraso`), GravadorPage (gravar, guardar com nome e peça, filtro, comparar),
                                 RecordingPlayer (RecordingAudio, RecordingRow, CompareRecordings, useObjectUrl;
                                 também usado no detalhe da peça)
apps/web/src/areas/estudar/      RotinaPage (`/estudar`: RoutinePicker + RoutineEditor na mesma tela; rotinas padrão
                                 têm id negativo e não se editam; testado em RoutinePicker.test.tsx), MetodoPage
                                 (módulos com barra de estrelas) → ModuloPage (`/estudar/modulo/:id`, histórico
                                 inline com HistoricoExercicio), CadernoPage (TarefasDaTurma, CadernoDaAula,
                                 ResumoDaSemana), EstudarTabs
apps/api/src/                    Fastify 5 + Zod 4 + SQL puro; routes/{auth,teacher,student,admin,files,access}.ts,
                                 auth/permissions.ts (catálogo de permissões e papéis do sistema), db/migrations
apps/web/src/api/                client.ts (api.get/post/…, queryString, errorMessage), useApiData + LoadState, types
apps/web/src/account/            classAssignments.ts (tarefas da turma: guarda no Dexie, progresso por item, conclui
                                 sozinha após o saveRun no Tocar e no refresh; TarefasDaTurma em Estudar › Caderno), store da sessão, ui.tsx (só
                                 FormError, Notice, LoadState, RequireAccount e datas; campos e Badge vêm de design/fields),
                                 links.ts (signupLink), practiceSync, files (PDF autenticado)
apps/web/src/areas/conta/        entrar, criar conta (convite e código de turma pela URL), minha conta
apps/web/src/areas/professor/    turmas, alunos e progresso, tarefas, materiais (PDF/link), planos de estudo
apps/web/src/areas/aulas/        visão do aluno: tarefas, materiais, planos adotados
apps/web/src/areas/admin/        /admin: visão geral, usuários (filtros na URL), professores, papéis, convites,
                                 auditoria, configurações; cada página exige a permissão da rota na API
apps/web/src/music/noteNames.ts  Latin note names and cents formatting for the screen
apps/web/src/notation/staffLayout.ts  pure staff geometry (positions, beams, slurs, window; optional `xAt` replaces the time axis), tested
apps/web/src/notation/pageLayout.ts   pure page layout: greedy line breaks by measure, justified lines, header room, pages by height, reading x per system, tested
apps/web/src/notation/highwayLayout.ts  pure lane geometry; reuses the staff TimeAxis so both views line up, tested
apps/web/src/areas/tocar/ScrollingStaff.tsx  canvas that draws the score scrolling into the playhead
```

Loop A-B lives in the core binding, not in the web: `session.setMeasureRange({firstIndex, lastIndex})` replaces the
session's score by a copy cut to those bars (time and `measureIndex` rebased to zero, tempo map and tempo scale
kept), so the engine, the staff, the metronome and the result all see "the piece" as just that excerpt.
`setMeasureRange(null)` restores the full score. A loop run is never saved as a result and restarts by itself.

Gamification is pure data in `data/gamification.ts`: XP per note (Perfect 3, Great 1, ×2 after 20 perfect in a
row, +50 when the day's session closes), five mastery levels per piece (`masteryOfRun`), achievements checked in
`saveRun` after every saved result. The streak counts days whose XP met `dailyGoalXp`; a frozen day (legacy
`userStats.frozenDays`) bridges the streak without counting. `currentStreak` keeps yesterday's streak alive while
today is still open. Medals (`data/medals.ts`) are derived on read from `results` + `practiceDays`, never stored:
seven of them, bronze/silver/gold thresholds, `longestStreak` is the best ever so a medal is never lost. They are
cosmetic by design (the owner's rule, 28/10: reward without changing the experience) — nothing in the UI, sounds or
palettes is gated by them; the resinas shop was removed and sépia and the three click sounds are free. `saveRun`
compares `medalProgress` before and after the save and returns `newMedals` for the result screen. The session planner (`planSession`) assigns review blocks first (weak <70% → spaced), then new pieces
(<2★, lowest level), then the rest by spaced priority with the day's seed; lesson tasks win their block.

## Rules

- Interface text is Brazilian Portuguese; code is English. Note names reach the screen through `displayNoteName`.
- "Ouvir" only exists with the microphone off (Tocar before Começar, the piece page): the speaker would leak into
  the mic and spoil the judgement. Começar and Sair call `listen.stop()`. Playing along with headphones is a
  separate feature.
- Tokens only: no hex colour, font name or spacing literal in a `.tsx`. Add a token to `tokens.css` first.
- `Tocar` wraps itself in `<div data-theme="dark">`; the selector in `tokens.css` is `[data-theme="dark"]` on
  purpose so a nested element can switch theme.
- The worklet is realtime code: no allocation per block beyond the hop buffer, no logging. It posts plain frames and
  the main thread does the musical interpretation, like the native engine.
- Imports use the `@/` alias to `apps/web/src`; it is declared in both `tsconfig.json` and `vite.config.ts`.
- No comments in TypeScript. What needs explaining goes in this file.

## Armadilhas

- **Subárvore clara dentro do Tocar escuro** (29/10, vista Página). Sintoma: `data-theme="light"` não fazia nada, porque
  os valores claros só existiam em `:root` e o Tocar força escuro. Regra: o bloco claro de `tokens.css` abre com
  `[data-theme="light"],` antes de `:root {` (nessa ordem: o `tokenCatalog.test` procura o texto `:root {`), e a
  sépia/ébano vem depois para ganhar. O canvas lê as cores do elemento com o tema (`getComputedStyle(canvas)`).

- **Toda tela tem volta dentro do app** (pedido do dono, 29/10: "nao sendo necessario ter q voltar com o botao de voltar
  do navegador"). Sintoma: Entrar, Criar conta, Termos e `/componentes` só saíam pelo voltar do navegador. Regra: tela
  que não é raiz de área tem `PageHeader back={{ to, label }}` com destino fixo (nunca `navigate(-1)`, que falha em link
  aberto direto); tela cheia tem "Sair"/link próprio; estado vazio ou de erro também oferece o caminho. Teste em
  `areas/conta/voltarNoApp.test.tsx`.

- **Nomes internos legados não se renomeiam.** A marca virou Spalla em 29/10, mas trocar o nome interno apaga dados
  ou quebra deploy: o Dexie `"fretless"` (outro nome = banco novo e vazio), as chaves `fretless-settings`,
  `fretless-conta`, `fretless-dispositivo` e `fretless-sync-*`, o worklet `fretless-pitch`, `%APPDATA%\Fretless`
  do app nativo, os pacotes `@fretless/*`, o `render.yaml`, os plugins `fretless:*` do
  vite e o valor `"sepia"` do `accent` (na tela, "Ébano"). Texto visível usa `PLATFORM_NAME`; nome interno fica.

- **O endereço do site segue o nome do repo.** O CI monta `BASE_PATH=/${{ github.event.repository.name }}/`; renomear o
  repo (fretless → spalla em 29/10) muda o caminho do Pages e o escopo do PWA, e o endereço antigo deixa de abrir
  (o GitHub redireciona o repo, não o Pages). Os dados ficam, porque o IndexedDB é por origem, não por caminho.
  Mudar a origem (outra conta ou org) apaga o progresso local; o `CORS_ORIGINS` da API (`render.yaml`) acompanha.

- **Rota antiga continua valendo.** `/praticar`, `/musicas/*`, `/estante/:id`, `/progresso`, `/configuracoes`,
  `/conta` e `/ferramentas/latencia` redirecionam pelo `LegacyRedirect` do router; o `itemPath` salvo nas rotinas
  aponta para `/tocar/*`, que não mudou. Mudar uma rota exige redirecionamento novo, não só trocar o link.

- **The binding is the contract, not `toString()`.** `NoteJudgement.grade` crashed the staff (`toneColor` returned
  `undefined`) because `Bindings.cpp` serialised the grade with the native screen label (`"PERFEITO"`) while
  `types.ts` promised `"Perfect"`. Anything the binding emits for a TS union must come from an id mapping in the
  binding (`gradeId`), never from a display helper, and `core.test.ts` asserts the union values against the real WASM.
  Rebuild the core (`pnpm --filter @fretless/core build`) after touching `Bindings.cpp`; vitest runs against `dist/`.

- **Worklet cannot `fetch`.** An AudioWorklet has no `fetch`, so the WASM bytes are fetched on the main thread and
  passed in `processorOptions.wasmBinary`; `loadCore({ wasmBinary })` accepts them. Loading by URL inside the worklet
  fails silently with a module that never becomes ready.
- **AudioWorkletGlobalScope has no `URL`.** `new URL(..., import.meta.url)` at the top of a module imported by the
  worklet throws, Chrome still resolves `addModule`, and `new AudioWorkletNode` fails with
  `InvalidStateError: 'fretless-pitch' is not defined`. `coreWasmUrl` in `packages/core/src/index.ts` is guarded by
  `typeof URL`; keep module top levels free of `URL`, `window`, `document`, `fetch`. The vitest case "evaluates
  and loads from bytes in a scope without URL" stubs `URL` out and fails without the guard.
- **The Emscripten glue ignores `Module.wasmBinary`.** Emscripten 4 only honours `locateFile` and
  `instantiateWasm`, so `loadCore({ wasmBinary })` turns the bytes into an `instantiateWasm` hook; without it the
  glue calls `findWasmBinary()` → `new URL(...)` → "URL is not defined" inside the worklet. Probe without a mic:
  `addModule` + `AudioWorkletNode` with an oscillator connected to the node and wait for the `ready` message.
- **pnpm 12 ignores `package.json#pnpm`.** Build-script approvals live in `pnpm-workspace.yaml` as `allowBuilds:
  { esbuild: true }`. The old `onlyBuiltDependencies` key is silently dropped and `pnpm install` exits with
  `ERR_PNPM_IGNORED_BUILDS`.
- **`virtual:pwa-register` needs `workbox-window` as a direct dependency** of `apps/web`, or the production build fails
  with "Rollup failed to resolve import workbox-window".
- **Vite does not read `tsconfig.paths`.** The `@` alias must also be in `resolve.alias` of `vite.config.ts`;
  typecheck passes and the build fails otherwise.
- **`.mxl` by bytes.** `parseMusicXmlBuffer` detects the `PK` zip header itself; the detection used to live only in
  the path-based `parseMusicXml`, so bytes coming from the browser's file input were parsed as XML and failed with
  "No document element found". The vitest case in `packages/core/src/core.test.ts` parses
  `tests/data/backslash_paths.mxl` from bytes and checks title and note count.
- **One buffer, one consumer.** `usePitchInput` keeps the frame queue for the game loop (`takeFrames`) and a separate
  `latest` ref for the React `frame` state. An earlier version drained the queue in its own rAF loop too, so the game
  saw empty frame lists whenever that callback ran first. Register the worklet listener once, on mount, not per
  `start()`: a listener per start duplicated every frame after "Tocar de novo".
- **Effects that depend on the hook object rerun every render.** `usePitchInput()` returns a fresh object; depend on
  `mic.status.status` and the stable callbacks (`start`, `stop`, `takeFrames`). The result save in `TocarPage` is
  guarded by a ref (`savedRunRef`), because the effect used to fire several times per finished run and inflate
  `practiceDays`.
- **pnpm only runs from Git Bash on this machine.** The global pnpm 12 never installed its native binary, so
  `%APPDATA%\npm\pnpm.cmd` points at a shell script Windows cannot execute ("não é reconhecido como um comando").
  Anything that spawns `pnpm` through cmd (the app's browser preview, `.claude/launch.json`, a root script such as
  `pnpm dev` that calls `pnpm --filter`) must run `node %APPDATA%\npm\node_modules\pnpm\bin\pnpm.mjs --dir apps/web dev`
  instead, as `.claude/launch.json` does.
- **`Score::applyTempoScale` is absolute, not cumulative.** It undoes the previous scale before applying the new
  one, so the binding's `setTempoScale(scale)` must pass the scale itself. It used to pass `scale / current`, which
  made the second call with the same value reset the tempo to the written one (`core.test.ts`, "treats the tempo
  scale as absolute"). Anything that re-cuts the score (`setMeasureRange`) must re-apply the scale explicitly, since
  the copy starts from the unscaled full score.
- **Zustand 5 selectors that build an object need `useShallow`.** A plain `useSettings((s) => ({a: s.a}))` returns a
  fresh object every store read and React re-renders forever. `useAccompaniment` is the example.
- **Streak uses the local calendar day.** `localDayKey` in `db.ts`; `toISOString().slice(0, 10)` is UTC and breaks
  the streak for anyone practising after 21:00 in Brazil.
- **Every `orderBy`/`where` key needs a Dexie index.** `/musicas` crashed with "KeyPath importedAt on object store
  pieces is not indexed" because the page ordered by a field the schema never declared. Adding an index is a new
  `version(n).stores()` (v3 added `importedAt` to `pieces`), never an edit of an older version; `db.test.ts` ("indexes
  every key the pages order or filter by") checks `schema.idxByName` for the keys the pages use.
- **The day plan pins what was played.** `planSession` recomputes from the results on every change, so after a run
  the ranking changed, the block swapped to another exercise and the session could never complete. `playedToday`
  (the `doneToday` set) is an input and an exercise already played today claims the first block that accepts its
  kind before any other pick (`planner.test.ts`, "keeps an exercise played today in its block").
- **The drone is created one render after the mic starts.** `begin()` calls `startDrone()` right after
  `await startMic()`, when `droneRef` is still null, so the pedal was silent on the first run. `useAccompaniment`
  remembers the request (`droneWantedRef`) and the effect that creates the `Drone` starts it; `stopDrone` clears the
  flag (`useAccompaniment.test.tsx`).
- **`TempoClock.start()` awaits `resume()` before setting its timer.** Two clicks before the context resumed
  created two intervals and `dispose()` during the await left one running on a closed context; `#isStarting` and
  `#isDisposed` guard both (`tempoClock.test.ts`, fake `AudioContext`/`GainNode` + `vi.getTimerCount()`).
- **Player de gravação depende do id, não do objeto.** `useLiveQuery` devolve objetos novos a cada mudança na
  tabela; com `[recording]` nas dependências, renomear uma gravação relia todos os blobs, trocava as object URLs e
  cortava o áudio que estava tocando. `useRecordingBlob` depende de `[id, mimeType]` (`RecordingPlayer.tsx`).
- **pdf.js 6 fecha o documento pelo `loadingTask`, não por `document.destroy()`.** `PDFDocumentProxy` perdeu o
  `destroy()` na versão 6 (só `cleanup()`); fechar é `document.loadingTask.destroy()`, embrulhado em `closePdf`.
  O `getDocument({ data })` toma posse do buffer, então os bytes guardados no Dexie vão como cópia (`bytes.slice()`).
- **Bytes de PDF ficam em tabela própria (`sheetFiles`).** `useLiveQuery` da lista relê a tabela inteira a cada
  mudança; com os bytes dentro de `sheets` isso puxaria dezenas de MB do IndexedDB para listar títulos.
- **Asset `.mjs` precisa estar no `globPatterns` do workbox.** O worker do pdf.js sai como `assets/pdf.worker.min-*.mjs`
  e o padrão antigo (`{js,css,html,wasm,svg,woff2}`) não o incluía: offline, o PDF não abria. Qualquer extensão nova
  em `dist/assets` entra no padrão em `vite.config.ts`.
- **pdf.js sem `cMapUrl`/`standardFontDataUrl`/`wasmUrl` renderiza fonte não embutida e JPX/JBIG2 errado, e offline
  nem tenta.** Os ~190 arquivos (`cmaps/*.bcmap`, `standard_fonts/*.pfb|ttf`, `wasm/*`, `iccs/*.icc`, ~3,9 MB) não
  vêm de `public/`: o plugin `fretless:pdfjs-assets` em `vite.config.ts` os emite em `dist/pdfjs/` no `generateBundle`
  (antes do service worker ser gerado) e os serve de `node_modules` no dev; `pdfjsAssetUrls(import.meta.env.BASE_URL)`
  monta as URLs com barra final, que o pdf.js só concatena. Nomes mudam entre versões do pdfjs-dist (a 6 não tem mais
  `Identity-H.bcmap` nem `FoxitSans.pfb`); ao atualizar, conferir `ls node_modules/pdfjs-dist/{cmaps,standard_fonts}`.
  `quickjs-eval.*` (sandbox de scripts) fica de fora.
- **Troca rápida de página com pdf.js: cancelar pelo efeito, não só pelo canvas.** `getPage` de uma página fora do
  cache resolve depois do `getPage` da seguinte; sem `AbortSignal` conferido depois do `await`, a página antiga
  desenhava por cima da nova. `PaginaPdf` aborta no cleanup e `renderPdfPage` checa o sinal após `getPage`.
- **Script que chama `pnpm` por dentro falha nesta máquina.** `pnpm build:core` (script raiz que roda
  `pnpm --filter @fretless/core build`) e o `webServer` do Playwright com `pnpm exec vite` morrem com
  `'"...npm\node_modules\pnpm\pnpm"' não é reconhecido`: o shim do pnpm instalado pelo npm resolve um caminho
  quebrado quando é um processo filho que o chama. Da shell direto funciona; dentro de um script, chamar a ferramenta
  sem pnpm: `cd packages/core && node scripts/build.mjs` para o core e `node ./node_modules/vite/bin/vite.js` no
  `playwright.config.ts`.
- **Jogador sintético só com a flag de build.** `?jogador=sintetico` troca o microfone pelo `SyntheticPlayer` do WASM
  em `TocarPage`, mas só quando `import.meta.env.VITE_JOGADOR_SINTETICO === "1"`; o `webServer` do Playwright é quem
  liga isso. Sem a flag a URL é ignorada, então um build normal nunca toca sozinho. Em modo sintético `isListening`
  vem do hook e o contexto de áudio do mic é nulo: metrônomo e drone ficam mudos de propósito.
- **Fixture com timestamp à meia-noite UTC muda de dia conforme o fuso.** `nativeProgress.test.ts` passava aqui
  (UTC−3) e quebrava o CI (UTC): `1793145600` é 28/10 00:00Z, que vira 27/10 à noite no Brasil e 28/10 em Londres,
  e `practiceDaysFromNative` agrupa por dia local. Todo timestamp de teste que vira dia local fica ao meio-dia UTC
  (`Date.UTC(ano, mês, dia, 12) / 1000`), que cai no mesmo dia em qualquer fuso entre −11 e +11. Para reproduzir o
  CI: `TZ=UTC pnpm --filter @fretless/web exec vitest run <arquivo>` no Git Bash.
- **`BASE_PATH=/spalla/` no Git Bash vira `C:/Program Files/Git/spalla/`.** O MSYS converte variável de
  ambiente que começa com `/` em caminho do Windows antes de entregar ao Node, e o build sai com `src="/Program
  Files/Git/spalla/assets/..."` e `scope` absoluto do disco. Para gerar o site do Pages localmente:
  `MSYS2_ENV_CONV_EXCL=BASE_PATH BASE_PATH=/spalla/ pnpm --filter @fretless/web run build` (`MSYS_NO_PATHCONV`
  não basta para variáveis). No CI (Linux) não existe conversão.
- **Coluna `date` do Postgres volta como `Date` à meia-noite UTC.** `dueOn` de uma tarefa saía como
  `2026-11-04T03:00` no Brasil e a data mostrada recuava um dia. Toda coluna `date` sai da query como texto:
  `to_char(due_on, 'YYYY-MM-DD') AS "dueOn"` (`teacher.ts`, `student.ts`; `lessons.test.ts` confere a data igual).
- **PGlite não cria a pasta-mãe do banco.** Num checkout limpo `pnpm --filter @fretless/api dev` morria com ENOENT ao
  abrir `.data/pglite`; `pgliteDb` faz `mkdir(dataDir, { recursive: true })` antes (`test/db.test.ts`).
- **Ação sobre outra conta também é concessão de permissão.** Quem tinha só `users.manage` podia gerar código de
  senha ou trocar o e-mail de uma conta de suporte e entrar nela; um suporte aprovava o próprio pedido de professor.
  Toda rota que age sobre outra conta chama `assertCanManage` (as permissões de plataforma do alvo têm de estar nas
  minhas; ensino e aluno não contam, senão só o admin atenderia aluno), e `decide()` recusa a própria conta e exige
  pedido `pending` (`admin.test.ts`, "não toma a conta" e "só vale para pedido pendente").
- **Botão de áudio preso em "Carregando…".** Um `play` assíncrono que cria o `AudioContext`, chama `resume()` e baixa
  amostras deixava o status em "carregando" para sempre quando qualquer passo lançava (aparelho sem saída de áudio).
  Todo `await` de abertura de áudio fica num `try` que volta o status a "parado" se o token ainda for o dele
  (`useListen.test.tsx`, "goes back to idle when the audio output cannot start"). Teste de hook que passa a partitura
  como `scoreOf()` dentro do `renderHook` cria uma nova a cada render e dispara o `stop` do efeito: fixar o objeto fora.
