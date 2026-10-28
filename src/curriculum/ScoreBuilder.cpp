#include "fretless/curriculum/ScoreBuilder.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace fretless::curriculum {

ScoreBuilder& ScoreBuilder::meter(int beats, int beatUnit) {
    beats_    = std::max(1, beats);
    beatUnit_ = std::max(1, beatUnit);
    return *this;
}

ScoreBuilder& ScoreBuilder::bow(int notesPerBow) {
    bowSpan_    = std::max(1, notesPerBow);
    bowCounter_ = 0;
    return *this;
}

ScoreBuilder& ScoreBuilder::note(int midi, double quarters) {
    if (quarters <= 0.0) {
        return *this;
    }
    // A rest breaks the bow: you cannot slur across silence. It also resets
    // the counter, so the slur after a rest starts at its own beginning.
    if (midi < 0) {
        events_.push_back({midi, quarters, cursorQuarters_, 1, 0});
        bowCounter_ = 0;
    } else {
        events_.push_back({midi, quarters, cursorQuarters_, bowSpan_,
                           bowCounter_ % bowSpan_});
        ++bowCounter_;
    }
    cursorQuarters_ += quarters;
    return *this;
}

ScoreBuilder& ScoreBuilder::rest(double quarters) {
    return note(-1, quarters);
}

ScoreBuilder& ScoreBuilder::notes(std::initializer_list<int> midis, double quarters) {
    for (const int midi : midis) {
        note(midi, quarters);
    }
    return *this;
}

ScoreBuilder& ScoreBuilder::repeat(int midi, int count, double quarters) {
    for (int i = 0; i < count; ++i) {
        note(midi, quarters);
    }
    return *this;
}

ScoreBuilder& ScoreBuilder::fillBar() {
    const double barQuarters = static_cast<double>(beats_) * 4.0 /
                               static_cast<double>(beatUnit_);
    if (barQuarters <= 0.0) {
        return *this;
    }
    // Floating point creeps in over hundreds of appended notes, so snap the
    // remainder rather than trusting fmod to land exactly on zero.
    const double intoBar = std::fmod(cursorQuarters_, barQuarters);
    const double missing = barQuarters - intoBar;
    if (missing > 1e-6 && missing < barQuarters - 1e-6) {
        rest(missing);
    }
    return *this;
}

score::Score ScoreBuilder::build() const {
    score::Score out;
    out.title           = title_;
    out.composer        = composer_;
    out.partName        = "Violin";
    out.sourcePath      = "generated";
    out.beatsPerMinute  = bpm_;
    out.beatsPerMeasure = beats_;
    out.beatUnit        = beatUnit_;
    out.keyFifths       = fifths_;
    out.tempoMap.push_back({0.0, bpm_});

    // One quarter note lasts 60/bpm seconds by definition of the tempo map,
    // whatever the beat unit is. The beat unit only changes what a *beat* is,
    // which is a display question, not a timing one.
    const double secondsPerQuarter = 60.0 / std::max(1.0, bpm_);
    const double barQuarters = static_cast<double>(beats_) * 4.0 /
                               static_cast<double>(beatUnit_);

    out.events.reserve(events_.size());
    for (const auto& entry : events_) {
        score::ScoreEvent event;
        event.startQuarters   = entry.start;
        event.startSeconds    = entry.start * secondsPerQuarter;
        event.durationSeconds = entry.quarters * secondsPerQuarter;
        event.isRest          = (entry.midi < 0);
        event.midi            = entry.midi;

        const double bar = (barQuarters > 0.0) ? entry.start / barQuarters : 0.0;
        event.measure = static_cast<int>(std::floor(bar)) + 1;
        event.beat    = static_cast<float>(
            (entry.start - std::floor(bar) * barQuarters) *
            static_cast<double>(beatUnit_) / 4.0 + 1.0);

        if (!event.isRest) {
            event.bowSpan         = static_cast<std::uint8_t>(
                std::clamp(entry.bowSpan, 1, 255));
            event.bowSlot         = static_cast<std::uint8_t>(
                std::clamp(entry.bowSlot, 0, 255));
            event.frequencyHz     = score::midiToFrequency(entry.midi);
            event.suggestedString = score::stringForMidi(entry.midi);
            score::writeNoteName(event.noteName, sizeof(event.noteName),
                                 entry.midi, fifths_);
        }
        out.events.push_back(event);
    }
    return out;
}

}  // namespace fretless::curriculum
