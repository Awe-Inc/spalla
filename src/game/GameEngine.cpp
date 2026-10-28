#include "fretless/game/GameEngine.h"

#include <algorithm>
#include <cmath>

namespace fretless::game {
namespace {

constexpr std::size_t kMaxRecentJudgements = 24;

/// Deviation of `detected` from `expected`, in cents. Unlike a tuner's
/// "distance to the nearest semitone", this is unbounded on purpose: a wrong
/// note reads as hundreds of cents off, which is exactly the verdict we want.
[[nodiscard]] float centsBetween(float detectedHz, float expectedHz) noexcept {
    if (detectedHz <= 0.0f || expectedHz <= 0.0f) {
        return 0.0f;
    }
    return 1200.0f * std::log2(detectedHz / expectedHz);
}

}  // namespace

const char* toString(HitGrade grade) noexcept {
    switch (grade) {
        case HitGrade::Perfect: return "PERFEITO";
        case HitGrade::Great:   return "ÓTIMO";
        case HitGrade::Good:    return "BOM";
        case HitGrade::Miss:    return "ERROU";
        case HitGrade::None:    break;
    }
    return "";
}

// ═══════════════════════════════════════════════════════════════════════════

void GameEngine::setScore(const score::Score* score) noexcept {
    score_ = score;
    stop();
}

void GameEngine::start() {
    if (score_ == nullptr || score_->events.empty()) {
        return;
    }
    restart();
}

void GameEngine::restart() {
    songTime_ = -leadInSec_;
    cursor_   = 0;
    stats_    = GameStats{};
    recent_.clear();
    history_.clear();
    history_.reserve(score_ != nullptr ? score_->noteCount() : 0);
    resetAccumulator();

    // Park the cursor on the first real note; rests are never judged.
    while (score_ != nullptr && cursor_ < score_->events.size() &&
           score_->events[cursor_].isRest) {
        ++cursor_;
    }
    state_ = (leadInSec_ > 0.0) ? GameState::Countdown : GameState::Playing;
}

void GameEngine::pause() {
    if (state_ == GameState::Playing || state_ == GameState::Countdown) {
        state_ = GameState::Paused;
    }
}

void GameEngine::resume() {
    if (state_ == GameState::Paused) {
        state_ = (songTime_ < 0.0) ? GameState::Countdown : GameState::Playing;
    }
}

void GameEngine::stop() {
    state_    = GameState::Idle;
    songTime_ = 0.0;
    cursor_   = 0;
    stats_    = GameStats{};
    recent_.clear();
    history_.clear();
    resetAccumulator();
}

void GameEngine::resetAccumulator() noexcept {
    acc_ = Accumulator{};
}

int GameEngine::comboMultiplier() const noexcept {
    const int steps = stats_.combo / std::max(1, config_.comboStep);
    return std::clamp(1 + steps, 1, std::max(1, config_.comboMax));
}

const score::ScoreEvent* GameEngine::currentNote() const noexcept {
    if (score_ == nullptr || cursor_ >= score_->events.size()) {
        return nullptr;
    }
    return &score_->events[cursor_];
}

bool GameEngine::liveCents(float& centsOut) const noexcept {
    if (!acc_.hasLive) {
        return false;
    }
    centsOut = acc_.lastCents;
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════

void GameEngine::update(double deltaSeconds,
                        const audio::PitchFrame* frames,
                        std::size_t frameCount) {
    if (state_ == GameState::Paused || state_ == GameState::Idle ||
        state_ == GameState::Finished || score_ == nullptr) {
        return;
    }

    songTime_ += deltaSeconds;
    if (state_ == GameState::Countdown && songTime_ >= 0.0) {
        state_ = GameState::Playing;
    }

    // The lead-in is silent by design: nothing is judged before time zero.
    if (songTime_ < 0.0) {
        return;
    }

    const auto& events = score_->events;

    // ── Fold this tick's audio into the current note's accumulator ────────
    if (cursor_ < events.size() && !events[cursor_].isRest) {
        const auto& note = events[cursor_];
        const double windowStart = note.startSeconds - config_.onsetToleranceSec;
        const double windowEnd   = note.endSeconds() + config_.onsetToleranceSec;

        acc_.hasLive = false;
        for (std::size_t i = 0; i < frameCount; ++i) {
            const auto& frame = frames[i];
            if (songTime_ < windowStart || songTime_ > windowEnd) {
                break;
            }
            ++acc_.samples;
            if (frame.frequencyHz <= 0.0f) {
                continue;
            }

            const float cents = centsBetween(frame.frequencyHz, note.frequencyHz);
            acc_.lastCents = cents;
            acc_.hasLive   = true;

            if (std::fabs(cents) <= config_.centsGood) {
                ++acc_.voicedInTune;
                acc_.centsSum += cents;
                acc_.worstCents = std::max(acc_.worstCents, std::fabs(cents));
                if (!acc_.onsetSeen) {
                    acc_.onsetSeen = true;
                    acc_.onsetTime = songTime_;
                }
            }
        }
    }

    // ── Close out every note whose window has passed ──────────────────────
    advanceCursorTo(songTime_);

    // ── Age out the flash queue ───────────────────────────────────────────
    while (!recent_.empty() && songTime_ - recent_.front().judgedAtSec > 1.5) {
        recent_.pop_front();
    }

    if (cursor_ >= events.size() && songTime_ > score_->durationSeconds()) {
        state_ = GameState::Finished;
    }
}

void GameEngine::advanceCursorTo(double time) {
    const auto& events = score_->events;

    while (cursor_ < events.size()) {
        const auto& note = events[cursor_];

        if (note.isRest) {
            if (time <= note.endSeconds()) {
                break;
            }
            ++cursor_;
            continue;
        }

        if (time <= note.endSeconds() + config_.onsetToleranceSec) {
            break;   // still in progress
        }

        judgeCurrentNote(note.endSeconds());
        ++cursor_;
        resetAccumulator();
    }
}

void GameEngine::judgeCurrentNote(double atTime) {
    const auto& note = score_->events[cursor_];

    NoteJudgement judgement;
    judgement.eventIndex  = cursor_;
    judgement.judgedAtSec = atTime;
    judgement.voicedRatio = (acc_.samples > 0)
        ? static_cast<float>(acc_.voicedInTune) / static_cast<float>(acc_.samples)
        : 0.0f;

    const bool isShort = note.durationSeconds < config_.shortNoteSec;
    // A short note cannot be expected to hold a steady pitch; require only
    // that something in tune was heard at all.
    const float requiredRatio = isShort ? 0.0f : config_.minVoicedRatio;
    const bool  heard = acc_.voicedInTune > 0 && judgement.voicedRatio >= requiredRatio;

    if (!heard) {
        judgement.grade      = HitGrade::Miss;
        judgement.meanCents  = 0.0f;
        judgement.points     = 0;
        stats_.combo         = 0;
        ++stats_.miss;
    } else {
        judgement.meanCents = static_cast<float>(acc_.centsSum /
                                                 static_cast<double>(acc_.voicedInTune));
        judgement.worstCents    = acc_.worstCents;
        judgement.onsetErrorSec = acc_.onsetSeen ? (acc_.onsetTime - note.startSeconds) : 0.0;

        const float deviation = std::fabs(judgement.meanCents);
        if (deviation <= config_.centsPerfect) {
            judgement.grade  = HitGrade::Perfect;
            judgement.points = config_.pointsPerfect;
            ++stats_.perfect;
        } else if (deviation <= config_.centsGreat) {
            judgement.grade  = HitGrade::Great;
            judgement.points = config_.pointsGreat;
            ++stats_.great;
        } else {
            judgement.grade  = HitGrade::Good;
            judgement.points = config_.pointsGood;
            ++stats_.good;
        }

        ++stats_.combo;
        judgement.points *= comboMultiplier();
        stats_.maxCombo = std::max(stats_.maxCombo, stats_.combo);

        // Running means over judged notes only — a missed note has no
        // meaningful intonation to average in.
        const int scored = stats_.perfect + stats_.great + stats_.good;
        stats_.meanAbsCents =
            (stats_.meanAbsCents * static_cast<float>(scored - 1) + deviation) /
            static_cast<float>(scored);
        stats_.meanSignedCents =
            (stats_.meanSignedCents * static_cast<float>(scored - 1) + judgement.meanCents) /
            static_cast<float>(scored);
    }

    judgement.comboAfter = stats_.combo;
    stats_.score += judgement.points;
    ++stats_.judgedNotes;
    stats_.accuracyPct =
        100.0f * static_cast<float>(stats_.perfect + stats_.great + stats_.good) /
        static_cast<float>(stats_.judgedNotes);

    recent_.push_back(judgement);
    if (recent_.size() > kMaxRecentJudgements) {
        recent_.pop_front();
    }
    history_.push_back(judgement);
}

}  // namespace fretless::game
