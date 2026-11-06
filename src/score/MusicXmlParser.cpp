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

/// Lowercased with spaces removed, so "D. C. al Fine" and "d.c. al fine" read alike.
[[nodiscard]] std::string normalizedWords(const char* text) {
    std::string out;
    for (const char* c = text; *c != '\0'; ++c) {
        const auto byte = static_cast<unsigned char>(*c);
        if (std::isspace(byte) == 0) {
            out += static_cast<char>(std::tolower(byte));
        }
    }
    return out;
}

[[nodiscard]] bool startsWith(const std::string& text, const char* prefix) {
    return text.rfind(prefix, 0) == 0;
}

/// Beats per minute a tempo word implies, or 0. Used only when the file states
/// no number anywhere, so a guess never overrides what the editor wrote.
[[nodiscard]] std::uint16_t noteMarkNamed(const char* name) {
    static constexpr std::pair<const char*, std::uint16_t> kMarks[] = {
        {"fermata", kMarkFermata},
        {"staccato", kMarkStaccato},
        {"staccatissimo", kMarkStaccatissimo},
        {"spiccato", kMarkStaccatissimo},
        {"tenuto", kMarkTenuto},
        {"accent", kMarkAccent},
        {"strong-accent", kMarkMarcato},
        {"trill-mark", kMarkTrill},
        {"mordent", kMarkMordent},
        {"inverted-mordent", kMarkMordent},
        {"turn", kMarkTurn},
        {"inverted-turn", kMarkTurn},
        {"delayed-turn", kMarkTurn},
        {"up-bow", kMarkUpBow},
        {"down-bow", kMarkDownBow},
        {"snap-pizzicato", kMarkPizzicato},
        {"harmonic", kMarkHarmonic},
    };
    for (const auto& [markName, mark] : kMarks) {
        if (std::strcmp(markName, name) == 0) {
            return mark;
        }
    }
    return 0;
}

[[nodiscard]] std::uint16_t readNoteMarks(const pugi::xml_node& note) {
    std::uint16_t marks = 0;
    for (const auto notations : note.children("notations")) {
        for (const auto item : notations.children()) {
            marks |= noteMarkNamed(item.name());
            for (const auto inner : item.children()) {
                marks |= noteMarkNamed(inner.name());
            }
        }
    }
    return marks;
}

void readDynamic(const pugi::xml_node& parent, char (&out)[6]) {
    for (const auto mark : parent.child("dynamics").children()) {
        const std::string_view name = mark.name();
        // <other-dynamics> holds free text, which is not a printed sign we know.
        if (!name.empty() && name.size() < sizeof(out)) {
            std::memcpy(out, name.data(), name.size());
            out[name.size()] = '\0';
            return;
        }
    }
}

