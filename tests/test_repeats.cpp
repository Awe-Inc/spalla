#include <cmath>
#include <string>
#include <vector>

#include "TestHarness.h"
#include "fretless/score/MusicXmlParser.h"

using namespace fretless::score;

namespace {

/// One whole note per measure at 60 BPM in 4/4, so measure k of the played
/// order starts at exactly 4k seconds and the order can be read off the pitches.
std::string piece(const std::vector<std::string>& measures) {
    std::string body;
    for (std::size_t i = 0; i < measures.size(); ++i) {
        body += "    <measure number=\"" + std::to_string(i + 1) + "\">\n";
        if (i == 0) {
            body +=
                "      <attributes><divisions>1</divisions>"
                "<key><fifths>0</fifths></key>"
                "<time><beats>4</beats><beat-type>4</beat-type></time></attributes>\n"
                "      <direction><sound tempo=\"60\"/></direction>\n";
        }
        body += measures[i] + "\n    </measure>\n";
    }
    return R"(<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <part id="P1">
)" + body + "  </part>\n</score-partwise>";
}

std::string whole(const char* step) {
    return std::string("      <note><pitch><step>") + step +
           "</step><octave>4</octave></pitch><duration>4</duration></note>";
}

const std::string kForward =
    R"(<barline location="left"><repeat direction="forward"/></barline>)";
const std::string kBackward =
    R"(<barline location="right"><repeat direction="backward"/></barline>)";

std::string ending(const char* numbers, const char* type) {
    return std::string(R"(<barline location="left"><ending number=")") + numbers +
           "\" type=\"" + type + "\"/></barline>";
}

std::string endingClose(const char* numbers, bool repeatBack) {
    return std::string(R"(<barline location="right"><ending number=")") + numbers +
           R"(" type="stop"/>)" +
           (repeatBack ? R"(<repeat direction="backward"/>)" : "") + "</barline>";
}

std::string sound(const char* attribute, const char* value = "yes") {
    return std::string("<direction><sound ") + attribute + "=\"" + value + "\"/></direction>";
}

std::string playedSteps(const Score& score) {
    std::string steps;
    for (const auto& event : score.events) {
        steps += event.isRest ? '-' : event.noteName[0];
    }
    return steps;
}

void expectOrder(const char* file, int line, const std::vector<std::string>& measures,
                 const std::string& expected, const ParseOptions& options = {}) {
    const std::string xml = piece(measures);
    std::string error;
    const auto score = parseMusicXmlBuffer(xml.c_str(), xml.size(), &error, options);
    if (!score.has_value()) {
        ::testing::reportFailure(file, line, "parse failed: " + error);
        return;
    }
    const std::string got = playedSteps(*score);
    if (got != expected) {
        ::testing::reportFailure(file, line, "played " + got + ", expected " + expected);
    }
    for (std::size_t i = 0; i < score->events.size(); ++i) {
        if (std::abs(score->events[i].startSeconds - 4.0 * static_cast<double>(i)) > 1e-6) {
            ::testing::reportFailure(file, line,
                "measure " + std::to_string(i) + " of the played order starts at " +
                std::to_string(score->events[i].startSeconds) + " s");
            return;
        }
    }
}

#define EXPECT_ORDER(...) expectOrder(__FILE__, __LINE__, __VA_ARGS__)

}  // namespace

TEST(a_repeat_plays_its_section_twice_and_the_timeline_keeps_moving_forward) {
    EXPECT_ORDER({whole("C"), kForward + whole("D"), whole("E") + kBackward, whole("F")},
                 "CDEDEF");
}

TEST(a_backward_repeat_with_no_forward_one_returns_to_the_start) {
    EXPECT_ORDER({whole("C"), whole("D") + kBackward, whole("E")}, "CDCDE");
}

TEST(a_second_repeat_without_a_forward_sign_returns_to_where_the_first_ended) {
    EXPECT_ORDER({whole("C") + kBackward, whole("D") + kBackward, whole("E")}, "CCDDE");
}

TEST(a_repeat_honours_its_times_attribute) {
    EXPECT_ORDER({kForward + whole("C") +
                      R"(<barline location="right"><repeat direction="backward" times="3"/></barline>)",
                  whole("D")},
                 "CCCD");
}

TEST(first_and_second_endings_are_taken_in_turn) {
    EXPECT_ORDER({whole("C"), whole("D"),
                  ending("1", "start") + whole("E") + endingClose("1", true),
                  ending("2", "start") + whole("F") + endingClose("2", false), whole("G")},
                 "CDECDFG");
}

TEST(an_ending_that_spans_several_measures_is_skipped_as_a_whole) {
    EXPECT_ORDER({whole("C"), ending("1", "start") + whole("D"), whole("E") + endingClose("1", true),
                  ending("2", "start") + whole("F") + endingClose("2", false)},
                 "CDECF");
}

TEST(an_ending_shared_by_two_passes_is_played_on_both) {
    EXPECT_ORDER({whole("C"),
                  ending("1, 2", "start") + whole("D") +
                      R"(<barline location="right"><ending number="1, 2" type="stop"/><repeat direction="backward" times="3"/></barline>)",
                  ending("3", "start") + whole("E") + endingClose("3", false)},
                 "CDCDCE");
}

TEST(da_capo_al_fine_returns_to_the_start_and_stops_at_fine) {
    EXPECT_ORDER({whole("C"), whole("D") + sound("fine"), whole("E") + sound("dacapo")},
                 "CDECD");
}

TEST(dal_segno_al_coda_jumps_to_the_sign_and_then_to_the_coda) {
    EXPECT_ORDER({whole("C"), sound("segno", "s1") + whole("D"),
                  whole("E") + sound("tocoda", "c1"), whole("F") + sound("dalsegno", "s1"),
                  sound("coda", "c1") + whole("G")},
                 "CDEFDEG");
}

TEST(after_da_capo_the_repeats_are_not_taken_again_and_the_last_ending_is_played) {
    EXPECT_ORDER({kForward + whole("C"), ending("1", "start") + whole("D") + endingClose("1", true),
                  ending("2", "start") + whole("E") + endingClose("2", false),
                  whole("F") + sound("dacapo")},
                 "CDCEFCEF");
}

TEST(a_repeated_measure_keeps_its_written_number_and_its_beats) {
    const std::string half =
        "<note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration></note>";
    const std::string xml = piece({kForward + half + half + kBackward, whole("B")});
    const auto score = parseMusicXmlBuffer(xml.c_str(), xml.size());
    CHECK(score.has_value());
    if (!score.has_value()) {
        return;
    }
    CHECK_EQ(score->events.size(), std::size_t{5});
    if (score->events.size() != 5) {
        return;
    }
    const int   measures[] = {1, 1, 1, 1, 2};
    const float beats[]    = {1.0f, 3.0f, 1.0f, 3.0f, 1.0f};
    for (std::size_t i = 0; i < 5; ++i) {
        CHECK_EQ(score->events[i].measure, measures[i]);
        CHECK_NEAR(score->events[i].beat, beats[i], 1e-6);
    }
}

TEST(repeats_can_be_left_unexpanded) {
    ParseOptions options;
    options.expandRepeats = false;
    EXPECT_ORDER({whole("C") + kBackward, whole("D")}, "CD", options);
}
