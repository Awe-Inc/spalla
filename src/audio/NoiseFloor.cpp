#include "fretless/audio/NoiseFloor.h"

#include <algorithm>
#include <cmath>

namespace fretless::audio {

void NoiseFloorTracker::observe(float rms, bool voiced, float blockSeconds) noexcept {
    if (!(rms >= 0.0f) || !(blockSeconds > 0.0f)) {
        return;
    }
    const bool rising = rms > floor_;
    if (rising && voiced) {
        return;
    }
    const float seconds = rising ? config_.riseSeconds : config_.fallSeconds;
    const float step = 1.0f - std::exp(-blockSeconds / std::max(seconds, 1e-3f));
    floor_ += (rms - floor_) * step;
}

float NoiseFloorTracker::gate() const noexcept {
    const float ceiling = std::max(config_.maximumGate, config_.minimumGate);
    return std::clamp(floor_ * config_.gateRatio, config_.minimumGate, ceiling);
}

}  // namespace fretless::audio
