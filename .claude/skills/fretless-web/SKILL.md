---
name: fretless-web
description: Working in the Fretless web app — the pnpm monorepo (packages/core = C++ core compiled to WebAssembly with embind; apps/web = React 19 + Vite 7 + Tailwind v4 + React Router 7 + Zustand + Dexie, installable PWA), the AudioWorklet pitch pipeline, the design tokens, the data layer and the build/test commands. Use when changing anything under apps/web or packages/core, before running pnpm, and when a change touches the WASM boundary.
---

# The Fretless web app

The C++20 core (`src/score`, `src/curriculum`, `src/game`, `src/audio/PitchDetector`) is unchanged and still builds
natively (see `fretless-engine`). The web app consumes it through `@fretless/core`, an Emscripten build with embind
bindings. Everything a player sees is React.

## Commands

```bash
pnpm install                       # once; pnpm 12, Node >= 22
pnpm build:core                    # Emscripten → packages/core/dist (needs C:\Users\Usuario\emsdk)
pnpm test                          # WASM harness (99 cases) + vitest core (12) + vitest web (20)
pnpm typecheck                     # tsc in both packages
pnpm --filter @fretless/web build  # tsc -b + vite build → apps/web/dist (PWA, service worker, 404.html = SPA fallback)
BASE_PATH=/fretless/ pnpm --filter @fretless/web build   # sub-path build (GitHub Pages); from PowerShell on Windows,
                                   # Git Bash rewrites "/fretless/" into a Windows path
pnpm dev                           # vite on http://localhost:5180 (preview: 4180)
```

`packages/core/scripts/build.mjs` finds `emcmake` in `%USERPROFILE%\emsdk` and Ninja through `vswhere`. The native
test binary is compiled to `dist/fretless_core_tests.cjs` too, so the same 100 cases run in both worlds (the
threaded ring-buffer case is skipped without pthreads).

Ports are fixed in `apps/web/vite.config.ts` (`strictPort`): 5180 dev, 4180 preview. Never change them to a port
another project uses.

## Layout

