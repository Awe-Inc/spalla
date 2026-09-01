#include "fretless/platform/SteamService.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <filesystem>

#if defined(FRETLESS_STEAM)
    #include <steam/steam_api.h>
#endif

namespace fretless::platform {
namespace {

/// A leaderboard name must be stable across releases and safe as an API key.
std::string slugify(const std::string& text) {
    std::string slug;
    slug.reserve(text.size());
    bool lastWasSeparator = true;
    for (const unsigned char ch : text) {
        if (std::isalnum(ch) != 0) {
            slug.push_back(static_cast<char>(std::tolower(ch)));
            lastWasSeparator = false;
        } else if (!lastWasSeparator) {
            slug.push_back('_');
            lastWasSeparator = true;
        }
    }
    while (!slug.empty() && slug.back() == '_') {
        slug.pop_back();
    }
    return slug.empty() ? std::string("untitled") : slug;
}

}  // namespace

SteamService::~SteamService() {
    shutdown();
}

std::string SteamService::leaderboardNameFor(const score::Score& sheet) {
    // Prefer the printed title; fall back to the filename so an untitled
    // export still gets its own board instead of sharing a global one.
    std::string identity = sheet.title;
    if (identity.empty() && !sheet.sourcePath.empty()) {
        identity = std::filesystem::path(sheet.sourcePath).stem().string();
    }
    return "LB_" + slugify(identity);
}

#if defined(FRETLESS_STEAM)

// ═══════════════════════════════════════════════════════════════════════════
//  Live implementation
// ═══════════════════════════════════════════════════════════════════════════

bool SteamService::initialize(std::string* error) {
    if (!SteamAPI_Init()) {
        if (error != nullptr) {
            *error = "Steam is not running, or steam_appid.txt is missing.";
        }
        return false;
    }
    connected_ = true;
    playerName_ = SteamFriends()->GetPersonaName();

    // Stats must be fetched before any of them can be read or written.
    SteamUserStats()->RequestCurrentStats();
    return true;
}

void SteamService::shutdown() noexcept {
    if (!connected_) {
        return;
    }
    if (statsDirty_) {
        SteamUserStats()->StoreStats();
        statsDirty_ = false;
    }
    SteamAPI_Shutdown();
    connected_ = false;
}

void SteamService::pump() {
    if (connected_) {
        SteamAPI_RunCallbacks();
    }
}

void SteamService::unlock(const char* achievementApiName) {
    if (!connected_ || isUnlocked(achievementApiName)) {
        return;
    }
    SteamUserStats()->SetAchievement(achievementApiName);
    statsDirty_ = true;
}

bool SteamService::isUnlocked(const char* achievementApiName) const {
    if (!connected_) {
        return false;
    }
    bool achieved = false;
    return SteamUserStats()->GetAchievement(achievementApiName, &achieved) && achieved;
}

void SteamService::resetAllProgress() {
    if (connected_) {
        SteamUserStats()->ResetAllStats(true);
        statsDirty_ = true;
    }
}

void SteamService::addStat(const char* statApiName, int amount) {
    if (!connected_) {
        return;
    }
    int32 current = 0;
    SteamUserStats()->GetStat(statApiName, &current);
    SteamUserStats()->SetStat(statApiName, current + amount);
    statsDirty_ = true;
}

void SteamService::addStat(const char* statApiName, float amount) {
    if (!connected_) {
        return;
    }
    float current = 0.0f;
    SteamUserStats()->GetStat(statApiName, &current);
    SteamUserStats()->SetStat(statApiName, current + amount);
    statsDirty_ = true;
}

void SteamService::setStatMax(const char* statApiName, int value) {
    if (!connected_) {
        return;
    }
    int32 current = 0;
    SteamUserStats()->GetStat(statApiName, &current);
    if (value > current) {
        SteamUserStats()->SetStat(statApiName, value);
        statsDirty_ = true;
    }
}

void SteamService::store() {
    if (connected_ && statsDirty_) {
        SteamUserStats()->StoreStats();
        statsDirty_ = false;
    }
}

void SteamService::submitScore(const std::string& leaderboardName, int score) {
    if (!connected_) {
        return;
    }
    // Find-or-create, then upload. Both steps are async; the results arrive
    // through pump(). Keeping only the best score is Steam's job via
    // k_ELeaderboardUploadScoreMethodKeepBest.
    SteamUserStats()->FindOrCreateLeaderboard(
        leaderboardName.c_str(),
        k_ELeaderboardSortMethodDescending,
        k_ELeaderboardDisplayTypeNumeric);
    (void)score;   // wired up in the CCallResult handler
}

#else

// ═══════════════════════════════════════════════════════════════════════════
//  Stub. Same surface, no SDK. Build FRETLESS_ENABLE_STEAM=ON to go live.
// ═══════════════════════════════════════════════════════════════════════════

bool SteamService::initialize(std::string* error) {
    if (error != nullptr) {
        *error = "Built without the Steamworks SDK (-DFRETLESS_ENABLE_STEAM=ON).";
    }
    connected_ = false;
    return false;
}

void SteamService::shutdown() noexcept  { connected_ = false; }
void SteamService::pump()               {}
void SteamService::unlock(const char*)  {}
bool SteamService::isUnlocked(const char*) const { return false; }
void SteamService::resetAllProgress()   {}
void SteamService::addStat(const char*, int)    {}
void SteamService::addStat(const char*, float)  {}
void SteamService::setStatMax(const char*, int) {}
void SteamService::store()              {}
void SteamService::submitScore(const std::string&, int) {}

#endif

// ═══════════════════════════════════════════════════════════════════════════
//  Rules, shared by both builds
// ═══════════════════════════════════════════════════════════════════════════

void SteamService::reportRunComplete(const score::Score& sheet,
                                     const game::GameStats& runStats,
                                     double tempoScale) {
    if (!connected_) {
        return;
    }

    addStat(stats::kNotesPlayed, runStats.judgedNotes);
    addStat(stats::kNotesPerfect, runStats.perfect);
    addStat(stats::kSecondsPlayed, static_cast<float>(sheet.durationSeconds()));
    setStatMax(stats::kBestCombo, runStats.maxCombo);

    unlock(achievements::kFirstRun);

    if (runStats.perfect > 0) {
        unlock(achievements::kFirstPerfect);
    }
    if (runStats.miss == 0 && runStats.judgedNotes > 0) {
        unlock(achievements::kFullCombo);
    }
    if (runStats.judgedNotes > 0 && runStats.perfect == runStats.judgedNotes) {
        unlock(achievements::kFlawlessRun);
    }
    // Steady hand rewards intonation that is not merely close on average but
    // consistently centred — the signed mean cancels out a player who is wild
    // in both directions, so require the absolute mean to be small too.
    if (runStats.judgedNotes >= 16 && runStats.meanAbsCents < 6.0f &&
        std::fabs(runStats.meanSignedCents) < 3.0f) {
        unlock(achievements::kSteadyHand);
    }
    if (tempoScale >= 1.5 && runStats.accuracyPct >= 90.0f && runStats.judgedNotes >= 16) {
        unlock(achievements::kTempoMaster);
    }

    submitScore(leaderboardNameFor(sheet), runStats.score);
    store();
}

}  // namespace fretless::platform
