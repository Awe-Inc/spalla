// ═══════════════════════════════════════════════════════════════════════════
//  AudioEngine.h — realtime capture + pitch analysis
//
//  ┌──────────────────────┐   SpscRingBuffer<PitchFrame>   ┌────────────────┐
//  │ PortAudio RT thread  │ ────────────────────────────►  │  game loop     │
//  │ (OS-scheduled, high  │        wait-free, no locks     │  (SDL2, 144Hz) │
//  │  priority, ~5ms)     │ ◄──────────────────────────    │                │
//  └──────────────────────┘   std::atomic<float> params    └────────────────┘
//
//  THREADING CONTRACT
//  ------------------
//  Methods are tagged [RT] or [main]:
//    [main]  initialize / shutdown / start / stop / poll / latest / setters
//    [RT]    processBlock — called from PortAudio's callback thread only
//
//  Inside [RT] the following are forbidden, because any of them can block for
//  longer than the buffer period and produce an audible dropout:
//    new/delete/malloc · mutexes · std::function · exceptions · file or
//    console I/O · std::string · anything that may page-fault
//
//  Consequently the RT side only ever writes trivially-copyable PODs into a
//  preallocated ring buffer and touches lock-free atomics. Musical
//  interpretation (note name, cents deviation, string assignment) is derived
//  on the game thread — it is presentation, not signal processing.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "fretless/audio/PitchDetector.h"
#include "fretless/core/SpscRingBuffer.h"

namespace fretless::audio {

// ───────────────────────────────────────────────────────────────────────────
//  Data crossing the thread boundary
// ───────────────────────────────────────────────────────────────────────────

enum PitchFlags : std::uint32_t {
    kFlagNone          = 0u,
    kFlagSilent        = 1u << 0,  ///< RMS below the gate
    kFlagLowConfidence = 1u << 1,  ///< YIN found no stable period
    kFlagClipped       = 1u << 2,  ///< |sample| >= 1.0 — tell the player
    kFlagInputOverflow = 1u << 3,  ///< PortAudio lost input frames
};

/// One analysis block. POD by design: it is memcpy'd across threads.
/// 32 bytes, fits inside half a cache line.
struct PitchFrame {
    double        streamTimeSec = 0.0;   ///< PortAudio stream clock at block start
    std::uint64_t blockIndex    = 0;     ///< monotonic; gaps reveal dropped frames
    float         frequencyHz   = 0.0f;  ///< 0.0f when unvoiced
    float         confidence    = 0.0f;  ///< [0, 1]
    float         rmsLinear     = 0.0f;  ///< block RMS, for the input meter
    std::uint32_t flags         = kFlagNone;
};
static_assert(sizeof(PitchFrame) == 32, "PitchFrame layout changed unexpectedly");

struct AudioDeviceInfo {
    int         index               = -1;
    std::string name;
    std::string hostApi;            ///< "Windows WASAPI", "MME", …
    int         maxInputChannels    = 0;
    double      defaultSampleRate   = 0.0;
    double      lowInputLatencySec  = 0.0;
    bool        isDefault           = false;
};

struct AudioConfig {
    int         deviceIndex         = -1;      ///< -1 = system default input
    double      sampleRate          = 48000.0; ///< 0 = device native
    /// Frames per callback. 256 @ 48 kHz = 5.33 ms. Below 128 the WASAPI
    /// shared-mode engine starts glitching on most consumer interfaces.
    unsigned    framesPerBuffer     = 256;
    bool        preferExclusiveMode = true;    ///< WASAPI exclusive when available

    float       silenceRmsThreshold = 0.0025f; ///< noise gate
    float       confidenceThreshold = 0.60f;   ///< reject unvoiced YIN results

    PitchDetectorConfig detector{};
};

// ───────────────────────────────────────────────────────────────────────────
//  Engine
// ───────────────────────────────────────────────────────────────────────────

class AudioEngine {
public:
    AudioEngine();
    ~AudioEngine();

    AudioEngine(const AudioEngine&)            = delete;
    AudioEngine& operator=(const AudioEngine&) = delete;
    AudioEngine(AudioEngine&&)                 = delete;
    AudioEngine& operator=(AudioEngine&&)      = delete;

    // ── Lifecycle ─────────────────────────────────────────────── [main] ──
    /// Initializes PortAudio, opens the stream and allocates every buffer the
    /// RT thread will ever touch. On failure returns false and fills `error`.
    [[nodiscard]] bool initialize(const AudioConfig& config, std::string* error = nullptr);

    /// Stops and closes the stream, terminates PortAudio. Idempotent.
    void shutdown() noexcept;

    [[nodiscard]] bool start(std::string* error = nullptr);
    void stop() noexcept;
    [[nodiscard]] bool isRunning() const noexcept { return running_.load(std::memory_order_acquire); }

