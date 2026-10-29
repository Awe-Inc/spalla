# Spalla

*(internal name: Fretless)*

A C++20 practice tool for the violin. It listens to you play, reads the score,
and judges every note on intonation and timing — and it comes with a syllabus,
so the answer to "what should I practise today" is on the first screen.

161 exercises across nine modules, from open-string long tones to three-octave
scales; a drone and a metronome; sight reading that deals a new page every
time; and a library of public-domain repertoire.

Live at https://pataxo-inc.github.io/spalla/ — repository at https://github.com/Pataxo-Inc/spalla.

Since October 2026 the app is web-first: the C++ core is compiled to
WebAssembly and the interface is React, installable as a PWA. The native
build still works and runs the same test suite.

The web app is called **Spalla** (the orchestra's first violin). Its look — dark fir and
ebony with a honey accent, Instrument Serif and Instrument Sans, Geist Mono for numbers — is
written down in `DESIGN.md`; every colour, font and radius lives in `apps/web/src/design/tokens.css`.
Package names and storage keys keep the old name on purpose, so
nobody's saved progress breaks.

```bash
pnpm install && pnpm build:core  # Emscripten build of the core (needs emsdk)
pnpm dev                         # the web app on http://localhost:5180
pnpm test                        # C++ cases in WASM + vitest (core and web)
pnpm --filter @fretless/web build  # PWA in apps/web/dist (BASE_PATH=/spalla/ for GitHub Pages; CI does this)

build.bat                        # native configure + build (CMake/Ninja from VS Build Tools)
build\bin\Fretless.exe          # the native practice hub
python tools/fetch_library.py    # download CC0 repertoire into assets/songs
```

---

## What you practise

The home screen offers a session that has already been decided, and the shelf
you would go to if you disagreed with it.

| Module | | |
|---|---|---|
| **Aquecimento** | 25 | Long tones, open-string crossings, the four finger patterns, Suzuki tonalization |
| **Afinação** | 23 | Ringing tones, drone scales, finger patterns against a reference pitch |
| **Escalas e arpejos** | 35 | One octave to three, majors and minors, arpeggios, broken thirds, chromatic |
| **Golpes de arco** | 10 | Détaché, slurs of 2 to 12, Galamian's acceleration, stroke studies on one pitch |
| **Uma corda por vez** | 16 | Every string, first through seventh position |
| **Ritmo** | 11 | One open string, so only the timing can be wrong. Includes Suzuki's Twinkle rhythms |
| **Leitura** | 16 | Sight reading generated fresh every attempt, and a note-naming drill |
| **Método Suzuki** | 6 | The five Twinkle variations, plus all ten books as a study path |
| **Melodias** | 9 | Public-domain melodies that lie under a first-position hand |

Every exercise says what it is for and what to listen for while playing it.
That field is required, and a test fails when it is empty — a drill without a
stated goal is time spent, not practice.

### How the exercises exist

None of them is a file. An `Exercise` carries a **recipe**, and the score is
built from it on demand:

```cpp
Recipe recipe;
recipe.tonicMidi    = 55;                       // G3
recipe.scale        = ScaleType::Major;
recipe.octaves      = 3;
recipe.bow          = BowPattern::Acceleration; // 1, 2, 3, 4, 6, 8 to a bow
recipe.noteQuarters = 0.5;
```

Twelve keys × three octaves × eight bowings is one table row each, not 288
MusicXML files. It also means the whole library can be validated in a second:

```bash
build\bin\Fretless.exe --check-curriculum
161 exercicios, 6357 notas, 0 problemas
```

### Language

**The interface is in Brazilian Portuguese and notes are named Dó, Ré, Mi, Fá,
Sol, Lá, Si** — which is what a Brazilian musician reads. The four strings are
Sol, Ré, Lá and Mi everywhere they appear: the highway gutter, the readout, the
exercise titles.

Only the presentation changes. `ScoreEvent::noteName` keeps the letter spelling
(`C#5`), because the staff positions notes by letter and the MusicXML parser
writes them; `score::toLatinName` converts on the way to the screen and nowhere
else. Exercise ids stay ASCII with letter names (`warmup.longtone.G`) because
they are the key progress is filed under — there is a test for both.

Code, comments and this file stay in English, on the same principle that keeps
ids ASCII: they are read by whoever maintains the project, not by the player.

### The session

The plan is built from three findings that are about as settled as anything in
this field gets — interleaving beats blocking, spacing beats massing, and a
drill needs a stated goal. So it never puts two exercises of the same kind back
to back, it prefers what has waited over what was played today, and every row
says *why* it is there: "not played for 9 days", "unfinished — best so far
64%", "push the tempo — clean at 72 BPM".

It is stable within a day and different the next, so opening the app twice does
not reshuffle the session underneath you.

### Drone and metronome

The engine used to be capture-only, which ruled out the two most effective
things a practice tool can do. `ToneEngine` is a second, independent PortAudio
stream: a drone to tune against and a click that knows where the bar line is.

Intonation against a drone is the most effective ear-training drill there is,
and it cannot be replaced by drawing something on a screen. **It does need
headphones** — a drone through speakers is heard by the microphone, and the
pitch detector will happily grade the drone. The UI says so on every exercise
that uses one.

Barlines and the click follow the score bar by bar. The parser records every
played bar with its own meter and its length in seconds, so a pickup, a
tempo change or a switch from 4/4 to 3/4 moves the staff's barlines, the
highway's grid, the beat dots and the accented click together. A piece that
opens with a one-beat pickup in 3/4 starts its click on beat three, not on an
accented downbeat. `--test-score` lists the pickup and every bar where the
meter or the click rate changes.

---

## The score library

`assets/songs/community/` ships 36 real editions — Schubert, Brahms, Fauré,
Debussy, Schumann, Elgar, Wolf and others — from the **OpenScore Lieder
Corpus**, released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
CC0 is a public domain dedication, so redistributing them here is unambiguous.

Being songs, many open with the piano alone — Am Wasserfall has twelve bars
and 20 seconds of rests in the voice part before it sings. The parser starts
the timeline at the bar of the first note instead, keeping that bar whole and
its printed number, so the count-in lands on its downbeat and the measure
numbers still match the printed page.

```bash
python tools/fetch_library.py --count 120
```

fetches more. They are songs, not violin parts, which is exactly what makes
them useful: a vocal line is a single melodic voice, phrased to be breathed,
and the fetcher keeps only the ones whose entire range fits between the open G
and the top of third position — so every file is playable as written, with no
transposition.

Attribution and the full list land in `assets/songs/community/ATTRIBUTION.md`.

---

## Why the rewrite

| | Python prototype | Fretless |
|---|---|---|
| Audio | `sounddevice` + `aubio`, GIL between callback and UI | PortAudio WASAPI exclusive, lock-free SPSC queue |
| Input latency | ~90 ms (MME) | **7.3 ms** (measured, WASAPI) |
| Pitch accuracy | untested | **≤1 cent** on all four open strings (measured through the sound card) |
| Notation | Verovio → SVG → embedded Chromium | native OpenGL primitives |
| Judgement | once per 11 ms audio block | **once per note** |
| Tests | none | 100 cases, incl. a concurrent queue stress test |

The judgement change is the important one. Grading every audio block meant a
whole note counted about 85 times and a sixteenth counted twice: "accuracy" was
really a percentage of *milliseconds*, and one long sour note outweighed a page
of clean playing. Fretless accumulates observations across a note and emits
exactly one verdict when its window closes.

---

## Architecture

```
                    ┌──────────────────────────────────────┐
   microphone ──►   │  AudioEngine     [RT thread, ~5 ms]  │
                    │  PortAudio callback → YIN → PitchFrame│
                    └───────────────┬──────────────────────┘
                                    │  SpscRingBuffer<PitchFrame, 256>
                                    │  wait-free · no locks · drops, never blocks
   Recipe ─────►    ┌───────────────▼──────────────────────┐
   Generators       │  GameEngine      [game thread, 144Hz]│
        │           │  one verdict per note                │
   .musicxml ──►    └───────────────┬──────────────────────┘
   MusicXmlParser                   │
                    ┌───────────────▼──────────────────────┐
                    │  Renderer2D → OpenGL 3.3             │
                    │  Home · Module · Library · Game      │
                    └──────────────────────────────────────┘

                    ┌──────────────────────────────────────┐
   speakers ◄───    │  ToneEngine      [RT thread]         │
                    │  drone + metronome, its own stream   │
                    └──────────────────────────────────────┘
```

Capture and playback are separate objects with separate streams on purpose.
Capture must work on a machine with no output device and playback must work
with no microphone; folding them into one duplex stream makes each a
prerequisite of the other, and WASAPI duplex additionally requires both
endpoints to agree on a sample rate, which consumer hardware routinely does
not.

### The threading contract

Everything in `AudioEngine::processBlock` runs on a driver-owned thread. It must
not allocate, lock, throw, or do I/O — any of those can block for longer than the
5 ms buffer period and produce an audible dropout. So the realtime side only
writes trivially-copyable PODs into a preallocated ring and touches lock-free
atomics. Musical interpretation (note names, cents, string assignment) is
presentation, and happens on the game thread.

When the game loop stalls, the producer **drops a frame and bumps a counter**
rather than waiting. A lost frame is invisible; a dropout is not.

### Layout

```
include/fretless/
  audio/       AudioEngine, PitchDetector       realtime capture + YIN
               ToneEngine                       drone + metronome, output side
  core/        SpscRingBuffer                   the thread boundary
  score/       Score, MusicXmlParser            pugixml, replaces music21
  curriculum/  Exercise, Generators             the syllabus, as recipes
               ScoreBuilder, Repertoire         scores without MusicXML
               Progress, PracticePlan           what you did, and what is next
  game/        GameEngine, SyntheticPlayer      judgement + a virtual violinist
  render/      Renderer2D, Font, Rect           batched GL, FreeType atlas
  view/        Home, Module, Menu               the hub, a module, the library
               Highway, Staff, Tuner, Hud       the run
  app/         Application, Theme               window, loop, palette
  platform/    FileDialog, SteamService         OS + Steamworks
```

`fretless_engine` is a static library; `Fretless` is just `main.cpp`. Tests link
the library directly.

---

## Building

Needs Visual Studio 2022 Build Tools with the C++ workload. `build.bat` finds it
through `vswhere` and uses the CMake and Ninja that ship with it — nothing else
to install.

```bash
build.bat                 # RelWithDebInfo
build.bat Debug
build.bat Debug clean     # wipe build/ first
test.bat                  # build with tests and run them
```

Dependencies are fetched and built in-tree on the first configure (SDL2,
PortAudio, pugixml, FreeType, miniz). glad is vendored in `lib/glad/`, so no
Python is needed at build time. A system or vcpkg copy of any dependency is
preferred automatically via `FIND_PACKAGE_ARGS`.

### CMake options

| Option | Default | Effect |
|---|---|---|
| `FRETLESS_ENABLE_STEAM` | OFF | Link the Steamworks SDK from `lib/steamworks/` |
| `FRETLESS_BUILD_TESTS` | OFF | Build and register `fretless_tests` |
| `FRETLESS_ENABLE_ASAN` | OFF | AddressSanitizer |
| `FRETLESS_WARNINGS_AS_ERRORS` | OFF | `/WX` |
| `FRETLESS_USE_AUBIO` | OFF | Use libaubio instead of the built-in YIN |

---

## Running

| Command | What it does |
|---|---|
| `Fretless` | Launch the practice hub |
| `Fretless --song <file>` | Launch straight into a piece |
| `Fretless --exercise <id>` | Launch straight into one exercise |
| `Fretless --module <id>` | Open a module's exercise list |
| `Fretless --exercises` | List every exercise with its id |
| `Fretless --check-curriculum` | Build every exercise and validate it |
| `Fretless --list-devices` | Enumerate inputs with their latencies |
| `Fretless --test-audio [s]` | Headless pitch readout from the microphone |
| `Fretless --test-score <file>` | Parse a MusicXML file and dump the timeline |
| `Fretless --simulate <file>` | Run a virtual violinist through a score, print the report |
| `Fretless --screenshot <png>` | Render one frame offscreen; needs no microphone |

### Controls

Escape walks the screens backwards — game → module → home — which is the only
navigation rule there is to learn.

**Home and the module list**

| Key | Action |
|---|---|
| `Enter` | Start the highlighted item |
| `Tab` | Switch between the session and the module shelf |
| `↑` `↓` `←` `→` | Move |
| `[` `]` | Tempo −/+ 4 BPM |
| `L` | The library: scores on disk, and the input picker |
| `Esc` | Back, and from the home screen, quit |

**During a run**

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `R` | Restart — and deal a new page, in a reading exercise |
| `D` | Drone on / off |
| `M` | Metronome on / off |
| `S` | Show or hide the staff |
| `[` `]` | Tempo −/+ 4 BPM |
| `I` | Change input device |
| `O` | Open a score (or drag a file onto the window) |
| `F3` | Frame time, draw calls, audio drops |
| `F11` | Fullscreen |
| `Esc` | Leave the run — the attempt is filed either way |

Scores load from `.musicxml`, `.xml` and `.mxl`. `assets/songs/` ships four
generated exercises (`python tools/make_songs.py`) and, once fetched, the CC0
community library.

### Progress

One line of text per exercise in `%APPDATA%\Fretless\progress.txt`, plus a
list of the days anything was practised. Text rather than a database, so a
corrupt line loses one exercise instead of the file, and a player can open it
and see that nothing embarrassing is being kept. Written to a `.tmp` and
renamed, so an interrupted save cannot destroy the real one.

Stars: one for playing it, two for 80% accuracy, three for 95% **at the written
tempo**. Ninety-five percent at half speed is a different achievement, and
collapsing the two tells a player they are finished when they are not.

---

## How judgement works

For each note the engine accumulates every pitch observation inside the note's
window, then grades on the way out:

- **Deviation is measured against the written pitch, not the nearest semitone.**
  A confidently played, perfectly-tuned *wrong* note is a miss. A tuner would
  call it "in tune"; the game must not.
- **A note must be held in tune for a minimum fraction of its length** — that is
  what separates a real note from a scoop or a squeak. Notes under 120 ms are
  graded on onset alone; there is not enough signal to average intonation.
- **Onset error is tracked separately from pitch**, so timing and intonation can
  be practised independently.

| Band | Deviation | Points |
|---|---|---|
| Perfect | ≤ 10 cents | 100 |
| Great | ≤ 20 cents | 60 |
| Good | ≤ 35 cents | 30 |
| Miss | beyond, or unheard | 0 |

The combo multiplier caps at 4×, reached on a 30-note streak.

The most useful number on the screen is **drift**: the *signed* mean deviation.
"18 cents off" tells a player nothing actionable; "18 cents flat" tells them
exactly what to fix.

### Fingering

Notes are assigned to the string a player would actually use: **the highest
string whose open note the pitch reaches**. The tempting rule — the lowest
string that can reach the note — is wrong at every boundary, sending A4 to the D
string as a fourth finger when A4 *is* the open A. Run Suzuki Twinkle through
both: this one reproduces the printed fingering note for note.

---

## Testing

```bash
test.bat
```

100 cases, no external test framework (a test dependency is a dependency CI can
fail to fetch). Notable coverage:

- **`ring_buffer_is_correct_under_concurrent_producer_and_consumer`** — 200 000
  items across two real threads, asserting no reordering and no torn reads.
- **`pitch_detector_finds_the_open_strings`** — driven with harmonic-rich tones
  where the fundamental is *weaker* than the second partial, which is the
  condition that makes naive autocorrelation report an octave error.
- **`a_confidently_played_wrong_note_is_a_miss`** — the case a tuner gets wrong.
- **`game_engine_judges_each_note_exactly_once`** — the invariant the Python
  prototype broke.
- **`mxl_with_backslash_entry_names_still_parses`** — real regression: ZIP
  mandates forward slashes, but PowerShell's `Compress-Archive` (and other
  writers) store `META-INF\container.xml`. A naive fallback then mistakes the
  container itself for the score.
