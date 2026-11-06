#include <cmath>
#include <optional>
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

// ── Printed marks without <sound> ──────────────────────────────────────────

namespace {

std::string words(const char* text) {
    return std::string("<direction><direction-type><words>") + text +
           "</words></direction-type></direction>";
}

std::string glyph(const char* name) {
    return std::string("<direction><direction-type><") + name +
           "/></direction-type></direction>";
}

std::optional<Score> parsed(const std::string& xml) {
    return parseMusicXmlBuffer(xml.c_str(), xml.size());
}

}  // namespace

std::string markedNote(const char* step, const std::string& notations) {
    return std::string("<note><pitch><step>") + step +
           "</step><octave>5</octave></pitch><duration>4</duration><type>whole</type>"
           "<notations>" + notations + "</notations></note>";
}

std::string dynamic(const char* sign) {
    return std::string("<direction><direction-type><dynamics><") + sign +
           "/></dynamics></direction-type></direction>";
}

std::optional<Score> parsedBars(const std::vector<std::string>& bars, std::size_t expectedEvents) {
    auto score = parsed(piece(bars));
    if (!score.has_value() || score->events.size() != expectedEvents) {
        return std::nullopt;
    }
    return score;
}

TEST(articulations_ornaments_and_bowings_reach_the_note) {
    const auto score = parsedBars({
        markedNote("C", "<articulations><staccato/><accent/></articulations>"),
        markedNote("D", "<ornaments><trill-mark/></ornaments>"),
        markedNote("E", "<technical><up-bow/></technical>"),
        markedNote("F", "<fermata/><technical><down-bow/><harmonic/></technical>"),
    }, 4);
    CHECK(score.has_value());
    if (!score.has_value()) {
        return;
    }
    CHECK_EQ(static_cast<int>(score->events[0].marks), kMarkStaccato | kMarkAccent);
    CHECK_EQ(static_cast<int>(score->events[1].marks), static_cast<int>(kMarkTrill));
    CHECK_EQ(static_cast<int>(score->events[2].marks), static_cast<int>(kMarkUpBow));
    CHECK_EQ(static_cast<int>(score->events[3].marks), kMarkFermata | kMarkDownBow | kMarkHarmonic);
}

TEST(a_dynamic_marks_the_note_after_it_and_skips_rests) {
    const auto score = parsedBars({
        dynamic("mf") + whole("C"),
        whole("D"),
        dynamic("sfz") + "<note><rest/><duration>4</duration></note>",
        whole("E"),
    }, 4);
    CHECK(score.has_value());
    if (!score.has_value()) {
        return;
    }
    CHECK(std::string(score->events[0].dynamic) == "mf");
    CHECK(std::string(score->events[1].dynamic).empty());
    CHECK(std::string(score->events[2].dynamic).empty());
    CHECK(std::string(score->events[3].dynamic) == "sfz");
}

TEST(printed_pizz_marks_only_the_next_note) {
    const auto score = parsedBars({words("pizz.") + whole("C"), whole("D")}, 2);
    CHECK(score.has_value());
    if (!score.has_value()) {
        return;
    }
    CHECK_EQ(static_cast<int>(score->events[0].marks), static_cast<int>(kMarkPizzicato));
    CHECK_EQ(static_cast<int>(score->events[1].marks), 0);
}

TEST(marks_on_a_lower_chord_note_survive_taking_the_top_note) {
    const auto score = parsedBars({
        markedNote("C", "<articulations><tenuto/></articulations>") +
        "<note><chord/><pitch><step>G</step><octave>5</octave></pitch><duration>4</duration></note>",
    }, 1);
    CHECK(score.has_value());
    if (!score.has_value()) {
        return;
    }
    CHECK(std::string(score->events[0].noteName) == "G5");
    CHECK_EQ(static_cast<int>(score->events[0].marks), static_cast<int>(kMarkTenuto));
}

TEST(printed_da_capo_al_fine_is_followed) {
    EXPECT_ORDER({whole("C"), words("Fine") + whole("D"), whole("E"),
                  words("D.C. al Fine") + whole("F")},
                 "CDEFCD");
}

TEST(printed_dal_segno_al_coda_is_followed) {
    EXPECT_ORDER({whole("C"), glyph("segno") + whole("D"), words("To Coda") + whole("E"),
                  words("D.S. al Coda") + whole("F"), glyph("coda") + whole("G")},
                 "CDEFDEG");
}

TEST(two_coda_glyphs_leave_at_the_first_and_land_at_the_last) {
    EXPECT_ORDER({whole("C"), glyph("coda") + whole("D"), words("D. C. al Coda") + whole("E"),
                  glyph("coda") + whole("F")},
                 "CDECDF");
}

TEST(sound_attributes_win_over_printed_words) {
    EXPECT_ORDER({whole("C"), sound("fine") + words("Fine") + whole("D"), words("Fine") + whole("E"),
                  sound("dacapo") + whole("F")},
                 "CDEFCD");
}

TEST(expression_words_are_not_navigation) {
    EXPECT_ORDER({words("dolce") + whole("C"), words("dim.") + whole("D"),
                  words("con fine arco") + whole("E")},
                 "CDE");
}

