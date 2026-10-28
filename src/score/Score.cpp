#include "fretless/score/Score.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace fretless::score {

float midiToFrequency(int midi) noexcept {
    return 440.0f * std::pow(2.0f, static_cast<float>(midi - 69) / 12.0f);
}

void writeNoteName(char* out, std::size_t outSize, int midi, int fifths) noexcept {
    if (out == nullptr || outSize == 0) {
        return;
    }
    if (midi < 0) {
        out[0] = '\0';
        return;
    }
    // Flat keys spell the black notes as flats. Getting this wrong does not
    // change the pitch, but it does change what the player is reading, and a
    // drill that says "A#" while the staff shows B-flat teaches the wrong name.
    static constexpr const char* kSharp[12] = {
        "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
    static constexpr const char* kFlat[12] = {
        "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"};

    const int pitchClass = ((midi % 12) + 12) % 12;
    const int octave     = midi / 12 - 1;
    const char* name = (fifths < 0) ? kFlat[pitchClass] : kSharp[pitchClass];
    std::snprintf(out, outSize, "%s%d", name, octave);
}

namespace {

/// C D E F G A B -> Dó Ré Mi Fá Sol Lá Si. UTF-8 source, and the glyphs are
/// all inside Latin-1, which is exactly what the font atlas rasterises.
constexpr const char* kLatin[7] = {
    "Dó", "Ré", "Mi", "Fá", "Sol", "Lá", "Si",
};

[[nodiscard]] int letterIndex(char letter) noexcept {
    switch (letter) {
        case 'C': return 0;
        case 'D': return 1;
        case 'E': return 2;
        case 'F': return 3;
        case 'G': return 4;
        case 'A': return 5;
        case 'B': return 6;
        default:  return -1;
    }
}

}  // namespace

void toLatinName(const char* scientific, char* out, std::size_t outSize) noexcept {
    if (out == nullptr || outSize == 0) {
        return;
    }
    out[0] = '\0';
    if (scientific == nullptr || scientific[0] == '\0') {
        return;
    }
    const int index = letterIndex(scientific[0]);
    if (index < 0) {
        // Not a note name after all. Copying it through beats printing
        // nothing: whatever it is, the caller wanted it on screen.
        std::snprintf(out, outSize, "%s", scientific);
        return;
    }
    // Everything after the letter - accidentals and the octave digit - is
    // already in the form a Brazilian musician reads: Dó#5, Sib4.
    std::snprintf(out, outSize, "%s%s", kLatin[index], scientific + 1);
}

void writeLatinName(char* out, std::size_t outSize, int midi, int fifths) noexcept {
    char scientific[8] = {};
    writeNoteName(scientific, sizeof(scientific), midi, fifths);
    toLatinName(scientific, out, outSize);
}

void writeLatinPitchClass(char* out, std::size_t outSize, int midi, int fifths) noexcept {
    char full[16] = {};
    writeLatinName(full, sizeof(full), midi, fifths);
    // Strip the trailing octave. A key is not in an octave, and "Lá4 maior"
    // is not something anybody has ever said.
    std::size_t length = std::strlen(full);
    while (length > 0 && (full[length - 1] == '-' ||
                          (full[length - 1] >= '0' && full[length - 1] <= '9'))) {
        full[--length] = '\0';
    }
    std::snprintf(out, outSize, "%s", full);
}

const ScoreEvent* Score::noteAt(double timeSeconds) const noexcept {
    // Events are sorted by onset, so binary-search the last onset <= t and
    // walk back over the handful that could still be sounding.
    const auto it = std::upper_bound(
        events.begin(), events.end(), timeSeconds,
        [](double t, const ScoreEvent& e) { return t < e.startSeconds; });

    for (auto cursor = it; cursor != events.begin();) {
        --cursor;
        if (cursor->isRest) {
            continue;
        }
        if (timeSeconds < cursor->endSeconds()) {
            return &*cursor;
        }
        // Onsets only move backwards from here; once we are past the end of a
        // note by more than the longest plausible duration, stop looking.
        if (cursor->startSeconds + 8.0 < timeSeconds) {
            break;
        }
    }
    return nullptr;
}

void Score::notesInWindow(double from, double to, std::vector<std::size_t>& out) const {
    out.clear();
    if (events.empty() || to < from) {
        return;
    }

    const auto begin = std::lower_bound(
        events.begin(), events.end(), from,
        [](const ScoreEvent& e, double t) { return e.startSeconds < t; });

    for (auto it = begin; it != events.end() && it->startSeconds <= to; ++it) {
        if (!it->isRest) {
            out.push_back(static_cast<std::size_t>(it - events.begin()));
        }
    }
}

void Score::applyTempoScale(double scale) {
    // Wide enough to cover the whole range of the tempo control against the
    // slowest and fastest written tempos in the curriculum. A tighter clamp
    // makes the displayed tempo a lie at the extremes.
    scale = std::clamp(scale, 0.1, 8.0);
    if (scale == tempoScale_) {
        return;
    }
    // Undo the previous scale, then apply the new one, so repeated calls do
    // not compound rounding error.
    const double factor = tempoScale_ / scale;
    for (auto& e : events) {
        e.startSeconds    *= factor;
        e.durationSeconds *= factor;
    }
    for (auto& t : tempoMap) {
        t.beatsPerMinute *= (scale / tempoScale_);
    }
    beatsPerMinute *= (scale / tempoScale_);
    tempoScale_ = scale;
}

}  // namespace fretless::score
