#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <utility>
#include <vector>

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "fretless/audio/AudioEngine.h"
#include "fretless/audio/PitchDetector.h"
#include "fretless/curriculum/Exercise.h"
#include "fretless/curriculum/Generators.h"
#include "fretless/game/GameEngine.h"
#include "fretless/game/SyntheticPlayer.h"
#include "fretless/score/Beaming.h"
#include "fretless/score/MusicXmlParser.h"
#include "fretless/score/Score.h"

using emscripten::val;
using namespace fretless;

namespace {

const curriculum::Curriculum& sharedCurriculum() {
    static const curriculum::Curriculum curriculum = curriculum::buildCurriculum();
    return curriculum;
}

std::string latinName(int midi, int fifths) {
    char buffer[8] = {};
    score::writeLatinName(buffer, sizeof(buffer), midi, fifths);
    return buffer;
}

val eventToVal(const score::ScoreEvent& e, int fifths) {
    val o = val::object();
    o.set("startSeconds", e.startSeconds);
    o.set("durationSeconds", e.durationSeconds);
    o.set("startQuarters", e.startQuarters);
    o.set("frequencyHz", e.frequencyHz);
    o.set("midi", e.midi);
    o.set("measure", e.measure);
    o.set("measureIndex", e.measureIndex);
    o.set("beat", e.beat);
    o.set("isRest", e.isRest);
    o.set("isTiedFrom", e.isTiedFrom);
    o.set("string", static_cast<int>(e.suggestedString));
    o.set("bowSpan", static_cast<int>(e.bowSpan));
    o.set("bowSlot", static_cast<int>(e.bowSlot));
    o.set("noteName", std::string(e.noteName));
    o.set("latinName", e.isRest ? std::string() : latinName(e.midi, fifths));
    return o;
}

val measureToVal(const score::MeasureMark& m) {
    val o = val::object();
    o.set("number", m.number);
    o.set("startQuarters", m.startQuarters);
    o.set("startSeconds", m.startSeconds);
    o.set("endSeconds", m.endSeconds);
    o.set("lengthQuarters", m.lengthQuarters);
    o.set("beats", m.beats);
    o.set("beatUnit", m.beatUnit);
    o.set("beatOffset", m.beatOffset);
    return o;
}

val beamGroupsToVal(const score::Score& s) {
    std::vector<score::BeamGroup> groups;
    score::findBeamGroups(s, groups);
    val out = val::array();
    for (const auto& g : groups) {
        val o = val::object();
        o.set("first", static_cast<int>(g.first));
        o.set("last", static_cast<int>(g.last));
        out.call<void>("push", o);
    }
    return out;
}

val scoreToVal(const score::Score& s) {
    val o = val::object();
    o.set("title", s.title);
    o.set("composer", s.composer);
    o.set("partName", s.partName);
    o.set("beatsPerMinute", s.beatsPerMinute);
    o.set("beatsPerMeasure", s.beatsPerMeasure);
    o.set("beatUnit", s.beatUnit);
    o.set("keyFifths", s.keyFifths);
    o.set("durationSeconds", s.durationSeconds());
    o.set("noteCount", static_cast<int>(s.noteCount()));
    o.set("trimmedIntroSeconds", s.trimmedIntroSeconds);
    o.set("tempoScale", s.tempoScale());

    val events = val::array();
    for (const auto& e : s.events) {
        events.call<void>("push", eventToVal(e, s.keyFifths));
    }
    o.set("events", events);

    val measures = val::array();
    for (const auto& m : s.measures) {
        measures.call<void>("push", measureToVal(m));
    }
    o.set("measures", measures);
    o.set("beamGroups", beamGroupsToVal(s));
    return o;
}

val recipeToVal(const curriculum::Recipe& r) {
    val o = val::object();
    o.set("tonicMidi", r.tonicMidi);
    o.set("scale", std::string(curriculum::toString(r.scale)));
    o.set("octaves", r.octaves);
    o.set("fifths", r.fifths);
    o.set("descend", r.descend);
    o.set("string", r.string);
    o.set("otherString", r.otherString);
    o.set("maxPosition", r.maxPosition);
    o.set("noteQuarters", r.noteQuarters);
    o.set("beats", r.beats);
    o.set("beatUnit", r.beatUnit);
    o.set("repeats", r.repeats);
    o.set("bow", std::string(curriculum::toString(r.bow)));
    o.set("notesPerBow", curriculum::notesPerBow(r.bow));
    o.set("pattern", r.pattern);
    o.set("pieceIndex", r.pieceIndex);
    o.set("bars", r.bars);
    return o;
}

const char* kindName(curriculum::ExerciseKind kind) {
    using curriculum::ExerciseKind;
    switch (kind) {
        case ExerciseKind::Piece:           return "piece";
        case ExerciseKind::LongTone:        return "long-tone";
        case ExerciseKind::Scale:           return "scale";
        case ExerciseKind::StringCrossing:  return "string-crossing";
        case ExerciseKind::SingleString:    return "single-string";
        case ExerciseKind::FingerPattern:   return "finger-pattern";
        case ExerciseKind::RingTone:        return "ring-tone";
        case ExerciseKind::DroneInterval:   return "drone-interval";
        case ExerciseKind::Rhythm:          return "rhythm";
        case ExerciseKind::SightReading:    return "sight-reading";
        case ExerciseKind::IntervalReading: return "interval-reading";
        case ExerciseKind::Reference:       return "reference";
    }
    return "unknown";
}

val exerciseToVal(const curriculum::Exercise& e, const std::string& moduleId) {
    val o = val::object();
    o.set("id", e.id);
    o.set("moduleId", moduleId);
    o.set("title", e.title);
    o.set("subtitle", e.subtitle);
    o.set("focus", e.focus);
    o.set("howTo", e.howTo);
    o.set("source", e.source);
    o.set("level", e.level);
    o.set("defaultBpm", e.defaultBpm);
    o.set("minBpm", e.minBpm);
    o.set("maxBpm", e.maxBpm);
    o.set("kind", std::string(kindName(e.kind)));
    o.set("playable", curriculum::isPlayable(e.kind));
    o.set("droneMidi", e.droneMidi);
    o.set("metronome", e.metronome);
    o.set("freshEveryTime", e.freshEveryTime);
    o.set("recipe", recipeToVal(e.recipe));
    return o;
}

val curriculumToVal() {
    val modules = val::array();
    for (const auto& m : sharedCurriculum().modules) {
        val o = val::object();
        o.set("id", m.id);
        o.set("title", m.title);
        o.set("tagline", m.tagline);
        o.set("description", m.description);
        o.set("accent", m.accent);
        o.set("levelFrom", m.levelFrom);
        o.set("levelTo", m.levelTo);
        val exercises = val::array();
        for (const auto& e : m.exercises) {
            exercises.call<void>("push", exerciseToVal(e, m.id));
        }
        o.set("exercises", exercises);
        modules.call<void>("push", o);
    }
    return modules;
}

val buildExerciseScore(const std::string& exerciseId, std::uint32_t seed) {
    const auto* exercise = sharedCurriculum().findExercise(exerciseId);
    if (exercise == nullptr || !curriculum::isPlayable(exercise->kind)) {
        return val::null();
    }
    return scoreToVal(curriculum::buildScore(*exercise, seed));
}

val parseMusicXml(const val& bytes, const val& optionsVal) {
    const std::vector<std::uint8_t> data = emscripten::convertJSArrayToNumberVector<std::uint8_t>(bytes);
    score::ParseOptions options{};
    if (!optionsVal.isUndefined() && !optionsVal.isNull()) {
        if (optionsVal.hasOwnProperty("partIndex"))       options.partIndex = optionsVal["partIndex"].as<int>();
        if (optionsVal.hasOwnProperty("expandRepeats"))   options.expandRepeats = optionsVal["expandRepeats"].as<bool>();
        if (optionsVal.hasOwnProperty("trimSilentIntro")) options.trimSilentIntro = optionsVal["trimSilentIntro"].as<bool>();
        if (optionsVal.hasOwnProperty("mergeTies"))       options.mergeTies = optionsVal["mergeTies"].as<bool>();
    }
    std::string error;
    auto parsed = score::parseMusicXmlBuffer(reinterpret_cast<const char*>(data.data()), data.size(), &error, options);
    val result = val::object();
    if (!parsed) {
        result.set("ok", false);
        result.set("error", error);
        return result;
    }
    result.set("ok", true);
    result.set("score", scoreToVal(*parsed));
    return result;
}

val statsToVal(const game::GameStats& s) {
    val o = val::object();
    o.set("score", s.score);
    o.set("combo", s.combo);
    o.set("maxCombo", s.maxCombo);
    o.set("perfect", s.perfect);
    o.set("great", s.great);
    o.set("good", s.good);
    o.set("miss", s.miss);
    o.set("judgedNotes", s.judgedNotes);
    o.set("accuracyPct", s.accuracyPct);
    o.set("meanAbsCents", s.meanAbsCents);
    o.set("meanSignedCents", s.meanSignedCents);
    return o;
}

// The TypeScript side keys on the enum name; toString() is the native screen label.
const char* gradeId(game::HitGrade grade) {
    switch (grade) {
        case game::HitGrade::Perfect: return "Perfect";
        case game::HitGrade::Great:   return "Great";
        case game::HitGrade::Good:    return "Good";
        case game::HitGrade::Miss:    return "Miss";
        case game::HitGrade::None:    break;
    }
    return "Miss";
}

val judgementToVal(const game::NoteJudgement& j) {
    val o = val::object();
    o.set("eventIndex", static_cast<int>(j.eventIndex));
    o.set("grade", std::string(gradeId(j.grade)));
    o.set("meanCents", j.meanCents);
    o.set("worstCents", j.worstCents);
    o.set("onsetErrorSec", j.onsetErrorSec);
    o.set("voicedRatio", j.voicedRatio);
    o.set("points", j.points);
    o.set("comboAfter", j.comboAfter);
    o.set("judgedAtSec", j.judgedAtSec);
    return o;
}

const char* stateName(game::GameState state) {
    using game::GameState;
    switch (state) {
        case GameState::Idle:      return "idle";
        case GameState::Countdown: return "countdown";
        case GameState::Playing:   return "playing";
        case GameState::Paused:    return "paused";
        case GameState::Finished:  return "finished";
    }
    return "idle";
}

val frameToVal(const audio::PitchFrame& f) {
    val o = val::object();
    o.set("streamTimeSec", f.streamTimeSec);
    o.set("blockIndex", static_cast<double>(f.blockIndex));
    o.set("frequencyHz", f.frequencyHz);
    o.set("confidence", f.confidence);
    o.set("rmsLinear", f.rmsLinear);
    o.set("silent", (f.flags & audio::kFlagSilent) != 0);
    o.set("lowConfidence", (f.flags & audio::kFlagLowConfidence) != 0);
    o.set("clipped", (f.flags & audio::kFlagClipped) != 0);
    return o;
}

class LivePitchTracker {
public:
    LivePitchTracker(double sampleRate, int windowSize) {
        audio::PitchDetectorConfig config{};
        config.sampleRate = sampleRate;
        config.windowSize = static_cast<std::size_t>(std::max(windowSize, 256));
        detector_.prepare(config);
        window_.assign(detector_.requiredSamples(), 0.0f);
    }

