// ═══════════════════════════════════════════════════════════════════════════
//  ToneEngine.h — the half of the audio path that makes a sound.
//
//  The engine used to be capture-only, which quietly ruled out the two most
//  effective things a practice tool can do: play a drone to tune against, and
//  click. Both are the reference the player is measured against, and neither
//  can be replaced by drawing something on a screen — intonation is heard, not
//  seen, and a metronome you have to watch is not a metronome.
//
//  It is a separate object from AudioEngine, and a separate PortAudio stream,
//  on purpose. Capture must keep working on a machine with no output device
//  and playback must keep working with no microphone; folding them into one
//  duplex stream makes each a prerequisite of the other, and duplex mode on
//  WASAPI additionally requires both endpoints to agree on a sample rate,
//  which consumer hardware routinely does not.
//
//  THREADING: identical contract to AudioEngine. Everything the callback
//  reaches is preallocated and lock-free; parameters cross as atomics.
//
//  ONE CAVEAT, STATED LOUDLY: a drone played through speakers is heard by the
//  microphone, and the pitch detector will happily grade the drone. Drone
//  exercises want headphones. The UI says so.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <atomic>
#include <cstdint>
#include <memory>
#include <string>

namespace fretless::audio {

struct ToneConfig {
    double   sampleRate      = 48000.0;
    unsigned framesPerBuffer = 256;
    /// Output is a convenience, not the product. If it cannot be opened the
    /// app carries on in silence rather than refusing to start.
    bool     required        = false;
};

class ToneEngine {
public:
    ToneEngine();
    ~ToneEngine();

    ToneEngine(const ToneEngine&)            = delete;
    ToneEngine& operator=(const ToneEngine&) = delete;

    [[nodiscard]] bool initialize(const ToneConfig& config, std::string* error = nullptr);
    void shutdown() noexcept;
    [[nodiscard]] bool start(std::string* error = nullptr);
    void stop() noexcept;

    /// True when a stream is open. Everything below is safe to call either
    /// way, so callers never need to check first.
    [[nodiscard]] bool available() const noexcept { return available_; }

    // ── Drone ─────────────────────────────────────────────────────────────
    /// Sustained reference pitch. `midi` below zero silences it. The tone is
    /// a sine with two quiet harmonics: a pure sine is hard to tune against
    /// because it gives the ear nothing to beat with, and a rich one competes
    /// with the violin.
    void setDrone(int midi, float gain = 0.22f) noexcept;
    void clearDrone() noexcept { setDrone(-1); }
    [[nodiscard]] int droneMidi() const noexcept {
        return droneMidi_.load(std::memory_order_relaxed);
    }

    // ── Metronome ─────────────────────────────────────────────────────────
    /// `bpm` at or below zero stops the click. The first beat of each bar is
    /// pitched higher, which is the only way a click can convey a bar line.
    void setMetronome(double bpm, int beatsPerBar, float gain = 0.5f) noexcept;
    void clearMetronome() noexcept { setMetronome(0.0, 4); }
    [[nodiscard]] bool metronomeRunning() const noexcept {
        return metronomeBpm_.load(std::memory_order_relaxed) > 0.0;
    }

    /// Puts the next click on the next callback, so the count-in and the first
    /// note of the score agree. Without this the click free-runs and lands
    /// wherever the stream happened to start.
    void resyncMetronome() noexcept {
        resyncRequest_.fetch_add(1, std::memory_order_release);
    }

    /// Master gain for everything this engine plays, 0..1.
    void setVolume(float gain) noexcept {
        volume_.store(gain < 0.0f ? 0.0f : (gain > 1.0f ? 1.0f : gain),
                      std::memory_order_relaxed);
    }
    [[nodiscard]] float volume() const noexcept {
        return volume_.load(std::memory_order_relaxed);
    }

private:
    /// [RT] The whole of the audio thread's work.
    void renderBlock(float* output, unsigned long frameCount) noexcept;

    struct Impl;
    std::unique_ptr<Impl> impl_;

    ToneConfig config_{};
    bool       available_ = false;

    // ── Written by [main], read by [RT] ───────────────────────────────────
    std::atomic<float>  droneHz_{0.0f};
    std::atomic<float>  droneGain_{0.22f};
    std::atomic<int>    droneMidi_{-1};
    std::atomic<double> metronomeBpm_{0.0};
    std::atomic<int>    metronomeBeats_{4};
    std::atomic<float>  metronomeGain_{0.5f};
    std::atomic<float>  volume_{0.7f};
    std::atomic<std::uint32_t> resyncRequest_{0};
    static_assert(std::atomic<float>::is_always_lock_free,
                  "Parameter atomics must be lock-free or the RT thread can block.");

    // ── Owned exclusively by [RT] ─────────────────────────────────────────
    double phase_          = 0.0;   ///< drone phase, in radians
    double currentHz_      = 0.0;   ///< slewed towards droneHz_, to avoid clicks
    float  currentGain_    = 0.0f;  ///< ramped, likewise
    double clickPhase_     = 0.0;   ///< seconds since the last click
    double clickEnvelope_  = 0.0;
    double clickHz_        = 880.0;
    int    beatInBar_      = 0;
    std::uint32_t seenResync_ = 0;
};

}  // namespace fretless::audio
