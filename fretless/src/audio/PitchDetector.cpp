#include "fretless/audio/PitchDetector.h"

#include <algorithm>
#include <cmath>

namespace fretless::audio {

void PitchDetector::prepare(const PitchDetectorConfig& config) {
    config_ = config;

    const double sr = config_.sampleRate;
    tauMin_ = std::max<std::size_t>(2, static_cast<std::size_t>(sr / config_.maxFrequencyHz));
    tauMax_ = static_cast<std::size_t>(sr / config_.minFrequencyHz) + 1;
    tauMax_ = std::max(tauMax_, tauMin_ + 2);

    // Allocate once, here. process() must never touch the allocator.
    difference_.assign(tauMax_ + 2, 0.0f);
    cumulative_.assign(tauMax_ + 2, 0.0f);
}

PitchEstimate PitchDetector::process(const float* x, std::size_t count) noexcept {
    const std::size_t W = config_.windowSize;
    if (x == nullptr || count < W + tauMax_ || difference_.empty()) {
        return {};
    }

    // ── YIN step 2: squared difference function ───────────────────────────
    // Computed from tau = 1 (not tauMin_) because step 3's running mean needs
    // the full prefix; the search range only bounds the minimum hunt below.
    difference_[0] = 0.0f;
    for (std::size_t tau = 1; tau <= tauMax_; ++tau) {
        float sum = 0.0f;
        const float* a = x;
        const float* b = x + tau;
        for (std::size_t j = 0; j < W; ++j) {
            const float d = a[j] - b[j];
            sum += d * d;
        }
        difference_[tau] = sum;
    }

    // ── YIN step 3: cumulative mean normalized difference ─────────────────
    cumulative_[0] = 1.0f;
    float running = 0.0f;
    for (std::size_t tau = 1; tau <= tauMax_; ++tau) {
        running += difference_[tau];
        cumulative_[tau] = (running > 0.0f)
            ? difference_[tau] * static_cast<float>(tau) / running
            : 1.0f;
    }

    // ── YIN step 4: absolute threshold ────────────────────────────────────
    std::size_t tauEst = 0;
    for (std::size_t tau = tauMin_; tau < tauMax_; ++tau) {
        if (cumulative_[tau] < config_.yinThreshold) {
            // Walk down to the local minimum instead of taking the first
            // crossing — otherwise the estimate biases sharp.
            while (tau + 1 < tauMax_ && cumulative_[tau + 1] < cumulative_[tau]) {
                ++tau;
            }
            tauEst = tau;
            break;
        }
    }

    // No dip below the threshold: fall back to the global minimum and let the
    // low confidence value tell the caller not to trust it. A hard reject here
    // makes the tuner needle stutter on a quiet bow change.
    if (tauEst == 0) {
        std::size_t best = tauMin_;
        for (std::size_t tau = tauMin_ + 1; tau < tauMax_; ++tau) {
            if (cumulative_[tau] < cumulative_[best]) {
                best = tau;
            }
        }
        if (cumulative_[best] >= 1.0f) {
            return {};
        }
        tauEst = best;
    }

    // ── YIN step 5: parabolic interpolation around the minimum ────────────
    float refinedTau = static_cast<float>(tauEst);
    if (tauEst > 1 && tauEst + 1 <= tauMax_) {
        const float s0 = cumulative_[tauEst - 1];
        const float s1 = cumulative_[tauEst];
        const float s2 = cumulative_[tauEst + 1];
        const float denom = 2.0f * s1 - s2 - s0;
        if (std::fabs(denom) > 1e-12f) {
            refinedTau += (s2 - s0) / (2.0f * denom);
        }
    }

    if (refinedTau <= 0.0f) {
        return {};
    }

    PitchEstimate estimate;
    estimate.frequencyHz = static_cast<float>(config_.sampleRate) / refinedTau;
    estimate.confidence  = std::clamp(1.0f - cumulative_[tauEst], 0.0f, 1.0f);

    // Guard against octave errors landing outside the instrument's compass.
    if (estimate.frequencyHz < config_.minFrequencyHz ||
        estimate.frequencyHz > config_.maxFrequencyHz) {
        return {};
    }
    return estimate;
}

}  // namespace fretless::audio