    std::uintptr_t allocateInput(int frames) {
        input_.assign(static_cast<std::size_t>(std::max(frames, 1)), 0.0f);
        return reinterpret_cast<std::uintptr_t>(input_.data());
    }

    void setSilenceThreshold(float rms) { silenceThreshold_ = rms; }
    void setConfidenceThreshold(float c) { confidenceThreshold_ = c; }
    void setInputGain(float gain) { inputGain_ = gain; }

    val process(int frames, double streamTimeSec) {
        const std::size_t need  = window_.size();
        const std::size_t count = std::min<std::size_t>(static_cast<std::size_t>(std::max(frames, 0)), input_.size());
        audio::PitchFrame frame{};
        frame.streamTimeSec = streamTimeSec;
        frame.blockIndex    = blockIndex_++;
        std::uint32_t flags = audio::kFlagNone;

        if (count == 0) {
            frame.flags = flags | audio::kFlagSilent;
            return frameToVal(frame);
        }

        const std::size_t n = std::min(count, need);
        if (n < need) {
            std::memmove(window_.data(), window_.data() + n, (need - n) * sizeof(float));
        }
        float*       dst = window_.data() + (need - n);
        const float* src = input_.data() + (count - n);
        float sumSquares = 0.0f;
        float peak       = 0.0f;
        for (std::size_t i = 0; i < n; ++i) {
            const float s = src[i] * inputGain_;
            dst[i]        = s;
            sumSquares   += s * s;
            peak          = std::max(peak, std::fabs(s));
        }
        frame.rmsLinear = std::sqrt(sumSquares / static_cast<float>(n));
        if (peak >= 0.999f) {
            flags |= audio::kFlagClipped;
        }
        if (frame.rmsLinear < silenceThreshold_) {
            flags |= audio::kFlagSilent;
        } else {
            const audio::PitchEstimate estimate = detector_.process(window_.data(), need);
            frame.confidence = estimate.confidence;
            if (estimate.frequencyHz > 0.0f && estimate.confidence >= confidenceThreshold_) {
                frame.frequencyHz = estimate.frequencyHz;
            } else {
                flags |= audio::kFlagLowConfidence;
            }
        }
        frame.flags = flags;
        return frameToVal(frame);
    }

