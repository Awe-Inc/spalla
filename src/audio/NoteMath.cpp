#include "fretless/audio/AudioEngine.h"

#include <cmath>
#include <cstdio>

namespace fretless::audio {
namespace {

constexpr const char* kNoteNames[12] = {
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
};

}  // namespace

float frequencyToMidi(float frequencyHz) noexcept {
    if (frequencyHz <= 0.0f) {
        return 0.0f;
    }
    return 12.0f * std::log2(frequencyHz / 440.0f) + 69.0f;
}

float centsOffset(float frequencyHz) noexcept {
    if (frequencyHz <= 0.0f) {
        return 0.0f;
    }
    const float midi = frequencyToMidi(frequencyHz);
    return (midi - std::round(midi)) * 100.0f;
}

void formatNoteName(float frequencyHz, char* out, std::size_t outSize) noexcept {
    if (out == nullptr || outSize == 0) {
        return;
    }
    if (frequencyHz <= 0.0f) {
        out[0] = '\0';
        return;
    }
    const int midi   = static_cast<int>(std::lround(frequencyToMidi(frequencyHz)));
    const int octave = (midi / 12) - 1;
    const int index  = ((midi % 12) + 12) % 12;
    std::snprintf(out, outSize, "%s%d", kNoteNames[index], octave);
}

}  // namespace fretless::audio
