---
name: violin-pedagogy
description: How violinists are actually taught — the Suzuki method and its sequence, warm-up routines, the Flesch and Galamian scale systems, intonation training with drones and ringing tones, sight-reading grading, bow-stroke families, and what the practice-science literature says about scheduling. Use when writing, reviewing or ordering practice content for Fretless, when deciding what an exercise should teach or what level it belongs at, or when a question is about violin technique rather than about code.
---

# Violin pedagogy

Reference for anyone adding practice content to Fretless. It exists because
the failure mode of a generated curriculum is not a crash: it is an exercise
that runs perfectly and teaches the wrong thing, or teaches the right thing in
the wrong order, and nothing in the build catches that.

Everything below is sourced. When you add content, cite it the same way — the
`source` field on `Exercise` is not decoration.

## The one rule

**A drill without a stated goal is time spent, not practice.** Every exercise
must be able to finish the sentence "listen for ___ while you play this". If
it cannot, it is not ready to ship. This is why `Exercise::howTo` is required
and why a test fails when it is empty.

---

## 1. The Suzuki method

A philosophy first, a repertoire second. The philosophy is the "mother tongue"
approach: children learn to speak by immersion, imitation and repetition long
before they learn to read, so they should learn music the same way.

The principles that matter for a practice tool:

| Principle | What it means here |
|---|---|
| **Listening** | Daily listening to the piece, before and during learning it. A tool cannot supply this, but it should not pretend reading replaces it. |
| **Tonalization** | A daily tone study — matching a fingered note to the open string above or below it. Suzuki put it before every lesson. Implemented as `ExerciseKind::RingTone`. |
| **Review** | Old pieces are replayed forever, not retired. This is why `Progress` keeps a `lastPlayed` per exercise and why the practice plan surfaces things that have waited. |
| **One point at a time** | A lesson changes one variable. This is the constraint the level bands enforce. |
| **Reading comes later** | Deliberately. The Reading module is a separate track, not a prerequisite. |

### Why Book 1 opens with variations

Suzuki's Book 1 begins with five rhythmic variations on "Twinkle" before the
theme itself. The pitches never change, so a beginner meets five bowing
patterns while only having to think about four notes. The theme is played
last, because a student who can play the variations can already play it.

The five rhythms, as implemented in `Repertoire.cpp`:

| | Pattern (per beat) | Teaches | Mnemonic |
|---|---|---|---|
| A | 4 sixteenths, then 2 eighths | detaché into staccato | "Mississippi Hot Dog" |
| B | 2 eighths, then 4 sixteenths | the retrograde of A | |
| C | eighth, two sixteenths | long/short bow division | "run pony" |
| D | triplet | six even notes to the bar-pair | "chocolate" |
| E | four sixteenths | even detaché at the middle | |

Variation B is published as the retrograde of A; the descriptions of A, D and E
(sixteenths into staccato eighths, six equal notes, eight equal sixteenths) are
attested directly.

### The ten books

Encoded in `buildSuzuki()` as reference cards. The volumes and their technical
focus:

1. Detaché, staccato, hooked bowing. First position, A and D major.
2. Extended finger patterns, slurred crossings. G and C major.
3. **Third position**, first vibrato, early double stops.
4. First concertos (Seitz, Vivaldi). Second and fourth position.
5. **Fifth position**, spiccato and collé.
6. Sixth and seventh position, baroque phrasing (La Folia, Handel).
7. Bach A minor concerto. Three-octave scales with double stops.
8. Unaccompanied Bach, trills, three-octave D and E major.
9. Mozart Concerto No. 5 in A, K. 219.
10. Mozart Concerto No. 4 in D, K. 218.

### Copyright

The Suzuki *editions* are copyrighted. The underlying melodies mostly are not:
"Twinkle" is a French tune from 1761, "Lightly Row" is *Hänschen klein*, "Go
Tell Aunt Rhody" descends from Rousseau's 1752 *Le Devin du village*. Encoding
a public-domain melody from scratch is fine; transcribing a Suzuki engraving is
not. When in doubt, ship a reference card instead of a transcription.

---

## 2. Warm-up

Roughly ten minutes, and it is not "scales played slowly". Structure:

1. **Long tones (son filé)** on open strings. Whole bows, one speed, parallel
   to the bridge. Pitch wobble here is a *bow* fault, not a finger fault.
2. **Open-string crossings.** The arm must reach the new string level before
   the bow does. Four shapes: alternating, two-and-two, bariolage (out and
   back), and its mirror.
3. **Left-hand finger gymnastics.** Schradieck Op. 1 Part 1 and Ševčík Op. 1
   are the standard sources; the four first-position finger patterns are the
   beginner version.
4. **Tonalization** before anything musical.

Then a slow scale, then the day's work.

