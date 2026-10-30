#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

#include "TestHarness.h"
#include "fretless/audio/PitchDetector.h"

using fretless::audio::PitchDetector;
using fretless::audio::PitchDetectorConfig;

namespace {

constexpr double kSampleRate   = 48000.0;
constexpr double kTwoPi        = 6.283185307179586;
constexpr double kSeconds      = 1.2;
constexpr std::size_t kHop     = 512;
constexpr float kMinConfidence = 0.60f;
constexpr double kOctaveCents  = 300.0;

struct Note {
    const char* name;
    double      hz;
};

constexpr Note kCompass[] = {
    {"Sol3", 196.00}, {"Re4", 293.66}, {"La4", 440.00}, {"Mi5", 659.26},
    {"Mi6", 1318.51}, {"La6", 1760.00}, {"Mi7", 2637.02},
};

using Signal = std::vector<float>;
using Stage  = std::function<Signal(Signal)>;

struct ToneShape {
    double fundamentalDb = 0.0;
    double vibratoCents  = 0.0;
};

Signal bowedTone(double hz, ToneShape shape = {}) {
    const auto count = static_cast<std::size_t>(kSampleRate * kSeconds);
    const double fundamental = std::pow(10.0, shape.fundamentalDb / 20.0);
    Signal out(count);
    double phase = 0.0;
    for (std::size_t i = 0; i < count; ++i) {
        const double t = static_cast<double>(i) / kSampleRate;
        const double wobble = shape.vibratoCents * std::sin(kTwoPi * 5.5 * t) / 1200.0;
        phase += kTwoPi * hz * std::pow(2.0, wobble) / kSampleRate;
        double value = 0.0;
        for (int k = 1; k <= 30 && k * hz < 20000.0; ++k) {
            value += (k == 1 ? fundamental : 1.0) / k * std::sin(k * phase);
        }
        out[i] = static_cast<float>(value);
    }
    return out;
}

double rms(const Signal& x) {
    double sum = 0.0;
    for (const float v : x) sum += static_cast<double>(v) * v;
    return std::sqrt(sum / static_cast<double>(x.size()));
}

Stage biquad(bool lowPass, double cutoffHz) {
    return [lowPass, cutoffHz](Signal x) {
        const double w = kTwoPi * cutoffHz / kSampleRate;
        const double alpha = std::sin(w) / (2.0 * 0.7071);
        const double c = std::cos(w);
        const double b0 = lowPass ? (1.0 - c) / 2.0 : (1.0 + c) / 2.0;
        const double b1 = lowPass ? 1.0 - c : -(1.0 + c);
        const double a0 = 1.0 + alpha;
        const double a1 = -2.0 * c;
        const double a2 = 1.0 - alpha;
        double x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0;
        for (auto& sample : x) {
            const double y = (b0 * sample + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2) / a0;
            x2 = x1; x1 = sample; y2 = y1; y1 = y;
            sample = static_cast<float>(y);
        }
        return x;
    };
}

Stage lowPass(double hz) {
    return [hz](Signal x) { return biquad(true, hz)(biquad(true, hz)(biquad(true, hz)(std::move(x)))); };
}

Stage highPass(double hz) {
    return [hz](Signal x) { return biquad(false, hz)(biquad(false, hz)(std::move(x))); };
}

Stage noise(double snrDb, std::uint32_t seed = 7) {
    return [snrDb, seed](Signal x) {
        const double level = rms(x) / std::pow(10.0, snrDb / 20.0);
        std::uint32_t state = seed;
        const auto uniform = [&state] {
            state = state * 1664525u + 1013904223u;
            return (static_cast<double>(state) + 1.0) / 4294967297.0;
        };
        for (auto& sample : x) {
            const double gaussian = std::sqrt(-2.0 * std::log(uniform())) * std::cos(kTwoPi * uniform());
            sample = static_cast<float>(sample + level * gaussian);
        }
        return x;
    };
}

struct Reading {
    double heard      = 0.0;
    double octaveOff  = 0.0;
    double p90Cents   = 0.0;
    double meanCents  = 0.0;
};

Reading listen(const Signal& signal, double playedHz) {
    PitchDetector detector;
    PitchDetectorConfig config;
    config.sampleRate = kSampleRate;
    config.windowSize = 2048;
    detector.prepare(config);

    const std::size_t window = detector.requiredSamples();
    const auto warmup = static_cast<std::size_t>(kSampleRate * 0.15);
    std::size_t frames = 0, heard = 0, octave = 0;
    std::vector<double> cents;
    for (std::size_t end = std::max(window, warmup); end <= signal.size(); end += kHop) {
        ++frames;
        const auto estimate = detector.process(signal.data() + end - window, window);
        if (estimate.frequencyHz <= 0.0f || estimate.confidence < kMinConfidence) continue;
        const double offset = 1200.0 * std::log2(estimate.frequencyHz / playedHz);
        if (std::fabs(offset) > kOctaveCents) {
            ++octave;
        } else {
            ++heard;
            cents.push_back(offset);
        }
    }

    Reading reading;
    reading.heard = static_cast<double>(heard) / static_cast<double>(frames);
    reading.octaveOff = static_cast<double>(octave) / static_cast<double>(frames);
    if (!cents.empty()) {
        double sum = 0.0;
        for (const double c : cents) sum += c;
        reading.meanCents = sum / static_cast<double>(cents.size());
        std::vector<double> magnitudes;
        for (const double c : cents) magnitudes.push_back(std::fabs(c));
        std::sort(magnitudes.begin(), magnitudes.end());
        reading.p90Cents = magnitudes[magnitudes.size() * 9 / 10];
    }
    return reading;
}

void expectAtMost(const std::string& what, double actual, double limit, int line) {
    if (actual > limit) {
        char message[200];
        std::snprintf(message, sizeof message, "%s = %.3f, limit %.3f", what.c_str(), actual, limit);
        ::testing::reportFailure(__FILE__, line, message);
    }
}

void expectAtLeast(const std::string& what, double actual, double floor, int line) {
    if (actual < floor) {
        char message[200];
        std::snprintf(message, sizeof message, "%s = %.3f, floor %.3f", what.c_str(), actual, floor);
        ::testing::reportFailure(__FILE__, line, message);
    }
}

}  // namespace

