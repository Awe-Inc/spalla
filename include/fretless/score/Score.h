// ═══════════════════════════════════════════════════════════════════════════
//  Score.h — the parsed, timeline-flattened representation of a piece.
//
//  Everything is precomputed at load time: absolute seconds, frequency in Hz,
//  the string a violinist would most likely use. The game loop only ever does
//  comparisons — no music theory at 144 FPS.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace fretless::score {

/// Lane index, low to high. Matches the highway top-to-bottom order reversed:
/// the view draws E at the top, as the instrument is held.
enum ViolinString : std::uint8_t {
    kStringG = 0,
    kStringD = 1,
    kStringA = 2,
    kStringE = 3,
    kStringCount = 4,
};

/// Open-string MIDI numbers: Sol3, Ré4, Lá4, Mi5.
inline constexpr int kOpenStringMidi[kStringCount] = {55, 62, 69, 76};

/// What the four strings are called out loud. Three characters at most, which
/// is what the lane gutter and the string chip are sized for.
inline constexpr const char* kStringName[kStringCount] = {"Sol", "Ré", "Lá", "Mi"};

/// The highest string whose open note the pitch reaches — which is where a
/// player actually puts it in first position.
///
/// The tempting rule, "lowest string that can reach the note", is wrong at
/// every boundary: it sends A4 to the D string as a fourth finger when A4 is
/// the open A. Run Suzuki Twinkle through both and this one reproduces the
/// printed fingering note for note (open A, open E, F# first finger on E,
/// D third finger on A), while the other puts the whole piece a string too low.
[[nodiscard]] constexpr std::uint8_t stringForMidi(int midi) noexcept {
    for (int s = kStringCount - 1; s >= 0; --s) {
        if (midi >= kOpenStringMidi[s]) {
            return static_cast<std::uint8_t>(s);
        }
    }
    return kStringG;   // below the instrument's range; park it on the low string
}

/// Equal-tempered frequency of a MIDI note, A4 = 440 Hz.
[[nodiscard]] float midiToFrequency(int midi) noexcept;

/// Scientific pitch notation for `midi`, spelled with sharps when `fifths` is
/// zero or positive and with flats when it is negative — the same accidental
/// the player will see on the staff. Writes at most 5 bytes including the NUL.
void writeNoteName(char* out, std::size_t outSize, int midi, int fifths) noexcept;

/// The Latin note names — Dó, Ré, Mi, Fá, Sol, Lá, Si — which is what every
/// Brazilian, Italian, French, Spanish and Portuguese musician reads. The
/// letter names stay in `ScoreEvent::noteName` because the staff positions
/// notes by letter and the parser writes them, so this is a presentation
/// step: it converts on the way to the screen and nowhere else.
///
/// Needs 12 bytes: "Sol#5" is five characters, and the accented ones are two
/// bytes each in UTF-8.
void toLatinName(const char* scientific, char* out, std::size_t outSize) noexcept;

/// Straight from a MIDI number, spelled by the key signature.
void writeLatinName(char* out, std::size_t outSize, int midi, int fifths) noexcept;

/// The pitch class alone, with no octave: "Lá", "Sib". For naming a key.
void writeLatinPitchClass(char* out, std::size_t outSize, int midi, int fifths) noexcept;

/// One note or rest on the flattened timeline.
struct ScoreEvent {
    double       startSeconds    = 0.0;
    double       durationSeconds = 0.0;
    double       startQuarters   = 0.0;   ///< position in quarter notes
    float        frequencyHz     = 0.0f;  ///< 0 for rests
    int          midi            = -1;    ///< -1 for rests
    int          measure         = 0;     ///< 1-based
    float        beat            = 1.0f;  ///< position within the measure
    bool         isRest          = false;
    bool         isTiedFrom      = false; ///< continuation of a previous note
    std::uint8_t suggestedString = kStringA;
    /// Notes taken under one bow. 1 means a separate bow per note; anything
    /// higher is a slur, which the staff draws and the readout names. Bowing
    /// is half of violin technique and the score had no way to say it.
    std::uint8_t bowSpan         = 1;
    std::uint8_t bowSlot         = 0;     ///< index of this note within its bow
    char         noteName[5]     = {};    ///< "A4", "C#5", …

    [[nodiscard]] double endSeconds() const noexcept {
        return startSeconds + durationSeconds;
    }
};

/// A tempo change on the timeline, used to convert quarters to seconds.
struct TempoMark {
    double quarterPosition = 0.0;
    double beatsPerMinute  = 120.0;
};

struct Score {
    std::string title;
    std::string composer;
    std::string partName;
    std::string sourcePath;

    double beatsPerMinute  = 120.0;   ///< first tempo mark, or 120
    int    beatsPerMeasure = 4;
    int    beatUnit        = 4;
    int    keyFifths       = 0;       ///< -7..+7, negative = flats

    std::vector<ScoreEvent> events;   ///< sorted by startSeconds
    std::vector<TempoMark>  tempoMap;

    [[nodiscard]] double durationSeconds() const noexcept {
        return events.empty() ? 0.0 : events.back().endSeconds();
    }

    [[nodiscard]] std::size_t noteCount() const noexcept {
        std::size_t n = 0;
        for (const auto& e : events) {
            n += (e.isRest ? 0u : 1u);
        }
        return n;
    }

    /// The note sounding at `timeSeconds`, or nullptr in a rest or a gap.
    /// Linear scan is fine for authoring tools; the game uses a cursor instead.
    [[nodiscard]] const ScoreEvent* noteAt(double timeSeconds) const noexcept;

    /// Indices of the notes whose onset falls in [from, to]. Used by the
    /// highway to draw only what is on screen.
    void notesInWindow(double from, double to, std::vector<std::size_t>& out) const;

    /// Rescales the whole timeline so the piece plays at `bpm` where the
    /// original first tempo mark said `beatsPerMinute`. Cheap: it only
    /// multiplies the precomputed seconds.
    void applyTempoScale(double scale);

    [[nodiscard]] double tempoScale() const noexcept { return tempoScale_; }

private:
    double tempoScale_ = 1.0;
};

}  // namespace fretless::score
