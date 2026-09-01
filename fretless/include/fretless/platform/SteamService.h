// ═══════════════════════════════════════════════════════════════════════════
//  SteamService.h — achievements, leaderboards and player stats.
//
//  The whole surface compiles and links whether or not FRETLESS_STEAM is set:
//  without the SDK every call is a no-op that reports "not connected". Game
//  code therefore never needs an #ifdef, and a developer without a Steam
//  install still gets a running build.
//
//  Steam's callback model requires Pump() every frame; forgetting it is the
//  classic reason achievements "sometimes" fail to unlock.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "fretless/game/GameEngine.h"
#include "fretless/score/Score.h"

namespace fretless::platform {

/// Achievement API names, matching the ones registered in the Steamworks
/// partner site. Kept as one list so the site and the code cannot drift.
namespace achievements {
inline constexpr const char* kFirstRun        = "ACH_FIRST_RUN";
inline constexpr const char* kFirstPerfect    = "ACH_FIRST_PERFECT";
inline constexpr const char* kFullCombo       = "ACH_FULL_COMBO";
inline constexpr const char* kFlawlessRun     = "ACH_FLAWLESS";       // all perfect
inline constexpr const char* kSteadyHand      = "ACH_STEADY_HAND";    // drift < 3 cents
inline constexpr const char* kTempoMaster     = "ACH_TEMPO_MASTER";   // clean at 150%+
inline constexpr const char* kHundredNotes    = "ACH_100_NOTES";
inline constexpr const char* kTenThousandNotes = "ACH_10000_NOTES";
}  // namespace achievements

namespace stats {
inline constexpr const char* kNotesPlayed   = "STAT_NOTES_PLAYED";
inline constexpr const char* kNotesPerfect  = "STAT_NOTES_PERFECT";
inline constexpr const char* kSecondsPlayed = "STAT_SECONDS_PLAYED";
inline constexpr const char* kBestCombo     = "STAT_BEST_COMBO";
}  // namespace stats

struct LeaderboardEntry {
    std::string playerName;
    int         rank  = 0;
    int         score = 0;
};

class SteamService {
public:
    SteamService() = default;
    ~SteamService();

    SteamService(const SteamService&)            = delete;
    SteamService& operator=(const SteamService&) = delete;

    /// Returns false when Steam is unavailable — which is not an error: the
    /// game runs standalone. `error` explains why, for the log.
    [[nodiscard]] bool initialize(std::string* error = nullptr);
    void shutdown() noexcept;

    [[nodiscard]] bool isConnected() const noexcept { return connected_; }
    [[nodiscard]] const std::string& playerName() const noexcept { return playerName_; }

    /// Must be called once per frame. Steam delivers its callbacks here.
    void pump();

    // ── Achievements ──────────────────────────────────────────────────────
    void unlock(const char* achievementApiName);
    [[nodiscard]] bool isUnlocked(const char* achievementApiName) const;
    /// Development helper; never wired to a shipping code path.
    void resetAllProgress();

    // ── Stats ─────────────────────────────────────────────────────────────
    void addStat(const char* statApiName, int amount);
    void addStat(const char* statApiName, float amount);
    void setStatMax(const char* statApiName, int value);
    /// Flushes queued stats and achievements. Steam rate-limits this, so it
    /// is called at natural boundaries, not every frame.
    void store();

    // ── Leaderboards ──────────────────────────────────────────────────────
    /// One board per piece: the name is derived from the score's identity so
    /// a player's Bach is never ranked against their Twinkle.
    [[nodiscard]] static std::string leaderboardNameFor(const score::Score& sheet);
    void submitScore(const std::string& leaderboardName, int score);
    /// Entries around the local player, filled in asynchronously by pump().
    [[nodiscard]] const std::vector<LeaderboardEntry>& leaderboard() const noexcept {
        return leaderboard_;
    }

    // ── High-level ────────────────────────────────────────────────────────
    /// Applies every achievement and stat rule for a completed run in one
    /// place, so the rules live together instead of scattered through the UI.
    void reportRunComplete(const score::Score& sheet,
                           const game::GameStats& runStats,
                           double tempoScale);

private:
    bool        connected_ = false;
    std::string playerName_;
    std::vector<LeaderboardEntry> leaderboard_;
    bool        statsDirty_ = false;
};

}  // namespace fretless::platform
