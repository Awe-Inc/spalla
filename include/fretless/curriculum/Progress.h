// ═══════════════════════════════════════════════════════════════════════════
//  Progress.h — what you have played, and how well.
//
//  A practice tool with no memory makes the same recommendation forever. This
//  is the smallest store that fixes that: one record per exercise, written to
//  a text file next to the player's other application data.
//
//  Text, not a database and not JSON, for three reasons. It survives a crash
//  mid-write with at most one bad line. A player can open it and see that
//  nothing embarrassing is being kept. And a parser for it is thirty lines,
//  which is thirty lines of dependency this project does not take on.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace fretless::curriculum {

/// One exercise's history. Bests are kept rather than averages: practice is
/// meant to move a ceiling, and an average punishes the attempts that made it
/// move.
struct ExerciseRecord {
    int   attempts       = 0;
    int   bestScore      = 0;
    float bestAccuracy   = 0.0f;   ///< percent
    int   bestBpm        = 0;      ///< tempo the best accuracy was reached at
    float lastAccuracy   = 0.0f;
    float bestMeanCents  = 0.0f;   ///< absolute; lower is better
    /// Seconds since the epoch. Zero means never played.
    std::int64_t lastPlayed = 0;

    /// 0..3. One star for finishing, two for playing it accurately, three for
    /// doing that at the written tempo. A star that cannot be lost is the
    /// only kind that rewards coming back to an old exercise.
    [[nodiscard]] int stars(int targetBpm) const noexcept;
    [[nodiscard]] bool played() const noexcept { return attempts > 0; }
};

class Progress {
public:
    /// The file the store lives in: %APPDATA%\Fretless\progress.txt on Windows,
    /// $XDG_DATA_HOME or ~/.local/share/fretless elsewhere. Falls back to the
    /// working directory if neither is available, because losing progress is
    /// better than refusing to start.
    [[nodiscard]] static std::string defaultPath();

    /// Missing file is not an error: a first run has no history.
    void load(const std::string& path);
    [[nodiscard]] bool save() const;

    [[nodiscard]] const ExerciseRecord* find(const std::string& exerciseId) const noexcept;
    /// Never null. Creates an empty record on first use.
    [[nodiscard]] ExerciseRecord& touch(const std::string& exerciseId);

    /// Folds one completed run into the record and marks the store dirty.
    void record(const std::string& exerciseId, int score, float accuracyPct,
                float meanAbsCents, int bpm);

    /// The exercise ids most recently played, newest first.
    [[nodiscard]] std::vector<std::string> recent(std::size_t limit) const;

    [[nodiscard]] std::size_t playedCount() const noexcept;
    [[nodiscard]] std::size_t starCount() const noexcept;
    /// Total attempts across every exercise — the "you have practised N times"
    /// number, which is the one players actually watch.
    [[nodiscard]] int totalAttempts() const noexcept;

    /// Days in a row with at least one attempt, counting back from the most
    /// recent day of practice. Today counts, and so does yesterday: opening
    /// the app in the morning must not read as a break before you have played.
    [[nodiscard]] int streakDays() const noexcept;
    /// Distinct days on which anything was practised.
    [[nodiscard]] std::size_t practiceDays() const noexcept { return days_.size(); }

    [[nodiscard]] bool dirty() const noexcept { return dirty_; }

    /// Star totals need the exercise's target tempo, which lives in the
    /// curriculum rather than here. The app hands it over once at load.
    void setTargetBpm(const std::string& exerciseId, int bpm);

private:
    std::unordered_map<std::string, ExerciseRecord> records_;
    std::unordered_map<std::string, int>            targetBpm_;
    /// Every day anything was practised, newest first. Kept separately from
    /// the records because a record only remembers its own last attempt, and
    /// a streak is a property of the session, not of any one exercise.
    std::vector<std::int64_t>                       days_;
    std::string  path_;
    mutable bool dirty_ = false;
};

}  // namespace fretless::curriculum