    int requiredSamples() const { return static_cast<int>(window_.size()); }

private:
    audio::PitchDetector detector_;
    std::vector<float>   window_;
    std::vector<float>   input_;
    std::uint64_t        blockIndex_          = 0;
    float                silenceThreshold_    = 0.0025f;
    float                confidenceThreshold_ = 0.60f;
    float                inputGain_           = 1.0f;
};

class Session {
public:
    bool loadExercise(const std::string& exerciseId, std::uint32_t seed) {
        const auto* exercise = sharedCurriculum().findExercise(exerciseId);
        if (exercise == nullptr || !curriculum::isPlayable(exercise->kind)) {
            return false;
        }
        full_ = curriculum::buildScore(*exercise, seed);
        score_ = full_;
        range_ = {-1, -1};
        attach();
        return true;
    }

    val loadMusicXml(const val& bytes, const val& options) {
        val result = parseMusicXml(bytes, options);
        if (!result["ok"].as<bool>()) {
            return result;
        }
        const std::vector<std::uint8_t> data = emscripten::convertJSArrayToNumberVector<std::uint8_t>(bytes);
        auto parsed = score::parseMusicXmlBuffer(reinterpret_cast<const char*>(data.data()), data.size());
        full_ = std::move(*parsed);
        score_ = full_;
        range_ = {-1, -1};
        attach();
        return result;
    }