- **`every_playable_exercise_produces_notes_the_violin_can_reach`** — the
  failure mode a generated curriculum actually has: one wrong field in one
  table row yields an exercise that runs fine and is silently unplayable.
- **`exercise_ids_are_unique_because_progress_is_filed_under_them`** — two
  exercises sharing an id would share a record, so practising one would award
  stars on the other.
- **`melodic_minor_descends_differently_from_how_it_ascends`** — the one scale
  that is not its own reverse, and the commonest silent mistake in a scale
  table.
- **`a_generated_bar_is_never_left_half_full`** — a bar that does not add up
  puts every following barline in the wrong place and makes the staff
  unreadable.
- **`first_and_second_endings_are_taken_in_turn`** and
  **`after_da_capo_the_repeats_are_not_taken_again_and_the_last_ending_is_played`**
  — a score plays in performance order: repeats with their `times`, voltas,
  D.C., D.S., Fine and Coda, read from the `<sound>` playback attributes
  rather than the printed words. `ParseOptions::expandRepeats = false` gives
  the page as printed, and `--test-score` prints the order as measure runs.
- **`dotted_eighth_and_sixteenth_share_a_beam`** and
  **`triplet_eighths_beam_together`** — beams group by beat (by dotted
  quarter in compound time) and count from the nominal note, so a dotted
  sixteenth gets two beams while the shorter triplet eighth gets one. The
  grouping is computed in quarters, so moving the tempo control never
  regroups the staff.
