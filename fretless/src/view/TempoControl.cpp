#include "fretless/view/TempoControl.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "fretless/app/Layout.h"
#include "fretless/app/Theme.h"

namespace fretless::view {
namespace {

using namespace fretless::app::theme;
namespace layout = fretless::app::layout;

constexpr float kButtonSize = 26.0f;
constexpr float kValueWidth = 78.0f;
constexpr float kDotSpacing = 16.0f;
constexpr float kDotRadius  = 4.0f;

}  // namespace

float TempoControl::preferredWidth(int beatsPerBar) noexcept {
    const float dots = static_cast<float>(std::max(1, beatsPerBar)) * kDotSpacing;
    return dots + layout::kSpaceLg + kButtonSize * 2.0f + kValueWidth;
}

void TempoControl::setTempo(int bpm) noexcept {
    const int clamped = std::clamp(bpm, kMinBpm, kMaxBpm);
    if (clamped != bpm_) {
        valueFlash_ = 1.0f;
    }
    bpm_ = clamped;
}

void TempoControl::setBeat(int beat, int beatsPerBar) noexcept {
    beatsPerBar_ = std::clamp(beatsPerBar, 1, 12);
    if (beat != beat_) {
        beatFlash_ = 1.0f;
    }
    beat_ = beat;
}

void TempoControl::update(double deltaSeconds) {
    const auto dt = static_cast<float>(deltaSeconds);
    beatFlash_  = std::max(0.0f, beatFlash_ - dt * 4.5f);
    valueFlash_ = std::max(0.0f, valueFlash_ - dt * 3.0f);
}

// ── Geometry ──────────────────────────────────────────────────────────────

render::Rect TempoControl::minusButton() const noexcept {
    const float dots = static_cast<float>(beatsPerBar_) * kDotSpacing + layout::kSpaceLg;
    return {bounds_.x + dots, bounds_.centerY() - kButtonSize * 0.5f,
            kButtonSize, kButtonSize};
}

render::Rect TempoControl::plusButton() const noexcept {
    const render::Rect minus = minusButton();
    return {minus.x + kButtonSize + kValueWidth, minus.y, kButtonSize, kButtonSize};
}

// ── Input ─────────────────────────────────────────────────────────────────

bool TempoControl::handleMouseMove(float x, float y) noexcept {
    const int before = hovered_;
    hovered_ = minusButton().contains(x, y) ? -1
             : plusButton().contains(x, y)  ? 1
                                            : 0;
    return hovered_ != before;
}

bool TempoControl::handleMouseClick(float x, float y) {
    if (minusButton().contains(x, y)) {
        setTempo(bpm_ - kStepBpm);
        return true;
    }
    if (plusButton().contains(x, y)) {
        setTempo(bpm_ + kStepBpm);
        return true;
    }
    return false;
}

bool TempoControl::handleScroll(float x, float y, int amount) {
    // Scrolling anywhere over the widget nudges the tempo — a small target is
    // frustrating to hit, and the whole control means one thing.
    if (!bounds_.contains(x, y) || amount == 0) {
        return false;
    }
    setTempo(bpm_ + amount * kStepBpm);
    return true;
}

// ── Drawing ───────────────────────────────────────────────────────────────

void TempoControl::draw(render::Renderer2D& renderer,
                        const render::Font& fontLabel,
                        const render::Font& fontBody,
                        const render::Font& fontLead) {
    const float centerY = bounds_.centerY();

    // ── Beat dots ─────────────────────────────────────────────────────────
    // The downbeat is larger, so the bar has a shape you can read at a glance
    // instead of a row of identical lights.
    for (int i = 0; i < beatsPerBar_; ++i) {
        const float cx = bounds_.x + kDotSpacing * (static_cast<float>(i) + 0.5f);
        const bool  isDownbeat = (i == 0);
        const bool  isCurrent  = (i == beat_);
        const float radius = isDownbeat ? kDotRadius + 1.5f : kDotRadius;

        if (isCurrent) {
            const float pulse = 1.0f + beatFlash_ * 0.9f;
            const auto color = isDownbeat ? kHitLine : kStringColor[2];
            renderer.drawCircle(cx, centerY, radius * pulse, color);
            renderer.drawCircle(cx, centerY, radius * pulse + 4.0f,
                                color.withAlpha(beatFlash_ * 0.28f));
        } else {
            renderer.drawCircle(cx, centerY, radius, kTextMuted.withAlpha(0.35f));
        }
    }

    // ── Stepper ───────────────────────────────────────────────────────────
    const render::Rect minus = minusButton();
    const render::Rect plus  = plusButton();

    auto drawButton = [&](const render::Rect& rect, const char* glyph, bool isHovered) {
        renderer.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, layout::kRadiusSm,
                                 isHovered ? kPanelRaised : kPanel);
        renderer.drawTextAligned(fontBody, rect.x,
                                 rect.centerY() + fontBody.ascender() * 0.34f,
                                 rect.w, render::TextAlign::Center, glyph,
                                 isHovered ? kTextPrimary : kTextSecondary);
    };
    drawButton(minus, "-", hovered_ == -1);
    drawButton(plus,  "+", hovered_ == 1);

    // ── Value ─────────────────────────────────────────────────────────────
    char buffer[32];
    std::snprintf(buffer, sizeof(buffer), "%d", bpm_);

    const float valueX = minus.right();
    const auto  valueColor = kTextPrimary.lerp(kStringColor[2], valueFlash_ * 0.8f);
    renderer.drawTextAligned(fontLead, valueX,
                             centerY + fontLead.ascender() * 0.34f - 2.0f,
                             kValueWidth, render::TextAlign::Center, buffer, valueColor);

    // "BPM" sits under the number as a unit, not beside it as another word.
    renderer.drawTextAligned(fontLabel, valueX, centerY + 26.0f, kValueWidth,
                             render::TextAlign::Center, "BPM", kTextMuted);

    // Only surface the written tempo once the player has moved away from it:
    // showing it always would be noise on the common path.
    if (writtenBpm_ > 0.0 && std::abs(static_cast<double>(bpm_) - writtenBpm_) > 0.5) {
        std::snprintf(buffer, sizeof(buffer), "written %.0f", writtenBpm_);
        renderer.drawText(fontLabel, plus.right() + layout::kSpaceSm,
                          centerY + 4.0f, buffer, kTextMuted);
    }
}

}  // namespace fretless::view
