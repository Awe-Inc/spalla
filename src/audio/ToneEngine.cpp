#include "fretless/audio/ToneEngine.h"

#include <portaudio.h>

#include <algorithm>
#include <cmath>

namespace fretless::audio {
namespace {

constexpr double kTwoPi = 6.283185307179586;

/// How fast the drone slides to a new pitch and how fast its level ramps.
/// Both exist only to keep a parameter change from producing a click; slow
/// enough to be inaudible as a step, fast enough not to be heard as a portamento.
constexpr double kPitchSlewPerSecond = 40.0;   // semitone-ish, in Hz per second scaled
constexpr float  kGainRampPerSecond  = 6.0f;

void setError(std::string* out, const char* what, PaError code) {
    if (out != nullptr) {
        *out = std::string(what) + ": " + Pa_GetErrorText(code);
    }
}

}  // namespace

// ═══════════════════════════════════════════════════════════════════════════
//  Impl
// ═══════════════════════════════════════════════════════════════════════════

struct ToneEngine::Impl {
    PaStream* stream        = nullptr;
    bool      paInitialized = false;

    /// [RT] entry point. noexcept is load-bearing: unwinding through
    /// PortAudio's C frames is undefined behaviour.
    static int paCallback(const void*                     /*input*/,
                          void*                           output,
                          unsigned long                   frameCount,
                          const PaStreamCallbackTimeInfo* /*timeInfo*/,
                          PaStreamCallbackFlags           /*statusFlags*/,
                          void*                           userData) noexcept {
        auto* self = static_cast<ToneEngine*>(userData);
        self->renderBlock(static_cast<float*>(output), frameCount);
        return paContinue;
    }
};

ToneEngine::ToneEngine() = default;

ToneEngine::~ToneEngine() {
    shutdown();
}

// ═══════════════════════════════════════════════════════════════════════════
//  Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

bool ToneEngine::initialize(const ToneConfig& config, std::string* error) {
    shutdown();
    config_ = config;
    impl_   = std::make_unique<Impl>();

    // Pa_Initialize is reference counted, so opening a second stream from a
    // second object is supported and Pa_Terminate here does not pull the rug
    // out from under the capture engine.
    PaError err = Pa_Initialize();
    if (err != paNoError) {
        setError(error, "Pa_Initialize failed", err);
        impl_.reset();
        return false;
    }
    impl_->paInitialized = true;

    const PaDeviceIndex device = Pa_GetDefaultOutputDevice();
    if (device == paNoDevice) {
        if (error != nullptr) {
            *error = "No output device available.";
        }
        shutdown();
        return false;
    }
    const PaDeviceInfo* info = Pa_GetDeviceInfo(device);
    if (info == nullptr || info->maxOutputChannels < 1) {
        if (error != nullptr) {
            *error = "Default output device has no output channels.";
        }
        shutdown();
        return false;
    }

    PaStreamParameters params{};
    params.device       = device;
    params.channelCount = 1;
    params.sampleFormat = paFloat32;
    // The default *high* latency, deliberately: a drone has no timing
    // requirement at all, and a larger buffer is one less thing competing with
    // the capture stream for the CPU. The click is placed inside the buffer by
    // sample index, so its accuracy does not depend on the buffer size.
    params.suggestedLatency          = info->defaultHighOutputLatency;
    params.hostApiSpecificStreamInfo = nullptr;

    const double rate = (config_.sampleRate > 0.0) ? config_.sampleRate
                                                   : info->defaultSampleRate;

    err = Pa_OpenStream(&impl_->stream, nullptr, &params, rate,
                        config_.framesPerBuffer, paClipOff,
                        &Impl::paCallback, this);
    if (err != paNoError) {
        setError(error, "Pa_OpenStream failed", err);
        shutdown();
        return false;
    }

    const PaStreamInfo* streamInfo = Pa_GetStreamInfo(impl_->stream);
    config_.sampleRate = (streamInfo != nullptr) ? streamInfo->sampleRate : rate;
    available_         = true;
    return true;
}

void ToneEngine::shutdown() noexcept {
    available_ = false;
    if (impl_ == nullptr) {
        return;
    }
    if (impl_->stream != nullptr) {
        Pa_AbortStream(impl_->stream);
        Pa_CloseStream(impl_->stream);
        impl_->stream = nullptr;
    }
    if (impl_->paInitialized) {
        Pa_Terminate();
        impl_->paInitialized = false;
    }
    impl_.reset();
}

bool ToneEngine::start(std::string* error) {
    if (impl_ == nullptr || impl_->stream == nullptr) {
        if (error != nullptr) {
            *error = "Output stream is not open.";
        }
        return false;
    }
    if (Pa_IsStreamActive(impl_->stream) == 1) {
        return true;
    }
    const PaError err = Pa_StartStream(impl_->stream);
    if (err != paNoError) {
        setError(error, "Pa_StartStream failed", err);
        return false;
    }
    return true;
}

void ToneEngine::stop() noexcept {
    clearDrone();
    clearMetronome();
    if (impl_ != nullptr && impl_->stream != nullptr) {
        Pa_StopStream(impl_->stream);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Parameters  [main]
// ═══════════════════════════════════════════════════════════════════════════

void ToneEngine::setDrone(int midi, float gain) noexcept {
    droneMidi_.store(midi, std::memory_order_relaxed);
    droneGain_.store(std::clamp(gain, 0.0f, 1.0f), std::memory_order_relaxed);
    droneHz_.store(midi < 0 ? 0.0f
                            : 440.0f * std::pow(2.0f, static_cast<float>(midi - 69) / 12.0f),
                   std::memory_order_relaxed);
}

void ToneEngine::setMetronome(double bpm, int beatsPerBar, float gain) noexcept {
    metronomeBeats_.store(std::max(1, beatsPerBar), std::memory_order_relaxed);
    metronomeGain_.store(std::clamp(gain, 0.0f, 1.0f), std::memory_order_relaxed);
    metronomeBpm_.store(bpm > 0.0 ? std::clamp(bpm, 20.0, 400.0) : 0.0,
                        std::memory_order_relaxed);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Synthesis  [RT]
// ═══════════════════════════════════════════════════════════════════════════

void ToneEngine::renderBlock(float* output, unsigned long frameCount) noexcept {
    if (output == nullptr) {
        return;
    }

    const double sampleRate  = (config_.sampleRate > 0.0) ? config_.sampleRate : 48000.0;
    const double invRate     = 1.0 / sampleRate;
    const float  master      = volume_.load(std::memory_order_relaxed);
    const float  targetGain  = (droneHz_.load(std::memory_order_relaxed) > 0.0f)
                                   ? droneGain_.load(std::memory_order_relaxed)
                                   : 0.0f;
    const double targetHz    = static_cast<double>(droneHz_.load(std::memory_order_relaxed));

    const double bpm         = metronomeBpm_.load(std::memory_order_relaxed);
    const int    beatsPerBar = metronomeBeats_.load(std::memory_order_relaxed);
    const float  clickGain   = metronomeGain_.load(std::memory_order_relaxed);
    const double beatSeconds = (bpm > 0.0) ? 60.0 / bpm : 0.0;

    const std::uint32_t resync = resyncRequest_.load(std::memory_order_acquire);
    if (resync != seenResync_) {
        seenResync_ = resync;
        // Put the next click exactly on the first frame of this block, and
        // start the bar again from its downbeat.
        clickPhase_ = beatSeconds;
        beatInBar_  = beatsPerBar - 1;
    }

    for (unsigned long i = 0; i < frameCount; ++i) {
        // ── Drone ─────────────────────────────────────────────────────────
        if (targetHz > 0.0) {
            if (currentHz_ <= 0.0) {
                currentHz_ = targetHz;    // first note: no slide from silence
            } else {
                const double step = kPitchSlewPerSecond * invRate * std::max(1.0, currentHz_);
                currentHz_ += std::clamp(targetHz - currentHz_, -step, step);
            }
        }
        currentGain_ += std::clamp(targetGain - currentGain_,
                                   -kGainRampPerSecond * static_cast<float>(invRate),
                                   kGainRampPerSecond * static_cast<float>(invRate));

        float sample = 0.0f;
        if (currentGain_ > 1.0e-5f && currentHz_ > 0.0) {
            phase_ += kTwoPi * currentHz_ * invRate;
            if (phase_ >= kTwoPi) {
                phase_ -= kTwoPi;
            }
            // A pure sine gives the ear almost nothing to beat against. Two
            // quiet harmonics is enough structure to hear interference and
            // still stay out of the violin's way.
            const double fundamental = std::sin(phase_);
            const double second      = std::sin(phase_ * 2.0) * 0.22;
            const double third       = std::sin(phase_ * 3.0) * 0.10;
            sample += static_cast<float>((fundamental + second + third) * 0.72) * currentGain_;
        }

        // ── Metronome ─────────────────────────────────────────────────────
        if (beatSeconds > 0.0) {
            clickPhase_ += invRate;
            if (clickPhase_ >= beatSeconds) {
                clickPhase_ -= beatSeconds;
                beatInBar_ = (beatInBar_ + 1) % std::max(1, beatsPerBar);
                clickEnvelope_ = 1.0;
                clickHz_ = (beatInBar_ == 0) ? 1600.0 : 1000.0;
            }
        } else {
            clickEnvelope_ = 0.0;
        }

        if (clickEnvelope_ > 1.0e-4) {
            const double click = std::sin(kTwoPi * clickHz_ * clickPhase_);
            sample += static_cast<float>(click * clickEnvelope_) * clickGain;
            // ~25 ms decay: short enough to be a click, long enough to carry
            // over a violin.
            clickEnvelope_ *= std::exp(-invRate / 0.008);
        }

        output[i] = std::clamp(sample * master, -1.0f, 1.0f);
    }
}

}  // namespace fretless::audio
