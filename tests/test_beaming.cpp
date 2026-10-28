#include <string>
#include <vector>

#include "TestHarness.h"
#include "fretless/score/Beaming.h"

using namespace fretless::score;

namespace {

/// A score at 60 BPM, so one quarter is one second, laid out from written
/// lengths in quarters. A negative length is a rest of that length.
Score line(const std::vector<double>& lengths, int beats = 4, int unit = 4) {
    Score score;
    score.beatsPerMinute  = 60.0;
    score.beatsPerMeasure = beats;
    score.beatUnit        = unit;
    const double measureQuarters = beats * 4.0 / unit;

    double position = 0.0;
    for (const double length : lengths) {
        ScoreEvent event;
        event.startQuarters   = position;
        event.startSeconds    = position;
        event.durationSeconds = length < 0.0 ? -length : length;
        event.isRest          = length < 0.0;
        event.midi            = event.isRest ? -1 : 69;
        const int measureIndex = static_cast<int>(position / measureQuarters + 1e-9);
        event.measure          = measureIndex + 1;
        event.beat             = static_cast<float>(
            (position - measureIndex * measureQuarters) * unit / 4.0 + 1.0);
        score.events.push_back(event);
        position += event.durationSeconds;
    }
    return score;
}

/// Groups as "first-last" pairs, for a one-line comparison in the failure.
std::string describe(const Score& score) {
    std::vector<BeamGroup> groups;
    findBeamGroups(score, groups);
    std::string text;
    for (const auto& group : groups) {
        if (!text.empty()) {
            text += ' ';
        }
        text += std::to_string(group.first) + "-" + std::to_string(group.last);
    }
    return text;
}

void expectGroups(const char* file, int line, const Score& score, const std::string& expected) {
    const std::string actual = describe(score);
    if (actual != expected) {
        ::testing::reportFailure(file, line,
                                 "groups \"" + actual + "\", expected \"" + expected + "\"");
    }
}

#define EXPECT_GROUPS(score, expected) expectGroups(__FILE__, __LINE__, score, expected)

}  // namespace

TEST(beam_count_follows_the_nominal_note) {
    CHECK_EQ(beamCount(1.0), 0);
    CHECK_EQ(beamCount(1.5), 0);
    CHECK_EQ(beamCount(0.5), 1);
    CHECK_EQ(beamCount(0.25), 2);
    CHECK_EQ(beamCount(0.125), 3);
    CHECK_EQ(beamCount(0.0625), 4);
    CHECK_EQ(beamCount(0.75), 1);
    CHECK_EQ(beamCount(0.375), 2);
    CHECK_EQ(beamCount(1.0 / 3.0), 1);
    CHECK_EQ(beamCount(1.0 / 6.0), 2);
    CHECK_EQ(beamCount(0.0), 0);
}

TEST(beam_span_is_a_beat_or_a_dotted_quarter) {
    CHECK_NEAR(beamSpanQuarters(4, 4), 1.0, 1e-9);
    CHECK_NEAR(beamSpanQuarters(3, 4), 1.0, 1e-9);
    CHECK_NEAR(beamSpanQuarters(2, 2), 2.0, 1e-9);
    CHECK_NEAR(beamSpanQuarters(6, 8), 1.5, 1e-9);
    CHECK_NEAR(beamSpanQuarters(9, 8), 1.5, 1e-9);
    CHECK_NEAR(beamSpanQuarters(5, 8), 0.5, 1e-9);
}

TEST(duration_in_quarters_ignores_the_tempo_control) {
    Score score = line({0.5, 0.5, 1.0});
    score.applyTempoScale(2.0);
    CHECK_NEAR(durationQuarters(score, 0), 0.5, 1e-9);
    CHECK_NEAR(durationQuarters(score, 2), 1.0, 1e-9);
    CHECK_NEAR(durationQuarters(score, 9), 0.0, 1e-9);
}

TEST(eighths_pair_up_by_beat_in_four_four) {
    EXPECT_GROUPS(line({0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5}), "0-1 2-3 4-5 6-7");
}

TEST(sixteenths_fill_one_beam_per_beat) {
    EXPECT_GROUPS(line({0.25, 0.25, 0.25, 0.25, 0.5, 0.25, 0.25, 1.0, 1.0}), "0-3 4-6");
}

TEST(compound_time_beams_in_threes) {
    EXPECT_GROUPS(line({0.5, 0.5, 0.5, 0.5, 0.5, 0.5}, 6, 8), "0-2 3-5");
}

TEST(quarters_and_rests_break_a_beam) {
    EXPECT_GROUPS(line({0.25, -0.25, 0.25, 0.25, 0.5, 1.0, 0.5, 1.0}), "2-3");
}

TEST(a_lone_eighth_keeps_its_flag) {
    EXPECT_GROUPS(line({1.0, 0.5, 1.0, 0.5, 1.0}), "");
}

TEST(beams_do_not_cross_the_barline) {
    EXPECT_GROUPS(line({0.5, 0.5, 0.5, 0.5}, 1, 4), "0-1 2-3");
    EXPECT_GROUPS(line({1.0, 1.0, 1.0, 0.5, 0.5, 0.5, 0.5}), "3-4 5-6");
}

TEST(dotted_eighth_and_sixteenth_share_a_beam) {
    EXPECT_GROUPS(line({0.75, 0.25, 0.75, 0.25, 2.0}), "0-1 2-3");
}

TEST(triplet_eighths_beam_together) {
    const double third = 1.0 / 3.0;
    EXPECT_GROUPS(line({third, third, third, third, third, third, 2.0}), "0-2 3-5");
}
