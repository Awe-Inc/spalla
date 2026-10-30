// ═══════════════════════════════════════════════════════════════════════════
//  PitchDetector.h — YIN fundamental frequency estimator
//  de Cheveigné & Kawahara (2002), steps 1–5.
//
//  Every buffer is allocated once in prepare(). process() is realtime-safe:
//  no allocation, no locks, no exceptions, no syscalls.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstddef>
#include <vector>

namespace fretless::audio {

struct PitchDetectorConfig {
    double      sampleRate     = 48000.0;
    std::size_t windowSize     = 1024;    ///< integration window W
    /// Search range. Bounding tau to the violin's compass cuts the O(W·tau)
    /// difference function by ~4x versus scanning tau up to W/2.
    float       minFrequencyHz = 170.0f;  ///< just below open G3 (196 Hz)
    /// Harmonics and the top of the fingerboard reach C8 (4186 Hz); the margin
    /// keeps a vibrato on it inside the range.
    float       maxFrequencyHz = 4400.0f;
    float       yinThreshold   = 0.15f;   ///< absolute threshold, YIN step 4
};

struct PitchEstimate {
    float frequencyHz = 0.0f;  ///< 0.0f when no periodicity was found
    float confidence  = 0.0f;  ///< 1 - d'(tau), clamped to [0, 1]
};

class PitchDetector {
public:
    PitchDetector() = default;

    /// Allocates the working buffers. Call from the loading thread — never
    /// from the audio callback.
    void prepare(const PitchDetectorConfig& config);

    /// Realtime-safe. `samples` must hold at least requiredSamples() frames of
    /// mono float audio, oldest first.
    [[nodiscard]] PitchEstimate process(const float* samples, std::size_t count) noexcept;

    [[nodiscard]] std::size_t requiredSamples() const noexcept {
        return config_.windowSize + tauMax_;
    }
    [[nodiscard]] const PitchDetectorConfig& config() const noexcept { return config_; }

private:
    [[nodiscard]] std::size_t firstComparableDip(std::size_t best) const noexcept;
    [[nodiscard]] float dipDepth(std::size_t tau) const noexcept;
    [[nodiscard]] float parabolicMinimum(std::size_t tau) const noexcept;
    [[nodiscard]] float refineOnAMultiple(float tau) const noexcept;

    PitchDetectorConfig config_{};
    std::vector<float>  difference_;   ///< d(tau),  YIN step 2
    std::vector<float>  cumulative_;   ///< d'(tau), YIN step 3
    std::size_t         tauMin_ = 2;
    std::size_t         tauMax_ = 2;
};

}  // namespace fretless::audio
