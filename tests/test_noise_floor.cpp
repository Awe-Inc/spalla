#include <cmath>

#include "TestHarness.h"
#include "fretless/audio/NoiseFloor.h"

using fretless::audio::NoiseFloorConfig;
using fretless::audio::NoiseFloorTracker;

namespace {

constexpr float kBlock = 512.0f / 48000.0f;

void feed(NoiseFloorTracker& tracker, float rms, bool voiced, float seconds) {
    for (float t = 0.0f; t < seconds; t += kBlock) {
        tracker.observe(rms, voiced, kBlock);
    }
}

}  // namespace

TEST(noise_floor_starts_at_the_minimum_gate) {
    const NoiseFloorTracker tracker;
    CHECK_NEAR(tracker.gate(), NoiseFloorConfig{}.minimumGate, 1e-6);
}

TEST(noise_floor_learns_a_noisy_room_and_gates_it) {
    NoiseFloorTracker tracker;
    const float fan = 0.01f;
    feed(tracker, fan, false, 10.0f);
    CHECK(tracker.gate() > fan);
    CHECK(tracker.gate() < 0.05f);
}

TEST(noise_floor_rises_slowly_so_a_quiet_unread_note_still_passes) {
    NoiseFloorTracker tracker;
    feed(tracker, 0.001f, false, 5.0f);
    const float note = 0.02f;
    feed(tracker, note, false, 1.0f);
    CHECK(tracker.gate() < note);
}

TEST(noise_floor_never_learns_from_a_voiced_note) {
    NoiseFloorTracker tracker;
    feed(tracker, 0.001f, false, 5.0f);
    const float before = tracker.gate();
    feed(tracker, 0.2f, true, 20.0f);
    CHECK_NEAR(tracker.gate(), before, 1e-6);
}

TEST(noise_floor_falls_fast_when_the_room_goes_quiet) {
    NoiseFloorTracker tracker;
    feed(tracker, 0.01f, false, 10.0f);
    feed(tracker, 0.0005f, false, 1.0f);
    CHECK_NEAR(tracker.gate(), NoiseFloorConfig{}.minimumGate, 1e-4);
}

TEST(noise_floor_caps_the_gate_in_a_loud_room) {
    NoiseFloorTracker tracker;
    feed(tracker, 0.5f, false, 30.0f);
    CHECK_NEAR(tracker.gate(), NoiseFloorConfig{}.maximumGate, 1e-6);
}

TEST(noise_floor_ignores_garbage_input) {
    NoiseFloorTracker tracker;
    tracker.observe(-1.0f, false, kBlock);
    tracker.observe(0.01f, false, 0.0f);
    tracker.observe(std::nanf(""), false, kBlock);
    CHECK_NEAR(tracker.floor(), 0.0f, 1e-9);
}
