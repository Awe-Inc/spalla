#include <string>

#include "TestHarness.h"
#include "fretless/score/MusicXmlParser.h"
#include "fretless/score/Score.h"

using namespace fretless::score;

namespace {

/// Wraps measures in the minimum valid score-partwise document.
std::string document(const std::string& measures, int fifths = 0, int tempo = 60) {
    return
        R"(<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Test</work-title></work>
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>)" + std::to_string(fifths) + R"(</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction><sound tempo=")" + std::to_string(tempo) + R"("/></direction>
)" + measures + R"(
    </measure>
  </part>
</score-partwise>)";
}

std::string note(const char* step, int octave, int duration, int alter = 0,
                 const char* extra = "") {
    std::string result = "      <note><pitch><step>";
    result += step;
    result += "</step>";
    if (alter != 0) {
        result += "<alter>" + std::to_string(alter) + "</alter>";
    }
    result += "<octave>" + std::to_string(octave) + "</octave></pitch>";
    result += "<duration>" + std::to_string(duration) + "</duration>";
    result += extra;
    result += "</note>\n";
    return result;
}

}  // namespace

TEST(string_assignment_matches_printed_fingering) {
    // The Suzuki Twinkle notes, which are printed on the A and E strings.
    CHECK_EQ(static_cast<int>(stringForMidi(69)), static_cast<int>(kStringA));  // A4 open A
    CHECK_EQ(static_cast<int>(stringForMidi(71)), static_cast<int>(kStringA));  // B4
    CHECK_EQ(static_cast<int>(stringForMidi(73)), static_cast<int>(kStringA));  // C#5
    CHECK_EQ(static_cast<int>(stringForMidi(74)), static_cast<int>(kStringA));  // D5
    CHECK_EQ(static_cast<int>(stringForMidi(76)), static_cast<int>(kStringE));  // E5 open E
    CHECK_EQ(static_cast<int>(stringForMidi(78)), static_cast<int>(kStringE));  // F#5

    // Open strings land on their own string, never as a fourth finger below.
    for (int s = 0; s < kStringCount; ++s) {
        CHECK_EQ(static_cast<int>(stringForMidi(kOpenStringMidi[s])), s);
    }
    // Below the instrument, everything parks on G.
    CHECK_EQ(static_cast<int>(stringForMidi(40)), static_cast<int>(kStringG));
}

TEST(parser_reads_pitch_duration_and_tempo) {
    // 60 BPM, divisions 4 -> a quarter note is 4 divisions and one second.
    const auto score = parseMusicXmlBuffer(
        document(note("A", 4, 4) + note("B", 4, 4) + note("C", 5, 8, 1)).c_str(),
        document(note("A", 4, 4) + note("B", 4, 4) + note("C", 5, 8, 1)).size());

    CHECK(score.has_value());
    if (!score.has_value()) {
        return;
    }
    CHECK_EQ(score->events.size(), std::size_t{3});
    CHECK_EQ(score->beatsPerMinute, 60.0);

    CHECK_NEAR(score->events[0].startSeconds, 0.0, 1e-6);
    CHECK_NEAR(score->events[0].durationSeconds, 1.0, 1e-6);
    CHECK_NEAR(score->events[0].frequencyHz, 440.0, 0.01);
    CHECK(std::string(score->events[0].noteName) == "A4");

    CHECK_NEAR(score->events[1].startSeconds, 1.0, 1e-6);
    CHECK_EQ(score->events[1].midi, 71);

    // C#5: two quarters long, starting at t=2.
    CHECK_NEAR(score->events[2].startSeconds, 2.0, 1e-6);
    CHECK_NEAR(score->events[2].durationSeconds, 2.0, 1e-6);
    CHECK_EQ(score->events[2].midi, 73);
    CHECK(std::string(score->events[2].noteName) == "C#5");
}

