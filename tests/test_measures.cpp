#include <string>
#include <vector>

#include "TestHarness.h"
#include "fretless/curriculum/ScoreBuilder.h"
#include "fretless/score/Beaming.h"
#include "fretless/score/MusicXmlParser.h"

using namespace fretless::score;

namespace {

/// Each entry is one measure's body. The first gets divisions of 2 (so an
/// eighth is 1) and a tempo of 60, which makes a quarter exactly one second.
std::string piece(const std::vector<std::string>& measures, const char* firstAttributes,
                  const char* firstMeasureAttributes = "") {
    std::string body;
    for (std::size_t i = 0; i < measures.size(); ++i) {
        body += "<measure number=\"" + std::to_string(i + 1) + "\"" +
                (i == 0 ? firstMeasureAttributes : "") + ">";
        if (i == 0) {
            body += std::string("<attributes><divisions>2</divisions>") + firstAttributes +
                    "</attributes><direction><sound tempo=\"60\"/></direction>";
        }
        body += measures[i] + "</measure>";
    }
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><score-partwise version=\"4.0\">"
           "<part-list><score-part id=\"P1\"><part-name>Violin</part-name></score-part>"
           "</part-list><part id=\"P1\">" + body + "</part></score-partwise>";
}

std::string note(int duration, const char* step = "A") {
    return std::string("<note><pitch><step>") + step +
           "</step><octave>4</octave></pitch><duration>" + std::to_string(duration) +
           "</duration></note>";
}

std::string notes(int count, int duration) {
    std::string out;
    for (int i = 0; i < count; ++i) {
        out += note(duration);
    }
    return out;
}

std::string meter(int beats, int unit) {
    return "<time><beats>" + std::to_string(beats) + "</beats><beat-type>" +
           std::to_string(unit) + "</beat-type></time>";
}

std::string tempo(int bpm) {
    return "<direction><sound tempo=\"" + std::to_string(bpm) + "\"/></direction>";
}

Score parse(const std::string& xml) {
    std::string error;
    auto score = parseMusicXmlBuffer(xml.c_str(), xml.size(), &error);
    if (!score.has_value()) {
        ::testing::reportFailure(__FILE__, __LINE__, "parse failed: " + error);
        return {};
    }
    return *score;
}

constexpr const char* kThreeFour = "<time><beats>3</beats><beat-type>4</beat-type></time>";
constexpr const char* kFourFour  = "<time><beats>4</beats><beat-type>4</beat-type></time>";

}  // namespace

TEST(a_pickup_measure_starts_the_first_full_bar_after_it) {
    const Score score = parse(piece({note(2), note(6), note(6)}, kThreeFour,
                                    " implicit=\"yes\""));
    CHECK_EQ(score.measures.size(), std::size_t{3});
    if (score.measures.size() != 3) {
        return;
    }
    CHECK_NEAR(score.measures[0].startSeconds, 0.0, 1e-9);
    CHECK_NEAR(score.measures[1].startSeconds, 1.0, 1e-9);
    CHECK_NEAR(score.measures[2].startSeconds, 4.0, 1e-9);
    CHECK_NEAR(score.measures[0].beatOffset, 2.0, 1e-9);
    CHECK_NEAR(score.measures[1].beatOffset, 0.0, 1e-9);
    CHECK_NEAR(score.events[0].beat, 3.0f, 1e-6);
    CHECK_NEAR(score.events[1].beat, 1.0f, 1e-6);
}

TEST(a_tempo_change_moves_every_later_barline) {
    const Score score =
        parse(piece({note(8), tempo(120) + note(8), note(8)}, kFourFour));
    CHECK_EQ(score.measures.size(), std::size_t{3});
    if (score.measures.size() != 3) {
        return;
    }
    CHECK_NEAR(score.measures[1].startSeconds, 4.0, 1e-9);
    CHECK_NEAR(score.measures[2].startSeconds, 6.0, 1e-9);
    CHECK_NEAR(score.measures[2].endSeconds, 8.0, 1e-9);
    CHECK_NEAR(score.measures[0].clicksPerMinute(), 60.0, 1e-9);
    CHECK_NEAR(score.measures[1].clicksPerMinute(), 120.0, 1e-9);
}

