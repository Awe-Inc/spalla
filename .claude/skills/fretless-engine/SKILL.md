---
name: fretless-engine
description: Working in the Fretless C++20 engine — the realtime audio contract, the screen and view architecture, the batched OpenGL renderer, layout and theme tokens, judgement, and the build and test commands. Use when changing anything under src/ or include/fretless outside curriculum/, when adding a screen or a view, when touching audio, and before building or running the app.
---

# The Fretless engine

The C++20 core of the violin practice tool: YIN pitch detection → one verdict
per note, plus the native shell (PortAudio capture, OpenGL 3.3 renderer). Since
28/10/2026 the same core also compiles to WebAssembly for the React app; that
side is the `fretless-web` skill. No notation engine, no test framework.

## Build and run

```bash
build.bat                 # RelWithDebInfo
build.bat Debug
build.bat Debug clean     # wipe build/ first
test.bat                  # build with tests and run them
```

`build.bat` finds Visual Studio through `vswhere` and uses the CMake and Ninja
that ship with it. Dependencies (SDL2, PortAudio, pugixml, FreeType, miniz) are
fetched on the first configure; glad is vendored.

Useful without a microphone or a violin:

```bash
build\bin\Fretless.exe --check-curriculum          # build every exercise, validate
build\bin\Fretless.exe --exercises                 # list them with their ids
build\bin\Fretless.exe --exercise <id>             # launch straight into one
build\bin\Fretless.exe --module <id>               # open a module's list
build\bin\Fretless.exe --simulate <file>           # virtual violinist, prints a report
build\bin\Fretless.exe --screenshot out.png [--at s]   # render one frame offscreen
build\bin\Fretless.exe --test-score <file>         # parse and dump a timeline
build\bin\Fretless.exe --list-devices              # inputs with their latencies
```

`--screenshot` combines with `--module` and `--exercise`, which is how each
screen is checked visually without a display session in the loop.

## The realtime contract

**This is the rule that matters most.** Everything reached from
`AudioEngine::processBlock` or `ToneEngine::renderBlock` runs on a
driver-owned thread. Inside it, all of the following are forbidden, because any
of them can block for longer than the buffer period and produce an audible
dropout:

> `new` / `delete` / `malloc` · mutexes · `std::function` · exceptions · file
> or console I/O · `std::string` · anything that may page-fault

So the realtime side only writes trivially-copyable PODs into a preallocated
`SpscRingBuffer` and touches lock-free atomics. Musical interpretation — note
names, cents, string assignment — is *presentation* and happens on the game
thread.

When the game loop stalls, the producer **drops a frame and bumps a counter**
rather than waiting. A lost frame is invisible; a dropout is not.

`noexcept` on the callbacks is load-bearing: unwinding through PortAudio's C
frames is undefined behaviour.

`AudioEngine` (capture) and `ToneEngine` (drone and click) are deliberately
separate objects with separate streams. Capture must work with no output
device and playback must work with no microphone; a duplex stream makes each a
prerequisite of the other, and WASAPI duplex additionally requires both
endpoints to agree on a sample rate, which consumer hardware often does not.
`Pa_Initialize`/`Pa_Terminate` are reference counted, so two users is fine.

## Screens and views

```
Screen::Home    HomeView       the hub: today's session + the module shelf
Screen::Module  ModuleView     one module's exercises + a detail pane
Screen::Library MenuView       scores on disk + the input picker
Screen::Game    Highway/Staff/Tuner/Hud/TempoControl
```

Escape walks that list backwards. That is the only navigation rule a player
has to learn, and `returnScreen_` is what makes leaving a run land back on the
row it was started from.

A view owns geometry and drawing and **returns an action enum** rather than
calling back into the application. `Application::handleXAction` is where the
decision is made. Views never touch audio, files or the game engine.

Every non-game screen keeps the tuner strip along the bottom, so a player can
check a note or check that the microphone is alive without first deciding what
they are practising.

Adding a screen: add to `Screen`, add the view member, then follow the
compiler through `layout()`, `handleEvents()`, `update()` and `render()` —
all four switch on `screen_` exhaustively.

## Rendering

One shader, one vertex buffer, one draw call per texture. Rounded rectangles
and circles are analytic: the fragment shader evaluates a signed distance
function, so a note head is antialiased at any size with no texture fetch and
no tessellation. Text is a FreeType glyph atlas rasterised at load.