TEST(parser_keeps_the_top_note_of_a_chord) {
    // A double stop: both notes share an onset, and <chord/> marks the second.
    const std::string xml = document(
        note("D", 5, 4) +
        "      <note><chord/><pitch><step>A</step><octave>5</octave></pitch>"
        "<duration>4</duration></note>\n" +
        note("E", 5, 4));
    const auto score = parseMusicXmlBuffer(xml.c_str(), xml.size());

    CHECK(score.has_value());
    if (!score.has_value()) {
        return;
    }
    // Two events, not three: the chord collapses to its top note.
    CHECK_EQ(score->events.size(), std::size_t{2});
    CHECK_EQ(score->events[0].midi, 81);   // A5, the higher of the double stop
    CHECK_EQ(score->events[1].midi, 76);
    // The chord must not have advanced the cursor twice.
    CHECK_NEAR(score->events[1].startSeconds, 1.0, 1e-6);
}

TEST(parser_merges_tied_notes_into_one_sustained_event) {
    const std::string xml = document(
        note("A", 4, 4, 0, "<tie type=\"start\"/>") +
        note("A", 4, 4, 0, "<tie type=\"stop\"/>") +
        note("B", 4, 4));
    const auto score = parseMusicXmlBuffer(xml.c_str(), xml.size());

    CHECK(score.has_value());
    if (!score.has_value()) {
        return;
    }
    CHECK_EQ(score->events.size(), std::size_t{2});
    // The tied pair becomes one two-second A4, not two attacks.
    CHECK_NEAR(score->events[0].durationSeconds, 2.0, 1e-6);
    CHECK_NEAR(score->events[1].startSeconds, 2.0, 1e-6);
}

TEST(parser_handles_rests_and_backup) {
    const std::string xml = document(
        note("A", 4, 4) +
        "      <note><rest/><duration>4</duration></note>\n" +
        note("B", 4, 4));
    const auto score = parseMusicXmlBuffer(xml.c_str(), xml.size());

    CHECK(score.has_value());
    if (!score.has_value()) {
        return;
    }
    CHECK_EQ(score->events.size(), std::size_t{3});
    CHECK(score->events[1].isRest);
    CHECK_EQ(score->noteCount(), std::size_t{2});
    CHECK_NEAR(score->events[2].startSeconds, 2.0, 1e-6);
}

TEST(parser_rejects_documents_that_are_not_musicxml) {
    const std::string junk = "<html><body>not a score</body></html>";
    std::string error;
    const auto score = parseMusicXmlBuffer(junk.c_str(), junk.size(), &error);
    CHECK(!score.has_value());
    CHECK(!error.empty());
}

TEST(note_lookup_finds_the_sounding_note) {
    const std::string xml = document(note("A", 4, 4) + note("B", 4, 4));
    const auto score = parseMusicXmlBuffer(xml.c_str(), xml.size());
    CHECK(score.has_value());
    if (!score.has_value()) {
        return;
    }
    CHECK(score->noteAt(0.5) != nullptr);
    CHECK_EQ(score->noteAt(0.5)->midi, 69);
    CHECK_EQ(score->noteAt(1.5)->midi, 71);
    CHECK(score->noteAt(50.0) == nullptr);

    std::vector<std::size_t> window;
    score->notesInWindow(0.0, 1.2, window);
    CHECK_EQ(window.size(), std::size_t{2});
}

TEST(tempo_scaling_is_reversible) {
    const std::string xml = document(note("A", 4, 4) + note("B", 4, 4));
    auto score = parseMusicXmlBuffer(xml.c_str(), xml.size());
    CHECK(score.has_value());
    if (!score.has_value()) {
        return;
    }
    const double original = score->events[1].startSeconds;

    score->applyTempoScale(2.0);        // twice as fast
    CHECK_NEAR(score->events[1].startSeconds, original / 2.0, 1e-9);

    score->applyTempoScale(1.0);        // back again
    CHECK_NEAR(score->events[1].startSeconds, original, 1e-9);
}