- **`a_pickup_measure_starts_the_first_full_bar_after_it`**,
  **`a_tempo_change_moves_every_later_barline`** and
  **`a_time_signature_change_is_kept_per_measure`** — barlines used to be a
  grid from the first tempo and the first meter, which put them in the wrong
  place in a third of the bundled songs.
- **`a_silent_introduction_is_cut_to_the_bar_of_the_first_note`** and
  **`a_piece_that_starts_playing_at_once_is_left_alone`** — the voice parts
  open with up to 20 s of rests under the piano introduction; the cut keeps
  the bar of the first note whole and leaves pickups untouched.
- **`a_streak_counts_days_of_practice_not_exercises_last_touched`** — a real
  bug: only the last attempt per exercise was stored, so practising the same
  warm-up every morning read as a streak of one, forever.
- **`the_third_star_needs_the_tempo_as_well_as_the_accuracy`**.
- **`notes_are_presented_with_their_latin_names`** and
  **`exercise_ids_stay_ascii_so_a_progress_file_can_hold_them`** — the two
  halves of the naming split above, pinned so a refactor cannot quietly merge
  them.

### End-to-end validation

`--simulate` runs a configurable virtual violinist through a whole score with no
microphone and no window:

```
Fretless --simulate assets\songs\twinkle_suzuki.musicxml --bias -18 --jitter 14
  ...
  accuracy    95.2%
  intonation  -18.16 c mean       <- the injected bias, recovered
```

