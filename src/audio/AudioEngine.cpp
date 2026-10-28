#include "fretless/audio/AudioEngine.h"

#include <portaudio.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

#if defined(_WIN32) && __has_include(<pa_win_wasapi.h>)
    #include <pa_win_wasapi.h>
    #define FRETLESS_HAS_WASAPI 1
#else
    #define FRETLESS_HAS_WASAPI 0
#endif

namespace fretless::audio {
namespace {

void setError(std::string* out, const char* what, PaError code) {
    if (out == nullptr) {
        return;
    }
    *out = std::string(what) + ": " + Pa_GetErrorText(code);
}

/// Picks the default input device, preferring a low-latency host API.
///
/// Pa_GetDefaultInputDevice() follows Windows' own default, which is MME at
/// around 90 ms. That is a quarter of a note at 160 BPM: it would dominate
/// every timing verdict the game makes. WASAPI on the same microphone
/// negotiates about 7 ms, so the host API is chosen before the device.
[[nodiscard]] PaDeviceIndex pickDefaultInputDevice() {
    constexpr PaHostApiTypeId kPreferredOrder[] = {
#if defined(_WIN32)
        paWASAPI, paWDMKS, paDirectSound, paMME,
#elif defined(__APPLE__)
        paCoreAudio,
#else
        paALSA, paJACK, paOSS,
#endif
    };

    for (const PaHostApiTypeId type : kPreferredOrder) {
        const PaHostApiIndex apiIndex = Pa_HostApiTypeIdToHostApiIndex(type);
        if (apiIndex < 0) {
            continue;   // this host API was not compiled in, or has no devices
        }
        const PaHostApiInfo* api = Pa_GetHostApiInfo(apiIndex);
        if (api == nullptr || api->defaultInputDevice == paNoDevice) {
            continue;
        }
        const PaDeviceInfo* device = Pa_GetDeviceInfo(api->defaultInputDevice);
        if (device != nullptr && device->maxInputChannels > 0) {
            return api->defaultInputDevice;
        }
    }
    return Pa_GetDefaultInputDevice();
}

}  // namespace

// ═══════════════════════════════════════════════════════════════════════════
//  Impl — owns everything that would otherwise drag <portaudio.h> into the
//  public header. Nested inside AudioEngine, so it may call the private
//  processBlock() without any friend declaration.
// ═══════════════════════════════════════════════════════════════════════════
struct AudioEngine::Impl {
    PaStream*           stream        = nullptr;
    PaStreamParameters  params{};
    bool                paInitialized = false;
#if FRETLESS_HAS_WASAPI
    PaWasapiStreamInfo  wasapi{};
#endif

