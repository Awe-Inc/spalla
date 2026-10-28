#include "fretless/view/HighwayView.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "fretless/app/Theme.h"

namespace fretless::view {
namespace {

using namespace fretless::app::theme;

/// Lane 0 is drawn at the top and holds the E string, so the visual order
/// matches the instrument: index 3 (E) maps to row 0.
[[nodiscard]] int rowForString(std::uint8_t violinString) noexcept {
    return 3 - static_cast<int>(violinString);
}

[[nodiscard]] render::Color gradeColor(game::HitGrade grade) noexcept {
    switch (grade) {
        case game::HitGrade::Perfect: return kPerfect;
        case game::HitGrade::Great:   return kGreat;
        case game::HitGrade::Good:    return kGood;
        case game::HitGrade::Miss:    return kMiss;
        case game::HitGrade::None:    break;
    }
    return kTextMuted;
}

}  // namespace

float HighwayView::laneTop(int laneFromTop) const noexcept {
    return bounds_.y + laneHeight() * static_cast<float>(laneFromTop);
}

float HighwayView::hitLineX() const noexcept {
    return bounds_.x + bounds_.w * kHitLineFraction;
}

float HighwayView::pixelsPerSecond() const noexcept {
    const float runway = bounds_.w * (1.0f - kHitLineFraction);
    return runway / kLookAheadSeconds;
}

void HighwayView::syncJudgements(const game::GameEngine& game, const score::Score& score) {
    const auto& history = game.allJudgements();
    for (std::size_t i = lastJudgementCount_; i < history.size(); ++i) {
        const auto& judgement = history[i];
        if (judgement.eventIndex >= score.events.size()) {
            continue;
        }
        const int row = rowForString(score.events[judgement.eventIndex].suggestedString);
        flashes_.push_back({row, 1.0f, judgement.grade});
        popups_.push_back({1.0f, row, judgement.grade, judgement.comboAfter});
        if (judgement.grade != game::HitGrade::Miss) {
            hitLinePulse_ = 1.0f;
        }
    }
    lastJudgementCount_ = history.size();

    while (flashes_.size() > 16) { flashes_.pop_front(); }
    while (popups_.size() > 8)   { popups_.pop_front(); }
}

void HighwayView::update(double deltaSeconds) {
    const auto dt = static_cast<float>(deltaSeconds);

    for (auto& flash : flashes_) { flash.life -= dt * 2.2f; }
    for (auto& popup : popups_)  { popup.life -= dt * 1.4f; }
    hitLinePulse_ = std::max(0.0f, hitLinePulse_ - dt * 3.0f);

    while (!flashes_.empty() && flashes_.front().life <= 0.0f) { flashes_.pop_front(); }
    while (!popups_.empty()  && popups_.front().life  <= 0.0f) { popups_.pop_front(); }
}

void HighwayView::draw(render::Renderer2D& renderer,
                       const render::FontSet& fonts,
                       const score::Score&  score,
                       const game::GameEngine& game,
                       float                liveCents,
                       bool                 hasLiveCents) {
    const render::Font& fontSmall = *fonts.label;
    const render::Font& fontLarge = *fonts.title;

    const float lane   = laneHeight();
    const float hitX   = hitLineX();
    const float pps    = pixelsPerSecond();
    const double songTime = game.songTime();

    renderer.pushClip(bounds_.x, bounds_.y, bounds_.w, bounds_.h);

    // ── Lanes ─────────────────────────────────────────────────────────────
    for (int row = 0; row < 4; ++row) {
        const int stringIndex = 3 - row;
        const float top = laneTop(row);

        renderer.drawRect(bounds_.x, top, bounds_.w, lane, kLaneBackground[stringIndex]);

        // The runway ahead of the hit line carries a whisper of the string's
        // colour, so the eye can find its lane without reading the label.
        renderer.drawRect(hitX, top, bounds_.w - (hitX - bounds_.x), lane,
                          kStringColor[stringIndex].withAlpha(0.05f));

        if (row > 0) {
            renderer.drawRect(bounds_.x, top, bounds_.w, 1.0f, kDivider);
        }

        // String label in the gutter left of the hit line.
        const char* label = score::kStringName[stringIndex];
        renderer.drawText(fontLarge, bounds_.x + 14.0f,
                          top + lane * 0.5f + fontLarge.ascender() * 0.36f,
                          label, kStringColor[stringIndex].withAlpha(0.55f));
    }

    // ── Beat grid ─────────────────────────────────────────────────────────
    // A faint line per measure gives the eye a pulse to lock onto.
    if (score.beatsPerMinute > 0.0) {
        const double secondsPerMeasure =
            60.0 / score.beatsPerMinute * score.beatsPerMeasure * 4.0 / score.beatUnit;
        if (secondsPerMeasure > 0.05) {
            const double leftTime  = songTime - (hitX - bounds_.x) / pps;
            const double rightTime = songTime + kLookAheadSeconds;
            int measureIndex = static_cast<int>(std::floor(leftTime / secondsPerMeasure));
            for (double t = measureIndex * secondsPerMeasure; t <= rightTime;
                 t += secondsPerMeasure, ++measureIndex) {
                if (t < 0.0) {
                    continue;
                }
                const float x = hitX + static_cast<float>(t - songTime) * pps;
                if (x < bounds_.x || x > bounds_.right()) {
                    continue;
                }
                // The grid is orientation, not content: a faint line is enough
                // to feel the bar. Numbering every measure turned the runway
                // into a ruler and competed with the notes travelling over it.
                renderer.drawRect(x, bounds_.y, 1.0f, bounds_.h, kDivider.withAlpha(0.35f));
            }
        }
    }

    // ── Notes ─────────────────────────────────────────────────────────────
    const double windowStart = songTime - (hitX - bounds_.x) / pps - 0.5;
    const double windowEnd   = songTime + kLookAheadSeconds + 0.5;
    score.notesInWindow(windowStart, windowEnd, visible_);

    const std::size_t cursor = game.currentNoteIndex();
    const auto& history = game.allJudgements();

    for (const std::size_t index : visible_) {
        const auto& note = score.events[index];
        const int   row  = rowForString(note.suggestedString);

        const float noteHeight = lane * 0.52f;
        const float y = laneTop(row) + (lane - noteHeight) * 0.5f;
        const float x = hitX + static_cast<float>(note.startSeconds - songTime) * pps;
        const float w = std::max(14.0f, static_cast<float>(note.durationSeconds) * pps - 3.0f);

        if (x + w < bounds_.x || x > bounds_.right()) {
            continue;
        }

        render::Color color = kStringColor[note.suggestedString];
        float alpha = 1.0f;

        if (index < cursor) {
            // Already judged: recolour by verdict so the trail reads as a
            // record of the run rather than undifferentiated debris.
            auto it = std::find_if(history.begin(), history.end(),
                                   [index](const game::NoteJudgement& j) {
                                       return j.eventIndex == index;
                                   });
            if (it != history.end()) {
                color = gradeColor(it->grade);
            }
            alpha = 0.35f;
        } else if (index == cursor) {
            // The note being played right now: tint live by how in tune it is.
            if (hasLiveCents) {
                const float deviation = std::fabs(liveCents);
                const render::Color live =
                    (deviation <= game.config().centsPerfect) ? kPerfect
                    : (deviation <= game.config().centsGreat) ? kGreat
                    : (deviation <= game.config().centsGood)  ? kGood
                                                              : kMiss;
                color = color.lerp(live, 0.75f);
            }
            const float pulse = 0.85f + 0.15f * std::sin(static_cast<float>(songTime) * 12.0f);
            color = color.scaled(pulse);
        }

        renderer.drawRoundedRect(x, y, w, noteHeight, std::min(7.0f, noteHeight * 0.35f),
                                 color.withAlpha(alpha));
        // A brighter cap on the leading edge reads as the attack point.
        renderer.drawRoundedRect(x, y, std::min(4.0f, w), noteHeight, 2.0f,
                                 color.scaled(1.6f).withAlpha(alpha));

        if (w > 30.0f && noteHeight > 16.0f) {
            char latin[16] = {};
            score::toLatinName(note.noteName, latin, sizeof(latin));
            renderer.drawTextAligned(fontSmall, x, y + noteHeight * 0.5f + 5.0f, w,
                                     render::TextAlign::Center, latin,
                                     render::Color{0.04f, 0.04f, 0.08f, alpha});
        }
    }

    // ── Hit line ──────────────────────────────────────────────────────────
    const float glow = 0.35f + hitLinePulse_ * 0.65f;
    renderer.drawRect(hitX - 12.0f, bounds_.y, 24.0f, bounds_.h,
                      kHitLine.withAlpha(0.06f * glow));
    renderer.drawRect(hitX - 1.0f, bounds_.y, 2.5f, bounds_.h, kHitLine.withAlpha(glow));

    // Rings, not discs: a filled circle here punches a hole through the note
    // that is being judged, which is exactly the moment the player is looking.
    for (int row = 0; row < 4; ++row) {
        const int stringIndex = 3 - row;
        const float cy = laneTop(row) + lane * 0.5f;
        const float radius = lane * 0.19f;
        renderer.drawRing(hitX, cy, radius, 2.5f,
                          kStringColor[stringIndex].withAlpha(0.55f + hitLinePulse_ * 0.45f));
    }

    // ── Judgement flashes ─────────────────────────────────────────────────
    for (const auto& flash : flashes_) {
        const float life = std::clamp(flash.life, 0.0f, 1.0f);
        const auto color = gradeColor(flash.grade).withAlpha(life * 0.55f);
        renderer.drawRoundedRect(hitX - 30.0f, laneTop(flash.lane) + 4.0f, 60.0f,
                                 lane - 8.0f, 8.0f, color);
    }

    for (const auto& popup : popups_) {
        const float life = std::clamp(popup.life, 0.0f, 1.0f);
        const float rise = (1.0f - life) * 26.0f;
        const auto color = gradeColor(popup.grade).withAlpha(std::min(1.0f, life * 1.6f));
        renderer.drawText(fontSmall, hitX + 40.0f,
                          laneTop(popup.lane) + lane * 0.5f - rise,
                          game::toString(popup.grade), color);
        if (popup.combo >= 5 && popup.grade != game::HitGrade::Miss) {
            char combo[24];
            std::snprintf(combo, sizeof(combo), "x%d", popup.combo);
            renderer.drawText(fontSmall, hitX + 40.0f,
                              laneTop(popup.lane) + lane * 0.5f - rise + 15.0f,
                              combo, kTextSecondary.withAlpha(life));
        }
    }

    renderer.popClip();
}

}  // namespace fretless::view