TEST(pitch_robustness_survives_microphone_band_limits) {
    const std::pair<const char*, Stage> microphones[] = {
        {"bluetooth 3.4k", lowPass(3400.0)},
        {"headset 7k", lowPass(7000.0)},
        {"phone 400 Hz high-pass", highPass(400.0)},
    };
    for (const auto& [label, stage] : microphones) {
        for (const auto& note : kCompass) {
            const auto reading = listen(stage(bowedTone(note.hz)), note.hz);
            const std::string what = std::string(label) + " " + note.name;
            expectAtLeast(what + " heard", reading.heard, 0.98, __LINE__);
            expectAtMost(what + " p90 cents", reading.p90Cents, 6.0, __LINE__);
        }
    }
}

TEST(pitch_robustness_reads_a_clean_tone_without_bias) {
    for (const auto& note : kCompass) {
        const auto reading = listen(bowedTone(note.hz), note.hz);
        expectAtMost(std::string(note.name) + " mean cents", std::fabs(reading.meanCents), 0.5, __LINE__);
    }
}

TEST(pitch_robustness_hears_a_weak_fundamental) {
    for (const auto& note : kCompass) {
        const auto reading = listen(bowedTone(note.hz, {.fundamentalDb = -20.0}), note.hz);
        expectAtLeast(std::string(note.name) + " heard", reading.heard, 0.98, __LINE__);
        expectAtMost(std::string(note.name) + " octave", reading.octaveOff, 0.0, __LINE__);
    }
}

TEST(pitch_robustness_centres_vibrato_on_the_written_pitch) {
    for (const auto& note : kCompass) {
        const auto reading = listen(bowedTone(note.hz, {.vibratoCents = 25.0}), note.hz);
        expectAtLeast(std::string(note.name) + " heard", reading.heard, 0.98, __LINE__);
        expectAtMost(std::string(note.name) + " mean cents", std::fabs(reading.meanCents), 6.0, __LINE__);
    }
}

TEST(pitch_robustness_keeps_the_octave_in_room_noise) {
    for (const double snr : {10.0, 5.0}) {
        for (const auto& note : kCompass) {
            const auto reading = listen(noise(snr)(bowedTone(note.hz)), note.hz);
            const std::string what = std::to_string(static_cast<int>(snr)) + " dB " + note.name;
            expectAtMost(what + " octave", reading.octaveOff, 0.05, __LINE__);
            expectAtMost(what + " p90 cents", reading.p90Cents, 12.0, __LINE__);
        }
    }
}

TEST(pitch_robustness_keeps_the_octave_in_heavy_noise) {
    for (const auto& note : kCompass) {
        const auto signal = noise(3.0)(bowedTone(note.hz));
        const auto reading = listen(signal, note.hz);
        const std::string what = std::string("3 dB ") + note.name;
        expectAtMost(what + " octave", reading.octaveOff, 0.02, __LINE__);
        expectAtLeast(what + " heard", reading.heard, 0.80, __LINE__);
    }
}

TEST(pitch_robustness_reports_the_octave_actually_played) {
    const auto a5 = listen(noise(5.0)(bowedTone(880.0)), 880.0);
    expectAtMost("A5 in noise: octave", a5.octaveOff, 0.05, __LINE__);
    expectAtLeast("A5 in noise: heard", a5.heard, 0.80, __LINE__);

    const auto a4 = listen(noise(5.0)(bowedTone(440.0)), 440.0);
    expectAtMost("A4 in noise: octave", a4.octaveOff, 0.05, __LINE__);
    expectAtLeast("A4 in noise: heard", a4.heard, 0.80, __LINE__);
}

TEST(pitch_robustness_keeps_an_out_of_tune_player_out_of_tune) {
    const double played = 440.0 * std::pow(2.0, -40.0 / 1200.0);
    const auto reading = listen(noise(5.0)(bowedTone(played)), played);
    expectAtMost("flat A4 mean cents", std::fabs(reading.meanCents), 3.0, __LINE__);
    expectAtLeast("flat A4 heard", reading.heard, 0.80, __LINE__);
}

