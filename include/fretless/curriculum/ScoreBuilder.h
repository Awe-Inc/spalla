// ═══════════════════════════════════════════════════════════════════════════
//  ScoreBuilder.h — build a score::Score in memory, without MusicXML.
//
//  The parser exists to read what other people wrote. Everything Fretless
//  generates itself — scales, string crossings, rhythm drills, sight-reading —
//  would have to be serialised to XML and parsed straight back if it were the
//  only way in. This is the way in.
//
//  It owns exactly the arithmetic the parser does on its way out: quarters to
//  seconds, MIDI to Hz, MIDI to a spelled note name, pitch to the string a
//  violinist would use. Those live in score/ so both paths share one answer.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <initializer_list>
#include <string>

#include "fretless/score/Score.h"

namespace fretless::curriculum {

class ScoreBuilder {
public:
    ScoreBuilder() = default;

    ScoreBuilder& title(std::string value)    { title_ = std::move(value); return *this; }
    ScoreBuilder& composer(std::string value) { composer_ = std::move(value); return *this; }

    /// Quarter notes per minute, as the tempo map stores it.
    ScoreBuilder& tempo(double bpm)           { bpm_ = bpm; return *this; }
    ScoreBuilder& meter(int beats, int beatUnit);
    ScoreBuilder& key(int fifths)             { fifths_ = fifths; return *this; }

    /// Appends one note. Duration is in quarter notes, so a half note is 2.0
    /// whatever the time signature says.
    ScoreBuilder& note(int midi, double quarters);
    ScoreBuilder& rest(double quarters);
    ScoreBuilder& notes(std::initializer_list<int> midis, double quarters);

    /// Appends `midi` `count` times. The commonest shape in a drill.
    ScoreBuilder& repeat(int midi, int count, double quarters);

    /// Pads the current measure out to a full bar with a rest. Called before a
    /// section break so the staff does not draw a half-empty measure.
    ScoreBuilder& fillBar();

    /// How many of the following notes go under one bow. 1 restores separate
    /// bows. The counter resets, so calling it mid-phrase starts a new slur
    /// rather than continuing the previous one at an offset.
    ScoreBuilder& bow(int notesPerBow);

    [[nodiscard]] double positionQuarters() const noexcept { return cursorQuarters_; }
    [[nodiscard]] bool   empty() const noexcept { return events_.empty(); }

    /// Materialises the score. Safe to call more than once.
    [[nodiscard]] score::Score build() const;

private:
    struct Entry {
        int    midi     = -1;
        double quarters = 1.0;
        double start    = 0.0;
        int    bowSpan  = 1;
        int    bowSlot  = 0;
    };

    std::string title_;
    std::string composer_ = "Fretless";
    double      bpm_      = 72.0;
    int         beats_    = 4;
    int         beatUnit_ = 4;
    int         fifths_   = 0;

    std::vector<Entry> events_;
    double             cursorQuarters_ = 0.0;
    int                bowSpan_        = 1;
    int                bowCounter_     = 0;
};

}  // namespace fretless::curriculum
