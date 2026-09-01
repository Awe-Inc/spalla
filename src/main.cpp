// ═══════════════════════════════════════════════════════════════════════════
//  main.cpp — entry point and CLI
//
//    Fretless                       launch the game
//    Fretless --list-devices        enumerate input devices and exit
//    Fretless --test-audio [secs]   headless pitch readout (default 5 s)
//    Fretless --test-score <file>   parse a MusicXML file and dump its notes
//    Fretless --song <file>         launch straight into a song
// ═══════════════════════════════════════════════════════════════════════════

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <thread>

#include "fretless/app/Application.h"
#include "fretless/audio/AudioEngine.h"
#include "fretless/game/GameEngine.h"
#include "fretless/game/SyntheticPlayer.h"
#include "fretless/score/MusicXmlParser.h"

namespace {

int listDevices() {
    const auto devices = fretless::audio::AudioEngine::enumerateInputDevices();
    if (devices.empty()) {
        std::printf("No input devices found.\n");
        return 1;
    }
    std::printf("%-4s %-46s %-22s %8s %10s\n", "idx", "name", "host api", "rate", "latency");
    std::printf("%s\n", std::string(94, '-').c_str());
    for (const auto& d : devices) {
        std::printf("%-4d %-46.46s %-22.22s %8.0f %8.1fms%s\n",
                    d.index, d.name.c_str(), d.hostApi.c_str(),
                    d.defaultSampleRate, d.lowInputLatencySec * 1000.0,
                    d.isDefault ? "  <- default" : "");
    }
    return 0;
}

int testAudio(double seconds, int deviceIndex, bool sharedMode) {
    fretless::audio::AudioEngine audio;
    fretless::audio::AudioConfig config;
    config.deviceIndex         = deviceIndex;
    config.preferExclusiveMode = !sharedMode;

    std::string error;
    if (!audio.initialize(config, &error)) {
        std::fprintf(stderr, "error: %s\n", error.c_str());
        return 1;
    }
    std::printf("backend=%s  rate=%.0f Hz  input latency=%.2f ms  block=%u frames\n\n",
                audio.backendName().c_str(), audio.sampleRate(),
                audio.inputLatencySec() * 1000.0, config.framesPerBuffer);

    if (!audio.start(&error)) {
        std::fprintf(stderr, "error: %s\n", error.c_str());
        return 1;
    }
    std::printf("Play something for %.0f seconds...\n\n", seconds);

    const auto deadline = std::chrono::steady_clock::now() +
                          std::chrono::milliseconds(static_cast<long long>(seconds * 1000.0));

    fretless::audio::PitchFrame frames[64];
    std::uint64_t voiced = 0;
    std::uint64_t total  = 0;

    // Level statistics are reported whether or not anything is detected: when
    // a user says "the tuner does not move", the first question is always
    // whether the samples are arriving at all, and at what amplitude.
    float  peakRms      = 0.0f;
    double sumRms       = 0.0;
    std::uint64_t silentBlocks     = 0;
    std::uint64_t lowConfidence    = 0;
    std::uint64_t clipped          = 0;
    float  bestConfidence = 0.0f;

    while (std::chrono::steady_clock::now() < deadline) {
        const std::size_t n = audio.poll(frames, 64);
        for (std::size_t i = 0; i < n; ++i) {
            const auto& f = frames[i];
            ++total;
            peakRms = (f.rmsLinear > peakRms) ? f.rmsLinear : peakRms;
            sumRms += f.rmsLinear;
            bestConfidence = (f.confidence > bestConfidence) ? f.confidence : bestConfidence;
            silentBlocks  += ((f.flags & fretless::audio::kFlagSilent) != 0) ? 1u : 0u;
            lowConfidence += ((f.flags & fretless::audio::kFlagLowConfidence) != 0) ? 1u : 0u;
            clipped       += ((f.flags & fretless::audio::kFlagClipped) != 0) ? 1u : 0u;

            if (f.frequencyHz <= 0.0f) {
                continue;
            }
            ++voiced;
            // One line per ~46 ms so the console stays readable.
            if (voiced % 8 != 0) {
                continue;
            }
            char note[8] = {};
            fretless::audio::formatNoteName(f.frequencyHz, note, sizeof(note));
            const float cents = fretless::audio::centsOffset(f.frequencyHz);
            std::printf("  %-4s %8.2f Hz  %+6.1f cents %s  conf=%.2f  rms=%.4f\n",
                        note, static_cast<double>(f.frequencyHz),
                        static_cast<double>(cents),
                        (cents > 5.0f ? "#" : (cents < -5.0f ? "b" : "=")),
                        static_cast<double>(f.confidence),
                        static_cast<double>(f.rmsLinear));
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }

    audio.stop();

    const double meanRms = (total > 0) ? sumRms / static_cast<double>(total) : 0.0;
    std::printf("\n%llu blocks, %llu voiced, %llu dropped, %llu overflows\n",
                static_cast<unsigned long long>(total),
                static_cast<unsigned long long>(voiced),
                static_cast<unsigned long long>(audio.droppedFrames()),
                static_cast<unsigned long long>(audio.inputOverflows()));
    std::printf("level: peak rms %.6f, mean rms %.6f  (gate %.6f)\n",
                static_cast<double>(peakRms), meanRms,
                static_cast<double>(config.silenceRmsThreshold));
    std::printf("rejected: %llu silent, %llu low confidence, %llu clipped"
                "  (best confidence %.2f, threshold %.2f)\n",
                static_cast<unsigned long long>(silentBlocks),
                static_cast<unsigned long long>(lowConfidence),
                static_cast<unsigned long long>(clipped),
                static_cast<double>(bestConfidence),
                static_cast<double>(config.confidenceThreshold));

    if (voiced == 0) {
        std::printf("\ndiagnosis: ");
        if (peakRms < 1e-5) {
            std::printf("the stream is delivering silence. The device is muted,\n"
                        "  or exclusive mode is not receiving from this endpoint.\n"
                        "  Try --shared, or pick another device with --device.\n");
        } else if (peakRms < config.silenceRmsThreshold) {
            std::printf("signal is arriving but sits below the noise gate.\n"
                        "  Raise the input level in Windows, or lower the gate.\n");
        } else {
            std::printf("signal is present and loud enough, but no stable pitch\n"
                        "  was found. Room noise, or the source is not a sustained tone.\n");
        }
    }
    return 0;
}

int testScore(const char* path) {
    std::string error;
    const auto score = fretless::score::parseMusicXml(path, &error);
    if (!score.has_value()) {
        std::fprintf(stderr, "error: %s\n", error.c_str());
        return 1;
    }
    const auto& s = *score;
    std::printf("title      : %s\n", s.title.c_str());
    std::printf("part       : %s\n", s.partName.c_str());
    std::printf("tempo      : %.1f BPM\n", s.beatsPerMinute);
    std::printf("time sig   : %d/%d\n", s.beatsPerMeasure, s.beatUnit);
    std::printf("key        : %d fifths\n", s.keyFifths);
    std::printf("events     : %zu (%zu notes, %zu rests)\n",
                s.events.size(), s.noteCount(), s.events.size() - s.noteCount());
    std::printf("duration   : %.2f s\n\n", s.durationSeconds());

    const std::size_t limit = s.events.size() < 40 ? s.events.size() : 40;
    for (std::size_t i = 0; i < limit; ++i) {
        const auto& n = s.events[i];
        if (n.isRest) {
            std::printf("  m%-3d t=%7.3f  REST            dur=%.3f\n",
                        n.measure, n.startSeconds, n.durationSeconds);
        } else {
            std::printf("  m%-3d t=%7.3f  %-4s %8.2f Hz  dur=%.3f  midi=%d  string=%c\n",
                        n.measure, n.startSeconds, n.noteName, n.frequencyHz,
                        n.durationSeconds, n.midi, "GDAE"[n.suggestedString]);
        }
    }
    if (limit < s.events.size()) {
        std::printf("  ... %zu more\n", s.events.size() - limit);
    }
    return 0;
}

/// Runs a whole score against the synthetic player with no window and no
/// microphone, then prints the report. This is the integration test for the
/// score parser, the timeline and the judgement rules in one command.
int simulate(const char* path, float centsBias, float centsJitter, float missRate) {
    std::string error;
    const auto parsed = fretless::score::parseMusicXml(path, &error);
    if (!parsed.has_value()) {
        std::fprintf(stderr, "error: %s\n", error.c_str());
        return 1;
    }
    const auto& score = *parsed;

    fretless::game::GameEngine engine;
    engine.setScore(&score);
    engine.setLeadInSeconds(0.25);
    engine.start();

    fretless::game::SyntheticPlayer player;
    fretless::game::SyntheticPlayerConfig playerConfig;
    playerConfig.centsBias       = centsBias;
    playerConfig.centsJitter     = centsJitter;
    playerConfig.missProbability = missRate;
    player.configure(playerConfig);
    player.reset();

    std::printf("%s  -  %zu notes  -  %.1f s  -  virtual player: "
                "bias %+.1f c, jitter %.1f c, miss %.0f%%\n\n",
                score.title.c_str(), score.noteCount(), score.durationSeconds(),
                static_cast<double>(centsBias), static_cast<double>(centsJitter),
                static_cast<double>(missRate * 100.0f));

    constexpr double kStep = 1.0 / 120.0;
    fretless::audio::PitchFrame frames[256];
    const double end = score.durationSeconds() + 1.0;

    for (double t = engine.songTime(); t < end; t += kStep) {
        const std::size_t count = (t >= 0.0)
            ? player.generate(score, t, t + kStep, frames, 256)
            : 0;
        engine.update(kStep, frames, count);
    }

    const auto& stats = engine.stats();
    std::printf("  score       %d\n", stats.score);
    std::printf("  judged      %d / %zu notes\n", stats.judgedNotes, score.noteCount());
    std::printf("  perfect     %d\n", stats.perfect);
    std::printf("  great       %d\n", stats.great);
    std::printf("  good        %d\n", stats.good);
    std::printf("  missed      %d\n", stats.miss);
    std::printf("  max combo   %d\n", stats.maxCombo);
    std::printf("  accuracy    %.1f%%\n", static_cast<double>(stats.accuracyPct));
    std::printf("  intonation  %+.2f c mean, %.2f c mean absolute\n",
                static_cast<double>(stats.meanSignedCents),
                static_cast<double>(stats.meanAbsCents));

    // Every note must receive exactly one verdict: no double counting, none
    // silently dropped. This is the invariant the per-block prototype broke.
    const bool complete = static_cast<std::size_t>(stats.judgedNotes) == score.noteCount();
    std::printf("\n  %s every note judged exactly once\n", complete ? "OK  " : "FAIL");
    return complete ? 0 : 1;
}

}  // namespace

int main(int argc, char** argv) {
    const char* songPath       = nullptr;
    const char* screenshotPath = nullptr;
    double      screenshotAt   = 6.0;
    int         deviceIndex    = -1;
    bool        sharedMode     = false;

    for (int i = 1; i < argc; ++i) {
        const char* arg = argv[i];

        if (std::strcmp(arg, "--list-devices") == 0) {
            return listDevices();
        }
        if (std::strcmp(arg, "--test-audio") == 0) {
            const double secs = (i + 1 < argc && argv[i + 1][0] != '-')
                ? std::atof(argv[++i]) : 5.0;
            // Trailing flags are consumed here so --test-audio can be combined
            // with --device and --shared in any order.
            for (int j = i + 1; j < argc; ++j) {
                if (std::strcmp(argv[j], "--shared") == 0) {
                    sharedMode = true;
                } else if (std::strcmp(argv[j], "--device") == 0 && j + 1 < argc) {
                    deviceIndex = std::atoi(argv[++j]);
                }
            }
            return testAudio(secs, deviceIndex, sharedMode);
        }
        if (std::strcmp(arg, "--test-score") == 0) {
            if (i + 1 >= argc) {
                std::fprintf(stderr, "--test-score needs a file path\n");
                return 2;
            }
            return testScore(argv[++i]);
        }
        if (std::strcmp(arg, "--simulate") == 0) {
            if (i + 1 >= argc) {
                std::fprintf(stderr, "--simulate needs a file path\n");
                return 2;
            }
            const char* file = argv[++i];
            float bias = 0.0f, jitter = 7.0f, miss = 0.04f;
            for (int j = i + 1; j + 1 < argc; j += 2) {
                if (std::strcmp(argv[j], "--bias") == 0)   { bias   = static_cast<float>(std::atof(argv[j + 1])); }
                else if (std::strcmp(argv[j], "--jitter") == 0) { jitter = static_cast<float>(std::atof(argv[j + 1])); }
                else if (std::strcmp(argv[j], "--miss") == 0)   { miss   = static_cast<float>(std::atof(argv[j + 1])); }
                else { break; }
            }
            return simulate(file, bias, jitter, miss);
        }
        if (std::strcmp(arg, "--screenshot") == 0 && i + 1 < argc) {
            screenshotPath = argv[++i];
            continue;
        }
        if (std::strcmp(arg, "--at") == 0 && i + 1 < argc) {
            screenshotAt = std::atof(argv[++i]);
            continue;
        }
        if (std::strcmp(arg, "--device") == 0 && i + 1 < argc) {
            deviceIndex = std::atoi(argv[++i]);
            continue;
        }
        if (std::strcmp(arg, "--shared") == 0) {
            sharedMode = true;
            continue;
        }
        if (std::strcmp(arg, "--song") == 0 && i + 1 < argc) {
            songPath = argv[++i];
            continue;
        }
        if (std::strcmp(arg, "--help") == 0 || std::strcmp(arg, "-h") == 0) {
            std::printf(
                "Fretless " FRETLESS_VERSION "\n\n"
                "  Fretless                     launch the game\n"
                "  Fretless --song <file>       launch straight into a song\n"
                "  Fretless --list-devices      enumerate audio input devices\n"
                "  Fretless --test-audio [s]    headless pitch readout\n"
                "  Fretless --test-score <file> parse a MusicXML file\n"
                "  Fretless --device <index>    pick an input device\n"
                "\n"
                "  Fretless --simulate <file> [--bias c] [--jitter c] [--miss p]\n"
                "        run a virtual violinist through the score and print the report\n"
                "  Fretless --screenshot <out.png> [--song <file>] [--at <seconds>]\n"
                "        render one frame offscreen; needs no microphone\n");
            return 0;
        }
        std::fprintf(stderr, "unknown argument: %s (try --help)\n", arg);
        return 2;
    }

    fretless::app::ApplicationConfig config;
    config.audio.deviceIndex = deviceIndex;
    if (songPath != nullptr) {
        config.initialSong = songPath;
    }
    if (screenshotPath != nullptr) {
        config.screenshotPath      = screenshotPath;
        config.screenshotAtSeconds = screenshotAt;
    }

    fretless::app::Application app;
    std::string error;
    if (!app.initialize(config, &error)) {
        std::fprintf(stderr, "fatal: %s\n", error.c_str());
        return 1;
    }
    app.run();
    app.shutdown();
    return 0;
}