    void setTempoScale(double scale) {
        if (scale > 0.0) {
            score_.applyTempoScale(scale);
        }
    }

    // A loop is a fresh score cut from the full one, so the engine, the staff
    // and the result all see "the piece" as just those bars: no special-casing
    // of a window inside GameEngine, and judgements index the sliced events.
    // The full score is kept unscaled; the active tempo is reapplied after
    // the cut so a slowed-down loop stays slowed down.
    bool setMeasureRange(int firstIndex, int lastIndex) {
        const double scale = score_.tempoScale();
        if (firstIndex < 0 || lastIndex < firstIndex ||
            static_cast<std::size_t>(lastIndex) >= full_.measures.size()) {
            score_ = full_;
            range_ = {-1, -1};
        } else {
            score_ = sliceMeasures(full_, static_cast<std::size_t>(firstIndex), static_cast<std::size_t>(lastIndex));
            range_ = {firstIndex, lastIndex};
        }
        if (scale > 0.0 && scale != 1.0) {
            score_.applyTempoScale(scale);
        }
        attach();
        return range_.first >= 0;
    }

    int measureCount() const { return static_cast<int>(full_.measures.size()); }
    int loopFirstMeasure() const { return range_.first; }
    int loopLastMeasure() const { return range_.second; }

    void setLeadInSeconds(double seconds) { engine_.setLeadInSeconds(seconds); }

    val score() const { return scoreToVal(score_); }

    void start()   { engine_.start(); }
    void pause()   { engine_.pause(); }
    void resume()  { engine_.resume(); }
    void stop()    { engine_.stop(); }
    void restart() { engine_.restart(); }

    void updateSilent(double deltaSeconds) { engine_.update(deltaSeconds, nullptr, 0); }

