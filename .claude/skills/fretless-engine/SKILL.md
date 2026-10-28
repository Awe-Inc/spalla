---
name: fretless-engine
description: Working in the Fretless C++20 engine — the realtime audio contract, the screen and view architecture, the batched OpenGL renderer, layout and theme tokens, judgement, and the build and test commands. Use when changing anything under src/ or include/fretless outside curriculum/, when adding a screen or a view, when touching audio, and before building or running the app.
---

# The Fretless engine

A native C++20 violin practice tool: PortAudio capture → YIN pitch detection →
one verdict per note → an OpenGL 3.3 renderer. No web stack, no notation
engine, no test framework.

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
- Onset error is tracked separately from pitch, so timing and intonation can
  be practised independently.

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
