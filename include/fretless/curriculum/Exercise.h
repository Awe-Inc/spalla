// ═══════════════════════════════════════════════════════════════════════════
//  Exercise.h — one practice item, and the tree they live in.
//
//  A "song" in the original engine was a MusicXML file on disk. That works for
//  repertoire and is hopeless for technique: a scale system is the same shape
//  in twelve keys, three octaves and eight rhythms, and nobody wants to ship
//  two thousand files to say so.
//
//  So an Exercise carries a RECIPE, not a score. The score is built on demand
//  from the recipe (see Generators.h), which means every key, every string and
//  every rhythm variant costs one line of table rather than one file. Written
//  out repertoire is still supported — it is one more recipe kind that happens
//  to point at an embedded melody.
//
//  The field that matters pedagogically is `howTo`. The deliberate-practice
//  literature is consistent that a drill without a stated goal is time spent
//  rather than practice, so every exercise here says what to listen for.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "fretless/score/Score.h"

namespace fretless::curriculum {

// ───────────────────────────────────────────────────────────────────────────
//  Musical vocabulary
// ───────────────────────────────────────────────────────────────────────────

/// The scale families a violinist actually drills. Modes are deliberately
/// absent from the beginner path and present in the advanced one.
enum class ScaleType : std::uint8_t {
    Major,
    NaturalMinor,
    HarmonicMinor,
    MelodicMinor,        ///< raised 6-7 ascending, natural descending
    Chromatic,
    PentatonicMajor,
    Dorian,
    Mixolydian,
    WholeTone,
    ArpeggioMajor,       ///< 1-3-5-8
    ArpeggioMinor,
    ArpeggioDominant7,
    ArpeggioDiminished7,
    BrokenThirds,        ///< 1-3 2-4 3-5 … the interval drill
};

[[nodiscard]] const char* toString(ScaleType type) noexcept;

/// How the notes of a generated exercise are laid under the bow. Galamian's
/// scale system is largely this list applied to the same pitches.
enum class BowPattern : std::uint8_t {
    Separate,        ///< one note per bow — detache
    Slur2,
    Slur3,
    Slur4,
    Slur6,
    Slur8,
    Slur12,
    Acceleration,    ///< 1, 2, 3, 4, 6, 8 notes per bow across one run
};

[[nodiscard]] const char* toString(BowPattern pattern) noexcept;
/// Notes under one bow, or 0 for the acceleration pattern.
[[nodiscard]] int notesPerBow(BowPattern pattern) noexcept;

/// What a recipe builds. The generator dispatches on this.
enum class ExerciseKind : std::uint8_t {
    Piece,            ///< an embedded melody: repertoire
    LongTone,         ///< sustained open strings, son file
    Scale,
    StringCrossing,   ///< alternating between two strings
    SingleString,     ///< everything stays on one string, shifts included
    FingerPattern,    ///< 0-1-2-3-4 shapes, whole and half steps
    RingTone,         ///< notes that resonate against an open string
    DroneInterval,    ///< hold a note against a sustained drone
    Rhythm,           ///< one pitch, a rhythm vocabulary
    SightReading,     ///< generated fresh each attempt, from a seed
    IntervalReading,  ///< staff-reading drill: landmarks and steps
    /// Not playable. A card that describes something outside the app — a
    /// volume of a printed method — and says what prepares it. Without this,
    /// a syllabus can only mention what it happens to be able to generate.
    Reference,
};

/// Whether pressing play on this kind produces notes.
[[nodiscard]] constexpr bool isPlayable(ExerciseKind kind) noexcept {
    return kind != ExerciseKind::Reference;
}

// ───────────────────────────────────────────────────────────────────────────
//  Recipe
// ───────────────────────────────────────────────────────────────────────────

/// Parameters for one generated exercise. Every field has a usable default so
/// a table entry only mentions what it actually cares about.
struct Recipe {
    // ── Pitch material ────────────────────────────────────────────────────
    int       tonicMidi = 69;            ///< A4
    ScaleType scale     = ScaleType::Major;
    int       octaves   = 1;
    int       fifths    = 3;             ///< key signature: spelling and staff
    bool      descend   = true;          ///< come back down

