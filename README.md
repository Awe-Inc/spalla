# Spalla

A violin practice platform that listens to you play. It reads the score, judges every note on
intonation and timing, and plans the day's session for you, so the answer to "what should I
practise today" is on the first screen.

**Live:** https://pataxo-inc.github.io/spalla/ · installable as an app (PWA), works offline.

The name is the orchestra's first violin, the one who tunes and leads the others. Inside the
code the project is still called **Fretless** (`@fretless/*` packages, storage keys, the native
binary). Those names stay on purpose: renaming them would wipe players' saved progress.

---

## What it does

| Area | What you find there |
|---|---|
| **Hoje** | Today's session: numbered blocks with minutes and a goal each, one button to start the next one |
| **Estudar** | Your routine and its editor, the method's nine modules, and the lesson notebook |
| **Repertório** | Pieces from the core and from a CC0 library, the Suzuki path with spaced review, and a music stand for your own PDFs |
| **Ferramentas** | Tuner, metronome, drone (nota pedal) and recorder |
| **Você** | Progress (streak, heatmap, accuracy over time, achievements), settings and account |

While you play, a scrolling staff or a string-lane highway shows the notes; at the end you get
stars, a bar-by-bar map of what went wrong and advice on tempo. Teachers can run classes, assign
tasks and share material through the optional API.

The interface is in Brazilian Portuguese and notes are named Dó, Ré, Mi, Fá, Sol, Lá, Si.
Code, ids and this file are in English.

---

## Getting started

