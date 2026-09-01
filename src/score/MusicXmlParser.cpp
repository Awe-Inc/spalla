#include "fretless/score/MusicXmlParser.h"

#include <pugixml.hpp>

#if __has_include(<miniz.h>)
    #include <miniz.h>
    #define FRETLESS_HAS_MINIZ 1
#else
    #define FRETLESS_HAS_MINIZ 0
#endif

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <map>
#include <string_view>
#include <vector>

namespace fretless::score {
namespace {

constexpr int kStepSemitone[7] = {9, 11, 0, 2, 4, 5, 7};  // A B C D E F G

/// Two onsets closer than this (in quarter notes) are the same musical moment.
/// A 128th note at quarter=1 is 0.03125, so 1/512 is safely below anything real.
constexpr double kOnsetEpsilon = 1.0 / 512.0;

[[nodiscard]] int stepToSemitone(const char* step) noexcept {
    if (step == nullptr || step[0] == '\0') {
        return -1;
    }
    const int index = step[0] - 'A';
    return (index >= 0 && index < 7) ? kStepSemitone[index] : -1;
}

[[nodiscard]] float midiToHz(int midi) noexcept {
    return 440.0f * std::pow(2.0f, static_cast<float>(midi - 69) / 12.0f);
}

void writeNoteName(char* out, const char* step, int alter, int octave) noexcept {
    // Spell the note the way the composer wrote it: F# and Gb are the same
    // pitch but a violinist reads them differently.
    const char accidental = (alter > 0) ? '#' : ((alter < 0) ? 'b' : '\0');
    if (accidental != '\0' && std::abs(alter) == 2) {
        std::snprintf(out, 5, "%c%c%c%d", step[0], accidental, accidental, octave);
    } else if (accidental != '\0') {
        std::snprintf(out, 5, "%c%c%d", step[0], accidental, octave);
    } else {
        std::snprintf(out, 5, "%c%d", step[0], octave);
    }
}

/// Reads a <sound tempo> or <metronome> block, returning 0 if neither is present.
[[nodiscard]] double readTempo(const pugi::xml_node& direction) noexcept {
    if (const auto sound = direction.child("sound")) {
        const double tempo = sound.attribute("tempo").as_double(0.0);
        if (tempo > 0.0) {
            return tempo;
        }
    }
    for (const auto type : direction.children("direction-type")) {
        const auto metronome = type.child("metronome");
        if (!metronome) {
            continue;
        }
        const double perMinute = metronome.child("per-minute").text().as_double(0.0);
        if (perMinute <= 0.0) {
            continue;
        }
        // <beat-unit> is the note the marking counts. "half = 60" means
        // 120 quarter notes per minute.
        const std::string unit = metronome.child_value("beat-unit");
        double factor = 1.0;
        if (unit == "half")      factor = 2.0;
        else if (unit == "whole")   factor = 4.0;
        else if (unit == "eighth")  factor = 0.5;
        else if (unit == "16th")    factor = 0.25;
        if (metronome.child("beat-unit-dot")) {
            factor *= 1.5;
        }
        return perMinute * factor;
    }
    return 0.0;
}

// ── Intermediate representation ────────────────────────────────────────────
// Positions stay in quarter notes until the very end, because tempo can change
// mid-piece and seconds are only meaningful once the tempo map is complete.
struct RawEvent {
    double startQuarters    = 0.0;
    double durationQuarters = 0.0;
    int    midi             = -1;
    int    measure          = 0;
    bool   isRest           = false;
    bool   tieStart         = false;
    bool   tieStop          = false;
    char   noteName[5]      = {};
};

/// Integrates the tempo map to convert a quarter-note position into seconds.
class TempoIntegrator {
public:
    explicit TempoIntegrator(const std::vector<TempoMark>& marks, double initialBpm)
        : marks_(marks), currentBpm_(initialBpm) {}

