#include "fretless/audio/PitchDetector.h"

#include <algorithm>
#include <cmath>

namespace fretless::audio {

namespace {
constexpr float kComparableDipRatio = 1.3f;
constexpr float kMaxMultipleDriftSamples = 0.5f;
}  // namespace

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

// Under room noise no dip reaches the absolute threshold, and the cumulative
// normalisation makes every multiple of the period look slightly better than
// the period itself, so the global minimum lands an octave or more low. The
// true period is the shortest dip that is about as deep as the best one.
std::size_t PitchDetector::firstComparableDip(std::size_t best) const noexcept {
    const float limit = cumulative_[best] * kComparableDipRatio;
    for (std::size_t tau = tauMin_ + 1; tau < best; ++tau) {
        const bool isDip = cumulative_[tau] <= cumulative_[tau - 1] &&
                           cumulative_[tau] <= cumulative_[tau + 1];
        if (isDip && cumulative_[tau] <= limit) {
            return tau;
        }
    }
    return best;
}

// On d(tau), not d'(tau): d' is multiplied by tau, which tilts the parabola
// towards shorter lags, and on a high note tau is only ~18 samples.
float PitchDetector::parabolicMinimum(std::size_t tau) const noexcept {
    float refined = static_cast<float>(tau);
    if (tau > 1 && tau + 1 <= tauMax_) {
        const float s0 = difference_[tau - 1];
        const float s1 = difference_[tau];
        const float s2 = difference_[tau + 1];
        const float denom = 2.0f * s1 - s2 - s0;
        if (std::fabs(denom) > 1e-12f) {
            refined += (s2 - s0) / (2.0f * denom);
        }
    }
    return refined;
}

// A parabola through three samples misses the true minimum by a fraction of
// a sample, which is five cents when the period is 18 samples. The same dip
// recurs at every multiple of the period, and d(tau) is already computed up
// to tauMax_, so interpolating the k-th dip and dividing by k shrinks that
// error k times for free. A dip that wandered off the expected multiple is
// noise, and the single-period estimate stands.
float PitchDetector::refineOnAMultiple(float tau) const noexcept {
    const auto multiple = static_cast<std::size_t>(static_cast<float>(tauMax_ - 1) / tau);
    if (multiple < 2) {
        return tau;
    }
    const auto expected = static_cast<std::size_t>(std::lround(tau * static_cast<float>(multiple)));
    std::size_t dip = expected;
    for (std::size_t candidate = expected - 1; candidate <= expected + 1 && candidate < tauMax_; ++candidate) {
        if (difference_[candidate] < difference_[dip]) {
            dip = candidate;
        }
    }
    const float refined = parabolicMinimum(dip) / static_cast<float>(multiple);
    return std::fabs(refined - tau) <= kMaxMultipleDriftSamples ? refined : tau;
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
        tauEst = firstComparableDip(best);
    }

    // ── YIN step 5: parabolic interpolation around the minimum ────────────
    float refinedTau = parabolicMinimum(tauEst);
    if (refinedTau <= 0.0f) {
        return {};
    }
    refinedTau = refineOnAMultiple(refinedTau);

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