```
packages/core/src/index.ts       loadCore(), typed wrappers: curriculum, exerciseScore, parseMusicXml,
                                 createSession, createPitchTracker, noteName, centsBetween
apps/web/src/design/tokens.css   the only place a colour, font or radius is written (from DESIGN.md)
apps/web/src/design/fonts.css    Fontsource imports (Fraunces Variable, Figtree Variable, JetBrains Mono 500);
                                 self-hosted woff2 land in the precache, no Google Fonts
.github/workflows/ci.yml          CI on main/PRs: emsdk 6.0.13 (same as ~/emsdk), pnpm build:core, typecheck, tests,
                                 web build with BASE_PATH=/<repo>/; the Pages deploy job only runs when the repo
                                 variable DEPLOY_PAGES is "true" (private repo on the free plan has no Pages)
apps/web/src/design/components.tsx  Button, Card, StringChip, Stars, GoalDots (pontos da série de repetições),
                                 AccuracyBars (barras de precisão por execução, cor por faixa),
                                 ProgressRing, HeadphoneNotice, …
apps/web/src/app/                Shell (sidebar ≥ lg, bottom bar below), router, settings store
apps/web/src/areas/<área>/       one folder per area: hoje, praticar, musicas, ferramentas, progresso,
                                 configuracoes, tocar (fullscreen, forced dark), boas-vindas (fullscreen
                                 onboarding em 5 passos; Shell redireciona para lá enquanto `onboardedAt` é null)
apps/web/src/audio/              pitch-worklet.ts (runs the WASM YIN inside an AudioWorklet),
                                 PitchInput.ts (mic + context), usePitchInput.ts, latency.ts,
                                 devices.ts (isStoredDeviceMissing: resets a stored mic id the OS no longer lists),
                                 clickTrack.ts (pure click schedule from a Score, tested), metronome.ts
                                 (Metronome: look-ahead scheduler on the mic AudioContext, 3 sounds),
                                 drone.ts (Drone: timbre "corda" = sawtooth + octave through a low-pass, ou
                                 "senoidal"; fades in and out), tempoClock.ts (TempoClock: metrônomo autônomo
                                 com AudioContext próprio, compasso, acento e andamento progressivo; puro testado)
apps/web/src/areas/tocar/        TocarPage (orchestration), useSession (core session + bpm + loop),
                                 useAccompaniment (metronome + drone bound to the mic context), TocarControls
                                 (tempo ±5, metronome, drone, loop pickers), ResultScreen (stars, measure map,
                                 tempo advice, "repetir compassos", cartão da meta do bloco com GoalDots e a
                                 frase da série), tempo.ts and measureMap.ts (pure, tested)
apps/web/src/data/               db.ts (Dexie v5: results, routines, practiceDays, userStats,
                                 achievements, lessonTasks, pieces, sheets + sheetFiles), sheets.ts (estante:
                                 importSheetFile valida PDF e guarda bytes em `sheetFiles`, metadados em `sheets`), gamification.ts (XP, maestria, conquistas,
                                 loja), spaced.ts (prioridade espaçada), routines.ts (rotinas padrão 15/25/45,
                                 blocos ↔ ExerciseKind, variações, `goalFor`: escalas/tecnica/estudo nascem com
                                 meta de 3 repetições limpas, o resto "uma-vez"; moveBlock/addBlock/removeBlock/
                                 setBlockMinutes/setBlockGoal/goalSummary: helpers puros do editor de rotina,
                                 testados em routines.test.ts), history.ts (`exerciseHistory`: runs, dias, melhor, última,
                                 andamento com ≥ 80%, deriva média, tendência, séries fechadas; frases PT-BR e
                                 `driftSentence`, usada também no ResultScreen), repetitions.ts (limpa = ≥ 90%;
                                 `cleanStreak` conta do fim e um erro zera; `goalProgress` por tipo de meta;
                                 `closedSeriesDays`/`shouldRaiseTempo`: 3 séries fechadas em dias diferentes pedem
                                 andamento novo), planner.ts (planSession: monta a sessão do dia;
                                 `blockProgress`/`nextOpenBlock`/`sessionProgress` recebem os runs de hoje por
                                 exercício, não um Set de ids: um bloco só fecha quando a meta fecha), progress.ts (saveRun: resultado + XP + conquistas; bônus de sessão,
                                 congelador, loja, setDailyGoal), calendar.ts (heatmap 12 semanas, tendência
                                 de precisão), backup.ts (exportar .json, resetar progresso, limpar cache + SW),
                                 pieces.ts (catálogo: peças do core + importadas, status não iniciada/em
                                 estudo/dominada, filtros), importPiece.ts (MusicXML → `db.pieces`, 8 MB, mesmo
                                 fileName substitui), lessons.ts (caderno da aula: CRUD de `lessonTasks`,
                                 `nextLessonSentence` a partir de `settings.lessonWeekday`) — todos os .ts puros
                                 têm teste ao lado
apps/web/src/areas/musicas/      MusicasPage (catálogo + importadas com PieceFiltersBar); música importada toca em
                                 `/tocar/musica/:pieceId` e grava resultado como `musica:<fileName>`; MusicasTabs
                                 (Catálogo | Estante)
apps/web/src/areas/estante/      modo estante, sem nota nem XP: EstantePage (lista + Importar PDF), LeitorPage
                                 (`/estante/:sheetId`, tela cheia, teclado e toque nas bordas, lembra `lastPage`),
                                 PaginaPdf (canvas + ResizeObserver), PainelFerramentas (afinador, metrônomo e
                                 pedal compactos, cada um com seu áudio). Rotas carregadas com `lazy` para o
                                 pdf.js ficar fora do bundle principal
apps/web/src/pdf/                pdfDocument.ts (pdfjs-dist 6: openPdf/closePdf/countPdfPages/renderPdfPage, worker
                                 via `?url`), fit.ts (escala por ajuste, toque → página; testado), assets.ts (URLs
                                 de cMaps, fontes padrão, wasm e ICC em `<base>/pdfjs/`, servidos pelo plugin
                                 `fretless:pdfjs-assets` do vite.config; testado)
apps/web/src/music/              noteNames.ts, tunerReading.ts (leitura do afinador a partir do PitchFrame; única
                                 implementação, usada em Afinador, MicrofoneCard, BoasVindas e no leitor)
apps/web/src/areas/progresso/    ProgressoPage (nível, resumo, estrelas por módulo) + Heatmap, HistoricoPrecisao,
                                 Conquistas, Loja
apps/web/src/areas/configuracoes/ ConfiguracoesPage (aparência, paleta sépia só se comprada, notas, tamanho da
                                 partitura `staffScale`, meta diária) + MicrofoneCard (teste ao vivo, sensibilidade
                                 → `PitchInput.setGain` → worklet "gain") + DadosCard
apps/web/src/areas/hoje/         useTodayPlan (rotina escolhida + resultados → plano do dia; `runsToday` e
                                 `useBlockGoal(exerciseId)` para o Tocar), HojePage (pontos + "n de 3 limpas
                                 seguidas" em cada bloco com meta),
                                 CadernoDaAula (tarefas da professora; aberta + bloco combinando vira "Da aula")
apps/web/src/areas/ferramentas/  FerramentasPage (hub) → AfinadorPage (tela cheia; corda provável = corda solta
                                 mais aguda ≤ nota; referência por corda com Drone próprio), MetronomoPage
                                 (TempoClock; som gated pela loja), PedalPage (Drone próprio, nota/oitava/timbre),
                                 LatenciaPage
apps/web/src/areas/praticar/     PraticarPage (módulos e exercícios; botão "Histórico" em cada exercício já tocado),
                                 HistoricoExercicio (painel: vezes/dias, última vez, melhor resultado, barras das
                                 últimas 12 execuções, tendência, andamento, deriva, séries fechadas),
                                 RoutinePicker (escolher/criar/editar/apagar rotina; rotinas padrão têm id
                                 negativo e não se editam), RoutineEditor (lista ordenada de blocos: arrastar
                                 com HTML5 drag-and-drop ou Subir/Descer no teclado, minutos e meta por bloco,
                                 adicionar/tirar bloco, aviso de vizinhos iguais; testado em RoutinePicker.test.tsx)
apps/web/src/music/noteNames.ts  Latin note names and cents formatting for the screen
apps/web/src/notation/staffLayout.ts  pure staff geometry (positions, beams, slurs, window), tested
apps/web/src/areas/tocar/ScrollingStaff.tsx  canvas that draws the score scrolling into the playhead
```