Practical consequences:

- Use `drawRoundedRect` / `drawCircle` / `drawRing` freely; they are as cheap
  as a quad.
- `pushClip` **flushes the batch**. Use it sparingly.
- **Measure text, do not count characters.** `Font::measure()` exists.
  Truncating at a character count makes "Warm-up" and "Scales and arpeggios"
  behave completely differently in the same box.
- The staff is drawn from primitives — lines, stadium note heads, stems,
  ledger lines, key signature, slur arcs — rather than a SMuFL font, so there
  is no font licensing question in the build.

## Language

The interface is Brazilian Portuguese; notes are Dó, Ré, Mi, Fá, Sol, Lá, Si.
Code and comments stay English. The conversion happens once, on the way to the
screen: `score::toLatinName()` takes whatever letter spelling you have — the
parser's, the detector's — and returns the Latin one. `ScoreEvent::noteName`
must keep its letter form, because `StaffView` positions a note by reading
`noteName[0]` and its octave digits.

Buffers for a Latin name need **12 bytes at least**: `Sol#5` is five glyphs and
the accented letters are two bytes each in UTF-8. The font atlas covers
Latin-1, which is every accent Portuguese uses, and the build already passes
`/utf-8`, so accented literals can be written directly in source.

## Layout and theme

Never hard-code a size or a colour. `app/Layout.h` has the type scale
(`kFontLabel` 12 → `kFontHero` 68, roughly a 1.4 ratio) and a 4 px spacing
grid; `app/Theme.h` has the palette.

The four string colours differ in **lightness as well as hue**, so the lanes
stay distinguishable under the common colour-vision deficiencies, and grade
feedback never relies on red-versus-green alone — the judgement text carries
the verdict in words too. Keep that property.

## Judgement

`GameEngine` emits **one verdict per note**, accumulated across the note's
window and graded when it closes. The properties worth preserving:

- Deviation is measured against the **written** pitch, not the nearest
  semitone. A confidently played, perfectly tuned *wrong* note is a miss.
- A note must be held in tune for a minimum fraction of its length; that is
  what separates a real note from a scoop or a squeak.
- Notes under 120 ms are graded on onset alone — there is not enough signal to
  average intonation.
- Sound the detector cannot read is **not ouvida** (`Unheard`), not a miss:
  it is the microphone's failure, not the player's, so it keeps the combo and
  leaves accuracy alone. Silence is still a miss.
- Onset error is tracked separately from pitch, so timing and intonation can
  be practised independently.
- The window reaches `onsetToleranceSec` past the written end only for a late
  player: there, only frames in tune with the note count, and a frame sounding
  anything else (or the same pitch when the next note repeats it) closes the
  note and goes to the next one.

The most useful number on screen is **drift**: the *signed* mean deviation.
"18 cents off" tells a player nothing actionable; "18 cents flat" tells them
exactly what to fix.

## Fingering

Notes are assigned to **the highest string whose open note the pitch reaches**.
The tempting rule — the lowest string that can reach the note — is wrong at
every boundary: it sends A4 to the D string as a fourth finger when A4 *is*
the open A. `stringForMidi` in `score/Score.h`, with a test.

## Tests

`test.bat`. No external framework: a test dependency is a dependency CI can
fail to fetch. Cases register through a static constructor; `TEST(name)`,
`CHECK`, `CHECK_EQ`, `CHECK_NEAR`.

What is worth adding a case for: an invariant that fails silently. The
existing suite is full of them — the ring buffer under two real threads, an
octave error in the pitch detector, a confidently played wrong note, one
verdict per note, a `.mxl` with backslash entry names, a bar that does not add
up to a bar.

## Armadilhas

- **A note's tail must not eat the next note.** Every note under ~0.36 s was a
  Miss even when played perfectly (OpenScore songs at 72 bpm scored 21% with the
  synthetic player): the window stayed open until end + 180 ms, counted the next
  note's first frames as this note's out-of-tune samples, and the next note
  started accumulating 180 ms late. `releaseNoteTheFrameHasLeft` closes a note
  as soon as a frame past its written end is something else, and
  `a_fast_run_played_in_tune_has_no_misses` holds it. Any change to the window:
  test a fast run, not only quarter notes.