[[nodiscard]] double tempoFromWords(const pugi::xml_node& direction) {
    static constexpr std::pair<const char*, double> kWords[] = {
        {"larghetto", 60.0}, {"largo", 50.0},   {"grave", 44.0},     {"lento", 56.0},
        {"adagietto", 72.0}, {"adagio", 66.0},  {"andantino", 84.0}, {"andante", 76.0},
        {"moderato", 100.0}, {"allegretto", 112.0}, {"allegro", 132.0},
        {"vivace", 160.0},   {"presto", 180.0},
    };
    for (const auto type : direction.children("direction-type")) {
        for (const auto words : type.children("words")) {
            const std::string text = normalizedWords(words.child_value());
            for (const auto& [word, bpm] : kWords) {
                if (startsWith(text, word)) {
                    return bpm;
                }
            }
        }
    }
    return 0.0;
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

// ── Performance order ─────────────────────────────────────────────────────
// Repeats and jumps are resolved into a list of measure indices before any
// note is read, so the note walk below stays a straight pass over measures and
// every timing rule it has (divisions, backup, pickups) applies unchanged to a
// measure heard for the second time.

/// What a measure's barlines, <sound> attributes and printed marks say about
/// navigation. <sound> is what notation programs write for playback, so it wins
/// wherever it exists; the printed words and glyphs fill in only the kinds of
/// mark the file gives no <sound> for, because plenty of exports and hand-made
/// files carry just the "D.S. al Coda" a reader sees.
struct MeasureFlow {
    bool             forwardRepeat = false;
    int              backwardTimes = 0;      ///< 0 = no backward repeat
    bool             repeatsAfterJump = false;  ///< <repeat after-jump="yes">
    std::vector<int> endings;                ///< volta numbers this measure belongs to
    bool             endingCloses  = false;  ///< the volta ends with this measure
    bool             finalEnding   = false;  ///< belongs to the last volta of its block
    std::string      segno;
    std::string      coda;
    std::string      toCoda;
    std::string      dalSegno;
    bool             daCapo        = false;
    bool             fine          = false;
};

/// A file is untrusted input; a volta numbered "99999999999" must not overflow.
constexpr int kMaxEndingNumber = 999;

[[nodiscard]] std::vector<int> parseEndingNumbers(const char* text) {
    std::vector<int> numbers;
    int  value   = 0;
    bool inDigit = false;
    for (const char* c = text; ; ++c) {
        if (*c >= '0' && *c <= '9') {
            value   = std::min(value * 10 + (*c - '0'), kMaxEndingNumber);
            inDigit = true;
        } else {
            if (inDigit) {
                numbers.push_back(value);
            }
            value   = 0;
            inDigit = false;
            if (*c == '\0') {
                break;
            }
        }
    }
    return numbers;
}

struct PrintedMarks {
    bool segno    = false;
    bool coda     = false;
    bool codaWord = false;
    bool toCoda   = false;
    bool dalSegno = false;
    bool daCapo   = false;
    bool fine     = false;
};

[[nodiscard]] PrintedMarks readPrintedMarks(const pugi::xml_node& measure) {
    PrintedMarks marks;
    for (const auto direction : measure.children("direction")) {
        for (const auto type : direction.children("direction-type")) {
            marks.segno |= static_cast<bool>(type.child("segno"));
            marks.coda  |= static_cast<bool>(type.child("coda"));
            for (const auto words : type.children("words")) {
                const std::string text = normalizedWords(words.child_value());
                // The dots are required for the short forms: bare "dc" and "ds"
                // begin too many ordinary expression marks.
                marks.daCapo   |= startsWith(text, "d.c") || startsWith(text, "dc.") ||
                                  text == "dc" || startsWith(text, "dacapo");
                marks.dalSegno |= startsWith(text, "d.s") || startsWith(text, "ds.") ||
                                  text == "ds" || startsWith(text, "dalsegno");
                marks.toCoda   |= startsWith(text, "tocoda") || startsWith(text, "alcoda");
                marks.codaWord |= text == "coda" || text == "coda.";
                marks.fine     |= text == "fine" || text == "fine.";
            }
        }
    }
    return marks;
}

/// Applies printed marks to the kinds of navigation no <sound> described. Two
/// coda glyphs and no "To Coda" words is how a printed score writes the jump:
/// the first glyph leaves, the last one is where it lands.
void fillFromPrintedMarks(std::vector<MeasureFlow>& flow,
                          const std::vector<pugi::xml_node>& measures) {
    const auto anyHas = [&flow](auto field) {
        return std::any_of(flow.begin(), flow.end(),
                           [field](const MeasureFlow& m) { return !(m.*field).empty(); });
    };
    const bool soundSegno    = anyHas(&MeasureFlow::segno);
    const bool soundCoda     = anyHas(&MeasureFlow::coda);
    const bool soundToCoda   = anyHas(&MeasureFlow::toCoda);
    const bool soundDalSegno = anyHas(&MeasureFlow::dalSegno);
    const bool soundDaCapo   = std::any_of(flow.begin(), flow.end(),
                                           [](const MeasureFlow& m) { return m.daCapo; });
    const bool soundFine     = std::any_of(flow.begin(), flow.end(),
                                           [](const MeasureFlow& m) { return m.fine; });

    std::vector<std::size_t> codaGlyphs;
    bool hasToCodaWords = false;
    for (std::size_t i = 0; i < flow.size(); ++i) {
        const PrintedMarks marks = readPrintedMarks(measures[i]);
        if (marks.segno && !soundSegno)       { flow[i].segno = "yes"; }
        if (marks.dalSegno && !soundDalSegno) { flow[i].dalSegno = "yes"; }
        if (marks.daCapo && !soundDaCapo)     { flow[i].daCapo = true; }
        if (marks.fine && !soundFine)         { flow[i].fine = true; }
        if (marks.toCoda && !soundToCoda)     { flow[i].toCoda = "yes"; hasToCodaWords = true; }
        if ((marks.coda || marks.codaWord) && !soundCoda) { codaGlyphs.push_back(i); }
    }
    if (codaGlyphs.empty()) {
        return;
    }
    if (!hasToCodaWords && !soundToCoda && codaGlyphs.size() >= 2) {
        flow[codaGlyphs.front()].toCoda = "yes";
        flow[codaGlyphs.back()].coda    = "yes";
        return;
    }
    flow[codaGlyphs.back()].coda = "yes";
}

[[nodiscard]] std::vector<MeasureFlow> readFlow(const std::vector<pugi::xml_node>& measures) {
    std::vector<MeasureFlow> flow(measures.size());
    std::vector<int>         openEnding;

    for (std::size_t i = 0; i < measures.size(); ++i) {
        MeasureFlow& m = flow[i];
        for (const auto barline : measures[i].children("barline")) {
            if (const auto repeat = barline.child("repeat")) {
                if (std::strcmp(repeat.attribute("direction").as_string(), "forward") == 0) {
                    m.forwardRepeat = true;
                } else {
                    m.backwardTimes = std::max(repeat.attribute("times").as_int(2), 2);
                    m.repeatsAfterJump |= repeat.attribute("after-jump").as_bool(false);
                }
            }
            if (const auto ending = barline.child("ending")) {
                const char* type = ending.attribute("type").as_string();
                if (std::strcmp(type, "start") == 0) {
                    openEnding = parseEndingNumbers(ending.attribute("number").as_string());
                } else {
                    m.endingCloses = true;
                    if (openEnding.empty()) {
                        openEnding = parseEndingNumbers(ending.attribute("number").as_string());
                    }
                }
            }
        }
        m.endings = openEnding;
        if (m.endingCloses) {
            openEnding.clear();
        }

        for (const auto node : measures[i].select_nodes(".//sound")) {
            const auto sound = node.node();
            if (const auto a = sound.attribute("segno"))    { m.segno    = a.as_string(); }
            if (const auto a = sound.attribute("coda"))     { m.coda     = a.as_string(); }
            if (const auto a = sound.attribute("tocoda"))   { m.toCoda   = a.as_string(); }
            if (const auto a = sound.attribute("dalsegno")) { m.dalSegno = a.as_string(); }
            m.daCapo |= sound.attribute("dacapo").as_bool(false);
            m.fine   |= static_cast<bool>(sound.attribute("fine"));
        }
    }

    fillFromPrintedMarks(flow, measures);

    // After a D.C. or D.S. the convention is to take the last ending of each
    // volta block, so each block needs to know which of its measures that is.
    for (std::size_t start = 0; start < flow.size();) {
        if (flow[start].endings.empty()) {
            ++start;
            continue;
        }
        std::size_t end     = start;
        int         highest = 0;
        while (end < flow.size() && !flow[end].endings.empty()) {
            for (const int n : flow[end].endings) {
                highest = std::max(highest, n);
            }
            ++end;
        }
        for (std::size_t i = start; i < end; ++i) {
            const auto& numbers = flow[i].endings;
            flow[i].finalEnding =
                std::find(numbers.begin(), numbers.end(), highest) != numbers.end();
        }
        start = end;
    }
    return flow;
}

/// Finds the measure carrying `label` in `field`. An empty label matches the
/// first measure with any value, because many editions write segno="segno"
/// on one side and dalsegno="yes" on the other.
template <typename Field>
[[nodiscard]] std::optional<std::size_t> findMarker(const std::vector<MeasureFlow>& flow,
                                                    Field field, const std::string& label,
                                                    std::size_t from = 0) {
    for (std::size_t i = from; i < flow.size(); ++i) {
        const std::string& value = flow[i].*field;
        if (!value.empty() && (value == label || label.empty() || label == "yes")) {
            return i;
        }
    }
    if (!label.empty() && label != "yes") {
        return findMarker(flow, field, std::string{}, from);
    }
    return std::nullopt;
}

[[nodiscard]] std::vector<std::size_t> performanceOrder(const std::vector<MeasureFlow>& flow) {
    std::vector<std::size_t> order;
    order.reserve(flow.size() * 2);

    // A malformed score can describe a loop with no exit — a backward repeat
    // inside a D.S. that lands before it, say. No real piece plays its page
    // more than a handful of times, so a generous cap ends the walk instead.
    const std::size_t limit = flow.size() * 16 + 16;

    std::size_t i           = 0;
    std::size_t repeatStart = 0;
    int         pass        = 1;
    bool        jumped      = false;   // after a D.C. or D.S., repeats are not retaken

    while (i < flow.size() && order.size() < limit) {
        const MeasureFlow& m = flow[i];

        if (m.forwardRepeat && !jumped && i != repeatStart) {
            repeatStart = i;
            pass        = 1;
        }

        if (!m.endings.empty()) {
            const bool taken = jumped
                ? m.finalEnding
                : std::find(m.endings.begin(), m.endings.end(), pass) != m.endings.end();
            if (!taken) {
                ++i;
                continue;
            }
        }

        order.push_back(i);

        if (jumped && m.fine) {
            break;
        }
        if (jumped && !m.toCoda.empty()) {
            if (const auto coda = findMarker(flow, &MeasureFlow::coda, m.toCoda, i + 1)) {
                i = *coda;
                continue;
            }
        }
        if (m.backwardTimes > 0 && (!jumped || m.repeatsAfterJump)) {
            if (pass < m.backwardTimes) {
                ++pass;
                i = repeatStart;
                continue;
            }
            pass        = 1;
            repeatStart = i + 1;
        } else if (m.endingCloses && !jumped) {
            pass        = 1;
            repeatStart = i + 1;
        }
        if (!jumped && m.daCapo) {
            jumped      = true;
            i           = 0;
            repeatStart = 0;
            pass        = 1;
            continue;
        }
        if (!jumped && !m.dalSegno.empty()) {
            if (const auto segno = findMarker(flow, &MeasureFlow::segno, m.dalSegno)) {
                jumped      = true;
                i           = *segno;
                repeatStart = i;
                pass        = 1;
                continue;
            }
        }
        ++i;
    }
    return order;
}

// ── Intermediate representation ────────────────────────────────────────────
// Positions stay in quarter notes until the very end, because tempo can change
// mid-piece and seconds are only meaningful once the tempo map is complete.
struct HeldNote {
    double startQuarters = 0.0;
    double endQuarters   = 0.0;
};

struct RawEvent {
    double startQuarters    = 0.0;
    double durationQuarters = 0.0;
    int    midi             = -1;
    int    measure          = 0;
    int    playedMeasure    = 0;   ///< position in performance order; numbers repeat
    bool   isRest           = false;
    bool   tieStart         = false;
    bool   tieStop          = false;
    std::uint16_t marks     = 0;
    char   dynamic[6]       = {};
    char   noteName[5]      = {};
};

/// One played bar, still in quarters. `beats`/`beatUnit` are the meter in
/// force when it was read; the time signature can change at any bar.
struct RawMeasure {
    double startQuarters = 0.0;
    double endQuarters   = 0.0;
    int    number        = 0;
    int    playedMeasure = 0;
    int    beats         = 4;
    int    beatUnit      = 4;
};

/// A fermata has no written length, so it is expressed as half the tempo over
/// the note: the note lasts twice as long and everything after it stays where
/// the meter says. Twice is the conventional reading; the player's own hold can
/// only be known while listening.
void holdFermatas(Score& score, std::vector<HeldNote> held) {
    if (held.empty()) {
        return;
    }
    std::stable_sort(held.begin(), held.end(), [](const HeldNote& a, const HeldNote& b) {
        return a.startQuarters < b.startQuarters;
    });
    const std::vector<TempoMark> written = score.tempoMap;
    const auto bpmAt = [&](double quarters) {
        double bpm = score.beatsPerMinute;
        for (const auto& mark : written) {
            if (mark.quarterPosition > quarters + kOnsetEpsilon) {
                break;
            }
            bpm = mark.beatsPerMinute;
        }
        return bpm;
    };
    double lastStart = -1.0;
    for (const auto& note : held) {
        if (note.startQuarters <= lastStart + kOnsetEpsilon) {
            continue;
        }
        lastStart = note.startQuarters;
        score.tempoMap.push_back({note.startQuarters, bpmAt(note.startQuarters) * 0.5, true});
        score.tempoMap.push_back({note.endQuarters, bpmAt(note.endQuarters)});
    }
    std::stable_sort(score.tempoMap.begin(), score.tempoMap.end(),
                     [](const TempoMark& a, const TempoMark& b) {
                         return a.quarterPosition < b.quarterPosition;
                     });
}

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

// ── Measure map ─────────────────────────────────────────────────────────────
/// Fills `score.measures` from the played bars. Needs the sorted tempo map
/// and `score.beatsPerMinute`, so it runs once the walk is over.
void buildMeasureMap(const std::vector<RawMeasure>& raw, Score& score) {
    score.measures.clear();
    score.measures.reserve(raw.size());
    TempoIntegrator integrator(score.tempoMap, score.beatsPerMinute);
    for (const auto& bar : raw) {
        MeasureMark mark;
        mark.startQuarters  = bar.startQuarters;
        mark.lengthQuarters = bar.endQuarters - bar.startQuarters;
        mark.startSeconds   = integrator.toSeconds(bar.startQuarters);
        mark.endSeconds     = integrator.toSeconds(bar.endQuarters);
        mark.number         = bar.number;
        mark.beats          = bar.beats;
        mark.beatUnit       = bar.beatUnit;
        score.measures.push_back(mark);
    }
    if (score.measures.empty()) {
        return;
    }
    // Only the opening bar can be a pickup. A short bar later on is the
    // second half of one split around a repeat sign, or the closing bar
    // that completes the pickup, and both start on a downbeat.
    MeasureMark& first = score.measures.front();
    const double fullQuarters = first.beats * 4.0 / first.beatUnit;
    const double missing      = fullQuarters - first.lengthQuarters;
    if (missing > kOnsetEpsilon) {
        first.beatOffset = missing * first.beatUnit / 4.0;
    }
}

/// 1-based beat of a position, in the meter of its own bar.
[[nodiscard]] float beatInMeasure(const Score& score, int measureIndex, double quarters) {
    if (measureIndex < 0 || static_cast<std::size_t>(measureIndex) >= score.measures.size()) {
        return 1.0f;
    }
    const MeasureMark& bar = score.measures[static_cast<std::size_t>(measureIndex)];
    return static_cast<float>(bar.beatOffset +
                              (quarters - bar.startQuarters) * bar.beatUnit / 4.0 + 1.0);
}

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
    // "PK\x03\x04" — a .mxl container regardless of where the bytes came from.
    if (size >= 4 && data[0] == 'P' && data[1] == 'K') {
#if FRETLESS_HAS_MINIZ
        std::vector<char> inner;
        if (!extractMxl(data, size, inner, error)) {
            return std::nullopt;
        }
        return parseMusicXmlBuffer(inner.data(), inner.size(), error, options);
#else
        if (error != nullptr) {
            *error = "Compressed .mxl files need miniz. Export as uncompressed MusicXML.";
        }
        return std::nullopt;
#endif
    }

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
    const bool timewise = !root && static_cast<bool>(doc.child("score-timewise"));
    if (timewise) {
        root = doc.child("score-timewise");
    }
    if (!root) {
        if (error != nullptr) {
            *error = "Not a MusicXML document (no <score-partwise> root).";
        }
        return std::nullopt;
    }

    Score score;
    // <movement-title> is the piece; <work-title> is the volume it came from.
    // Preferring the work title lists every song in a published collection
    // under the collection's name, which is how a library of a hundred
    // Schubert songs ends up looking like one file repeated.
    score.title = root.child_value("movement-title");
    if (score.title.empty()) {
        score.title = root.child("work").child_value("work-title");
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

    // Timewise files nest the other way round: each <measure> holds a <part>
    // per instrument. Those <part> nodes have the children the walk below reads,
    // so the walk treats them as the measures.
    std::vector<pugi::xml_node> measures;
    if (timewise) {
        for (const auto measure : root.children("measure")) {
            for (const auto candidate : measure.children("part")) {
                if (partId.empty() || std::strcmp(candidate.attribute("id").as_string(),
                                                  partId.c_str()) == 0) {
                    measures.push_back(candidate);
                    break;
                }
            }
        }
    } else {
        for (const auto candidate : root.children("part")) {
            if (partId.empty() || std::strcmp(candidate.attribute("id").as_string(),
                                              partId.c_str()) == 0) {
                for (const auto measure : candidate.children("measure")) {
                    measures.push_back(measure);
                }
                break;
            }
        }
    }
    if (measures.empty()) {
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
    int    currentBeats        = 4;
    int    currentBeatUnit     = 4;
    int    transposeSemitones  = 0;
    std::vector<RawMeasure> rawMeasures;
    std::vector<HeldNote>   heldNotes;
    // A dynamic or "pizz." sits between notes on the page and belongs to the
    // note that follows it; a rest cannot show it, so it waits for a real note.
    char          pendingDynamic[6] = {};
    std::uint16_t pendingMarks      = 0;

    const bool statesTempo = std::any_of(measures.begin(), measures.end(), [](const pugi::xml_node& m) {
        return static_cast<bool>(m.select_node(".//sound[@tempo]")) ||
               static_cast<bool>(m.select_node(".//metronome"));
    });

    std::vector<std::size_t> order;
    if (options.expandRepeats) {
        order = performanceOrder(readFlow(measures));
    } else {
        order.resize(measures.size());
        for (std::size_t i = 0; i < order.size(); ++i) {
            order[i] = i;
        }
    }

    int playedMeasure = 0;
    for (const std::size_t measureIndex : order) {
        const pugi::xml_node measure = measures[measureIndex];
        ++playedMeasure;
        // The number attribute is the printed one, which is what a player
        // looks for on the page; a measure heard twice reports it twice.
        const pugi::xml_node numbered = timewise ? measure.parent() : measure;
        measureNumber = numbered.attribute("number").as_int(static_cast<int>(measureIndex) + 1);
        const double measureStart = quarterCursor;
        // A bar lasts as long as its longest voice. The cursor after the
        // last element is wherever the last voice stopped, which for a
        // second voice written without trailing rests is short of the bar.
        double measureFurthest = quarterCursor;

        for (const auto element : measure.children()) {
            const char* name = element.name();

            if (std::strcmp(name, "attributes") == 0) {
                if (const auto d = element.child("divisions")) {
                    const double value = d.text().as_double(0.0);
                    if (value > 0.0) {
                        divisions = value;
                    }
                }
                if (const auto time = element.child("time")) {
                    currentBeats    = std::max(1, time.child("beats").text().as_int(4));
                    currentBeatUnit = std::max(1, time.child("beat-type").text().as_int(4));
                    // The score-level meter stays the opening one: it names
                    // the piece in the library and sizes the tempo control.
                    if (!sawTimeSignature) {
                        score.beatsPerMeasure = currentBeats;
                        score.beatUnit        = currentBeatUnit;
                        sawTimeSignature      = true;
                    }
                }
                if (const auto transpose = element.child("transpose")) {
                    transposeSemitones = transpose.child("chromatic").text().as_int(0) +
                                         transpose.child("octave-change").text().as_int(0) * 12;
                }
                if (const auto key = element.child("key"); key && !sawKey) {
                    score.keyFifths = key.child("fifths").text().as_int(0);
                    sawKey          = true;
                }
                continue;
            }

            if (std::strcmp(name, "direction") == 0 || std::strcmp(name, "sound") == 0) {
                if (std::strcmp(name, "direction") == 0) {
                    for (const auto type : element.children("direction-type")) {
                        readDynamic(type, pendingDynamic);
                        for (const auto words : type.children("words")) {
                            if (startsWith(normalizedWords(words.child_value()), "pizz")) {
                                pendingMarks |= kMarkPizzicato;
                            }
                        }
                    }
                    if (element.child("sound").attribute("pizzicato").as_bool()) {
                        pendingMarks |= kMarkPizzicato;
                    }
                }
                double bpm = (std::strcmp(name, "sound") == 0)
                    ? element.attribute("tempo").as_double(0.0)
                    : readTempo(element);
                if (bpm <= 0.0 && !statesTempo && std::strcmp(name, "direction") == 0) {
                    bpm = tempoFromWords(element);
                }
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
                measureFurthest = std::max(measureFurthest, quarterCursor);
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
            event.playedMeasure    = playedMeasure;
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
                // The midi value is what the instrument must sound, which is what
                // the pitch detector will hear; the name stays as printed.
                event.midi = (octave + 1) * 12 + semi + alter + transposeSemitones;
                writeNoteName(event.noteName, step, alter, octave);
            } else {
                continue;   // <unpitched> — percussion, not our instrument
            }

            for (const auto tie : element.children("tie")) {
                const char* type = tie.attribute("type").as_string();
                event.tieStart |= (std::strcmp(type, "start") == 0);
                event.tieStop  |= (std::strcmp(type, "stop") == 0);
            }

            event.marks = readNoteMarks(element);
            for (const auto notations : element.children("notations")) {
                readDynamic(notations, event.dynamic);
            }
            if (!event.isRest) {
                event.marks |= pendingMarks;
                pendingMarks = 0;
                if (pendingDynamic[0] != '\0' && event.dynamic[0] == '\0') {
                    std::memcpy(event.dynamic, pendingDynamic, sizeof(event.dynamic));
                }
                pendingDynamic[0] = '\0';
            }

            raw.push_back(event);

            if (!isChord && durQuarters > 0.0 && element.child("notations").child("fermata")) {
                heldNotes.push_back({quarterCursor, quarterCursor + durQuarters});
            }

            if (!isChord) {
                lastOnsetQuarters    = quarterCursor;
                lastDurationQuarters = durQuarters;
                quarterCursor       += durQuarters;
                measureFurthest      = std::max(measureFurthest, quarterCursor);
            }
        }

        // A measure that ended short (pickup, or a voice that stopped early)
        // must not drag the next measure backwards.
        quarterCursor = std::max(quarterCursor, measureFurthest);
        if (quarterCursor > measureStart + kOnsetEpsilon) {
            rawMeasures.push_back({measureStart, quarterCursor, measureNumber, playedMeasure,
                                   currentBeats, currentBeatUnit});
        }
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
                // The sort already put the highest note first, but engravers
                // attach the marks of a chord to whichever note came first.
                merged.back().marks |= event.marks;
                if (merged.back().dynamic[0] == '\0') {
                    std::memcpy(merged.back().dynamic, event.dynamic, sizeof(event.dynamic));
                }
                continue;
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
                tied.back().marks |= event.marks & kMarkFermata;
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

    holdFermatas(score, heldNotes);

    buildMeasureMap(rawMeasures, score);
    std::vector<int> measureOfPlayed(static_cast<std::size_t>(playedMeasure) + 1, -1);
    for (std::size_t i = 0; i < rawMeasures.size(); ++i) {
        measureOfPlayed[static_cast<std::size_t>(rawMeasures[i].playedMeasure)] =
            static_cast<int>(i);
    }

    TempoIntegrator integrator(score.tempoMap, score.beatsPerMinute);
    score.events.reserve(merged.size());

    for (const auto& event : merged) {
        ScoreEvent out;
        out.startQuarters   = event.startQuarters;
        out.startSeconds    = integrator.toSeconds(event.startQuarters);
        out.durationSeconds = integrator.toSeconds(event.startQuarters + event.durationQuarters)
                              - out.startSeconds;
        out.measure         = event.measure;
        out.measureIndex    = measureOfPlayed[static_cast<std::size_t>(event.playedMeasure)];
        out.beat            = beatInMeasure(score, out.measureIndex, event.startQuarters);
        out.isRest          = event.isRest;
        out.midi            = event.midi;

        if (!event.isRest) {
            out.frequencyHz     = midiToHz(event.midi);
            out.suggestedString = stringForMidi(event.midi);
            std::memcpy(out.noteName, event.noteName, sizeof(out.noteName));
        }
        out.marks = event.marks;
        std::memcpy(out.dynamic, event.dynamic, sizeof(out.dynamic));
        score.events.push_back(out);
    }

    if (options.trimSilentIntro) {
        score.trimSilentIntro();
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

    auto score = parseMusicXmlBuffer(bytes.data(), bytes.size(), error, options);
    if (score.has_value()) {
        score->sourcePath = path;
    }
    return score;
}

}  // namespace fretless::score
