#include "fretless/game/SyntheticPlayer.h"

#include <cmath>

namespace fretless::game {
namespace {

/// Deterministic hash, so a note's error depends only on its index and the
/// seed — replaying the same run gives the same performance.
[[nodiscard]] std::uint32_t hash32(std::uint32_t x) noexcept {
    x ^= x >> 16;
    x *= 0x7FEB352Du;
    x ^= x >> 15;
    x *= 0x846CA68Bu;
    x ^= x >> 16;
    return x;
}

}  // namespace

void SyntheticPlayer::reset() noexcept {
    state_         = config_.seed;
    nextBlockTime_ = 0.0;
    blockIndex_    = 0;
}

float SyntheticPlayer::nextUniform() noexcept {
    state_ = state_ * 1664525u + 1013904223u;
    return static_cast<float>(state_ >> 8) / 16777216.0f;
}

float SyntheticPlayer::nextGaussian() noexcept {
    // Sum of uniforms: close enough to normal for a jitter model, and cheap.
    return (nextUniform() + nextUniform() + nextUniform() +
            nextUniform() + nextUniform() + nextUniform() - 3.0f) / 1.732f;
}

float SyntheticPlayer::noteOffsetCents(std::size_t noteIndex) noexcept {
    const std::uint32_t h = hash32(static_cast<std::uint32_t>(noteIndex) ^ config_.seed);
    // Map the hash to [-1, 1] then scale, so the offset is stable per note.
    const float unit = (static_cast<float>(h >> 8) / 8388608.0f) - 1.0f;
    return config_.centsBias + unit * config_.centsJitter;
}

std::size_t SyntheticPlayer::generate(const score::Score& score,
                                      double fromSeconds, double toSeconds,
                                      audio::PitchFrame* out, std::size_t maxFrames) {
    if (out == nullptr || maxFrames == 0 || toSeconds <= fromSeconds) {
        return 0;
    }
    if (nextBlockTime_ < fromSeconds) {
        nextBlockTime_ = fromSeconds;
    }

    std::size_t written = 0;
    while (written < maxFrames && nextBlockTime_ <= toSeconds) {
        const double blockTime = nextBlockTime_;
        nextBlockTime_ += config_.blockSeconds;

        audio::PitchFrame frame{};
        frame.streamTimeSec = blockTime;
        frame.blockIndex    = blockIndex_++;

        // The player reacts to the note slightly late.
        const score::ScoreEvent* note = score.noteAt(blockTime - config_.reactionSec);
        if (note == nullptr || note->isRest) {
            frame.flags     = audio::kFlagSilent;
            frame.rmsLinear = 0.0005f;
            out[written++]  = frame;
            continue;
        }

        const auto index = static_cast<std::size_t>(note - score.events.data());
        const std::uint32_t missRoll = hash32(static_cast<std::uint32_t>(index) * 2654435761u ^
                                              config_.seed);
        const float missUnit = static_cast<float>(missRoll >> 8) / 16777216.0f;
        if (missUnit < config_.missProbability) {
            frame.flags     = audio::kFlagSilent;
            frame.rmsLinear = 0.0008f;
            out[written++]  = frame;
            continue;
        }

        // Stable per-note error, plus a slow wander across the note.
        const double intoNote = blockTime - note->startSeconds;
        const float wander = config_.centsWander *
                             std::sin(static_cast<float>(intoNote) * 11.0f);
        const float cents = noteOffsetCents(index) + wander;

        frame.frequencyHz = note->frequencyHz * std::pow(2.0f, cents / 1200.0f);
        frame.confidence  = 0.90f + nextUniform() * 0.09f;
        frame.rmsLinear   = 0.05f + nextUniform() * 0.02f;
        frame.flags       = audio::kFlagNone;
        out[written++]    = frame;
    }
    return written;
}

}  // namespace fretless::game