    /// Calls must be non-decreasing in `quarters` — the caller walks a sorted
    /// timeline, so this stays O(n) overall instead of O(n * marks).
    [[nodiscard]] double toSeconds(double quarters) {
        while (index_ < marks_.size() && marks_[index_].quarterPosition <= quarters) {
            const auto& mark = marks_[index_];
            if (mark.quarterPosition > lastQuarters_) {
                seconds_      += (mark.quarterPosition - lastQuarters_) * 60.0 / currentBpm_;
                lastQuarters_  = mark.quarterPosition;
            }
            currentBpm_ = mark.beatsPerMinute;
            ++index_;
        }
        return seconds_ + (quarters - lastQuarters_) * 60.0 / currentBpm_;
    }

private:
    const std::vector<TempoMark>& marks_;
    std::size_t index_        = 0;
    double      seconds_      = 0.0;
    double      lastQuarters_ = 0.0;
    double      currentBpm_   = 120.0;
};

// ── .mxl (zipped MusicXML) ────────────────────────────────────────────────
#if FRETLESS_HAS_MINIZ

/// ZIP mandates forward slashes, but plenty of writers ignore that — Windows
/// PowerShell's Compress-Archive stores "META-INF\container.xml". Comparing
/// raw names therefore misses the container and, worse, lets the container
/// itself pass a "not in META-INF/" filter and be mistaken for the score.
[[nodiscard]] std::string normalizeZipPath(const char* raw) {
    std::string path = (raw != nullptr) ? raw : "";
    std::replace(path.begin(), path.end(), '\\', '/');
    return path;
}

[[nodiscard]] bool endsWithIgnoreCase(const std::string& text, const char* suffix) {
    const std::size_t length = std::strlen(suffix);
    if (text.size() < length) {
        return false;
    }
    for (std::size_t i = 0; i < length; ++i) {
        const char a = static_cast<char>(std::tolower(
            static_cast<unsigned char>(text[text.size() - length + i])));
        if (a != suffix[i]) {
            return false;
        }
    }
    return true;
}

/// Cheap structural check: is this buffer actually a partwise score? Used to
/// validate a candidate before committing to it.
[[nodiscard]] bool looksLikeScore(const char* data, std::size_t size) {
    const std::string_view text(data, std::min<std::size_t>(size, 4096));
    return text.find("score-partwise") != std::string_view::npos ||
           text.find("score-timewise") != std::string_view::npos;
}

[[nodiscard]] bool extractEntry(mz_zip_archive& zip, mz_uint index,
                                std::vector<char>& out) {
    std::size_t entrySize = 0;
    void* raw = mz_zip_reader_extract_to_heap(&zip, index, &entrySize, 0);
    if (raw == nullptr) {
        return false;
    }
    out.assign(static_cast<char*>(raw), static_cast<char*>(raw) + entrySize);
    mz_free(raw);
    return true;
}

[[nodiscard]] bool extractMxl(const char* data, std::size_t size,
                              std::vector<char>& out, std::string* error) {
    mz_zip_archive zip{};
    if (!mz_zip_reader_init_mem(&zip, data, size, 0)) {
        if (error != nullptr) { *error = "Not a readable .mxl archive."; }
        return false;
    }

    const mz_uint fileCount = mz_zip_reader_get_num_files(&zip);
    std::map<std::string, mz_uint> entries;   // normalized path -> index
    for (mz_uint i = 0; i < fileCount; ++i) {
        mz_zip_archive_file_stat stat{};
        if (mz_zip_reader_file_stat(&zip, i, &stat) && !mz_zip_reader_is_file_a_directory(&zip, i)) {
            entries.emplace(normalizeZipPath(stat.m_filename), i);
        }
    }

    // 1. The container names the real score file. This is the correct path.
    std::string rootPath;
    if (const auto it = entries.find("META-INF/container.xml"); it != entries.end()) {
        std::vector<char> container;
        if (extractEntry(zip, it->second, container)) {
            pugi::xml_document document;
            if (document.load_buffer(container.data(), container.size())) {
                rootPath = normalizeZipPath(
                    document.select_node("//rootfile/@full-path").attribute().as_string());
            }
        }
    }

    if (!rootPath.empty()) {
        if (const auto it = entries.find(rootPath); it != entries.end()) {
            if (extractEntry(zip, it->second, out) && looksLikeScore(out.data(), out.size())) {
                mz_zip_reader_end(&zip);
                return true;
            }
        }
    }

    // 2. No usable container: try every .xml outside META-INF and keep the
    //    first one that is actually a score, rather than the first one that
    //    merely has the right extension.
    for (const auto& [name, index] : entries) {
        if (name.rfind("META-INF/", 0) == 0) {
            continue;
        }
        if (!endsWithIgnoreCase(name, ".xml") && !endsWithIgnoreCase(name, ".musicxml")) {
            continue;
        }
        if (extractEntry(zip, index, out) && looksLikeScore(out.data(), out.size())) {
            mz_zip_reader_end(&zip);
            return true;
        }
    }

    mz_zip_reader_end(&zip);
    if (error != nullptr) {
        *error = "No MusicXML score found inside the .mxl archive.";
    }
    return false;
}
#endif

}  // namespace

// ═══════════════════════════════════════════════════════════════════════════

std::optional<Score> parseMusicXmlBuffer(const char* data, std::size_t size,
                                         std::string* error,
                                         const ParseOptions& options) {
    pugi::xml_document doc;
    const pugi::xml_parse_result result =
        doc.load_buffer(data, size, pugi::parse_default | pugi::parse_doctype);
    if (!result) {
        if (error != nullptr) {
            *error = std::string("XML parse error: ") + result.description();
        }
        return std::nullopt;
    }

    pugi::xml_node root = doc.child("score-partwise");
    if (!root) {
        if (doc.child("score-timewise")) {
            if (error != nullptr) {
                *error = "score-timewise is not supported. Re-export as score-partwise.";
            }
        } else if (error != nullptr) {
            *error = "Not a MusicXML document (no <score-partwise> root).";
        }
        return std::nullopt;
    }

    Score score;
    score.title = root.child("work").child_value("work-title");
    if (score.title.empty()) {
        score.title = root.child_value("movement-title");
    }
    for (const auto creator : root.child("identification").children("creator")) {
        if (std::strcmp(creator.attribute("type").as_string(), "composer") == 0) {
            score.composer = creator.child_value();
            break;
        }
    }

    // ── Select the part ───────────────────────────────────────────────────
    std::string partId;
    int partCursor = 0;
    for (const auto scorePart : root.child("part-list").children("score-part")) {
        if (partCursor == options.partIndex) {
            partId         = scorePart.attribute("id").as_string();
            score.partName = scorePart.child_value("part-name");
            break;
        }
        ++partCursor;
    }

    pugi::xml_node part;
    for (const auto candidate : root.children("part")) {
        if (partId.empty() || std::strcmp(candidate.attribute("id").as_string(),
                                          partId.c_str()) == 0) {
            part = candidate;
            break;
        }
    }
    if (!part) {
        if (error != nullptr) {
            *error = "Part " + std::to_string(options.partIndex) + " not found.";
        }
        return std::nullopt;
    }

    // ── Walk the measures ─────────────────────────────────────────────────
    std::vector<RawEvent> raw;
    raw.reserve(2048);

    double divisions           = 1.0;   // divisions per quarter note
    double quarterCursor       = 0.0;
    double lastOnsetQuarters   = 0.0;   // for <chord/>
    double lastDurationQuarters = 0.0;
    int    measureNumber       = 0;
    bool   sawTimeSignature    = false;
    bool   sawKey              = false;

    for (const auto measure : part.children("measure")) {
        measureNumber = measure.attribute("number").as_int(measureNumber + 1);
        const double measureStart = quarterCursor;

        for (const auto element : measure.children()) {
            const char* name = element.name();

            if (std::strcmp(name, "attributes") == 0) {
                if (const auto d = element.child("divisions")) {
                    const double value = d.text().as_double(0.0);
                    if (value > 0.0) {
                        divisions = value;
                    }
                }
                if (const auto time = element.child("time"); time && !sawTimeSignature) {
                    score.beatsPerMeasure = time.child("beats").text().as_int(4);
                    score.beatUnit        = time.child("beat-type").text().as_int(4);
                    sawTimeSignature      = true;
                }
                if (const auto key = element.child("key"); key && !sawKey) {
                    score.keyFifths = key.child("fifths").text().as_int(0);
                    sawKey          = true;
                }
                continue;
            }

            if (std::strcmp(name, "direction") == 0 || std::strcmp(name, "sound") == 0) {
                const double bpm = (std::strcmp(name, "sound") == 0)
                    ? element.attribute("tempo").as_double(0.0)
                    : readTempo(element);
                if (bpm > 0.0) {
                    score.tempoMap.push_back({quarterCursor, bpm});
                }
                continue;
            }

            if (std::strcmp(name, "backup") == 0) {
                quarterCursor -= element.child("duration").text().as_double(0.0) / divisions;
                quarterCursor = std::max(quarterCursor, 0.0);
                continue;
            }

            if (std::strcmp(name, "forward") == 0) {
                quarterCursor += element.child("duration").text().as_double(0.0) / divisions;
                continue;
            }

            if (std::strcmp(name, "note") != 0) {
                continue;
            }

            // ── A note or rest ────────────────────────────────────────────
            // Grace notes carry no duration and would corrupt the timeline.
            // They are ornaments; the game judges the principal note.
            if (element.child("grace")) {
                continue;
            }

            const bool   isChord     = static_cast<bool>(element.child("chord"));
            const double durQuarters = element.child("duration").text().as_double(0.0) / divisions;

            RawEvent event;
            event.measure          = measureNumber;
            event.startQuarters    = isChord ? lastOnsetQuarters : quarterCursor;
            event.durationQuarters = isChord ? lastDurationQuarters : durQuarters;

            if (element.child("rest")) {
                event.isRest = true;
            } else if (const auto pitch = element.child("pitch")) {
                const char* step   = pitch.child_value("step");
                const int   alter  = pitch.child("alter").text().as_int(0);
                const int   octave = pitch.child("octave").text().as_int(4);
                const int   semi   = stepToSemitone(step);
                if (semi < 0) {
                    continue;
                }
                event.midi = (octave + 1) * 12 + semi + alter;
                writeNoteName(event.noteName, step, alter, octave);
            } else {
                continue;   // <unpitched> — percussion, not our instrument
            }

            for (const auto tie : element.children("tie")) {
                const char* type = tie.attribute("type").as_string();
                event.tieStart |= (std::strcmp(type, "start") == 0);
                event.tieStop  |= (std::strcmp(type, "stop") == 0);
            }

            raw.push_back(event);

            if (!isChord) {
                lastOnsetQuarters    = quarterCursor;
                lastDurationQuarters = durQuarters;
                quarterCursor       += durQuarters;
            }
        }

        // A measure that ended short (pickup, or a voice that stopped early)
        // must not drag the next measure backwards.
        quarterCursor = std::max(quarterCursor, measureStart);
    }

    if (raw.empty()) {
        if (error != nullptr) {
            *error = "The part contains no notes.";
        }
        return std::nullopt;
    }

    // ── Collapse to a single monophonic line ──────────────────────────────
    // Chords and multi-voice writing both produce several events at the same
    // onset. A violinist reading the melody plays the top one.
    std::stable_sort(raw.begin(), raw.end(),
                     [](const RawEvent& a, const RawEvent& b) {
                         if (std::abs(a.startQuarters - b.startQuarters) > kOnsetEpsilon) {
                             return a.startQuarters < b.startQuarters;
                         }
                         return a.midi > b.midi;   // notes before rests (midi -1)
                     });

    std::vector<RawEvent> merged;
    merged.reserve(raw.size());
    for (const auto& event : raw) {
        if (!merged.empty() &&
            std::abs(merged.back().startQuarters - event.startQuarters) <= kOnsetEpsilon) {
            if (options.takeTopNoteOfChord) {
                continue;   // the sort already put the highest note first
            }
        }
        merged.push_back(event);
    }

    // Clamp overlaps so the timeline really is monophonic: the game's
    // "which note is expected right now" question must have one answer.
    for (std::size_t i = 0; i + 1 < merged.size(); ++i) {
        const double gap = merged[i + 1].startQuarters - merged[i].startQuarters;
        if (merged[i].durationQuarters > gap) {
            merged[i].durationQuarters = gap;
        }
    }

    // ── Merge ties ────────────────────────────────────────────────────────
    if (options.mergeTies) {
        std::vector<RawEvent> tied;
        tied.reserve(merged.size());
        for (const auto& event : merged) {
            if (!tied.empty() && event.tieStop && !event.isRest &&
                tied.back().midi == event.midi && tied.back().tieStart) {
                tied.back().durationQuarters =
                    (event.startQuarters + event.durationQuarters) - tied.back().startQuarters;
                tied.back().tieStart = event.tieStart;
                continue;
            }
            tied.push_back(event);
        }
        merged.swap(tied);
    }

    // ── Convert to seconds ────────────────────────────────────────────────
    std::stable_sort(score.tempoMap.begin(), score.tempoMap.end(),
                     [](const TempoMark& a, const TempoMark& b) {
                         return a.quarterPosition < b.quarterPosition;
                     });

    score.beatsPerMinute = score.tempoMap.empty() ? 120.0
                                                  : score.tempoMap.front().beatsPerMinute;

    TempoIntegrator integrator(score.tempoMap, score.beatsPerMinute);
    const double beatsPerQuarter = static_cast<double>(score.beatUnit) / 4.0;

    score.events.reserve(merged.size());
    double measureStartQuarters = 0.0;
    int    currentMeasure       = -1;

    for (const auto& event : merged) {
        if (event.measure != currentMeasure) {
            currentMeasure       = event.measure;
            measureStartQuarters = event.startQuarters;
        }

        ScoreEvent out;
        out.startQuarters   = event.startQuarters;
        out.startSeconds    = integrator.toSeconds(event.startQuarters);
        out.durationSeconds = integrator.toSeconds(event.startQuarters + event.durationQuarters)
                              - out.startSeconds;
        out.measure         = event.measure;
        out.beat            = static_cast<float>(
            (event.startQuarters - measureStartQuarters) * beatsPerQuarter + 1.0);
        out.isRest          = event.isRest;
        out.midi            = event.midi;

        if (!event.isRest) {
            out.frequencyHz     = midiToHz(event.midi);
            out.suggestedString = stringForMidi(event.midi);
            std::memcpy(out.noteName, event.noteName, sizeof(out.noteName));
        }
        score.events.push_back(out);
    }

    return score;
}

std::optional<Score> parseMusicXml(const std::string& path, std::string* error,
                                   const ParseOptions& options) {
    std::ifstream file(path, std::ios::binary);
    if (!file) {
        if (error != nullptr) {
            *error = "Cannot open " + path;
        }
        return std::nullopt;
    }
    std::vector<char> bytes((std::istreambuf_iterator<char>(file)),
                            std::istreambuf_iterator<char>());
    if (bytes.size() < 4) {
        if (error != nullptr) {
            *error = path + " is empty or truncated.";
        }
        return std::nullopt;
    }

    // "PK\x03\x04" — a .mxl container regardless of the file extension.
    if (bytes[0] == 'P' && bytes[1] == 'K') {
#if FRETLESS_HAS_MINIZ
        std::vector<char> inner;
        if (!extractMxl(bytes.data(), bytes.size(), inner, error)) {
            return std::nullopt;
        }
        bytes.swap(inner);
#else
        if (error != nullptr) {
            *error = "Compressed .mxl files need miniz. Export as uncompressed MusicXML.";
        }
        return std::nullopt;
#endif
    }

    auto score = parseMusicXmlBuffer(bytes.data(), bytes.size(), error, options);
    if (score.has_value()) {
        score->sourcePath = path;
    }
    return score;
}

}  // namespace fretless::score