TEST(a_time_signature_change_is_kept_per_measure) {
    const Score score = parse(piece(
        {note(8), "<attributes>" + meter(3, 4) + "</attributes>" + note(4) + note(2),
         "<attributes>" + meter(6, 8) + "</attributes>" + notes(6, 1)},
        kFourFour));
    CHECK_EQ(score.measures.size(), std::size_t{3});
    if (score.measures.size() != 3) {
        return;
    }
    CHECK_EQ(score.measures[0].beats, 4);
    CHECK_EQ(score.measures[1].beats, 3);
    CHECK_EQ(score.measures[2].beats, 6);
    CHECK_EQ(score.measures[2].beatUnit, 8);
    CHECK_NEAR(score.measures[1].startQuarters, 4.0, 1e-9);
    CHECK_NEAR(score.measures[2].startQuarters, 7.0, 1e-9);
    CHECK_NEAR(score.measures[2].clicksPerMinute(), 120.0, 1e-9);

    CHECK_NEAR(score.events[2].beat, 3.0f, 1e-6);
    CHECK_NEAR(score.events[6].beat, 4.0f, 1e-6);
    CHECK_EQ(score.events[6].measureIndex, 2);
}

TEST(beams_follow_the_meter_of_their_own_measure) {
    const Score score = parse(piece(
        {notes(8, 1), "<attributes>" + meter(6, 8) + "</attributes>" + notes(6, 1)},
        kFourFour));
    std::vector<BeamGroup> groups;
    findBeamGroups(score, groups);
    CHECK_EQ(groups.size(), std::size_t{6});
    if (groups.size() != 6) {
        return;
    }
    CHECK_EQ(groups[3].last, std::size_t{7});
    CHECK_EQ(groups[4].first, std::size_t{8});
    CHECK_EQ(groups[4].last, std::size_t{10});
}

TEST(measures_follow_the_performance_order) {
    const std::string forward  = R"(<barline location="left"><repeat direction="forward"/></barline>)";
    const std::string backward = R"(<barline location="right"><repeat direction="backward"/></barline>)";
    const Score score = parse(piece({forward + note(8) + backward, note(8)}, kFourFour));
    CHECK_EQ(score.measures.size(), std::size_t{3});
    if (score.measures.size() != 3) {
        return;
    }
    CHECK_EQ(score.measures[0].number, 1);
    CHECK_EQ(score.measures[1].number, 1);
    CHECK_EQ(score.measures[2].number, 2);
    CHECK_NEAR(score.measures[2].startSeconds, 8.0, 1e-9);
}

TEST(the_beat_at_a_moment_counts_a_pickup_from_its_end) {
    const Score score = parse(piece({note(2), note(6), note(6)}, kThreeFour,
                                    " implicit=\"yes\""));
    CHECK_EQ(score.beatAt(-0.5), -1);
    CHECK_EQ(score.beatAt(0.5), 2);
    CHECK_EQ(score.beatAt(1.0), 0);
    CHECK_EQ(score.beatAt(3.5), 2);
    CHECK_EQ(score.beatAt(4.2), 0);
    CHECK_EQ(score.beatAt(99.0), -1);
    CHECK_EQ(score.measureIndexAt(2.0), std::size_t{1});
    CHECK_EQ(score.measureIndexAt(-1.0), score.measures.size());
}

TEST(no_barline_is_drawn_before_a_pickup) {
    const Score score = parse(piece({note(2), note(6), note(6)}, kThreeFour,
                                    " implicit=\"yes\""));
    std::vector<double> lines;
    score.barlinesInWindow(-1.0, 99.0, lines);
    CHECK_EQ(lines.size(), std::size_t{3});
    if (lines.size() != 3) {
        return;
    }
    CHECK_NEAR(lines[0], 1.0, 1e-9);
    CHECK_NEAR(lines[1], 4.0, 1e-9);
    CHECK_NEAR(lines[2], 7.0, 1e-9);

    score.barlinesInWindow(2.0, 5.0, lines);
    CHECK_EQ(lines.size(), std::size_t{1});
}

TEST(the_tempo_control_moves_the_barlines_with_the_notes) {
    Score score = parse(piece({note(8), note(8)}, kFourFour));
    score.applyTempoScale(2.0);
    CHECK_EQ(score.measures.size(), std::size_t{2});
    if (score.measures.size() != 2) {
        return;
    }
    CHECK_NEAR(score.measures[1].startSeconds, 2.0, 1e-9);
    CHECK_NEAR(score.measures[1].endSeconds, 4.0, 1e-9);
    CHECK_NEAR(score.measures[1].clicksPerMinute(), 120.0, 1e-9);
}

TEST(a_generated_exercise_carries_its_measures) {
    fretless::curriculum::ScoreBuilder builder;
    builder.tempo(90).meter(3, 4).repeat(69, 7, 1.0).fillBar();
    const Score score = builder.build();
    CHECK_EQ(score.measures.size(), std::size_t{3});
    if (score.measures.size() != 3) {
        return;
    }
    CHECK_NEAR(score.measures[2].startQuarters, 6.0, 1e-9);
    CHECK_NEAR(score.measures[2].startSeconds, 4.0, 1e-9);
    CHECK_EQ(score.events[3].measureIndex, 1);
}