Loop A-B lives in the core binding, not in the web: `session.setMeasureRange({firstIndex, lastIndex})` replaces the
session's score by a copy cut to those bars (time and `measureIndex` rebased to zero, tempo map and tempo scale
kept), so the engine, the staff, the metronome and the result all see "the piece" as just that excerpt.
`setMeasureRange(null)` restores the full score. A loop run is never saved as a result and restarts by itself.

Gamification is pure data in `data/gamification.ts`: XP per note (Perfect 3, Great 1, ×2 after 20 perfect in a
row, +50 when the day's session closes), five mastery levels per piece (`masteryOfRun`), achievements checked in
`saveRun` after every saved result, Resinas = stars × 5. The streak counts days whose XP met `dailyGoalXp`; a
frozen day bridges the streak without counting. `currentStreak` keeps yesterday's streak alive while today is
still open. Shop items gate the UI by `userStats.unlockedItems` (`sound:<id>` in TocarControls, `theme:sepia`
in Configurações; the sepia palette is `[data-accent="sepia"]` overrides in tokens.css). The session planner (`planSession`) assigns review blocks first (weak <70% → spaced), then new pieces
(<2★, lowest level), then the rest by spaced priority with the day's seed; lesson tasks win their block.

## Rules

- Interface text is Brazilian Portuguese; code is English. Note names reach the screen through `displayNoteName`.
- Tokens only: no hex colour, font name or spacing literal in a `.tsx`. Add a token to `tokens.css` first.
- `Tocar` wraps itself in `<div data-theme="dark">`; the selector in `tokens.css` is `[data-theme="dark"]` on
  purpose so a nested element can switch theme.
- The worklet is realtime code: no allocation per block beyond the hop buffer, no logging. It posts plain frames and
  the main thread does the musical interpretation, like the native engine.
- Imports use the `@/` alias to `apps/web/src`; it is declared in both `tsconfig.json` and `vite.config.ts`.
- No comments in TypeScript. What needs explaining goes in this file.

## Armadilhas

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