Measured through the sound card (loopback, synthetic violin tone):

| String | Target | Detected | Error |
|---|---|---|---|
| G3 | 196.00 Hz | 196.11 | 1.00 ¢ |
| D4 | 293.66 Hz | 293.74 | 0.42 ¢ |
| A4 | 440.00 Hz | 440.06 | 0.25 ¢ |
| E5 | 659.26 Hz | 659.35 | 0.26 ¢ |

1685 blocks, 0 dropped, 0 overflows.

---

## Rendering

One shader, one vertex buffer, one draw call per texture. Rounded rectangles and
circles are analytic: the fragment shader evaluates a signed distance function,
so a note head is antialiased at any size with no texture fetch and no
tessellation. `fwidth` gives exactly one pixel of the distance field, which is
the correct AA width however the quad was scaled.

Text is a FreeType glyph atlas (Latin-1, single R8 texture) rasterized at load
time, so a glyph costs the same as any other quad.

The staff is drawn from primitives — lines, stadium note heads, stems, ledger
lines, key signature — rather than a SMuFL font, so there is no font licensing
question and no engraving library in the build.

**Fonts:** any `.ttf`/`.otf` dropped into `assets/fonts/` wins; otherwise a
system UI font is used so a fresh checkout renders text. Ship an OFL font in
`assets/fonts/` before release — a Windows system font is not redistributable.