Needs Node 22+, pnpm 12 and, to build the core, [emsdk](https://emscripten.org/) 6.0.13 in
`%USERPROFILE%\emsdk` (the WebAssembly build is not checked in).

```bash
pnpm install
pnpm build:core                    # C++ core → WebAssembly (packages/core/dist)
pnpm dev                           # web app on http://localhost:5180
```

| Command | What it does |
|---|---|
| `pnpm test` | C++ cases compiled to WASM, plus vitest for the core, the web app and the API |
| `pnpm typecheck` | `tsc` in every package |
| `pnpm --filter @fretless/web test:e2e` | Playwright on port 4180; a synthetic violinist plays real exercises (first run: `pnpm --filter @fretless/web exec playwright install chromium`) |
| `pnpm --filter @fretless/web build` | PWA in `apps/web/dist` |
| `pnpm --filter @fretless/api dev` | Accounts and classes API (Fastify) on port 3400 |

Without `VITE_API_URL` (see `apps/web/.env.example`) the account and class areas say the platform
is offline and everything else keeps working locally: progress lives in the browser (IndexedDB).

Pushes to `main` run the CI (core build, typecheck, tests, web build) and publish the site to
GitHub Pages under `/<repo name>/`.

### Where things are

```
packages/core/   the C++ core compiled with Emscripten, typed wrappers in src/index.ts
apps/web/        React 19 + Vite 7 + Tailwind v4 + React Router 7 + Dexie
  src/areas/     one folder per screen area
  src/design/    tokens.css (the only place a colour, font or radius is written) and the components
  src/audio/     the AudioWorklet pitch pipeline, metronome, drone, recorder
  src/data/      the local database, planner, gamification, history
apps/api/        Fastify 5 + Zod + SQL: accounts, classes, tasks, material, admin
src/, include/   the C++ engine (score, curriculum, judgement, YIN), shared by web and native
DESIGN.md        the visual system: palette, type, components, vocabulary
docs/PROJETO.md  the whole project in one document, with its current state
```

The skills in `.claude/skills/` carry the context that is not in the code: `fretless-web`,
`fretless-engine`, `fretless-curriculum` and `violin-pedagogy`.

---

## Design

"Madeira e verniz": dark by default, fir-green and ebony neutrals with a single honey accent,
Instrument Serif for titles, Instrument Sans for the interface and Geist Mono for numbers. String
colours differ in lightness as well as hue, and a verdict is never colour alone. All of it is
written down in `DESIGN.md`.

---

## The curriculum

161 exercises across nine modules, from open-string long tones to three-octave scales:

| Module | | |
|---|---|---|
| **Aquecimento** | 25 | Long tones, open-string crossings, the four finger patterns, Suzuki tonalization |
| **Afinação** | 23 | Ringing tones, drone scales, finger patterns against a reference pitch |
| **Escalas e arpejos** | 35 | One octave to three, majors and minors, arpeggios, broken thirds, chromatic |
| **Golpes de arco** | 10 | Détaché, slurs of 2 to 12, Galamian's acceleration, stroke studies on one pitch |
| **Uma corda por vez** | 16 | Every string, first through seventh position |
| **Ritmo** | 11 | One open string, so only the timing can be wrong |
| **Leitura** | 16 | Sight reading generated fresh every attempt, and a note-naming drill |
| **Método Suzuki** | 6 | The five Twinkle variations, plus all ten books as a study path |
| **Melodias** | 9 | Public-domain melodies that lie under a first-position hand |

None of them is a file. An exercise carries a **recipe** and the score is built from it on
demand, so twelve keys × three octaves × eight bowings is one table row each, not 288 MusicXML
files. Every exercise says what it is for and what to listen for, and a test fails when that
field is empty.

Exercise ids are a schema: progress is filed under them, so an id never changes once shipped.

### The session

The planner follows three well-established findings: interleaving beats blocking, spacing beats
massing, and a drill needs a stated goal. It never puts two exercises of the same kind back to
back, prefers what has waited over what was played today, and says why each block is there. It
is stable within a day and different the next.

### The score library

`assets/songs/community/` ships real editions (Schubert, Brahms, Fauré, Debussy, Schumann, Elgar
and others) from the **OpenScore Lieder Corpus**, released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Only vocal lines whose whole range
fits between the open G and third position are kept, so every file is playable as written.
`python tools/fetch_library.py --count 120` fetches more; attribution is in
`assets/songs/community/ATTRIBUTION.md`.

The rule for content: **only add a melody you can verify.** A wrong note in a tool that grades
intonation is worse than no melody at all.

---

## How judgement works

For each note the engine gathers every pitch observation inside the note's window and grades it
once, when the window closes:

- **Deviation is measured against the written pitch, not the nearest semitone.** A confidently
  played, perfectly tuned *wrong* note is a miss.
- **A note must be held in tune for part of its length**, which separates a real note from a
  scoop. Notes under 120 ms are graded on onset alone.
- **Onset error is tracked apart from pitch**, so timing and intonation can be practised
  separately.

| Band | Deviation | Points |
|---|---|---|
| Perfect | ≤ 10 cents | 100 |
| Great | ≤ 20 cents | 60 |
| Good | ≤ 35 cents | 30 |
| Miss | beyond, or unheard | 0 |

The most useful number is **drift**, the signed mean deviation: "18 cents flat" says what to fix,
"18 cents off" does not.

Notes go to **the highest string whose open note the pitch reaches**, which reproduces printed
fingering; the tempting "lowest string that can reach it" sends A4 to the D string when A4 *is*
the open A.

Stars: one for playing, two for 80% accuracy, three for 95% **at the written tempo**.

**Drones need headphones.** Through speakers the microphone hears the drone and the detector
grades it. The app says so wherever a drone plays.

---

## The native app

The same core also builds as a native Windows app (SDL2, PortAudio, OpenGL 3.3). It was the
original form of the project and still runs the same test suite.

```bash
build.bat                                   # RelWithDebInfo; build.bat Debug [clean]
test.bat                                    # build with tests and run them (100 cases)
build\bin\Fretless.exe                      # the practice hub
build\bin\Fretless.exe --check-curriculum   # build and validate every exercise
build\bin\Fretless.exe --simulate <file>    # a virtual violinist plays a score, prints the report
```

Needs Visual Studio 2022 Build Tools with the C++ workload; `build.bat` finds CMake and Ninja
through `vswhere`, and the dependencies are fetched on the first configure. Escape walks the
screens backwards (game → module → home). Progress is one line per exercise in
`%APPDATA%\Fretless\progress.txt`.

The realtime rule: nothing reached from the audio callback allocates, locks, throws or does I/O.
The capture thread writes plain structs into a lock-free ring buffer and drops a frame rather
than wait, because a lost frame is invisible and a dropout is not.

Measured through the sound card: input latency 7.3 ms (WASAPI) and pitch error at most 1 cent on
the four open strings.

### Known gaps

- No accompaniment playback: a drone and a click, not a piano part.
- Only Book 1's Twinkle variations are playable in the Suzuki module. The printed editions are
  copyrighted, so books 1–10 are a study path, not transcriptions.
- Native only: the leaderboard upload is not wired up, and `--screenshot` needs a GPU and a
  display server.
