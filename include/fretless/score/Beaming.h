// ═══════════════════════════════════════════════════════════════════════════
//  Beaming.h — which short notes share a beam, decided from the score alone.
//
//  Kept out of StaffView so it can be tested without a GL context, and kept
//  in quarter notes so the answer does not change when the player moves the
//  tempo control.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstddef>
#include <vector>

#include "fretless/score/Score.h"

namespace fretless::score {

/// Consecutive events [first, last] drawn under one beam. Always two or more.
struct BeamGroup {
    std::size_t first = 0;
    std::size_t last  = 0;
};

/// The written length of event `index` in quarter notes. Derived from the
/// quarter positions around it rather than from seconds and the first tempo
/// mark, which would misread every note after a tempo change.
[[nodiscard]] double durationQuarters(const Score& score, std::size_t index) noexcept;

/// How many beams a note of this length carries: 0 for a quarter or longer,
/// 1 for an eighth, 2 for a sixteenth, up to 4. Dotted and triplet values are
/// recognised by their nominal note: a dotted sixteenth (0.375) is shorter
/// than a triplet eighth (0.333) but carries one beam more, so no single
/// threshold on the length can get both right.
[[nodiscard]] int beamCount(double quarters) noexcept;

/// The span one beam may cover, in quarters: a beat in simple time, a dotted
/// quarter in compound time — the grouping that shows where the beats fall.
[[nodiscard]] double beamSpanQuarters(int beatsPerMeasure, int beatUnit) noexcept;

/// Every beam group in the score, in order. Reuses `out`'s storage.
void findBeamGroups(const Score& score, std::vector<BeamGroup>& out);

}  // namespace fretless::score
