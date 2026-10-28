---
name: fretless-curriculum
description: How to add, change or debug practice content in Fretless — the Recipe/Generator system, the ExerciseKind taxonomy, exercise ids and why they are a schema, level bands, the practice plan, progress and stars, and the melody table. Use when adding an exercise, a module, a scale type, a rhythm pattern or a tune, when an exercise generates the wrong notes, or when touching anything under include/fretless/curriculum or src/curriculum.
---

# The Fretless curriculum

Practice content lives in `curriculum/`. **Nothing in it is a file on disk.**
An exercise carries a *recipe*; `buildScore()` turns the recipe into a
`score::Score` on demand. That is what makes twelve keys × three octaves ×
eight bowings cost one table row instead of 288 MusicXML files.

```
include/fretless/curriculum/
  Exercise.h      Recipe, Exercise, Module, Curriculum — the data model
  Generators.h    buildScore() and the musical vocabulary it exposes
  ScoreBuilder.h  programmatic construction of a score::Score
  Repertoire.h    the melodies compiled into the binary
  Progress.h      what was played and how well
  PracticePlan.h  today's session
src/curriculum/
  Curriculum.cpp  THE CONTENT. Nine buildX() functions, one per module.
```

## Adding an exercise

Go to the module's `buildX()` in `src/curriculum/Curriculum.cpp` and add a row.

```cpp
Recipe recipe;
recipe.tonicMidi    = 69;            // A4
recipe.scale        = ScaleType::Major;
recipe.octaves      = 2;
recipe.fifths       = fifthsFor(69, ScaleType::Major);
recipe.noteQuarters = 0.5;
recipe.bow          = BowPattern::Slur4;

auto exercise = make(
    "scales.2oct.69",                       // id — ASCII, and a schema
    keyLabel(69, recipe.fifths) + " maior - duas oitavas",          // title
    "Quatro por arcada, uma mudança de posição em cada sentido",    // subtitle
    "Mudar de posição dentro de uma ligadura",                      // focus
    "A mudança acontece embaixo de uma ligadura, então ela não pode ser "
    "encoberta por uma troca de arco. Estude a mudança sozinha primeiro: "
    "dedo antigo até a nota nova, mesma corda, sem arco.",          // howTo
    5,                                      // level, 1..10
    60,                                     // default BPM
    ExerciseKind::Scale, recipe);
exercise.source    = "Flesch, Scale System.";
exercise.droneMidi = 57;      // optional: a sustained reference pitch
exercise.metronome = true;    // optional: audible click
module.exercises.push_back(std::move(exercise));
```

## Language: player-facing Portuguese, ASCII ids

Everything the player reads is **Brazilian Portuguese**, and notes are named
**Dó, Ré, Mi, Fá, Sol, Lá, Si**. Everything a maintainer reads — code,
comments, ids, this file — stays in English and ASCII.

That split is load-bearing, not cosmetic:

| | Use |
|---|---|
| `kStringId[]` in Curriculum.cpp | ids only: `G`, `D`, `A`, `E` |
| `score::kStringName[]` | anything on screen: `Sol`, `Ré`, `Lá`, `Mi` |
| `keyLabel(midi, fifths)` | a key, with no octave: `Sib` |
| `score::writeLatinName()` | a pitch with its octave: `Fá#5` |
| `score::toLatinName()` | converts a letter name you already have |
| `ScoreEvent::noteName` | **stays** the letter form: the staff needs it |

An id with an accent in it would still work today — the progress file is
whitespace-delimited, not ASCII-only — but it would stop being greppable and
would tie a stored key to a UI language. Two tests hold the line:
`exercise_ids_stay_ascii_so_a_progress_file_can_hold_them` and
`notes_are_presented_with_their_latin_names`.

Then:

```bash
build\bin\Fretless.exe --check-curriculum
```

which builds every exercise and checks range, duration and emptiness, and

```bash
test.bat
```

which additionally checks id uniqueness, title uniqueness within a module,
level ordering, and that `focus` and `howTo` are non-empty.

To try it:

```bash
build\bin\Fretless.exe --exercise scales.2oct.69
```

## Ids are a schema

`Exercise::id` is the key `Progress` files a player's history under. **Renaming
one silently resets that player's stars and history.** Treat the id as
permanent once shipped. If content genuinely changes meaning, use a new id and
leave the old one out — a stale record is harmless, a mismatched one is not.

Convention: `module.family.parameter`, all lower case —
`warmup.cross.2.D`, `scales.3oct.55`, `reading.full.4`, `suzuki.twinkle.3`.

## The kinds

`ExerciseKind` selects which builder runs in `Generators.cpp`. Adding a kind
means adding a `case` there and a label in `ModuleView.cpp::kindLabel`; the
compiler will find both, because both switches are exhaustive with no default.

