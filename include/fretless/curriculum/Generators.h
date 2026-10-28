// ═══════════════════════════════════════════════════════════════════════════
//  Generators.h — turning a Recipe into something you can play.
//
//  One function does the whole job. Everything else in here is the vocabulary
//  it needs and the introspection the UI wants (what does this scale look
//  like, which notes ring against an open string) so the detail panel can say
//  something true rather than something generic.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstdint>
#include <vector>

#include "fretless/curriculum/Exercise.h"
#include "fretless/score/Score.h"

namespace fretless::curriculum {

/// Builds the playable score for `exercise`. `seed` is only consulted by the
/// kinds that regenerate — sight reading — so the same exercise otherwise
/// yields byte-identical output every call.
[[nodiscard]] score::Score buildScore(const Exercise& exercise,
                                      std::uint32_t seed = 0);

/// Semitone offsets of one octave of `type`, ascending from the tonic. The
/// closing octave is not included; callers add it when they want it.
[[nodiscard]] std::vector<int> scaleOffsets(ScaleType type);

/// Melodic minor descends differently from how it ascends. Returns the
/// descending offsets, which for every other scale are just the ascending
/// ones reversed.
[[nodiscard]] std::vector<int> descendingOffsets(ScaleType type);

/// The key signature that spells `tonicMidi` in `type` with the fewest
/// accidentals. Saves every table entry from carrying a hand-counted `fifths`.
[[nodiscard]] int fifthsFor(int tonicMidi, ScaleType type) noexcept;

/// Notes in first position on `string` that share a pitch class with one of
/// the four open strings, and therefore ring sympathetically when in tune.
/// These are the only intonation checks that need no tuner and no drone.
[[nodiscard]] std::vector<int> ringingTones(int string);

/// The four classic first-position finger patterns, as semitone offsets from
/// the open string for fingers 0-1-2-3-4. `pattern` is 0..3.
[[nodiscard]] std::vector<int> fingerPattern(int pattern);
[[nodiscard]] const char* fingerPatternName(int pattern) noexcept;

/// Human-readable name of a rhythm vocabulary id, for the detail panel.
[[nodiscard]] const char* rhythmName(int pattern) noexcept;

}  // namespace fretless::curriculum
