#include "fretless/curriculum/Generators.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>

#include "fretless/curriculum/Repertoire.h"
#include "fretless/curriculum/ScoreBuilder.h"

namespace fretless::curriculum {
namespace {

// ═══════════════════════════════════════════════════════════════════════════
//  Deterministic randomness
//
//  Sight reading needs different bars every attempt, and a bug report needs
//  the same bars twice. A seeded xorshift gives both, costs nothing, and does
//  not drag <random> and its per-platform distribution differences in.
// ═══════════════════════════════════════════════════════════════════════════
class Rng {
public:
    explicit Rng(std::uint32_t seed) noexcept
        : state_(seed == 0 ? 0x9E3779B9u : seed) {}

    std::uint32_t next() noexcept {
        state_ ^= state_ << 13;
        state_ ^= state_ >> 17;
        state_ ^= state_ << 5;
        return state_;
    }
    /// Uniform in [0, bound).
    int below(int bound) noexcept {
        return (bound <= 0) ? 0 : static_cast<int>(next() % static_cast<std::uint32_t>(bound));
    }
    bool chance(int percent) noexcept { return below(100) < percent; }

private:
    std::uint32_t state_;
};

// ── Rhythm vocabulary ──────────────────────────────────────────────────────
// Each cell is a list of quarter-note durations. Cells are whole numbers of
// beats so they can be laid end to end without leaving a bar half full.
struct RhythmCell {
    const char*                name;
    std::array<double, 16>     durations;   ///< 0 terminates
};

constexpr RhythmCell kRhythms[] = {
    {"Semínimas firmes",       {{1, 1, 1, 1}}},
    {"Colcheias",              {{0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5}}},
    {"Mínima e semínimas",     {{2, 1, 1}}},
    {"Semínima pontuada e colcheia", {{1.5, 0.5, 1.5, 0.5}}},
    {"Colcheia pontuada e semicolcheia", {{0.75, 0.25, 0.75, 0.25, 0.75, 0.25, 0.75, 0.25}}},
    {"Síncope",                {{0.5, 1, 0.5, 0.5, 1, 0.5}}},
    {"Tercinas",               {{1.0 / 3, 1.0 / 3, 1.0 / 3, 1.0 / 3, 1.0 / 3, 1.0 / 3,
                                 1.0 / 3, 1.0 / 3, 1.0 / 3, 1.0 / 3, 1.0 / 3, 1.0 / 3}}},
    {"Semicolcheias",          {{0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25,
                                 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25}}},
    {"Quatro e duas (Suzuki A)", {{0.25, 0.25, 0.25, 0.25, 0.5, 0.5,
                                 0.25, 0.25, 0.25, 0.25, 0.5, 0.5}}},
    {"Longa, curta-curta",     {{0.5, 0.25, 0.25, 0.5, 0.25, 0.25,
                                 0.5, 0.25, 0.25, 0.5, 0.25, 0.25}}},
    {"Compasso composto, 6/8", {{0.5, 0.5, 0.5, 0.5, 0.5, 0.5}}},
    {"Semibreves",             {{4}}},
};
constexpr int kRhythmCount = static_cast<int>(std::size(kRhythms));

// ── Sight-reading grades ──────────────────────────────────────────────────
// Each grade widens exactly one thing at a time: first the rhythm vocabulary,
// then the interval size, then the range. Widening two at once is how a
// "graded" reading course stops being graded.
struct ReadingGrade {
    const char* label;
    double      durations[6];   ///< pool to draw from; 0 terminates
    int         maxLeap;        ///< in scale degrees
    int         leapPercent;
};

constexpr ReadingGrade kGrades[] = {
    {"graus conjuntos, semínimas e mínimas", {2, 1, 1, 1, 0, 0},   1,  0},
    {"graus e terças, com colcheias",   {2, 1, 1, 0.5, 0.5, 0},    2, 25},
    {"saltos até a quinta, pontuados",  {1.5, 1, 1, 0.5, 0.5, 2},  4, 35},
    {"semicolcheias e saltos largos",   {1, 0.5, 0.5, 0.25, 0.25, 1.5}, 6, 45},
};
constexpr int kGradeCount = static_cast<int>(std::size(kGrades));

/// Every pitch of the major scale of `fifths` that falls in [low, high].
std::vector<int> keyPitches(int fifths, int low, int high) {
    // Circle of fifths: the tonic's pitch class is 7 semitones per step.
    const int tonicClass = ((fifths * 7) % 12 + 12) % 12;
    static constexpr int kMajor[7] = {0, 2, 4, 5, 7, 9, 11};

    std::vector<int> out;
    for (int midi = low; midi <= high; ++midi) {
        const int degree = ((midi - tonicClass) % 12 + 12) % 12;
        if (std::find(std::begin(kMajor), std::end(kMajor), degree) != std::end(kMajor)) {
            out.push_back(midi);
        }
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Builders, one per ExerciseKind
// ═══════════════════════════════════════════════════════════════════════════

void applyBow(ScoreBuilder& builder, BowPattern pattern) {
    const int span = notesPerBow(pattern);
    builder.bow(span > 0 ? span : 1);
}

/// The pitches of one full run: up `octaves`, then back down.
std::vector<int> scaleRun(const Recipe& recipe) {
    const auto up   = scaleOffsets(recipe.scale);
    const auto down = descendingOffsets(recipe.scale);
    if (up.empty()) {
        return {recipe.tonicMidi};
    }

    std::vector<int> pitches;
    pitches.reserve(static_cast<std::size_t>(up.size() * 2 * recipe.octaves + 2));

    for (int octave = 0; octave < std::max(1, recipe.octaves); ++octave) {
        for (const int offset : up) {
            pitches.push_back(recipe.tonicMidi + octave * 12 + offset);
        }
    }
    pitches.push_back(recipe.tonicMidi + std::max(1, recipe.octaves) * 12);

    if (recipe.descend) {
        for (int octave = std::max(1, recipe.octaves) - 1; octave >= 0; --octave) {
            for (auto it = down.rbegin(); it != down.rend(); ++it) {
                pitches.push_back(recipe.tonicMidi + octave * 12 + *it);
            }
        }
        // The run closes on the tonic it started from, not on the second
        // degree: a scale that stops one note short never sounds finished.
        if (pitches.back() != recipe.tonicMidi) {
            pitches.push_back(recipe.tonicMidi);
        }
    }
    return pitches;
}

void buildScaleInto(ScoreBuilder& builder, const Recipe& recipe) {
    if (recipe.scale == ScaleType::BrokenThirds) {
        // 1-3, 2-4, 3-5 … the drill that makes a hand frame audible.
        const auto offsets = scaleOffsets(ScaleType::Major);
        const int span = static_cast<int>(offsets.size());
        for (int octave = 0; octave < std::max(1, recipe.octaves); ++octave) {
            for (int degree = 0; degree < span; ++degree) {
                const int rootOctave = octave + (degree / span);
                const int upper      = degree + 2;
                builder.note(recipe.tonicMidi + rootOctave * 12 + offsets[static_cast<std::size_t>(degree)],
                             recipe.noteQuarters);
                builder.note(recipe.tonicMidi + (upper / span + rootOctave) * 12 +
                                 offsets[static_cast<std::size_t>(upper % span)],
                             recipe.noteQuarters);
            }
        }
        builder.fillBar();
        return;
    }

    const auto pitches = scaleRun(recipe);
    for (int pass = 0; pass < std::max(1, recipe.repeats); ++pass) {
        if (recipe.bow == BowPattern::Acceleration) {
            // Galamian's acceleration: the same pitches, taken 1, 2, 3, 4, 6
            // and 8 to a bow. Speed is a bowing problem long before it is a
            // left-hand one, and this is the exercise that says so.
            static constexpr int kSteps[] = {1, 2, 3, 4, 6, 8};
            for (const int span : kSteps) {
                builder.bow(span);
                for (const int midi : pitches) {
                    builder.note(midi, recipe.noteQuarters);
                }
                builder.fillBar();
            }
        } else {
            applyBow(builder, recipe.bow);
            for (const int midi : pitches) {
                builder.note(midi, recipe.noteQuarters);
            }
            builder.fillBar();
        }
    }
}

void buildLongToneInto(ScoreBuilder& builder, const Recipe& recipe) {
    // Whole bows on the open strings. The point is the sound, not the notes,
    // so each one is held long enough for the bow to run out and be told off.
    const int first = (recipe.string >= 0) ? recipe.string : 0;
    const int last  = (recipe.string >= 0) ? recipe.string : score::kStringCount - 1;

    for (int pass = 0; pass < std::max(1, recipe.repeats); ++pass) {
        for (int string = first; string <= last; ++string) {
            const int midi = score::kOpenStringMidi[string];
            const double hold = std::max(1.0, recipe.noteQuarters);
            builder.note(midi, hold);
            builder.note(midi, hold);
            builder.fillBar();
        }
    }
}

void buildStringCrossingInto(ScoreBuilder& builder, const Recipe& recipe) {
    const int lowString  = std::clamp(recipe.string, 0, score::kStringCount - 1);
    const int highString = std::clamp(
        recipe.otherString >= 0 ? recipe.otherString : lowString + 1,
        0, score::kStringCount - 1);

    const int low  = score::kOpenStringMidi[lowString];
    const int high = score::kOpenStringMidi[highString];

    // Four shapes, hardest last: alternating, doubled, bariolage (the return
    // to the same string that makes the arm change direction twice per beat),
    // and a rocking figure.
    static constexpr int kShapes[4][4] = {
        {0, 1, 0, 1},
        {0, 0, 1, 1},
        {0, 1, 1, 0},
        {1, 0, 0, 1},
    };
    const auto& shape = kShapes[std::clamp(recipe.pattern, 0, 3)];

    applyBow(builder, recipe.bow);
    for (int pass = 0; pass < std::max(1, recipe.repeats); ++pass) {
        for (const int which : shape) {
            builder.note(which == 0 ? low : high, recipe.noteQuarters);
        }
    }
    builder.fillBar();
}

void buildSingleStringInto(ScoreBuilder& builder, const Recipe& recipe) {
    // Everything on one string, which is the only way to practise a shift: as
    // soon as a crossing is allowed the hand takes the easy way out.
    const int string = std::clamp(recipe.string, 0, score::kStringCount - 1);
    const int open   = score::kOpenStringMidi[string];
    const auto offsets = scaleOffsets(recipe.scale);
    if (offsets.empty()) {
        return;
    }

    // A position is roughly two semitones of hand travel; first position
    // reaches a fourth finger seven semitones above the open string.
    const int ceiling = open + 7 + (std::max(1, recipe.maxPosition) - 1) * 2;

    std::vector<int> pitches;
    for (int octave = 0; octave < 3; ++octave) {
        for (const int offset : offsets) {
            const int midi = recipe.tonicMidi + octave * 12 + offset;
            if (midi >= open && midi <= ceiling) {
                pitches.push_back(midi);
            }
        }
    }
    std::sort(pitches.begin(), pitches.end());
    pitches.erase(std::unique(pitches.begin(), pitches.end()), pitches.end());
    if (pitches.empty()) {
        return;
    }

    applyBow(builder, recipe.bow);
    for (int pass = 0; pass < std::max(1, recipe.repeats); ++pass) {
        for (const int midi : pitches) {
            builder.note(midi, recipe.noteQuarters);
        }
        if (recipe.descend) {
            for (auto it = pitches.rbegin() + 1; it != pitches.rend(); ++it) {
                builder.note(*it, recipe.noteQuarters);
            }
        }
        builder.fillBar();
    }
}

void buildFingerPatternInto(ScoreBuilder& builder, const Recipe& recipe) {
    const int first = (recipe.string >= 0) ? recipe.string : 0;
    const int last  = (recipe.string >= 0) ? recipe.string : score::kStringCount - 1;
    const auto offsets = fingerPattern(recipe.pattern);

    applyBow(builder, recipe.bow);
    for (int pass = 0; pass < std::max(1, recipe.repeats); ++pass) {
        for (int string = first; string <= last; ++string) {
            const int open = score::kOpenStringMidi[string];
            for (const int offset : offsets) {
                builder.note(open + offset, recipe.noteQuarters);
            }
            for (auto it = offsets.rbegin() + 1; it != offsets.rend(); ++it) {
                builder.note(open + *it, recipe.noteQuarters);
            }
            builder.fillBar();
        }
    }
}

void buildRingToneInto(ScoreBuilder& builder, const Recipe& recipe) {
    // Open string, then the fingered note that shares its pitch class with
    // another open string. When the fingered note is right the instrument
    // answers on its own — an intonation check that needs no tuner.
    const int first = (recipe.string >= 0) ? recipe.string : 0;
    const int last  = (recipe.string >= 0) ? recipe.string : score::kStringCount - 1;
    const double hold = std::max(1.0, recipe.noteQuarters);

    for (int pass = 0; pass < std::max(1, recipe.repeats); ++pass) {
        for (int string = first; string <= last; ++string) {
            const auto tones = ringingTones(string);
            if (tones.size() < 2) {
                continue;
            }
            const int open = tones.front();
            for (std::size_t i = 1; i < tones.size(); ++i) {
                builder.note(open, hold);
                builder.note(tones[i], hold);
            }
            builder.fillBar();
        }
    }
}

void buildDroneIntervalInto(ScoreBuilder& builder, const Recipe& recipe) {
    // One degree at a time against the drone, held long enough for the beating
    // between the two pitches to become audible and then disappear.
    const auto offsets = scaleOffsets(recipe.scale);
    const double hold = std::max(2.0, recipe.noteQuarters);

    for (int pass = 0; pass < std::max(1, recipe.repeats); ++pass) {
        for (const int offset : offsets) {
            builder.note(recipe.tonicMidi + offset, hold);
            builder.fillBar();
        }
        builder.note(recipe.tonicMidi + 12, hold);
        builder.fillBar();
    }
}

void buildRhythmInto(ScoreBuilder& builder, const Recipe& recipe) {
    // One pitch, so nothing but the rhythm can be wrong. An open string is the
    // usual choice because it removes the left hand from the problem too.
    const auto& cell = kRhythms[std::clamp(recipe.pattern, 0, kRhythmCount - 1)];
    const int midi = recipe.tonicMidi;

    applyBow(builder, recipe.bow);
    for (int pass = 0; pass < std::max(2, recipe.repeats); ++pass) {
        for (const double duration : cell.durations) {
            if (duration <= 0.0) {
                break;
            }
            builder.note(midi, duration);
        }
    }
    builder.fillBar();
}

void buildPieceInto(ScoreBuilder& builder, const Recipe& recipe) {
    const PieceData* piece = pieceAt(recipe.pieceIndex);
    if (piece == nullptr) {
        return;
    }
    const int variation = std::clamp(recipe.pattern, 0, kVariationCount - 1);

    if (variation == 0) {
        applyBow(builder, recipe.bow);
        for (std::size_t i = 0; i < piece->count; ++i) {
            builder.note(piece->notes[i].midi,
                         static_cast<double>(piece->notes[i].quarters));
        }
        builder.fillBar();
        return;
    }

    // A variation subdivides every quarter note of the theme, keeping the
    // pitch. Notes longer than a quarter take one cell per quarter they last,
    // which is how a half note becomes two groups in the printed variations.
    int beat = 0;
    float subdivisions[8] = {};
    for (std::size_t i = 0; i < piece->count; ++i) {
        const PieceNote& note = piece->notes[i];
        if (note.midi < 0) {
            builder.rest(static_cast<double>(note.quarters));
            continue;
        }
        double left = static_cast<double>(note.quarters);
        while (left > 1e-6) {
            const double slice = std::min(1.0, left);
            const std::size_t count =
                variationBeat(variation, beat, subdivisions, std::size(subdivisions));
            for (std::size_t s = 0; s < count; ++s) {
                builder.note(note.midi, static_cast<double>(subdivisions[s]) * slice);
            }
            left -= slice;
            ++beat;
        }
    }
    builder.fillBar();
}

void buildSightReadingInto(ScoreBuilder& builder, const Recipe& recipe, Rng& rng) {
    const auto& grade = kGrades[std::clamp(recipe.pattern, 0, kGradeCount - 1)];
    const auto pitches = keyPitches(recipe.fifths, recipe.lowMidi, recipe.highMidi);
    if (pitches.size() < 3) {
        return;
    }

    const double barQuarters = static_cast<double>(recipe.beats) * 4.0 /
                               static_cast<double>(recipe.beatUnit);

    int pool = 0;
    while (pool < 6 && grade.durations[pool] > 0.0) {
        ++pool;
    }

    int index = static_cast<int>(pitches.size()) / 2;
    const int bars = std::max(2, recipe.bars);

    for (int bar = 0; bar < bars; ++bar) {
        double left = barQuarters;
        while (left > 1e-6) {
            double duration = grade.durations[rng.below(pool)];
            if (duration > left) {
                duration = left;      // never spill a note across the bar line
            }

            // The last bar lands on the tonic: an exercise that stops in mid
            // air teaches the ear that phrases do not need to resolve.
            const bool finalNote = (bar == bars - 1) &&
                                   (left - duration <= 1e-6);
            if (finalNote) {
                const int tonicClass = ((recipe.fifths * 7) % 12 + 12) % 12;
                int best = index;
                int bestDistance = 128;
                for (int candidate = 0; candidate < static_cast<int>(pitches.size()); ++candidate) {
                    if (((pitches[static_cast<std::size_t>(candidate)] % 12) + 12) % 12 != tonicClass) {
                        continue;
                    }
                    const int distance = std::abs(candidate - index);
                    if (distance < bestDistance) {
                        best = candidate;
                        bestDistance = distance;
                    }
                }
                index = best;
            } else {
                const int leap = recipe.stepwiseOnly
                    ? 1
                    : (rng.chance(grade.leapPercent) ? 1 + rng.below(grade.maxLeap) : 1);
                index += rng.chance(50) ? leap : -leap;
                index = std::clamp(index, 0, static_cast<int>(pitches.size()) - 1);
            }

            builder.note(pitches[static_cast<std::size_t>(index)], duration);
            left -= duration;
        }
    }
    builder.fillBar();
}

void buildIntervalReadingInto(ScoreBuilder& builder, const Recipe& recipe, Rng& rng) {
    // Not a melody: isolated notes, held, so the eye has to name each one from
    // scratch rather than ride the contour of a phrase. Pattern-reading is a
    // good habit that hides an inability to name a note on sight.
    const auto pitches = keyPitches(recipe.fifths, recipe.lowMidi, recipe.highMidi);
    if (pitches.empty()) {
        return;
    }
    const int count = std::max(8, recipe.bars * recipe.beats);
    for (int i = 0; i < count; ++i) {
        builder.note(pitches[static_cast<std::size_t>(rng.below(static_cast<int>(pitches.size())))],
                     std::max(1.0, recipe.noteQuarters));
    }
    builder.fillBar();
}

}  // namespace

// ═══════════════════════════════════════════════════════════════════════════
//  Vocabulary
// ═══════════════════════════════════════════════════════════════════════════

const char* toString(ScaleType type) noexcept {
    switch (type) {
        case ScaleType::Major:               return "maior";
        case ScaleType::NaturalMinor:        return "menor natural";
        case ScaleType::HarmonicMinor:       return "menor harmônica";
        case ScaleType::MelodicMinor:        return "menor melódica";
        case ScaleType::Chromatic:           return "cromática";
        case ScaleType::PentatonicMajor:     return "pentatônica maior";
        case ScaleType::Dorian:              return "dórica";
        case ScaleType::Mixolydian:          return "mixolídia";
        case ScaleType::WholeTone:           return "de tons inteiros";
        case ScaleType::ArpeggioMajor:       return "arpejo maior";
        case ScaleType::ArpeggioMinor:       return "arpejo menor";
        case ScaleType::ArpeggioDominant7:   return "arpejo de sétima da dominante";
        case ScaleType::ArpeggioDiminished7: return "arpejo de sétima diminuta";
        case ScaleType::BrokenThirds:        return "terças quebradas";
    }
    return "escala";
}

const char* toString(BowPattern pattern) noexcept {
    switch (pattern) {
        case BowPattern::Separate:     return "arcadas separadas";
        case BowPattern::Slur2:        return "2 por arcada";
        case BowPattern::Slur3:        return "3 por arcada";
        case BowPattern::Slur4:        return "4 por arcada";
        case BowPattern::Slur6:        return "6 por arcada";
        case BowPattern::Slur8:        return "8 por arcada";
        case BowPattern::Slur12:       return "12 por arcada";
        case BowPattern::Acceleration: return "1-2-3-4-6-8 por arcada";
    }
    return "arcadas separadas";
}

int notesPerBow(BowPattern pattern) noexcept {
    switch (pattern) {
        case BowPattern::Separate:     return 1;
        case BowPattern::Slur2:        return 2;
        case BowPattern::Slur3:        return 3;
        case BowPattern::Slur4:        return 4;
        case BowPattern::Slur6:        return 6;
        case BowPattern::Slur8:        return 8;
        case BowPattern::Slur12:       return 12;
        case BowPattern::Acceleration: return 0;
    }
    return 1;
}

std::vector<int> scaleOffsets(ScaleType type) {
    switch (type) {
        case ScaleType::Major:           return {0, 2, 4, 5, 7, 9, 11};
        case ScaleType::NaturalMinor:    return {0, 2, 3, 5, 7, 8, 10};
        case ScaleType::HarmonicMinor:   return {0, 2, 3, 5, 7, 8, 11};
        case ScaleType::MelodicMinor:    return {0, 2, 3, 5, 7, 9, 11};
        case ScaleType::Chromatic:       return {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
        case ScaleType::PentatonicMajor: return {0, 2, 4, 7, 9};
        case ScaleType::Dorian:          return {0, 2, 3, 5, 7, 9, 10};
        case ScaleType::Mixolydian:      return {0, 2, 4, 5, 7, 9, 10};
        case ScaleType::WholeTone:       return {0, 2, 4, 6, 8, 10};
        case ScaleType::ArpeggioMajor:   return {0, 4, 7};
        case ScaleType::ArpeggioMinor:   return {0, 3, 7};
        case ScaleType::ArpeggioDominant7:   return {0, 4, 7, 10};
        case ScaleType::ArpeggioDiminished7: return {0, 3, 6, 9};
        case ScaleType::BrokenThirds:    return {0, 2, 4, 5, 7, 9, 11};
    }
    return {0, 2, 4, 5, 7, 9, 11};
}

std::vector<int> descendingOffsets(ScaleType type) {
    // The one scale that is not its own reverse. Coming down, the raised sixth
    // and seventh go back to where the key signature put them.
    if (type == ScaleType::MelodicMinor) {
        return {0, 2, 3, 5, 7, 8, 10};
    }
    return scaleOffsets(type);
}

int fifthsFor(int tonicMidi, ScaleType type) noexcept {
    const int pitchClass = ((tonicMidi % 12) + 12) % 12;
    // Major keys around the circle of fifths, indexed by pitch class.
    // C=0 G=1 D=2 A=3 E=4 B=5 F#=6 -> beyond that flats read better.
    static constexpr int kMajorFifths[12] = {
        0,   // C
        -5,  // Db
        2,   // D
        -3,  // Eb
        4,   // E
        -1,  // F
        -6,  // Gb
        1,   // G
        -4,  // Ab
        3,   // A
        -2,  // Bb
        5,   // B
    };
    int fifths = kMajorFifths[pitchClass];

    switch (type) {
        case ScaleType::NaturalMinor:
        case ScaleType::HarmonicMinor:
        case ScaleType::MelodicMinor:
        case ScaleType::ArpeggioMinor:
            fifths -= 3;   // the relative major is a minor third up
            break;
        case ScaleType::Dorian:
            fifths -= 2;
            break;
        case ScaleType::Mixolydian:
            fifths -= 1;
            break;
        case ScaleType::Chromatic:
        case ScaleType::WholeTone:
        case ScaleType::ArpeggioDiminished7:
            return 0;      // no key signature helps; write it all as accidentals
        default:
            break;
    }
    return std::clamp(fifths, -7, 7);
}

std::vector<int> ringingTones(int string) {
    const int index = std::clamp(string, 0, score::kStringCount - 1);
    const int open  = score::kOpenStringMidi[index];

    // Anything in first position whose pitch class matches an open string:
    // G, D, A or E. Those are the notes the other three strings answer.
    static constexpr int kOpenClasses[4] = {7, 2, 9, 4};

    std::vector<int> out{open};
    for (int offset = 1; offset <= 7; ++offset) {
        const int midi = open + offset;
        const int pitchClass = ((midi % 12) + 12) % 12;
        if (std::find(std::begin(kOpenClasses), std::end(kOpenClasses), pitchClass) !=
            std::end(kOpenClasses)) {
            out.push_back(midi);
        }
    }
    return out;
}

std::vector<int> fingerPattern(int pattern) {
    // Offsets from the open string for fingers 0-1-2-3-4. The violin's four
    // first-position shapes: which pair of fingers touches.
    switch (std::clamp(pattern, 0, 3)) {
        case 0: return {0, 2, 4, 5, 7};   // high 2 — half step 2-3
        case 1: return {0, 2, 3, 5, 7};   // low 2  — half step 1-2
        case 2: return {0, 1, 3, 5, 7};   // low 1  — half step 0-1
        default: return {0, 2, 4, 6, 7};  // high 3 — half step 3-4
    }
}

const char* fingerPatternName(int pattern) noexcept {
    switch (std::clamp(pattern, 0, 3)) {
        case 0:  return "2 alto - os dedos 2 e 3 se encostam";
        case 1:  return "2 baixo - os dedos 1 e 2 se encostam";
        case 2:  return "1 baixo - o dedo 1 recuado até a pestana";
        default: return "3 alto - os dedos 3 e 4 se encostam";
    }
}

const char* rhythmName(int pattern) noexcept {
    return kRhythms[std::clamp(pattern, 0, kRhythmCount - 1)].name;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Entry point
// ═══════════════════════════════════════════════════════════════════════════

score::Score buildScore(const Exercise& exercise, std::uint32_t seed) {
    const Recipe& recipe = exercise.recipe;
    Rng rng(seed);

    ScoreBuilder builder;
    builder.title(exercise.title)
           .tempo(static_cast<double>(exercise.defaultBpm))
           .meter(recipe.beats, recipe.beatUnit)
           .key(recipe.fifths);

    switch (exercise.kind) {
        case ExerciseKind::Piece: {
            const PieceData* piece = pieceAt(recipe.pieceIndex);
            if (piece != nullptr) {
                builder.composer(piece->composer)
                       .meter(piece->beats, piece->beatUnit)
                       .key(piece->fifths);
            }
            buildPieceInto(builder, recipe);
            break;
        }
        case ExerciseKind::LongTone:       buildLongToneInto(builder, recipe); break;
        case ExerciseKind::Scale:          buildScaleInto(builder, recipe); break;
        case ExerciseKind::StringCrossing: buildStringCrossingInto(builder, recipe); break;
        case ExerciseKind::SingleString:   buildSingleStringInto(builder, recipe); break;
        case ExerciseKind::FingerPattern:  buildFingerPatternInto(builder, recipe); break;
        case ExerciseKind::RingTone:       buildRingToneInto(builder, recipe); break;
        case ExerciseKind::DroneInterval:  buildDroneIntervalInto(builder, recipe); break;
        case ExerciseKind::Rhythm:         buildRhythmInto(builder, recipe); break;
        case ExerciseKind::SightReading:   buildSightReadingInto(builder, recipe, rng); break;
        case ExerciseKind::IntervalReading:buildIntervalReadingInto(builder, recipe, rng); break;
        case ExerciseKind::Reference:      break;   // a card, not a drill
    }

    return builder.build();
}

}  // namespace fretless::curriculum
