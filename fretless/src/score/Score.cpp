#include "fretless/score/Score.h"

#include <algorithm>

namespace fretless::score {

const ScoreEvent* Score::noteAt(double timeSeconds) const noexcept {
    // Events are sorted by onset, so binary-search the last onset <= t and
    // walk back over the handful that could still be sounding.
    const auto it = std::upper_bound(
        events.begin(), events.end(), timeSeconds,
        [](double t, const ScoreEvent& e) { return t < e.startSeconds; });

    for (auto cursor = it; cursor != events.begin();) {
        --cursor;
        if (cursor->isRest) {
            continue;
        }
        if (timeSeconds < cursor->endSeconds()) {
            return &*cursor;
        }
        // Onsets only move backwards from here; once we are past the end of a
        // note by more than the longest plausible duration, stop looking.
        if (cursor->startSeconds + 8.0 < timeSeconds) {
            break;
        }
    }
    return nullptr;
}

void Score::notesInWindow(double from, double to, std::vector<std::size_t>& out) const {
    out.clear();
    if (events.empty() || to < from) {
        return;
    }

    const auto begin = std::lower_bound(
        events.begin(), events.end(), from,
        [](const ScoreEvent& e, double t) { return e.startSeconds < t; });

    for (auto it = begin; it != events.end() && it->startSeconds <= to; ++it) {
        if (!it->isRest) {
            out.push_back(static_cast<std::size_t>(it - events.begin()));
        }
    }
}

void Score::applyTempoScale(double scale) {
    scale = std::clamp(scale, 0.25, 2.0);
    if (scale == tempoScale_) {
        return;
    }
    // Undo the previous scale, then apply the new one, so repeated calls do
    // not compound rounding error.
    const double factor = tempoScale_ / scale;
    for (auto& e : events) {
        e.startSeconds    *= factor;
        e.durationSeconds *= factor;
    }
    for (auto& t : tempoMap) {
        t.beatsPerMinute *= (scale / tempoScale_);
    }
    beatsPerMinute *= (scale / tempoScale_);
    tempoScale_ = scale;
}

}  // namespace fretless::score
