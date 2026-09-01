# Fretless

A custom C++20 engine for practising the violin: it listens to you play, reads
the score, and judges every note on intonation and timing.

A ground-up rewrite of an earlier Python/PyQt6 prototype, as a native engine
with a realtime audio path, a GPU renderer and no web stack. The comparisons
below are against that prototype; it is no longer in the tree.

```bash
build.bat            # configure + build (uses the CMake/Ninja in VS Build Tools)
build\bin\Fretless.exe --song assets\songs\twinkle_suzuki.musicxml
```

---

## Why the rewrite

| | Python prototype | Fretless |
|---|---|---|
| Audio | `sounddevice` + `aubio`, GIL between callback and UI | PortAudio WASAPI exclusive, lock-free SPSC queue |
| Input latency | ~90 ms (MME) | **7.3 ms** (measured, WASAPI) |
| Pitch accuracy | untested | **≤1 cent** on all four open strings (measured through the sound card) |
| Notation | Verovio → SVG → embedded Chromium | native OpenGL primitives |
| Judgement | once per 11 ms audio block | **once per note** |
| Tests | none | 30 cases, incl. a concurrent queue stress test |

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
                    ┌───────────────▼──────────────────────┐
   .musicxml ──►    │  GameEngine      [game thread, 144Hz]│
   MusicXmlParser   │  one verdict per note                │
                    └───────────────┬──────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────┐
                    │  Renderer2D → OpenGL 3.3             │
                    │  Highway · Staff · Tuner · HUD       │
                    └──────────────────────────────────────┘
```

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
  audio/    AudioEngine, PitchDetector          realtime capture + YIN
  core/     SpscRingBuffer                      the thread boundary
  score/    Score, MusicXmlParser               pugixml, replaces music21
  game/     GameEngine, SyntheticPlayer         judgement + a virtual violinist
  render/   Renderer2D, Font, Rect              batched GL, FreeType atlas
  view/     Highway, Staff, Tuner, Hud          the screens
  app/      Application, Theme                  window, loop, palette
  platform/ FileDialog, SteamService            OS + Steamworks
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
| `Fretless` | Launch the game |
| `Fretless --song <file>` | Launch straight into a piece |
| `Fretless --list-devices` | Enumerate inputs with their latencies |
| `Fretless --test-audio [s]` | Headless pitch readout from the microphone |
| `Fretless --test-score <file>` | Parse a MusicXML file and dump the timeline |
| `Fretless --simulate <file>` | Run a virtual violinist through a score, print the report |
| `Fretless --screenshot <png>` | Render one frame offscreen; needs no microphone |

### Controls

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `R` | Restart |
| `O` | Open a score (or drag a file onto the window) |
| `[` `]` | Tempo −/+ 5 BPM |
| `↑` `↓` | Cycle input device |
| `F3` | Frame time, draw calls, audio drops |
| `F11` | Fullscreen |
| `Esc` | Quit |

Scores load from `.musicxml`, `.xml` and `.mxl`. `assets/songs/` ships four
public-domain exercises, regenerated by `python tools/make_songs.py`.

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

30 cases, no external test framework (a test dependency is a dependency CI can
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

- **Repeats and voltas are not expanded**; the score plays linearly. Fine for
  practice, wrong for a performance-accurate playthrough.
- **Beaming is not grouped** — eighths and shorter get an individual flag.
- **Leaderboard upload** stops at `FindOrCreateLeaderboard`; the async
  `CCallResult` handler that submits the score is not wired up.
- **No audio playback** of the accompaniment. The engine is capture-only.
- `--screenshot` renders through a hidden window rather than an FBO, so it needs
  a GPU and a display server.