---

## 3. Scales

Two systems dominate: **Flesch** (*Scale System*, heavy on double stops) and
**Galamian** (*Contemporary Violin Technique*, heavy on rhythm and bowing).
Galamian's is built on the "hand frame" — first and fourth fingers define an
octave — so his fingerings start on the first finger and the octave is the
structural unit.

The ladder both agree on:

1. One octave, first position, starting on an open string (A, D, then G, C).
2. Two octaves with one shift each way, taken under a slur so the shift cannot
   hide behind a bow change.
3. Three octaves — the standard audition scale.
4. Arpeggios inside each key: major, minor, dominant 7th, diminished 7th.
5. Broken thirds and chromatic scales.

**Galamian's acceleration** is the exercise worth knowing: the same pitches
taken 1, 2, 3, 4, 6 and 8 notes to a bow. The left hand ends up at four times
its starting speed without ever having been asked to go faster, which is the
point — speed is a bowing problem before it is a fingering problem.

**Melodic minor is the only scale that is not its own reverse.** Raised sixth
and seventh ascending, natural descending. Getting this wrong in a table is
silent and there is a test for it.

---

## 4. Intonation

A tuner tells you a note is twelve cents sharp. It does not tell you *why*.
The instrument itself is a better reference, and there are two ways to use it.

### Ringing tones

Notes in first position that share a pitch class with an open string make the
whole violin resonate when they are in tune. There are only a handful:

| String | Ringing notes in first position |
|---|---|
| G | G3 (open), A3, D4 |
| D | D4 (open), E4, G4, A4 |
| A | A4 (open), D5, E5 |
| E | E5 (open), G5, A5 |

The finger is moved until the body of the violin joins in. No tuner involved,
and the skill transfers to the concert hall.

### Drones

A sustained tonic underneath a scale, one degree per bar, held until the
beating between the two pitches slows and stops. This trains *just* intonation
rather than equal temperament: against a drone, thirds settle lower than a
tuner wants and fifths settle wider. Both are correct.

**A drone through speakers is heard by the microphone.** The pitch detector
will grade the drone. Drone exercises need headphones, and the UI says so.

---

## 5. Bow strokes

Three families, and the teaching order is not negotiable — everything in the
second and third families is built from the first.

| Family | Strokes | Note length |
|---|---|---|
| On the string, full length | détaché, legato, portato | full |
| On the string, with air | martelé, staccato, marcato | shortened |
| Off the string | spiccato, sautillé, ricochet | shortened, bow leaves |

Beginner: détaché, legato, staccato, whole bows, pizzicato.
Intermediate: martelé, spiccato, collé, hooked bowing, string crossing, bariolage.
Advanced: sautillé, ricochet, tremolo, flying staccato, son filé.

Collé is a slow-motion spiccato and is how spiccato is taught; aiming for the
bounce directly produces an uncontrolled one.

---

## 6. Sight reading

The one skill that cannot be practised by repetition — the second time through
is not sight reading. Hence `Exercise::freshEveryTime`.

What the literature and teaching practice agree on:

- **Rhythm before pitch.** Rhythm is where sight reading fails. Clap or tap it
  first; break complex figures into smaller units.
- **A steady tempo beats correct notes.** A reader who stops to fix a wrong
  note is training themselves to stop. Choose a tempo you can hold to the end.
- **Read below your playing level.** Material slightly easier than what you
  can play is where reading improves.
- **Pattern recognition, not note-by-note decoding** (Hodgson) — but not
  *instead* of being able to name a note, which is why the Reading module has a
  separate note-naming drill with disconnected pitches.
- Skilled and unskilled readers differ measurably in eye movement (Goolsby,
  1994), which is a fluency effect, not a knowledge one.

Grade one variable at a time: first the rhythm vocabulary, then the interval
size, then the range. Widening two at once stops it being graded.

---

## 7. How to schedule practice

Three findings, all of which the practice plan is built on:

- **Interleaving beats blocking.** Alternating between tasks feels worse during
  the session and retains better afterwards; repeated events get less
  processing. Immediate fluency is a poor predictor of long-term learning.
- **Spacing beats massing.** The same total time spread over days beats
  cramming. An exercise untouched for a week is worth more than a fourth run
  at today's.
- **Varied practice.** Same passage from different angles — tempo changed,
  rhythm changed, bowing changed.

On gamification: a meta-analysis finds it reliably improves *motivation*,
*autonomy* and *relatedness*, and has minimal effect on *competence*. Read
that as a warning. Streaks and stars get a player to the instrument; they do
not make anyone play better, and a design that leans on them instead of on
feedback quality is optimising the wrong number.

---

## References

Loaded on demand, not up front:

- `references/sources.md` — the full source list with URLs, and what each was
  used for.
