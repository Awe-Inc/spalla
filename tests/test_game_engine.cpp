#include <cmath>
#include <string>
#include <vector>

#include "TestHarness.h"
#include "fretless/game/GameEngine.h"
#include "fretless/game/SyntheticPlayer.h"
#include "fretless/score/MusicXmlParser.h"

using namespace fretless;

namespace {

/// Four quarter notes at 60 BPM: one second each, A4 B4 C#5 D5.
std::string fourNotes() {
    return
        R"(<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><sound tempo="60"/></direction>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration></note>
      <note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch><duration>4</duration></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>)";
}

score::Score loadFourNotes() {
    const std::string xml = fourNotes();
    auto parsed = score::parseMusicXmlBuffer(xml.c_str(), xml.size());
    return parsed.value_or(score::Score{});
}

/// Feeds the engine a stream that is `centsOffset` away from whatever note is
/// written at that moment, at a realistic block rate.
void playAlong(game::GameEngine& engine, const score::Score& sheet,
               float centsOffset, double untilSeconds, bool silent = false) {
    constexpr double kStep  = 1.0 / 240.0;
    constexpr double kBlock = 256.0 / 48000.0;

    double nextBlock = 0.0;
    std::vector<audio::PitchFrame> frames;

    for (double t = engine.songTime(); t < untilSeconds; t += kStep) {
        frames.clear();
        while (nextBlock <= t) {
            audio::PitchFrame frame{};
            frame.streamTimeSec = nextBlock;
            const score::ScoreEvent* note = sheet.noteAt(nextBlock);
            if (note == nullptr || silent) {
                frame.flags     = audio::kFlagSilent;
                frame.rmsLinear = 0.0001f;
            } else {
                frame.frequencyHz = note->frequencyHz *
                                    std::pow(2.0f, centsOffset / 1200.0f);
                frame.confidence  = 0.95f;
                frame.rmsLinear   = 0.08f;
            }
            frames.push_back(frame);
            nextBlock += kBlock;
        }
        engine.update(kStep, frames.data(), frames.size());
    }
}

}  // namespace

TEST(game_engine_judges_each_note_exactly_once) {
    const auto sheet = loadFourNotes();
    CHECK_EQ(sheet.noteCount(), std::size_t{4});

    game::GameEngine engine;
    engine.setScore(&sheet);
    engine.setLeadInSeconds(0.0);
    engine.start();
    playAlong(engine, sheet, 0.0f, 6.0);

    // This is the invariant the per-audio-block prototype broke: a whole note
    // was scored ~85 times and a sixteenth twice.
    CHECK_EQ(engine.stats().judgedNotes, 4);
    CHECK_EQ(engine.allJudgements().size(), std::size_t{4});
}

TEST(game_engine_grades_by_distance_from_the_written_pitch) {
    const auto sheet = loadFourNotes();

    struct Case { float cents; game::HitGrade expected; };
    const Case cases[] = {
        {  0.0f, game::HitGrade::Perfect},
        {  8.0f, game::HitGrade::Perfect},
        { 15.0f, game::HitGrade::Great},
        { 30.0f, game::HitGrade::Good},
        {-30.0f, game::HitGrade::Good},
    };

    for (const auto& testCase : cases) {
        game::GameEngine engine;
        engine.setScore(&sheet);
        engine.setLeadInSeconds(0.0);
        engine.start();
        playAlong(engine, sheet, testCase.cents, 6.0);

        CHECK_EQ(engine.stats().judgedNotes, 4);
        CHECK(engine.allJudgements()[0].grade == testCase.expected);
    }
}

