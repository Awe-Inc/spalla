// ═══════════════════════════════════════════════════════════════════════════
//  SyntheticPlayer.h — a virtual violinist.
//
//  Produces the PitchFrame stream a real player would, with a configurable
//  intonation bias, per-note jitter and miss rate. Two jobs:
//
//    · integration testing — run a whole score through GameEngine headless and
//      assert the report, with no microphone and no human in the loop
//    · screenshots — drive the UI to a realistic mid-song state so a rendering
//      change can be inspected without playing the violin at the machine
//
//  Deterministic for a given seed, so a regression is reproducible.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstddef>
#include <cstdint>

#include "fretless/audio/AudioEngine.h"
#include "fretless/score/Score.h"

namespace fretless::game {

struct SyntheticPlayerConfig {
    /// Systematic error, in cents. Real players drift; string players who
    /// tune to a piano and then play by ear usually drift sharp.
    float centsBias = 0.0f;
    /// Spread of the per-note error, in cents.
    float centsJitter = 7.0f;
    /// Slow wobble within a note, in cents — vibrato and bow-pressure drift.
    float centsWander = 3.0f;
    /// Probability that a note is simply not played.
    float missProbability = 0.04f;
    /// Constant lag before the attack, in seconds.
    double reactionSec = 0.02;
    /// Audio block period. Matches AudioEngine's default at 48 kHz / 256.
    double blockSeconds = 256.0 / 48000.0;

    std::uint32_t seed = 0x5EED1234u;
};

class SyntheticPlayer {
public:
    void configure(const SyntheticPlayerConfig& config) noexcept { config_ = config; }
    void reset() noexcept;

    /// Emits the blocks that fall in (fromSeconds, toSeconds]. Returns how
    /// many were written to `out`.
    [[nodiscard]] std::size_t generate(const score::Score& score,
                                       double fromSeconds, double toSeconds,
                                       audio::PitchFrame* out, std::size_t maxFrames);

private:
    [[nodiscard]] float nextUniform() noexcept;
    [[nodiscard]] float nextGaussian() noexcept;
    /// Stable per-note error, so a note does not change its mind mid-way.
    [[nodiscard]] float noteOffsetCents(std::size_t noteIndex) noexcept;

    SyntheticPlayerConfig config_{};
    std::uint32_t state_        = 0x5EED1234u;
    double        nextBlockTime_ = 0.0;
    std::uint64_t blockIndex_    = 0;
};

}  // namespace fretless::game
