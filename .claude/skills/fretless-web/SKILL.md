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
pnpm test                          # WASM harness (99 cases) + vitest core (11) + vitest web (20)
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
                                 configuracoes, tocar (fullscreen, forced dark)
apps/web/src/audio/              pitch-worklet.ts (runs the WASM YIN inside an AudioWorklet),
                                 PitchInput.ts (mic + context), usePitchInput.ts, latency.ts
apps/web/src/data/               db.ts (Dexie: results, routines, practiceDays, settings), library.ts
apps/web/src/music/noteNames.ts  Latin note names and cents formatting for the screen
```

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

- **Worklet cannot `fetch`.** An AudioWorklet has no `fetch`, so the WASM bytes are fetched on the main thread and
  passed in `processorOptions.wasmBinary`; `loadCore({ wasmBinary })` accepts them. Loading by URL inside the worklet
  fails silently with a module that never becomes ready.
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
- **Streak uses the local calendar day.** `localDayKey` in `db.ts`; `toISOString().slice(0, 10)` is UTC and breaks
  the streak for anyone practising after 21:00 in Brazil.