    void update(double deltaSeconds, double streamTimeSec, float frequencyHz, float confidence, float rms, bool silent) {
        audio::PitchFrame frame{};
        frame.streamTimeSec = streamTimeSec;
        frame.blockIndex    = blockIndex_++;
        frame.frequencyHz   = frequencyHz;
        frame.confidence    = confidence;
        frame.rmsLinear     = rms;
        frame.flags         = silent ? audio::kFlagSilent : audio::kFlagNone;
        engine_.update(deltaSeconds, &frame, 1);
    }

    // The browser e2e drives the real page without a microphone: the same
    // SyntheticPlayer the headless simulate() uses, but streamed one tick at
    // a time so the page's own loop, staff and result screen are exercised.
    void configureSyntheticPlayer(float centsBias, float centsJitter, float missProbability, std::uint32_t seed) {
        game::SyntheticPlayerConfig config;
        config.centsBias       = centsBias;
        config.centsJitter     = centsJitter;
        config.missProbability = missProbability;
        config.seed            = seed;
        player_.configure(config);
        player_.reset();
    }

    val synthesize(double fromSeconds, double toSeconds) {
        std::array<audio::PitchFrame, kMaxSynthesizedFramesPerCall> frames{};
        const std::size_t count = player_.generate(score_, fromSeconds, toSeconds, frames.data(), frames.size());
        val out = val::array();
        for (std::size_t i = 0; i < count; ++i) {
            out.call<void>("push", frameToVal(frames[i]));
        }
        return out;
    }

    std::string state() const { return stateName(engine_.state()); }
    double songTime() const { return engine_.songTime(); }
    int currentNoteIndex() const { return static_cast<int>(engine_.currentNoteIndex()); }
    val stats() const { return statsToVal(engine_.stats()); }

    val liveCents() const {
        float cents = 0.0f;
        if (!engine_.liveCents(cents)) {
            return val::null();
        }
        return val(cents);
    }

    val judgements() const {
        val out = val::array();
        for (const auto& j : engine_.allJudgements()) {
            out.call<void>("push", judgementToVal(j));
        }
        return out;
    }

    val simulate(float centsBias, float centsJitter, float missProbability, std::uint32_t seed) {
        game::SyntheticPlayerConfig config{};
        config.centsBias       = centsBias;
        config.centsJitter     = centsJitter;
        config.missProbability = missProbability;
        config.seed            = seed;
        game::SyntheticPlayer player;
        player.configure(config);
        player.reset();

        engine_.restart();
        engine_.start();
        constexpr double kStep = 1.0 / 60.0;
        std::vector<audio::PitchFrame> frames(64);
        double clock = 0.0;
        while (engine_.state() != game::GameState::Finished && clock < score_.durationSeconds() + 10.0) {
            const double from = engine_.songTime();
            engine_.update(kStep, nullptr, 0);
            const double to = engine_.songTime();
            const std::size_t produced = player.generate(score_, from, to, frames.data(), frames.size());
            if (produced > 0) {
                engine_.update(0.0, frames.data(), produced);
            }
            clock += kStep;
        }
        return stats();
    }

private:
    void attach() {
        engine_.stop();
        engine_.setScore(&score_);
        blockIndex_ = 0;
    }

    static score::Score sliceMeasures(const score::Score& full, std::size_t first, std::size_t last) {
        score::Score cut = full;
        const score::MeasureMark& head = full.measures[first];
        const score::MeasureMark& tail = full.measures[last];
        const double fromSeconds  = head.startSeconds;
        const double fromQuarters = head.startQuarters;
        const double toQuarters   = tail.startQuarters + tail.lengthQuarters;
        constexpr double kEpsilon = 1.0 / 512.0;

        cut.measures.assign(full.measures.begin() + static_cast<std::ptrdiff_t>(first),
                            full.measures.begin() + static_cast<std::ptrdiff_t>(last) + 1);
        for (auto& m : cut.measures) {
            m.startSeconds  -= fromSeconds;
            m.endSeconds    -= fromSeconds;
            m.startQuarters -= fromQuarters;
        }
        cut.beatsPerMeasure = head.beats;
        cut.beatUnit        = head.beatUnit;

        cut.events.clear();
        for (const auto& e : full.events) {
            if (e.startQuarters < fromQuarters - kEpsilon || e.startQuarters >= toQuarters - kEpsilon) continue;
            score::ScoreEvent shifted = e;
            shifted.startSeconds  -= fromSeconds;
            shifted.startQuarters -= fromQuarters;
            shifted.measureIndex  -= static_cast<int>(first);
            cut.events.push_back(shifted);
        }

        std::vector<score::TempoMark> tempos;
        double tempoAtCut = full.beatsPerMinute;
        for (const auto& t : full.tempoMap) {
            if (t.quarterPosition <= fromQuarters + kEpsilon) {
                tempoAtCut = t.beatsPerMinute;
            } else if (t.quarterPosition < toQuarters) {
                tempos.push_back({t.quarterPosition - fromQuarters, t.beatsPerMinute});
            }
        }
        tempos.insert(tempos.begin(), score::TempoMark{0.0, tempoAtCut});
        cut.tempoMap       = std::move(tempos);
        cut.beatsPerMinute = tempoAtCut;
        return cut;
    }