TEST(repeat_after_jump_is_retaken) {
    const std::string backAfterJump =
        R"(<barline location="right"><repeat direction="backward" after-jump="yes"/></barline>)";
    EXPECT_ORDER({glyph("segno") + whole("C"), whole("D") + backAfterJump,
                  words("D.S.") + whole("E")},
                 "CDCDECDCDE");
}

// ── Fermata, transposition, tempo words, timewise ──────────────────────────

TEST(fermata_doubles_the_note_and_keeps_the_tempo_after_it) {
    const std::string held =
        "<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration>"
        "<notations><fermata/></notations></note>";
    const auto score = parsed(piece({held, whole("D"), whole("E")}));
    CHECK(score.has_value());
    if (!score.has_value() || score->events.size() != 3) {
        CHECK(false);
        return;
    }
    CHECK_NEAR(score->events[0].durationSeconds, 8.0, 1e-3);
    CHECK_NEAR(score->events[1].startSeconds, 8.0, 1e-3);
    CHECK_NEAR(score->events[2].startSeconds, 12.0, 1e-3);
    CHECK_NEAR(score->beatsPerMinute, 60.0, 1e-6);
}

TEST(fermata_after_a_trimmed_intro_is_not_the_tempo_of_the_piece) {
    const std::string rest = "<note><rest/><duration>4</duration></note>";
    const std::string held =
        "<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration>"
        "<notations><fermata/></notations></note>";
    ParseOptions options;
    options.trimSilentIntro = true;
    const std::string xml = piece({rest, held, whole("D")});
    const auto result = parseMusicXmlBuffer(xml.c_str(), xml.size(), nullptr, options);
    CHECK(result.has_value());
    if (!result.has_value() || result->events.size() != 2) {
        CHECK(false);
        return;
    }
    CHECK_NEAR(result->beatsPerMinute, 60.0, 1e-6);
    CHECK_NEAR(result->events[0].durationSeconds, 8.0, 1e-3);
    CHECK_NEAR(result->events[1].startSeconds, 8.0, 1e-3);
}

TEST(fermata_on_the_second_pass_holds_again) {
    const std::string held =
        "<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration>"
        "<notations><fermata/></notations></note>";
    const auto score = parsed(piece({held + kBackward, whole("D")}));
    CHECK(score.has_value());
    if (!score.has_value() || score->events.size() != 3) {
        CHECK(false);
        return;
    }
    CHECK_NEAR(score->events[1].startSeconds, 8.0, 1e-3);
    CHECK_NEAR(score->events[2].startSeconds, 16.0, 1e-3);
}

TEST(transpose_changes_what_must_sound_not_the_printed_name) {
    const std::string transposing =
        "<attributes><transpose><chromatic>-2</chromatic><octave-change>-1</octave-change>"
        "</transpose></attributes>";
    const auto score = parsed(piece({transposing + whole("C")}));
    CHECK(score.has_value());
    if (!score.has_value() || score->events.empty()) {
        CHECK(false);
        return;
    }
    CHECK_EQ(score->events[0].midi, 60 - 14);
    CHECK_EQ(score->events[0].noteName[0], 'C');
}

TEST(tempo_word_applies_only_when_no_number_exists) {
    const std::string noNumber = R"(<?xml version="1.0"?>
<score-partwise><part-list><score-part id="P1"/></part-list><part id="P1">
<measure number="1"><attributes><divisions>1</divisions></attributes>
<direction><direction-type><words>Allegro con brio</words></direction-type></direction>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
</measure></part></score-partwise>)";
    const auto inferred = parsed(noNumber);
    CHECK(inferred.has_value());
    if (inferred.has_value()) {
        CHECK_NEAR(inferred->beatsPerMinute, 132.0, 1e-6);
    }
    const auto stated = parsed(piece({words("Allegro") + whole("C")}));
    CHECK(stated.has_value());
    if (stated.has_value()) {
        CHECK_NEAR(stated->beatsPerMinute, 60.0, 1e-6);
    }
}

TEST(timewise_scores_are_read_with_their_navigation) {
    const std::string xml = R"(<?xml version="1.0"?>
<score-timewise><part-list><score-part id="P1"/><score-part id="P2"/></part-list>
<measure number="7">
  <part id="P1"><attributes><divisions>1</divisions></attributes>
    <barline location="left"><repeat direction="forward"/></barline>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
    <barline location="right"><repeat direction="backward"/></barline></part>
  <part id="P2"><attributes><divisions>1</divisions></attributes>
    <note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration></note></part>
</measure>
<measure number="8">
  <part id="P1"><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration></note></part>
  <part id="P2"><note><pitch><step>A</step><octave>2</octave></pitch><duration>4</duration></note></part>
</measure></score-timewise>)";
    const auto score = parsed(xml);
    CHECK(score.has_value());
    if (!score.has_value()) {
        return;
    }
    CHECK(playedSteps(*score) == "CCD");
    CHECK_EQ(score->events[0].measure, 7);
    CHECK_EQ(score->events[2].measure, 8);
}