---

## Steam

`SteamService` compiles and links whether or not the SDK is present. Without it
every call is a no-op reporting "not connected", so game code needs no `#ifdef`
and a developer with no Steam install still gets a running build.

To go live: extract the Steamworks SDK into `lib/steamworks/` (so that
`lib/steamworks/public/steam/steam_api.h` exists), put your app id in
`steam_appid.txt`, and configure with `-DFRETLESS_ENABLE_STEAM=ON`.

Achievements and stats are registered in `SteamService.h` as one list, so the
partner site and the code cannot drift. `pump()` is called every frame —
forgetting it is the classic reason achievements "sometimes" fail to unlock.

---

## Known gaps

- **Leaderboard upload** stops at `FindOrCreateLeaderboard`; the async
  `CCallResult` handler that submits the score is not wired up.
- **No accompaniment playback.** `ToneEngine` plays a drone and a click; it
  does not play a piano part.
- **A drone through speakers is heard by the microphone** and the detector will
  grade it. The UI asks for headphones; it cannot enforce them.
- **The click and the notes run on different clocks** — the sound card's and
  SDL's performance counter. They are aligned at the end of the count-in, and
  again wherever the meter or the tempo changes, and in between will drift apart by a few milliseconds over several minutes. Inaudible in a
  practice session, wrong for a recording.
- **Only Book 1's Twinkle variations are playable** in the Suzuki module. The
  printed editions are copyrighted, so books 1–10 ship as a study path — what
  each volume is for, and which exercises here prepare it — rather than as
  transcriptions.
- `--screenshot` renders through a hidden window rather than an FBO, so it needs
  a GPU and a display server.

---

## Working on this

Three skills in `.claude/skills/` carry the context that is not in the code:

| Skill | What it covers |
|---|---|
| `violin-pedagogy` | How violinists are actually taught — the Suzuki sequence, warm-up structure, the Flesch and Galamian scale ladders, ringing tones and drones, bow-stroke families, sight-reading grading, and what the practice-science literature says. Every claim is sourced in `references/sources.md`. |
| `fretless-curriculum` | Adding and debugging practice content: the recipe system, the kind taxonomy, why exercise ids are a schema, level bands, the practice plan, stars, and the melody table. |
| `fretless-engine` | The realtime audio contract, the screen and view architecture, the renderer, layout and theme tokens, and the build and test commands. |

The rule that governs the content: **only add a melody you can verify.** A
wrong note in a tool that grades intonation is worse than no melody at all,
which is why the hand-written repertoire is short and the large-scale library
comes from CC0 editions instead.
