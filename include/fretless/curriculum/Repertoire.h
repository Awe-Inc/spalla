// ═══════════════════════════════════════════════════════════════════════════
//  Repertoire.h — the melodies that ship inside the binary.
//
//  Everything here is a public-domain tune, transposed into a key that lies
//  under a beginner's hand in first position, and written out by hand. Nothing
//  is transcribed from a copyrighted edition: the Suzuki books are engravings
//  of folk songs, and it is the engraving that is protected, not "Twinkle,
//  Twinkle, Little Star".
//
//  The list is deliberately short. A melody with one wrong note in a tool that
//  grades intonation is worse than no melody at all, so it contains only tunes
//  that can be verified by anyone who can hum, and the large-scale repertoire
//  comes from assets/songs/community/ — real editions, fetched under CC0 by
//  tools/fetch_library.py.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstddef>
#include <cstdint>

namespace fretless::curriculum {

/// One note of a written-out melody. -1 is a rest; duration is in quarters.
struct PieceNote {
    std::int16_t midi     = -1;
    float        quarters = 1.0f;
};

struct PieceData {
    const char* title    = "";
    const char* composer = "";
    const char* source   = "";   ///< where the tune comes from, for the detail panel
    int fifths   = 0;
    int beats    = 4;
    int beatUnit = 4;
    int bpm      = 90;

    const PieceNote* notes = nullptr;
    std::size_t      count = 0;
};

[[nodiscard]] const PieceData* pieceAt(int index) noexcept;
[[nodiscard]] int pieceCount() noexcept;

// ── Suzuki's Twinkle variations ───────────────────────────────────────────
// Suzuki opens Book 1 with five rhythmic variations on one melody, so that a
// beginner meets five bowing patterns while only ever having to think about
// four pitches. The variations are a *rhythm* applied to the theme, which is
// how they are stored: one subdivision pattern per beat, cycled across the
// tune. Variation 0 is the theme, played as written.
inline constexpr int kVariationCount = 6;

/// Name of variation `index`, 0 = theme.
[[nodiscard]] const char* variationName(int index) noexcept;
/// What the variation is for — the bow stroke it drills.
[[nodiscard]] const char* variationFocus(int index) noexcept;

/// Subdivisions of one quarter-note beat for `index`, at beat `beatInCycle`.
/// Writes at most `maxOut` durations and returns how many were written.
[[nodiscard]] std::size_t variationBeat(int index, int beatInCycle,
                                        float* out, std::size_t maxOut) noexcept;
/// How many beats the variation's pattern spans before repeating.
[[nodiscard]] int variationCycle(int index) noexcept;

}  // namespace fretless::curriculum