    /// Enumerates input devices. Safe to call before initialize().
    /// Allocates — never call this while the stream is live if you can help it.
    [[nodiscard]] static std::vector<AudioDeviceInfo> enumerateInputDevices();

    // ── Consumption ───────────────────────────────────────────── [main] ──
    /// Drains up to `maxFrames` analysis blocks into `out`; returns how many
    /// were written. Call once per game frame: at 144 FPS / 5.3 ms blocks you
    /// will typically get one or two.
    [[nodiscard]] std::size_t poll(PitchFrame* out, std::size_t maxFrames) noexcept;

    /// Drains the queue and hands back only the newest block — what the tuner
    /// needle and the "current note" HUD actually want.
    /// Returns false if nothing arrived since the last call and no block has
    /// ever been received.
    [[nodiscard]] bool latest(PitchFrame& out) noexcept;

    // ── Runtime parameters (lock-free, read by the RT thread) ─── [main] ──
    void setSilenceThreshold(float rms) noexcept   { silenceThreshold_.store(rms, std::memory_order_relaxed); }
    void setConfidenceThreshold(float c) noexcept  { confidenceThreshold_.store(c, std::memory_order_relaxed); }
    void setInputGain(float linearGain) noexcept   { inputGain_.store(linearGain, std::memory_order_relaxed); }

    // ── Diagnostics ───────────────────────────────────────────── [main] ──
    /// Blocks the RT thread produced but could not enqueue (game loop stalled).
    [[nodiscard]] std::uint64_t droppedFrames() const noexcept  { return dropped_.load(std::memory_order_relaxed); }
    /// Times PortAudio reported that input samples were lost before we saw them.
    [[nodiscard]] std::uint64_t inputOverflows() const noexcept { return overflows_.load(std::memory_order_relaxed); }
    /// Actual input latency the driver negotiated. Feed this into the timing
    /// judgement so early/late scoring is not biased by the audio stack.
    [[nodiscard]] double inputLatencySec() const noexcept { return inputLatencySec_; }
    [[nodiscard]] double sampleRate() const noexcept      { return actualSampleRate_; }
    [[nodiscard]] const std::string& backendName() const noexcept { return backendName_; }

private:
    // ── Realtime side ─────────────────────────────────────────────[RT] ──
    /// The whole of the audio thread's work. Called by AudioEngine::Impl's
    /// PortAudio callback. noexcept is load-bearing: an exception unwinding
    /// through a C callback is undefined behaviour.
    void processBlock(const float* input,
                      unsigned long frameCount,
                      double        streamTimeSec,
                      unsigned long statusFlags) noexcept;

    /// Holds PaStream* and the callback trampoline. Being a nested type it can
    /// reach processBlock() without a friend declaration, which keeps
    /// <portaudio.h> out of this header and out of every TU that includes it.
    struct Impl;
    std::unique_ptr<Impl> impl_;

    // ── Shared: written by [RT], read by [main] ───────────────────────────
    /// 256 blocks ≈ 1.4 s of backlog at 5.3 ms — enough to ride out a long
    /// shader compile without losing the player's performance data.
    static constexpr std::size_t kQueueSlots = 256;
    core::SpscRingBuffer<PitchFrame, kQueueSlots> queue_;

    std::atomic<std::uint64_t> dropped_{0};
    std::atomic<std::uint64_t> overflows_{0};
    std::atomic<bool>          running_{false};

    // ── Shared: written by [main], read by [RT] ───────────────────────────
    std::atomic<float> silenceThreshold_{0.0025f};
    std::atomic<float> confidenceThreshold_{0.60f};
    std::atomic<float> inputGain_{1.0f};
    static_assert(std::atomic<float>::is_always_lock_free,
                  "Parameter atomics must be lock-free or the RT thread can block.");

    // ── Owned exclusively by [RT] after start(); no synchronization needed ─
    PitchDetector      detector_;
    std::vector<float> analysisWindow_;   ///< sliding buffer, sized in initialize()
    std::uint64_t      blockIndex_ = 0;

    // ── Owned exclusively by [main] ───────────────────────────────────────
    PitchFrame  lastFrame_{};
    bool        hasLastFrame_    = false;
    double      inputLatencySec_ = 0.0;
    double      actualSampleRate_ = 0.0;
    std::string backendName_;
};

// ───────────────────────────────────────────────────────────────────────────
//  Musical interpretation — pure functions, game-thread side
// ───────────────────────────────────────────────────────────────────────────

/// MIDI note number as a real value (A4 = 69.0). Returns 0.0f for f <= 0.
[[nodiscard]] float frequencyToMidi(float frequencyHz) noexcept;

/// Deviation from the nearest equal-tempered semitone, in cents [-50, +50].
[[nodiscard]] float centsOffset(float frequencyHz) noexcept;

/// Scientific pitch notation, e.g. "A4". Writes at most 5 bytes incl. NUL.
void formatNoteName(float frequencyHz, char* out, std::size_t outSize) noexcept;

}  // namespace fretless::audio