    /// The string an exercise is pinned to, for SingleString / LongTone /
    /// StringCrossing. -1 means "wherever the notes fall".
    int  string      = -1;
    int  otherString = -1;               ///< StringCrossing partner

    /// Highest position the generator may use. 1 keeps everything in first
    /// position; 3, 5 and 7 open up the fingerboard.
    int maxPosition = 1;

    // ── Time ──────────────────────────────────────────────────────────────
    double     noteQuarters = 1.0;
    int        beats        = 4;
    int        beatUnit     = 4;
    int        repeats      = 1;
    BowPattern bow          = BowPattern::Separate;

    /// Rhythm vocabulary id for ExerciseKind::Rhythm and difficulty knob for
    /// SightReading. Both index tables in Generators.cpp.
    int pattern = 0;

    // ── Repertoire ────────────────────────────────────────────────────────
    /// Index into the embedded melody table. -1 for generated exercises.
    int pieceIndex = -1;

    // ── Sight reading ─────────────────────────────────────────────────────
    int  lowMidi      = 69;
    int  highMidi     = 81;
    int  bars         = 8;
    bool stepwiseOnly = false;
};

// ───────────────────────────────────────────────────────────────────────────
//  Exercise
// ───────────────────────────────────────────────────────────────────────────

struct Exercise {
    /// Stable across releases: it is the key progress is filed under. Renaming
    /// one silently resets a player's history, so treat it as a schema.
    std::string id;

    std::string title;
    std::string subtitle;   ///< one line, shown in the list
    std::string focus;      ///< the technical target, three or four words
    std::string howTo;      ///< what to listen for while playing it
    std::string source;     ///< provenance and attribution

    /// 1..10, matching the level bands in Curriculum. Used for sorting, for
    /// the practice plan, and for the "you are here" marker.
    int level = 1;

    int defaultBpm = 72;
    int minBpm     = 40;
    int maxBpm     = 200;

    ExerciseKind kind = ExerciseKind::Scale;
    Recipe       recipe{};

    /// A sustained reference pitch played while practising, or -1. Intonation
    /// against a drone is the most effective ear-training drill there is, and
    /// it is impossible without playback.
    int  droneMidi = -1;
    /// Audible click. Off by default: a metronome under a long-tone exercise
    /// is noise, and under a rhythm exercise it is the point.
    bool metronome = false;

    /// Regenerate the score on every attempt instead of caching one. Sight
    /// reading that hands you the same eight bars twice is not sight reading.
    bool freshEveryTime = false;
};

// ───────────────────────────────────────────────────────────────────────────
//  Module
// ───────────────────────────────────────────────────────────────────────────

/// A themed group of exercises: one card on the home screen, one list screen.
struct Module {
    std::string id;
    std::string title;
    std::string tagline;      ///< one line on the card
    std::string description;  ///< a paragraph at the top of the list

    /// Which string colour the card and its rows take, tying the whole UI back
    /// to the four lanes of the highway.
    int accent = 2;

    /// Level band this module spans, for the "recommended next" logic.
    int levelFrom = 1;
    int levelTo   = 10;

    std::vector<Exercise> exercises;
};

/// The whole tree, built once at startup.
struct Curriculum {
    std::vector<Module> modules;

    [[nodiscard]] const Module*   findModule(const std::string& id) const noexcept;
    [[nodiscard]] const Exercise* findExercise(const std::string& id) const noexcept;
    [[nodiscard]] std::size_t exerciseCount() const noexcept;
};

/// Builds the shipped curriculum. Deterministic and allocation-heavy, so call
/// it once and keep the result.
[[nodiscard]] Curriculum buildCurriculum();

}  // namespace fretless::curriculum
