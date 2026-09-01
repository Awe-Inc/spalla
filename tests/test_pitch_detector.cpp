#include <cmath>
#include <vector>

#include "TestHarness.h"
#include "fretless/audio/AudioEngine.h"
#include "fretless/audio/PitchDetector.h"

using fretless::audio::PitchDetector;
using fretless::audio::PitchDetectorConfig;

namespace {

constexpr double kSampleRate = 48000.0;

/// A bowed string is nothing like a sine: the tone is rich in harmonics and
/// the fundamental is often weaker than the second partial. A detector that
/// only handles sines will report an octave error on a real violin, so the
/// tests drive it with a sawtooth-like partial stack.
std::vector<float> makeTone(double frequency, std::size_t sampleCount,
                            int harmonics = 8, double phase = 0.0) {
    std::vector<float> samples(sampleCount);
    for (std::size_t i = 0; i < sampleCount; ++i) {
        const double t = static_cast<double>(i) / kSampleRate;
        double value = 0.0;
        for (int h = 1; h <= harmonics; ++h) {
            value += std::sin(2.0 * 3.14159265358979 * frequency * h * t + phase) / h;
        }
        samples[i] = static_cast<float>(value * 0.3);
    }
    return samples;
}

PitchDetector makeDetector() {
    PitchDetector detector;
    PitchDetectorConfig config;
    config.sampleRate = kSampleRate;
    detector.prepare(config);
    return detector;
}

}  // namespace

TEST(pitch_detector_finds_the_open_strings) {
    auto detector = makeDetector();
    const double expected[] = {196.00, 293.66, 440.00, 659.26};   // G3 D4 A4 E5

    for (const double frequency : expected) {
        const auto samples = makeTone(frequency, detector.requiredSamples());
        const auto estimate = detector.process(samples.data(), samples.size());
        CHECK(estimate.frequencyHz > 0.0f);
        // Within 5 cents of the target.
        const double cents = 1200.0 * std::log2(estimate.frequencyHz / frequency);
        CHECK_NEAR(cents, 0.0, 5.0);
        CHECK(estimate.confidence > 0.5f);
    }
}

TEST(pitch_detector_resolves_small_detuning) {
    auto detector = makeDetector();
    // 440 Hz off by exactly -20 cents.
    const double target = 440.0 * std::pow(2.0, -20.0 / 1200.0);
    const auto samples = makeTone(target, detector.requiredSamples());
    const auto estimate = detector.process(samples.data(), samples.size());

    CHECK(estimate.frequencyHz > 0.0f);
    const double cents = 1200.0 * std::log2(estimate.frequencyHz / 440.0);
    CHECK_NEAR(cents, -20.0, 4.0);
}

TEST(pitch_detector_rejects_silence_and_noise) {
    auto detector = makeDetector();

    std::vector<float> silence(detector.requiredSamples(), 0.0f);
    const auto silent = detector.process(silence.data(), silence.size());
    CHECK_EQ(silent.frequencyHz, 0.0f);

    // Deterministic white-ish noise: no periodicity to find.
    std::vector<float> noise(detector.requiredSamples());
    std::uint32_t state = 12345;
    for (auto& sample : noise) {
        state = state * 1664525u + 1013904223u;
        sample = (static_cast<float>(state >> 8) / 8388608.0f - 1.0f) * 0.2f;
    }
    const auto noisy = detector.process(noise.data(), noise.size());
    // It may latch onto something, but never with high confidence.
    CHECK(noisy.frequencyHz == 0.0f || noisy.confidence < 0.6f);
}

TEST(pitch_detector_ignores_pitches_outside_the_violin_compass) {
    auto detector = makeDetector();
    // C2, an octave and a half below the G string.
    const auto samples = makeTone(65.41, detector.requiredSamples());
    const auto estimate = detector.process(samples.data(), samples.size());
    CHECK_EQ(estimate.frequencyHz, 0.0f);
}

TEST(pitch_detector_needs_a_full_window) {
    auto detector = makeDetector();
    const auto samples = makeTone(440.0, detector.requiredSamples() / 2);
    const auto estimate = detector.process(samples.data(), samples.size());
    CHECK_EQ(estimate.frequencyHz, 0.0f);   // refuses rather than guessing
}

TEST(frequency_to_note_conversion_round_trips) {
    char name[8] = {};

    fretless::audio::formatNoteName(440.0f, name, sizeof(name));
    CHECK(std::string(name) == "A4");

    fretless::audio::formatNoteName(196.0f, name, sizeof(name));
    CHECK(std::string(name) == "G3");

    fretless::audio::formatNoteName(659.255f, name, sizeof(name));
    CHECK(std::string(name) == "E5");

    CHECK_NEAR(fretless::audio::centsOffset(440.0f), 0.0, 0.01);
    // A quarter tone above A4 is +50 cents from A4, and the nearest semitone
    // boundary, so the offset saturates near the half-step edge.
    CHECK_NEAR(fretless::audio::centsOffset(440.0f * std::pow(2.0f, 20.0f / 1200.0f)),
               20.0, 0.1);
}
