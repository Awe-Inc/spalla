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
pnpm --filter @fretless/web build  # tsc -b + vite build → apps/web/dist (PWA, service worker)
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
apps/web/src/design/components.tsx  Button, Card, StringChip, Stars, ProgressRing, HeadphoneNotice, …
apps/web/src/app/                Shell (sidebar ≥ lg, bottom bar below), router, settings store
apps/web/src/areas/<área>/       one folder per area: hoje, praticar, musicas, ferramentas, progresso,
                                 configuracoes, tocar (fullscreen, forced dark), boas-vindas (fullscreen
                                 onboarding em 5 passos; Shell redireciona para lá enquanto `onboardedAt` é null)
apps/web/src/audio/              pitch-worklet.ts (runs the WASM YIN inside an AudioWorklet),
                                 PitchInput.ts (mic + context), usePitchInput.ts, latency.ts,
                                 clickTrack.ts (pure click schedule from a Score, tested), metronome.ts
                                 (Metronome: look-ahead scheduler on the mic AudioContext, 3 sounds),
                                 drone.ts (Drone: sawtooth + octave through a low-pass, fades in and out)
apps/web/src/areas/tocar/        TocarPage (orchestration), useSession (core session + bpm + loop),
                                 useAccompaniment (metronome + drone bound to the mic context), TocarControls
                                 (tempo ±5, metronome, drone, loop pickers), ResultScreen (stars, measure map,
                                 tempo advice, "repetir compassos"), tempo.ts and measureMap.ts (pure, tested)
apps/web/src/data/               db.ts (Dexie v2: results, routines, practiceDays, settings, userStats,
                                 achievements, lessonTasks, pieces), gamification.ts (XP, maestria, conquistas,
                                 loja), spaced.ts (prioridade espaçada), routines.ts (rotinas padrão 15/25/45,
                                 blocos ↔ ExerciseKind, variações), planner.ts (planSession: monta a sessão do
                                 dia), progress.ts (saveRun: resultado + XP + conquistas; bônus de sessão,
                                 congelador, loja, setDailyGoal), calendar.ts (heatmap 12 semanas, tendência
                                 de precisão), backup.ts (exportar .json, resetar progresso, limpar cache + SW),
                                 library.ts — todos os .ts puros têm teste ao lado
apps/web/src/areas/progresso/    ProgressoPage (nível, resumo, estrelas por módulo) + Heatmap, HistoricoPrecisao,
                                 Conquistas, Loja
apps/web/src/areas/configuracoes/ ConfiguracoesPage (aparência, paleta sépia só se comprada, notas, tamanho da
                                 partitura `staffScale`, meta diária) + MicrofoneCard (teste ao vivo, sensibilidade
                                 → `PitchInput.setGain` → worklet "gain") + DadosCard
apps/web/src/areas/hoje/         useTodayPlan (rotina escolhida + resultados → plano do dia), HojePage
apps/web/src/areas/praticar/     RoutinePicker (escolher/criar rotina; rotinas padrão têm id negativo)
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