    /// THE REALTIME ENTRY POINT.
    /// Runs on a driver-owned, high-priority thread. Everything it reaches
    /// must be allocation-free and lock-free. `noexcept` is mandatory:
    /// unwinding through PortAudio's C frames is undefined behaviour.
    static int paCallback(const void*                     input,
                          void*                           /*output*/,
                          unsigned long                   frameCount,
                          const PaStreamCallbackTimeInfo* timeInfo,
                          PaStreamCallbackFlags           statusFlags,
                          void*                           userData) noexcept {
        auto* self = static_cast<AudioEngine*>(userData);
        self->processBlock(static_cast<const float*>(input),
                           frameCount,
                           timeInfo != nullptr ? timeInfo->inputBufferAdcTime : 0.0,
                           static_cast<unsigned long>(statusFlags));
        return paContinue;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
//  Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

AudioEngine::AudioEngine() = default;

AudioEngine::~AudioEngine() {
    shutdown();
}

bool AudioEngine::initialize(const AudioConfig& config, std::string* error) {
    shutdown();
    impl_ = std::make_unique<Impl>();

    PaError err = Pa_Initialize();
    if (err != paNoError) {
        setError(error, "Pa_Initialize failed", err);
        impl_.reset();
        return false;
    }
    impl_->paInitialized = true;

    const PaDeviceIndex device = (config.deviceIndex >= 0)
        ? static_cast<PaDeviceIndex>(config.deviceIndex)
        : pickDefaultInputDevice();

    if (device == paNoDevice) {
        if (error != nullptr) {
            *error = "No input device available.";
        }
        shutdown();
        return false;
    }

    const PaDeviceInfo* info = Pa_GetDeviceInfo(device);
    if (info == nullptr || info->maxInputChannels < 1) {
        if (error != nullptr) {
            *error = "Selected device has no input channels.";
        }
        shutdown();
        return false;
    }

    double rate = (config.sampleRate > 0.0) ? config.sampleRate : info->defaultSampleRate;

    impl_->params.device                    = device;
    impl_->params.channelCount              = 1;          // mono: a violin is one voice
    impl_->params.sampleFormat              = paFloat32;
    impl_->params.suggestedLatency          = info->defaultLowInputLatency;
    impl_->params.hostApiSpecificStreamInfo = nullptr;

#if FRETLESS_HAS_WASAPI
    // Exclusive mode bypasses the Windows mixer: ~5 ms instead of ~25 ms, and
    // the ProAudio thread priority keeps us off the scheduler's naughty list.
    const PaHostApiInfo* hostApi = Pa_GetHostApiInfo(info->hostApi);
    if (config.preferExclusiveMode && hostApi != nullptr && hostApi->type == paWASAPI) {
        impl_->wasapi.size           = sizeof(PaWasapiStreamInfo);
        impl_->wasapi.hostApiType    = paWASAPI;
        impl_->wasapi.version        = 1;
        impl_->wasapi.flags          = paWinWasapiExclusive | paWinWasapiThreadPriority;
        impl_->wasapi.threadPriority = eThreadPriorityProAudio;
        impl_->params.hostApiSpecificStreamInfo = &impl_->wasapi;
    }
#endif

    // Negotiate down rather than fail: exclusive mode, then the requested
    // rate, then whatever the device natively runs at.
    if (Pa_IsFormatSupported(&impl_->params, nullptr, rate) != paFormatIsSupported) {
        impl_->params.hostApiSpecificStreamInfo = nullptr;
        if (Pa_IsFormatSupported(&impl_->params, nullptr, rate) != paFormatIsSupported) {
            rate = info->defaultSampleRate;
            err  = Pa_IsFormatSupported(&impl_->params, nullptr, rate);
            if (err != paFormatIsSupported) {
                setError(error, "No supported input format", err);
                shutdown();
                return false;
            }
        }
    }

    // ── Preallocate everything the RT thread will touch ───────────────────
    PitchDetectorConfig detectorConfig = config.detector;
    detectorConfig.sampleRate = rate;
    detector_.prepare(detectorConfig);
    analysisWindow_.assign(detector_.requiredSamples(), 0.0f);
    blockIndex_ = 0;
    queue_.reset();

    silenceThreshold_.store(config.silenceRmsThreshold, std::memory_order_relaxed);
    confidenceThreshold_.store(config.confidenceThreshold, std::memory_order_relaxed);

    err = Pa_OpenStream(&impl_->stream,
                        &impl_->params,
                        nullptr,                       // no output stream
                        rate,
                        config.framesPerBuffer,
                        paClipOff | paDitherOff,
                        &Impl::paCallback,
                        this);
    if (err != paNoError) {
        setError(error, "Pa_OpenStream failed", err);
        shutdown();
        return false;
    }

    const PaStreamInfo* streamInfo = Pa_GetStreamInfo(impl_->stream);
    actualSampleRate_ = (streamInfo != nullptr) ? streamInfo->sampleRate : rate;
    inputLatencySec_  = (streamInfo != nullptr) ? streamInfo->inputLatency : 0.0;

    const PaHostApiInfo* api = Pa_GetHostApiInfo(info->hostApi);
    backendName_ = (api != nullptr && api->name != nullptr) ? api->name : "unknown";

    return true;
}

void AudioEngine::shutdown() noexcept {
    if (!impl_) {
        return;
    }
    if (impl_->stream != nullptr) {
        Pa_StopStream(impl_->stream);
        Pa_CloseStream(impl_->stream);
        impl_->stream = nullptr;
    }
    if (impl_->paInitialized) {
        Pa_Terminate();
        impl_->paInitialized = false;
    }
    running_.store(false, std::memory_order_release);
    impl_.reset();
}

bool AudioEngine::start(std::string* error) {
    if (!impl_ || impl_->stream == nullptr) {
        if (error != nullptr) {
            *error = "AudioEngine::start called before initialize.";
        }
        return false;
    }
    if (isRunning()) {
        return true;
    }
    const PaError err = Pa_StartStream(impl_->stream);
    if (err != paNoError) {
        setError(error, "Pa_StartStream failed", err);
        return false;
    }
    running_.store(true, std::memory_order_release);
    return true;
}

void AudioEngine::stop() noexcept {
    if (impl_ && impl_->stream != nullptr && isRunning()) {
        Pa_StopStream(impl_->stream);   // blocks until the callback returns
    }
    running_.store(false, std::memory_order_release);
}

std::vector<AudioDeviceInfo> AudioEngine::enumerateInputDevices() {
    std::vector<AudioDeviceInfo> devices;

    // Pa_Initialize is refcounted, so this is safe alongside a live engine.
    if (Pa_Initialize() != paNoError) {
        return devices;
    }

    // Report the device the engine would actually open, not the one Windows
    // calls default — otherwise the picker highlights a row we never use.
    const PaDeviceIndex defaultInput = pickDefaultInputDevice();
    const PaDeviceIndex count        = Pa_GetDeviceCount();

    for (PaDeviceIndex i = 0; i < count; ++i) {
        const PaDeviceInfo* info = Pa_GetDeviceInfo(i);
        if (info == nullptr || info->maxInputChannels < 1) {
            continue;
        }
        const PaHostApiInfo* api = Pa_GetHostApiInfo(info->hostApi);

        AudioDeviceInfo entry;
        entry.index              = static_cast<int>(i);
        entry.name               = (info->name != nullptr) ? info->name : "";
        entry.hostApi            = (api != nullptr && api->name != nullptr) ? api->name : "";
        entry.maxInputChannels   = info->maxInputChannels;
        entry.defaultSampleRate  = info->defaultSampleRate;
        entry.lowInputLatencySec = info->defaultLowInputLatency;
        entry.isDefault          = (i == defaultInput);
        devices.push_back(std::move(entry));
    }

    Pa_Terminate();
    return devices;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Realtime thread
// ═══════════════════════════════════════════════════════════════════════════

void AudioEngine::processBlock(const float* input,
                               unsigned long frameCount,
                               double        streamTimeSec,
                               unsigned long statusFlags) noexcept {
    const std::size_t need = analysisWindow_.size();
    if (need == 0 || frameCount == 0) {
        return;
    }

    std::uint32_t flags = kFlagNone;
    if ((statusFlags & paInputOverflow) != 0) {
        flags |= kFlagInputOverflow;
        overflows_.fetch_add(1, std::memory_order_relaxed);
    }

    PitchFrame frame{};
    frame.streamTimeSec = streamTimeSec;
    frame.blockIndex    = blockIndex_++;

    // PortAudio may hand us a null buffer when input is momentarily lost.
    if (input == nullptr) {
        frame.flags = flags | kFlagSilent;
        if (!queue_.push(frame)) {
            dropped_.fetch_add(1, std::memory_order_relaxed);
        }
        return;
    }

    // Slide the analysis window left and append the new block. memmove/memcpy
    // are the only "library" calls allowed here — both are leaf, lock-free and
    // touch memory we already faulted in during initialize().
    const std::size_t n = std::min<std::size_t>(frameCount, need);
    if (n < need) {
        std::memmove(analysisWindow_.data(),
                     analysisWindow_.data() + n,
                     (need - n) * sizeof(float));
    }

    const float  gain = inputGain_.load(std::memory_order_relaxed);
    float*       dst  = analysisWindow_.data() + (need - n);
    const float* src  = input + (frameCount - n);

    float sumSquares = 0.0f;
    float peak       = 0.0f;
    for (std::size_t i = 0; i < n; ++i) {
        const float s = src[i] * gain;
        dst[i]        = s;
        sumSquares   += s * s;
        peak          = std::max(peak, std::fabs(s));
    }

    frame.rmsLinear = std::sqrt(sumSquares / static_cast<float>(n));
    if (peak >= 0.999f) {
        flags |= kFlagClipped;
    }

    if (frame.rmsLinear < silenceThreshold_.load(std::memory_order_relaxed)) {
        flags |= kFlagSilent;
    } else {
        const PitchEstimate estimate = detector_.process(analysisWindow_.data(), need);
        frame.confidence = estimate.confidence;
        if (estimate.frequencyHz > 0.0f &&
            estimate.confidence >= confidenceThreshold_.load(std::memory_order_relaxed)) {
            frame.frequencyHz = estimate.frequencyHz;
        } else {
            flags |= kFlagLowConfidence;
        }
    }

    frame.flags = flags;

    // Dropping is the correct failure mode: a stalled game loop must never
    // stall the audio thread.
    if (!queue_.push(frame)) {
        dropped_.fetch_add(1, std::memory_order_relaxed);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Game thread
// ═══════════════════════════════════════════════════════════════════════════

std::size_t AudioEngine::poll(PitchFrame* out, std::size_t maxFrames) noexcept {
    if (out == nullptr || maxFrames == 0) {
        return 0;
    }
    const std::size_t n = queue_.popBatch(out, maxFrames);
    if (n > 0) {
        lastFrame_    = out[n - 1];
        hasLastFrame_ = true;
    }
    return n;
}

bool AudioEngine::latest(PitchFrame& out) noexcept {
    PitchFrame frame{};
    while (queue_.pop(frame)) {
        lastFrame_    = frame;
        hasLastFrame_ = true;
    }
    if (!hasLastFrame_) {
        return false;
    }
    out = lastFrame_;
    return true;
}

}  // namespace fretless::audio
