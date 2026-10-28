// ═══════════════════════════════════════════════════════════════════════════
//  PracticePlan.h — today's session, chosen for you.
//
//  The hardest part of practising alone is not playing; it is deciding what to
//  play. Left to themselves, most players run the piece they are working on
//  from the top until they are bored, which is the practice schedule the
//  research is least kind to.
//
//  So the plan is built from three findings that are about as settled as
//  anything in this field gets:
//
//    · Interleaving beats blocking. Alternating between tasks feels worse
//      during the session and produces better retention afterwards, so the
//      plan never puts two exercises from the same module back to back.
//    · Spacing beats massing. An exercise you have not touched for a few days
//      is worth more than a fourth run at today's.
//    · A drill needs a stated goal, which is what the `reason` field is for.
//
//  The shape — sound, then intonation, then technique, then reading, then a
//  tune — is the one an orchestral warm-up has used for a century.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "fretless/curriculum/Exercise.h"
#include "fretless/curriculum/Progress.h"

namespace fretless::curriculum {

struct PlanItem {
    std::string moduleId;
    std::string exerciseId;
    std::string title;
    /// Why this one, today. Shown under the row: a plan that cannot justify
    /// itself is a random list with a schedule attached.
    std::string reason;
    int         minutes = 3;
};

struct PracticePlan {
    std::vector<PlanItem> items;
    int totalMinutes = 0;

    /// The level the plan was built for, so the home screen can say where the
    /// player currently is without recomputing it.
    int level = 1;
};

/// Builds a session of roughly `minutes` from what the player has and has not
/// done. `daySeed` keeps a plan stable within a day and different across days,
/// so opening the app twice does not shuffle the session underneath you.
[[nodiscard]] PracticePlan buildPracticePlan(const Curriculum& curriculum,
                                             const Progress&   progress,
                                             int               minutes = 25,
                                             std::uint32_t     daySeed = 0);

/// A seed that changes once a day. Used as the default for `daySeed`.
[[nodiscard]] std::uint32_t todaySeed();

/// The level the player is working at: one past the highest level they have
/// two stars on, clamped to what exists. Starts at 1 for a fresh profile.
[[nodiscard]] int estimateLevel(const Curriculum& curriculum, const Progress& progress);

}  // namespace fretless::curriculum