TEST(a_confidently_played_wrong_note_is_a_miss) {
    const auto sheet = loadFourNotes();

    game::GameEngine engine;
    engine.setScore(&sheet);
    engine.setLeadInSeconds(0.0);
    engine.start();
    // A whole semitone sharp: perfectly in tune with the wrong note. A tuner
    // would call this "in tune"; the game must not.
    playAlong(engine, sheet, 100.0f, 6.0);

    CHECK_EQ(engine.stats().miss, 4);
    CHECK_EQ(engine.stats().perfect, 0);
    CHECK_EQ(engine.stats().combo, 0);
}

TEST(silence_is_a_miss_and_breaks_the_combo) {
    const auto sheet = loadFourNotes();

    game::GameEngine engine;
    engine.setScore(&sheet);
    engine.setLeadInSeconds(0.0);
    engine.start();
    playAlong(engine, sheet, 0.0f, 6.0, /*silent=*/true);

    CHECK_EQ(engine.stats().miss, 4);
    CHECK_EQ(engine.stats().maxCombo, 0);
    CHECK_NEAR(engine.stats().accuracyPct, 0.0, 0.01);
}

TEST(intonation_drift_is_reported_with_its_sign) {
    const auto sheet = loadFourNotes();

    game::GameEngine engine;
    engine.setScore(&sheet);
    engine.setLeadInSeconds(0.0);
    engine.start();
    playAlong(engine, sheet, -18.0f, 6.0);

    // Playing flat must read as flat, not as an unsigned "18 cents off".
    CHECK_NEAR(engine.stats().meanSignedCents, -18.0, 1.0);
    CHECK_NEAR(engine.stats().meanAbsCents, 18.0, 1.0);
}

TEST(combo_multiplier_raises_the_value_of_a_streak) {
    const auto sheet = loadFourNotes();

    game::GameEngine engine;
    engine.setScore(&sheet);
    engine.setLeadInSeconds(0.0);
    engine.start();
    playAlong(engine, sheet, 0.0f, 6.0);

    const auto& judgements = engine.allJudgements();
    CHECK_EQ(judgements.size(), std::size_t{4});
    for (const auto& judgement : judgements) {
        CHECK(judgement.grade == game::HitGrade::Perfect);
    }
    // Four notes is below the 10-note step, so every note is worth the base.
    CHECK_EQ(engine.stats().score, 400);
    CHECK_EQ(engine.stats().maxCombo, 4);
}

TEST(pausing_freezes_the_song_clock) {
    const auto sheet = loadFourNotes();

    game::GameEngine engine;
    engine.setScore(&sheet);
    engine.setLeadInSeconds(0.0);
    engine.start();
    playAlong(engine, sheet, 0.0f, 1.5);

    const double frozen = engine.songTime();
    engine.pause();
    for (int i = 0; i < 100; ++i) {
        engine.update(0.01, nullptr, 0);
    }
    CHECK_NEAR(engine.songTime(), frozen, 1e-9);

    engine.resume();
    engine.update(0.01, nullptr, 0);
    CHECK(engine.songTime() > frozen);
}

TEST(the_synthetic_player_reproduces_its_configured_bias) {
    const auto sheet = loadFourNotes();

    game::GameEngine engine;
    engine.setScore(&sheet);
    engine.setLeadInSeconds(0.0);
    engine.start();

    game::SyntheticPlayer player;
    game::SyntheticPlayerConfig config;
    config.centsBias       = 12.0f;
    config.centsJitter     = 0.0f;
    config.centsWander     = 0.0f;
    config.missProbability = 0.0f;
    player.configure(config);
    player.reset();

    constexpr double kStep = 1.0 / 240.0;
    audio::PitchFrame frames[64];
    for (double t = 0.0; t < 6.0; t += kStep) {
        const std::size_t count = player.generate(sheet, t, t + kStep, frames, 64);
        engine.update(kStep, frames, count);
    }

    CHECK_EQ(engine.stats().judgedNotes, 4);
    CHECK_NEAR(engine.stats().meanSignedCents, 12.0, 1.5);
    // 12 cents is outside Perfect but inside Great.
    CHECK_EQ(engine.stats().great, 4);
}
