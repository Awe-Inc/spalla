// ═══════════════════════════════════════════════════════════════════════════
//  NoiseFloor.h — adaptive silence gate
//
//  A fixed RMS gate is wrong in both directions: in a quiet room it lets a
//  bow change through as noise, and next to a fan or a laptop the room itself
//  clears it, reaches the detector and comes back as low-confidence frames,
//  which the judge would then grade as notes it could not hear. The gate
//  follows the room instead. Realtime-safe: no allocation, no locks.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

namespace fretless::audio {

struct NoiseFloorConfig {
    float minimumGate  = 0.0025f;  ///< never gate below this: a silent room
    float maximumGate  = 0.05f;    ///< a loud room must not mute a real bow
    float gateRatio    = 2.0f;     ///< gate = floor × ratio (≈ 6 dB above the room)
    /// Rising slowly keeps a long quiet note from teaching the gate that it is
    /// the room; falling fast lets a quiet room take over as soon as it is.
    float riseSeconds  = 3.0f;
    float fallSeconds  = 0.3f;
};

class NoiseFloorTracker {
public:
    NoiseFloorTracker() = default;
    explicit NoiseFloorTracker(const NoiseFloorConfig& config) : config_(config) {}

    /// Feeds one block. A block the detector read as a confident pitch never
    /// raises the floor: that is the instrument, not the room.
    void observe(float rms, bool voiced, float blockSeconds) noexcept;

    [[nodiscard]] float gate() const noexcept;
    [[nodiscard]] float floor() const noexcept { return floor_; }

    void setMinimumGate(float rms) noexcept { config_.minimumGate = rms; }
    void reset() noexcept { floor_ = 0.0f; }

private:
    NoiseFloorConfig config_{};
    float            floor_ = 0.0f;
};

}  // namespace fretless::audio