- **In room noise YIN reads high notes an octave (or more) low.** At 5 dB SNR
  36–100% of the confident frames of Lá4…Mi7 came out as a sub-harmonic, so a
  note played right was graded wrong. No dip crosses the 0.15 threshold under
  noise, the fallback takes the global minimum of d', and the cumulative
  normalisation makes every multiple of the period look slightly deeper than
  the period itself. `PitchDetector::firstComparableDip` takes the shortest dip
  within 1.3× of the best one. `tests/test_pitch_robustness.cpp` (microphone
  band limits, weak fundamental, vibrato, 10/5/3 dB noise, an out-of-tune
  player) holds it; any change to the detector keeps that bank green, and a
  bank fed only clean sines proves nothing about a real microphone.
- **High notes read sharp.** A clean Mi7 came out +5.4 cents (Lá6 +3.4,
  Mi6 +1.8), enough to push a well-tuned note out of Perfect. The parabola
  was fitted on d', which is multiplied by tau and so tilts towards shorter
  lags, and at tau ≈ 18 samples a fraction of a sample is several cents.
  `parabolicMinimum` fits on d(tau), and `refineOnAMultiple` re-fits the dip
  at the k-th multiple of the period and divides by k, keeping the
  single-period estimate if the multiple drifts more than half a sample.
  `pitch_robustness_reads_a_clean_tone_without_bias` (|mean| ≤ 0.5 cent across
  the compass) holds it.
- **A weak microphone turned a right note into a Miss.** Sound was there
  (rms above the gate) but no frame reached the confidence threshold, so the
  note had no in-tune frames and was graded wrong, broke the combo and cost
  accuracy. Now a frame flagged `kFlagLowConfidence` counts as unreadable, and
  a note with no heard verdict whose unreadable frames outnumber the
  confidently off-tune ones (and reach the voiced-ratio floor) is
  `HitGrade::Unheard`: 0 points, combo kept, out of the accuracy denominator.
  A confidently read wrong pitch still wins and stays a Miss. Three tests in
  `test_game_engine.cpp` hold it; the web skips Unheard in the measure map
  and in the perfect streak, and `creditedAccuracyPct` counts Unheard
  against the saved result once it is more than half the notes, so a dead
  microphone cannot earn stars from the two notes it caught.
- **Dó8 read an octave low once the ceiling went past Mi7.** `maxFrequencyHz`
  is 4400 so harmonics up to C8 with vibrato stay in range. At 4186 Hz the
  period (≈ 11.47 samples) falls between integer lags while twice the period
  lands almost on lag 23, so the sub-octave's raw d(tau) looked deeper and
  `firstComparableDip` kept it. `dipDepth` (parabola vertex) is compared too,
  but only for a dip that divides the chosen period (k ≥ 2, drift ≤ 0.5
  sample) and within 1.6×: on every dip it extrapolates a clean tone to zero
  and reads a weak fundamental an octave high.
  `pitch_robustness_reaches_the_harmonics_above_e7` and
  `pitch_robustness_keeps_a_weak_fundamental_in_noise` hold both sides.
- **A fixed silence gate turns room noise into "não ouvida".** A fan above
  the gate is "sound" with no readable pitch, so every rest became Unheard
  frames and a quiet room's note fell under the gate. `NoiseFloorTracker`
  (`audio/NoiseFloor.h`) learns the floor only from unvoiced blocks, rises in
  ~3 s and falls in ~0.3 s; the gate is 2× the floor, clamped between the
  user's sensitivity threshold and 0.05. Both `AudioEngine` and the WASM
  `LivePitchTracker` use it, and the binding returns `gate` and `noiseFloor`
  per frame for the web's microphone test. `tests/test_noise_floor.cpp`.

## House style

- Comments explain **why**, never what. If a line needs a comment saying what
  it does, rewrite the line.
- A comment that describes a decision should say what the alternative was and
  why it lost. Most of the comments in this codebase do.
- `[[nodiscard]]` on anything returning a value that must be checked.
- Error reporting is `bool f(..., std::string* error)`, never exceptions
  across a subsystem boundary.
- Optional subsystems (Steam, the tone engine) compile and link whether or not
  they are present, and report "not connected" rather than failing — so game
  code needs no `#ifdef` and a fresh checkout runs.