| Kind | Builds | Key recipe fields |
|---|---|---|
| `Piece` | an embedded melody, optionally with a rhythmic variation | `pieceIndex`, `pattern` (0 = theme, 1-5 = Twinkle variations A-E) |
| `LongTone` | sustained open strings | `string` (-1 = all four), `noteQuarters` |
| `Scale` | scales, arpeggios, broken thirds, chromatic | `tonicMidi`, `scale`, `octaves`, `bow`, `descend` |
| `StringCrossing` | two open strings in a shape | `string`, `otherString`, `pattern` 0-3 |
| `SingleString` | a scale locked to one string | `string`, `maxPosition` |
| `FingerPattern` | the four first-position hand shapes | `pattern` 0-3, `string` |
| `RingTone` | open string then the notes that resonate with it | `string` |
| `DroneInterval` | one degree per bar against a drone | `tonicMidi`, `scale`; set `droneMidi` too |
| `Rhythm` | one pitch, a rhythm cell | `tonicMidi`, `pattern` (index into `kRhythms`) |
| `SightReading` | generated fresh from a seed | `fifths`, `lowMidi`, `highMidi`, `bars`, `pattern` = grade 0-3 |
| `IntervalReading` | disconnected notes to name | `fifths`, `lowMidi`, `highMidi` |
| `Reference` | **not playable** — a card describing something outside the app | none |

`Reference` exists so the Suzuki books can be listed as a study path without
pretending to reproduce copyrighted engravings. `isPlayable()` gates it, and
the plan, the module list and the play key all check it.

## Levels

1..10, and **a level changes one variable at a time.** That constraint is what
makes the list a syllabus. The bands the content uses:

| Level | Roughly |
|---|---|
| 1-2 | Open strings, first position in A and D major, quarters and halves |
| 3-4 | All four strings, G and C major, one shift, eighths |
| 5-6 | Two octaves, minors, spiccato, dotted rhythms and sixteenths |
| 7-8 | Three octaves, fifth and seventh position, acceleration bowing |
| 9-10 | Advanced repertoire; mostly reference cards |

`estimateLevel()` puts the player one past the highest level they have two
stars on, and the practice plan will not offer more than one level above it —
which is why a fresh profile is never handed a three-octave scale, and there
is a test for that.

## Progress and stars

`Progress` is one line of text per exercise in
`%APPDATA%\Fretless\progress.txt`, plus one `days` line listing every day
anything was practised. Text, so a corrupt line loses one exercise rather than
the file, and written to a `.tmp` then renamed so an interrupted save cannot
destroy the real one.

Stars, from `ExerciseRecord::stars(targetBpm)`:

- **1** — played at all.
- **2** — best accuracy ≥ 80%.
- **3** — best accuracy ≥ 95% **and** it was reached at or above the written
  tempo. Ninety-five percent at half speed is a different achievement, and
  collapsing the two tells a player they are finished when they are not.

`bestBpm` travels with `bestAccuracy`, not with its own maximum: "95%
somewhere and 160 BPM somewhere else" is not a result.

## The practice plan

`buildPracticePlan()` fills nine slots (`kSlots`), in warm-up → intonation →
technique → reading → repertoire order, scoring each candidate by:

- unfinished work first (`(3 - stars) * 25`),
- then how long it has waited (4 points a day, capped at 14),
- minus 45 if it was already played today,
- minus 8 per level away from the player's,
- minus 30 if an exercise of the same kind is already in the plan
  (interleaving),
- plus a per-day jitter so ties do not always resolve the same way.

`daySeed` makes the plan stable within a day and different across days. Opening
the app twice must not reshuffle the session.

## Adding a melody

`src/curriculum/Repertoire.cpp`. Rules, in order of importance:

1. **Only tunes you can verify.** A wrong note in a tool that grades intonation
   is worse than no tune at all. If you cannot hum it from memory and check it,
   do not add it — point at `assets/songs/community/` instead.
2. **Public domain, and say where it came from.** `PieceData::source` is shown
   in the detail panel.
3. **First position.** MIDI 55 to 83. There is a test.
4. Transpose into a key that lies under the hand — usually Lá or Ré major.
5. Use the Brazilian title where one is genuinely used (*Hino à Alegria*,
   *Brilha, Brilha, Estrelinha*, *Minueto em Sol*) and the original where one
   is not (*Lightly Row*, *Au clair de la lune*).

Use the `Q`/`H`/`E_`/`DQ`/`DH`/`W` duration constants and the `A4`/`Fs5` pitch
constants; writing `66` instead of `Fs4` in a hundred-note melody is how wrong
notes get in.

## Adding a rhythm or a reading grade

Both are tables at the top of `src/curriculum/Generators.cpp`:

- `kRhythms` — each cell is a list of quarter-note durations that **must sum to
  a whole number of beats**, or every barline after it lands in the wrong place
  on the staff. There is a test.
- `kGrades` — a duration pool, a maximum leap in scale degrees, and how often
  to leap. Widen exactly one of those per grade.

## Bow groups

`ScoreBuilder::bow(n)` marks the following notes as `n` to a bow;
`ScoreEvent::bowSpan`/`bowSlot` carry it, and `StaffView` draws the slur. A
rest breaks the group and resets the counter — you cannot slur across silence.
`BowPattern::Acceleration` is special-cased in `buildScaleInto`: it runs the
same pitches six times at 1, 2, 3, 4, 6 and 8 to a bow.

## Where the musical decisions are explained

The *why* behind the content — the Suzuki sequence, the scale ladder, ringing
tones, sight-reading grading, practice scheduling — is in the
`violin-pedagogy` skill, with sources. Read it before inventing content;
almost every question about what an exercise should teach is answered there.
