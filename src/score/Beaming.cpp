#include "fretless/score/Beaming.h"

#include <algorithm>
#include <cmath>

namespace fretless::score {
namespace {

/// The flag rule StaffView has always used: a little under a quarter, so a
/// quarter shortened by a clamped overlap still reads as a quarter.
constexpr double kShortestUnbeamed = 0.9;
constexpr int    kMaxBeams         = 4;

/// Two positions this close (in quarters) are the same moment.
constexpr double kQuarterEpsilon = 1.0 / 64.0;

[[nodiscard]] double quartersPerSecond(const Score& score, std::size_t from, std::size_t to) {
    const double seconds = score.events[to].startSeconds - score.events[from].startSeconds;
    if (seconds <= 0.0) {
        return 0.0;
    }
    return (score.events[to].startQuarters - score.events[from].startQuarters) / seconds;
}

/// The meter of the bar an event sits in: its own when the score has a
/// measure map, the opening one otherwise.
struct Meter {
    int beats;
    int unit;
};

[[nodiscard]] Meter meterOf(const Score& score, const ScoreEvent& event) {
    if (event.measureIndex >= 0 &&
        static_cast<std::size_t>(event.measureIndex) < score.measures.size()) {
        const MeasureMark& bar = score.measures[static_cast<std::size_t>(event.measureIndex)];
        return {bar.beats, bar.beatUnit};
    }
    return {score.beatsPerMeasure, score.beatUnit};
}

[[nodiscard]] double measurePositionQuarters(const ScoreEvent& event, Meter meter) {
    if (meter.unit <= 0) {
        return 0.0;
    }
    return (static_cast<double>(event.beat) - 1.0) * 4.0 / static_cast<double>(meter.unit);
}

}  // namespace

double durationQuarters(const Score& score, std::size_t index) noexcept {
    const auto& events = score.events;
    if (index >= events.size()) {
        return 0.0;
    }
    double rate = 0.0;
    if (index + 1 < events.size()) {
        rate = quartersPerSecond(score, index, index + 1);
    }
    if (rate <= 0.0 && index > 0) {
        rate = quartersPerSecond(score, index - 1, index);
    }
    if (rate <= 0.0) {
        rate = score.beatsPerMinute / 60.0;
    }
    return events[index].durationSeconds * rate;
}

int beamCount(double quarters) noexcept {
    if (quarters <= 0.0 || quarters >= kShortestUnbeamed) {
        return 0;
    }
    // Beams are log2 of the nominal note: an eighth (0.5) is 1, a sixteenth 2.
    // A dot multiplies by 1.5 and a triplet by 2/3, so each shifts the log by
    // the same 0.585 in opposite directions; the reading that lands nearest
    // a whole number is the note the composer wrote.
    const double logLength   = -std::log2(quarters);
    const double dotShift    = std::log2(1.5);
    const double readings[3] = {logLength, logLength + dotShift, logLength - dotShift};

    double bestDistance = 1.0;
    int    beams        = 1;
    for (const double reading : readings) {
        const double nearest  = std::round(reading);
        const double distance = std::abs(reading - nearest);
        if (distance < bestDistance) {
            bestDistance = distance;
            beams        = static_cast<int>(nearest);
        }
    }
    return std::clamp(beams, 1, kMaxBeams);
}

double beamSpanQuarters(int beatsPerMeasure, int beatUnit) noexcept {
    if (beatUnit <= 0) {
        return 1.0;
    }
    const bool compound = beatUnit == 8 && beatsPerMeasure % 3 == 0;
    return compound ? 1.5 : 4.0 / static_cast<double>(beatUnit);
}

void findBeamGroups(const Score& score, std::vector<BeamGroup>& out) {
    out.clear();
    const auto& events = score.events;

    const auto beamable = [&](std::size_t i) {
        return !events[i].isRest && beamCount(durationQuarters(score, i)) > 0;
    };
    const auto spanIndex = [&](std::size_t i) {
        const Meter  meter = meterOf(score, events[i]);
        const double span  = beamSpanQuarters(meter.beats, meter.unit);
        return static_cast<long>(
            std::floor(measurePositionQuarters(events[i], meter) / span + kQuarterEpsilon));
    };
    const auto joins = [&](std::size_t i, std::size_t next) {
        const double end = events[i].startQuarters + durationQuarters(score, i);
        return beamable(next) && events[next].measure == events[i].measure &&
               events[next].measureIndex == events[i].measureIndex &&
               spanIndex(next) == spanIndex(i) &&
               std::abs(events[next].startQuarters - end) < kQuarterEpsilon;
    };

    std::size_t i = 0;
    while (i < events.size()) {
        if (!beamable(i)) {
            ++i;
            continue;
        }
        std::size_t last = i;
        while (last + 1 < events.size() && joins(last, last + 1)) {
            ++last;
        }
        if (last > i) {
            out.push_back({i, last});
        }
        i = last + 1;
    }
}

}  // namespace fretless::score
