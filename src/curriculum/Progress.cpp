#include "fretless/curriculum/Progress.h"

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>

namespace fretless::curriculum {
namespace {

constexpr int kFormatVersion = 1;
constexpr std::int64_t kSecondsPerDay = 86400;

std::int64_t nowSeconds() {
    using namespace std::chrono;
    return duration_cast<seconds>(system_clock::now().time_since_epoch()).count();
}

/// Local midnight is what a practice streak is counted in, but a local
/// midnight needs a timezone database. Day boundaries in UTC are off by at
/// most a few hours, which cannot turn a real streak into a broken one for
/// anybody who practises at a normal hour.
std::int64_t dayNumber(std::int64_t epochSeconds) {
    return epochSeconds / kSecondsPerDay;
}

std::string environment(const char* name) {
#ifdef _WIN32
    char*  value = nullptr;
    std::size_t size = 0;
    if (_dupenv_s(&value, &size, name) != 0 || value == nullptr) {
        return {};
    }
    std::string out(value);
    std::free(value);
    return out;
#else
    const char* value = std::getenv(name);
    return (value == nullptr) ? std::string{} : std::string(value);
#endif
}

}  // namespace

// ═══════════════════════════════════════════════════════════════════════════
//  Records
// ═══════════════════════════════════════════════════════════════════════════

int ExerciseRecord::stars(int targetBpm) const noexcept {
    if (attempts <= 0) {
        return 0;
    }
    int stars = 1;
    if (bestAccuracy >= 80.0f) {
        ++stars;
    }
    // The third star needs the accuracy AND the tempo. Ninety-five percent at
    // half speed is a different achievement from ninety-five at the written
    // tempo, and collapsing them tells a player they are finished when they
    // are not.
    if (bestAccuracy >= 95.0f && targetBpm > 0 && bestBpm >= targetBpm) {
        ++stars;
    }
    return stars;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Store
// ═══════════════════════════════════════════════════════════════════════════

std::string Progress::defaultPath() {
    namespace fs = std::filesystem;

    fs::path base;
#ifdef _WIN32
    const std::string appData = environment("APPDATA");
    if (!appData.empty()) {
        base = fs::path(appData) / "Fretless";
    }
#else
    std::string dataHome = environment("XDG_DATA_HOME");
    if (dataHome.empty()) {
        const std::string home = environment("HOME");
        if (!home.empty()) {
            dataHome = (fs::path(home) / ".local" / "share").string();
        }
    }
    if (!dataHome.empty()) {
        base = fs::path(dataHome) / "fretless";
    }
#endif
    if (base.empty()) {
        return "fretless_progress.txt";
    }

    std::error_code ec;
    fs::create_directories(base, ec);
    return (base / "progress.txt").string();
}

void Progress::load(const std::string& path) {
    path_ = path;
    records_.clear();
    days_.clear();
    dirty_ = false;

    std::ifstream file(path);
    if (!file) {
        return;   // first run
    }

    std::string line;
    while (std::getline(file, line)) {
        if (line.empty() || line[0] == '#') {
            continue;
        }
        std::istringstream stream(line);
        if (line.rfind("days ", 0) == 0) {
            std::istringstream dayStream(line.substr(5));
            std::int64_t day = 0;
            while (dayStream >> day) {
                days_.push_back(day);
            }
            std::sort(days_.begin(), days_.end(), std::greater<>());
            days_.erase(std::unique(days_.begin(), days_.end()), days_.end());
            continue;
        }
        std::string id;
        ExerciseRecord record;
        // id attempts bestScore bestAccuracy bestBpm lastAccuracy
        // bestMeanCents lastPlayed
        if (!(stream >> id >> record.attempts >> record.bestScore
                     >> record.bestAccuracy >> record.bestBpm
                     >> record.lastAccuracy >> record.bestMeanCents
                     >> record.lastPlayed)) {
            continue;   // one damaged line loses one exercise, not the file
        }
        records_[id] = record;
    }
}

bool Progress::save() const {
    if (path_.empty()) {
        return false;
    }
    // Written to a sibling and renamed, so an interrupted save cannot leave a
    // half-written file where the real one was.
    const std::string temporary = path_ + ".tmp";
    {
        std::ofstream file(temporary, std::ios::trunc);
        if (!file) {
            return false;
        }
        file << "# fretless progress v" << kFormatVersion << "\n"
             << "# id attempts bestScore bestAccuracy bestBpm lastAccuracy "
                "bestMeanCents lastPlayed\n";
        if (!days_.empty()) {
            // A year of practice days is 400 numbers; there is no reason to
            // keep more, and a streak cannot reach back past them anyway.
            file << "days";
            std::size_t written = 0;
            for (const std::int64_t day : days_) {
                if (written++ >= 400) {
                    break;
                }
                file << ' ' << day;
            }
            file << '\n';
        }
        for (const auto& [id, record] : records_) {
            file << id << ' ' << record.attempts << ' ' << record.bestScore << ' '
                 << record.bestAccuracy << ' ' << record.bestBpm << ' '
                 << record.lastAccuracy << ' ' << record.bestMeanCents << ' '
                 << record.lastPlayed << '\n';
        }
        if (!file.good()) {
            return false;
        }
    }

    std::error_code ec;
    std::filesystem::rename(temporary, path_, ec);
    if (ec) {
        std::filesystem::remove(path_, ec);
        std::filesystem::rename(temporary, path_, ec);
    }
    if (!ec) {
        dirty_ = false;
    }
    return !ec;
}

const ExerciseRecord* Progress::find(const std::string& exerciseId) const noexcept {
    const auto it = records_.find(exerciseId);
    return (it == records_.end()) ? nullptr : &it->second;
}

ExerciseRecord& Progress::touch(const std::string& exerciseId) {
    return records_[exerciseId];
}

void Progress::record(const std::string& exerciseId, int score, float accuracyPct,
                      float meanAbsCents, int bpm) {
    ExerciseRecord& entry = records_[exerciseId];
    ++entry.attempts;
    entry.lastAccuracy = accuracyPct;
    entry.lastPlayed   = nowSeconds();
    entry.bestScore    = std::max(entry.bestScore, score);

    // The best tempo travels with the best accuracy rather than being its own
    // maximum: "95% somewhere, and 160 BPM somewhere else" is not a result.
    if (accuracyPct > entry.bestAccuracy) {
        entry.bestAccuracy = accuracyPct;
        entry.bestBpm      = bpm;
    } else if (accuracyPct >= entry.bestAccuracy && bpm > entry.bestBpm) {
        entry.bestBpm = bpm;
    }

    if (meanAbsCents > 0.0f &&
        (entry.bestMeanCents <= 0.0f || meanAbsCents < entry.bestMeanCents)) {
        entry.bestMeanCents = meanAbsCents;
    }

    const std::int64_t today = dayNumber(entry.lastPlayed);
    if (days_.empty() || days_.front() != today) {
        days_.push_back(today);
        std::sort(days_.begin(), days_.end(), std::greater<>());
        days_.erase(std::unique(days_.begin(), days_.end()), days_.end());
    }
    dirty_ = true;
}

std::vector<std::string> Progress::recent(std::size_t limit) const {
    std::vector<const std::pair<const std::string, ExerciseRecord>*> ordered;
    ordered.reserve(records_.size());
    for (const auto& entry : records_) {
        if (entry.second.lastPlayed > 0) {
            ordered.push_back(&entry);
        }
    }
    std::sort(ordered.begin(), ordered.end(), [](const auto* a, const auto* b) {
        return a->second.lastPlayed > b->second.lastPlayed;
    });

    std::vector<std::string> out;
    out.reserve(std::min(limit, ordered.size()));
    for (std::size_t i = 0; i < ordered.size() && i < limit; ++i) {
        out.push_back(ordered[i]->first);
    }
    return out;
}

std::size_t Progress::playedCount() const noexcept {
    return static_cast<std::size_t>(
        std::count_if(records_.begin(), records_.end(),
                      [](const auto& entry) { return entry.second.played(); }));
}

std::size_t Progress::starCount() const noexcept {
    std::size_t total = 0;
    for (const auto& [id, record] : records_) {
        const auto it = targetBpm_.find(id);
        total += static_cast<std::size_t>(
            record.stars(it == targetBpm_.end() ? 0 : it->second));
    }
    return total;
}

int Progress::totalAttempts() const noexcept {
    int total = 0;
    for (const auto& [id, record] : records_) {
        total += record.attempts;
    }
    return total;
}

int Progress::streakDays() const noexcept {
    if (days_.empty()) {
        return 0;
    }
    // days_ is kept sorted newest first and deduplicated on the way in, so
    // the streak is just the length of the run of consecutive numbers at the
    // front. Counted back from the last day of practice rather than from
    // today, so opening the app the morning after does not read as a break.
    const std::int64_t today = dayNumber(nowSeconds());
    if (days_.front() < today - 1) {
        return 0;
    }

    int streak = 1;
    for (std::size_t i = 1; i < days_.size(); ++i) {
        if (days_[i - 1] - days_[i] == 1) {
            ++streak;
        } else {
            break;
        }
    }
    return streak;
}

void Progress::setTargetBpm(const std::string& exerciseId, int bpm) {
    targetBpm_[exerciseId] = bpm;
}

}  // namespace fretless::curriculum