    score::Score            full_;
    score::Score            score_;
    std::pair<int, int>     range_{-1, -1};
    game::GameEngine        engine_;
    game::SyntheticPlayer   player_;
    std::uint64_t           blockIndex_ = 0;

    static constexpr std::size_t kMaxSynthesizedFramesPerCall = 64;
};

std::string noteName(int midi, int fifths) { return latinName(midi, fifths); }

std::string stringName(int index) {
    if (index < 0 || index >= score::kStringCount) {
        return std::string();
    }
    return score::kStringName[index];
}

int openStringMidi(int index) {
    if (index < 0 || index >= score::kStringCount) {
        return -1;
    }
    return score::kOpenStringMidi[index];
}

float centsBetween(float frequencyHz, float referenceHz) {
    if (frequencyHz <= 0.0f || referenceHz <= 0.0f) {
        return 0.0f;
    }
    return 1200.0f * std::log2(frequencyHz / referenceHz);
}

}  // namespace

EMSCRIPTEN_BINDINGS(fretless_core) {
    emscripten::function("buildCurriculum", &curriculumToVal);
    emscripten::function("buildExerciseScore", &buildExerciseScore);
    emscripten::function("parseMusicXml", &parseMusicXml);
    emscripten::function("noteName", &noteName);
    emscripten::function("stringName", &stringName);
    emscripten::function("openStringMidi", &openStringMidi);
    emscripten::function("midiToFrequency", &score::midiToFrequency);
    emscripten::function("centsBetween", &centsBetween);

    emscripten::class_<LivePitchTracker>("LivePitchTracker")
        .constructor<double, int>()
        .function("allocateInput", &LivePitchTracker::allocateInput)
        .function("process", &LivePitchTracker::process)
        .function("requiredSamples", &LivePitchTracker::requiredSamples)
        .function("setSilenceThreshold", &LivePitchTracker::setSilenceThreshold)
        .function("setConfidenceThreshold", &LivePitchTracker::setConfidenceThreshold)
        .function("setInputGain", &LivePitchTracker::setInputGain);

    emscripten::class_<Session>("Session")
        .constructor<>()
        .function("loadExercise", &Session::loadExercise)
        .function("loadMusicXml", &Session::loadMusicXml)
        .function("setTempoScale", &Session::setTempoScale)
        .function("setLeadInSeconds", &Session::setLeadInSeconds)
        .function("setMeasureRange", &Session::setMeasureRange)
        .function("measureCount", &Session::measureCount)
        .function("loopFirstMeasure", &Session::loopFirstMeasure)
        .function("loopLastMeasure", &Session::loopLastMeasure)
        .function("score", &Session::score)
        .function("start", &Session::start)
        .function("pause", &Session::pause)
        .function("resume", &Session::resume)
        .function("stop", &Session::stop)
        .function("restart", &Session::restart)
        .function("update", &Session::update)
        .function("updateSilent", &Session::updateSilent)
        .function("state", &Session::state)
        .function("songTime", &Session::songTime)
        .function("currentNoteIndex", &Session::currentNoteIndex)
        .function("stats", &Session::stats)
        .function("liveCents", &Session::liveCents)
        .function("judgements", &Session::judgements)
        .function("simulate", &Session::simulate)
        .function("configureSyntheticPlayer", &Session::configureSyntheticPlayer)
        .function("synthesize", &Session::synthesize);
}
