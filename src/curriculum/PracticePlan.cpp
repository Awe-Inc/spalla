#include "fretless/curriculum/PracticePlan.h"

#include <algorithm>
#include <chrono>
#include <cmath>

namespace fretless::curriculum {
namespace {

constexpr std::int64_t kSecondsPerDay = 86400;

std::int64_t nowSeconds() {
    using namespace std::chrono;
    return duration_cast<seconds>(system_clock::now().time_since_epoch()).count();
}

/// The slots a session is built from, in the order they are played. The
/// minutes are what the shape is worth, not a stopwatch: the point is that
/// two thirds of a session goes on sound and technique.
struct Slot {
    const char* moduleId;
    int         minutes;
    const char* fallbackModuleId;   ///< used when the first has nothing to offer
};

constexpr Slot kSlots[] = {
    {"warmup",     4, "bowing"},
    {"intonation", 4, "scales"},
    {"scales",     4, "strings"},
    {"warmup",     3, "rhythm"},
    {"bowing",     3, "scales"},
    {"rhythm",     3, "reading"},
    {"strings",    3, "scales"},
    {"reading",    3, "rhythm"},
    {"repertoire", 5, "suzuki"},
};

/// How badly this exercise wants to be practised. Higher wins.
///
/// The three terms are the three findings the plan is built on: unfinished
/// work first, then work that has not been seen for a while, then a nudge
/// towards the player's current level so a beginner is not handed a
/// three-octave scale in the name of variety.
int urgency(const Exercise& exercise, const Progress& progress, int level) {
    const ExerciseRecord* record = progress.find(exercise.id);

    int score = 0;

    if (record == nullptr || !record->played()) {
        // Never played, and at or just below the working level: this is the
        // next thing to learn. Far above it, it is not yet useful.
        score += (exercise.level <= level + 1) ? 60 : 5;
    } else {
        const int stars = record->stars(exercise.defaultBpm);
        score += (3 - stars) * 25;

        const std::int64_t days =
            std::max<std::int64_t>(0, (nowSeconds() - record->lastPlayed) / kSecondsPerDay);
        // Grows with the gap and then stops: something untouched for a month
        // is not thirty times more urgent than something untouched for a day.
        score += static_cast<int>(std::min<std::int64_t>(days, 14)) * 4;

        // Played today already. Not forbidden - repetition is how anything is
        // learnt - but it should lose to something that has waited.
        if (days == 0) {
            score -= 45;
        }
    }

    score -= std::abs(exercise.level - level) * 8;
    return score;
}

}  // namespace

std::uint32_t todaySeed() {
    return static_cast<std::uint32_t>(nowSeconds() / kSecondsPerDay);
}

int estimateLevel(const Curriculum& curriculum, const Progress& progress) {
    int highest = 0;
    for (const auto& module : curriculum.modules) {
        for (const auto& exercise : module.exercises) {
            const ExerciseRecord* record = progress.find(exercise.id);
            if (record != nullptr && record->stars(exercise.defaultBpm) >= 2) {
                highest = std::max(highest, exercise.level);
            }
        }
    }
    return std::clamp(highest + 1, 1, 10);
}

PracticePlan buildPracticePlan(const Curriculum& curriculum, const Progress& progress,
                               int minutes, std::uint32_t daySeed) {
    PracticePlan plan;
    plan.level = estimateLevel(curriculum, progress);
    if (daySeed == 0) {
        daySeed = todaySeed();
    }

    std::vector<std::string>  chosen;
    std::vector<ExerciseKind> chosenKinds;

    auto pickFrom = [&](const std::string& moduleId, int slotIndex) -> const Exercise* {
        const Module* module = curriculum.findModule(moduleId);
        if (module == nullptr) {
            return nullptr;
        }
        const Exercise* best = nullptr;
        int bestScore = -1000;

        for (const auto& exercise : module->exercises) {
            if (!isPlayable(exercise.kind)) {
                continue;
            }
            if (std::find(chosen.begin(), chosen.end(), exercise.id) != chosen.end()) {
                continue;
            }
            // A stable per-day jitter, so two exercises that score identically
            // do not always resolve the same way and the plan varies without
            // becoming unpredictable inside one day.
            const std::uint32_t hash =
                daySeed * 2654435761u +
                static_cast<std::uint32_t>(std::hash<std::string>{}(exercise.id)) +
                static_cast<std::uint32_t>(slotIndex) * 40503u;
            const int jitter = static_cast<int>(hash % 11u);

            int score = urgency(exercise, progress, plan.level) + jitter;

            // Interleaving is the point of the plan, and two slots from the
            // same module can still land on two exercises of the same kind -
            // which reads to the player as the plan repeating itself. Penalise
            // rather than forbid: with a small module there may be nothing
            // else to offer.
            if (std::find(chosenKinds.begin(), chosenKinds.end(), exercise.kind) !=
                chosenKinds.end()) {
                score -= 30;
            }

            if (score > bestScore) {
                bestScore = score;
                best      = &exercise;
            }
        }
        return best;
    };

    int slotIndex = 0;
    for (const auto& slot : kSlots) {
        if (plan.totalMinutes >= minutes) {
            break;
        }
        const Exercise* exercise = pickFrom(slot.moduleId, slotIndex);
        std::string moduleId = slot.moduleId;
        if (exercise == nullptr) {
            exercise = pickFrom(slot.fallbackModuleId, slotIndex);
            moduleId = slot.fallbackModuleId;
        }
        ++slotIndex;
        if (exercise == nullptr) {
            continue;
        }

        const ExerciseRecord* record = progress.find(exercise->id);
        std::string reason;
        if (record == nullptr || !record->played()) {
            reason = "Novo - o próximo passo no nível " + std::to_string(exercise->level);
        } else {
            const int stars = record->stars(exercise->defaultBpm);
            const std::int64_t days =
                std::max<std::int64_t>(0, (nowSeconds() - record->lastPlayed) / kSecondsPerDay);
            if (stars >= 3) {
                reason = "Revisão - para manter, não para reaprender";
            } else if (days >= 7) {
                reason = "Sem tocar há " + std::to_string(days) + " dias";
            } else if (record->bestAccuracy < 80.0f) {
                reason = "Inacabado - melhor até agora " +
                         std::to_string(static_cast<int>(record->bestAccuracy)) + "%";
            } else {
                reason = "Suba o andamento - limpo a " +
                         std::to_string(record->bestBpm) + " BPM";
            }
        }

        plan.items.push_back({moduleId, exercise->id, exercise->title,
                              std::move(reason), slot.minutes});
        plan.totalMinutes += slot.minutes;
        chosen.push_back(exercise->id);
        chosenKinds.push_back(exercise->kind);
    }

    return plan;
}

}  // namespace fretless::curriculum
