// ═══════════════════════════════════════════════════════════════════════════
//  GameEngine.h — scoring and judgement
//
//  The Python prototype graded every 11 ms audio block independently, so a
//  whole note counted ~85 times and a sixteenth counted twice: accuracy was
//  really "percentage of milliseconds", and one long sour note could outweigh
//  a page of clean playing. This engine judges ONE VERDICT PER NOTE.
//
//  For each note it accumulates every pitch observation that lands inside the
//  note's window, then grades on the way out:
//    · deviation is measured against the EXPECTED pitch, not the nearest
//      semitone, so playing a confident, perfectly-tuned wrong note is a miss
//    · a note must be held in tune for a minimum fraction of its length,
//      which is what separates a real note from a passing scoop or a squeak
//    · onset error is tracked separately from pitch so timing and intonation
//      can be reported (and practised) independently
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstddef>
#include <cstdint>
#include <deque>
#include <vector>

#include "fretless/audio/AudioEngine.h"
#include "fretless/score/Score.h"

namespace fretless::game {

enum class GameState : std::uint8_t {
    Idle,
    Countdown,
    Playing,
    Paused,
    Finished,
};

enum class HitGrade : std::uint8_t {
    None,
    Perfect,
    Great,
    Good,
    Miss,
};

[[nodiscard]] const char* toString(HitGrade grade) noexcept;

struct JudgementConfig {
    /// Intonation bands, in cents from the expected pitch. 10 cents is about
    /// the threshold where a trained ear starts to object.
    float  centsPerfect = 10.0f;
    float  centsGreat   = 20.0f;
    float  centsGood    = 35.0f;

    /// How far outside its notated window an attack still belongs to a note.
    double onsetToleranceSec = 0.18;

    /// Fraction of the note that must carry a confident, in-tune pitch before
    /// it counts as played at all. Below this it is a miss regardless of how
    /// good the few good samples were.
    float  minVoicedRatio = 0.35f;

    /// Notes shorter than this are graded on onset alone — there is not enough
    /// signal in a 60 ms note to average intonation meaningfully.
    double shortNoteSec = 0.12;

    int pointsPerfect = 100;
    int pointsGreat   = 60;
    int pointsGood    = 30;

    /// Combo multiplier caps at 4x, reached at a 30-note streak.
    int comboStep = 10;
    int comboMax  = 4;
};

/// The verdict on one note, emitted once, when the note's window closes.
struct NoteJudgement {
    std::size_t eventIndex    = 0;
    HitGrade    grade         = HitGrade::None;
    float       meanCents     = 0.0f;   ///< signed: negative = flat
    float       worstCents    = 0.0f;
    double      onsetErrorSec = 0.0;    ///< positive = late
    float       voicedRatio   = 0.0f;
    int         points        = 0;
    int         comboAfter    = 0;
    double      judgedAtSec   = 0.0;
};

struct GameStats {
    int   score        = 0;
    int   combo        = 0;
    int   maxCombo     = 0;
    int   perfect      = 0;
    int   great        = 0;
    int   good         = 0;
    int   miss         = 0;
    int   judgedNotes  = 0;
    float accuracyPct  = 0.0f;   ///< (perfect+great+good) / judged
    float meanAbsCents = 0.0f;   ///< intonation quality over the whole run
    /// Signed mean: a consistently negative value means the player plays flat,
    /// which is far more actionable feedback than a single accuracy number.
    float meanSignedCents = 0.0f;
};

class GameEngine {
public:
    GameEngine() = default;

    void setScore(const score::Score* score) noexcept;
    void setConfig(const JudgementConfig& config) noexcept { config_ = config; }
    [[nodiscard]] const JudgementConfig& config() const noexcept { return config_; }

    /// Seconds of silence before the first note, so the player can breathe.
    void setLeadInSeconds(double seconds) noexcept { leadInSec_ = seconds; }

    void start();
    void pause();
    void resume();
    void stop();
    void restart();

    /// Advances the clock and consumes the audio frames drained this tick.
    void update(double deltaSeconds,
                const audio::PitchFrame* frames,
                std::size_t              frameCount);

    [[nodiscard]] GameState state()    const noexcept { return state_; }
    [[nodiscard]] double    songTime() const noexcept { return songTime_; }
    [[nodiscard]] const GameStats& stats() const noexcept { return stats_; }

    /// The note the player should be on right now, or nullptr between notes.
    [[nodiscard]] const score::ScoreEvent* currentNote() const noexcept;
    [[nodiscard]] std::size_t currentNoteIndex() const noexcept { return cursor_; }

    /// Live intonation of the note in progress, for the needle and the note
    /// colour. Returns false when nothing is sounding.
    [[nodiscard]] bool liveCents(float& centsOut) const noexcept;

    /// Verdicts emitted recently, newest last. The view drains these to spawn
    /// flashes; they age out on their own.
    [[nodiscard]] const std::deque<NoteJudgement>& recentJudgements() const noexcept {
        return recent_;
    }

    /// Everything judged this run, in order — the end-of-song report.
    [[nodiscard]] const std::vector<NoteJudgement>& allJudgements() const noexcept {
        return history_;
    }

private:
    void  judgeCurrentNote(double atTime);
    void  advanceCursorTo(double time);
    void  resetAccumulator() noexcept;
    [[nodiscard]] int comboMultiplier() const noexcept;

    const score::Score* score_ = nullptr;
    JudgementConfig     config_{};

    GameState state_     = GameState::Idle;
    double    songTime_  = 0.0;
    double    leadInSec_ = 2.0;

    /// Index into score_->events of the note being accumulated.
    std::size_t cursor_ = 0;

    // ── Accumulator for the note in progress ──────────────────────────────
    struct Accumulator {
        int    samples      = 0;
        int    voicedInTune = 0;
        double centsSum     = 0.0;
        float  worstCents   = 0.0f;
        double onsetTime    = -1.0;
        bool   onsetSeen    = false;
        float  lastCents    = 0.0f;
        bool   hasLive      = false;
    } acc_;

    GameStats                  stats_{};
    std::deque<NoteJudgement>  recent_;
    std::vector<NoteJudgement> history_;
};

}  // namespace fretless::game
