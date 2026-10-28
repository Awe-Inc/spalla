#include "fretless/view/TunerView.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

#include "fretless/app/Layout.h"
#include "fretless/score/Score.h"
#include "fretless/app/Theme.h"

namespace fretless::view {
namespace {

using namespace fretless::app::theme;
namespace layout = fretless::app::layout;

/// Band edges in cents. These match the judgement thresholds, so what the
/// tuner shows as "in tune" is exactly what the game scores as Perfect.
constexpr float kPerfectCents = 10.0f;
constexpr float kGreatCents   = 20.0f;

[[nodiscard]] render::Color colorForCents(float cents) noexcept {
    const float deviation = std::fabs(cents);
    if (deviation <= kPerfectCents) { return kPerfect; }
    if (deviation <= kGreatCents)   { return kGreat; }
    return kGood;
}

}  // namespace

void TunerView::update(double deltaSeconds, const audio::PitchFrame& frame, bool hasFrame,
                       float referenceCents, bool hasReference) {
    const auto dt = static_cast<float>(deltaSeconds);

    if (hasFrame) {
        // Decibels, not raw amplitude: a linear meter shows nothing between
        // "silent" and "quiet", which is exactly the range someone checks when
        // working out whether the microphone is live at all.
        const float dbfs = (frame.rmsLinear > 1.0e-7f)
            ? 20.0f * std::log10(frame.rmsLinear)
            : -120.0f;
        const float target = std::clamp((dbfs + 60.0f) / 60.0f, 0.0f, 1.0f);
        const float rate   = (target > level_) ? 22.0f : 5.0f;
        level_ += (target - level_) * std::min(1.0f, rate * dt);

        silentSeconds_ = (frame.rmsLinear > kNoSignalRms) ? 0.0
                                                          : silentSeconds_ + deltaSeconds;
    }

    referenced_ = hasReference;

    if (hasReference) {
        cents_  = referenceCents;
        active_ = true;
    } else if (hasFrame && frame.frequencyHz > 0.0f) {
        cents_  = audio::centsOffset(frame.frequencyHz);
        active_ = true;
    } else if (hasFrame && (frame.flags & audio::kFlagSilent) != 0) {
        active_ = false;
    }

    if (hasFrame && frame.frequencyHz > 0.0f) {
        // The detector answers in letters; the player reads solfège. This is
        // the only place the conversion has to happen on the audio path.
        char scientific[8] = {};
        audio::formatNoteName(frame.frequencyHz, scientific, sizeof(scientific));
        score::toLatinName(scientific, noteName_, sizeof(noteName_));
    }

    target_ = active_ ? std::clamp(cents_ / kScaleCents, -1.0f, 1.0f) : 0.0f;
    // Fast enough to feel connected to the bow, slow enough that YIN's
    // per-block jitter does not make the indicator buzz.
    position_ += (target_ - position_) * std::min(1.0f, layout::kFollowFast * dt);
}

void TunerView::draw(render::Renderer2D& renderer, const render::FontSet& fonts) {
    const float trackWidth = std::min(bounds_.w - layout::kSpaceXx * 2.0f, 520.0f);
    const float trackX     = bounds_.centerX() - trackWidth * 0.5f;
    const float trackY     = bounds_.y + layout::kSpaceLg;
    const float trackH     = 6.0f;

    // ── Scale ─────────────────────────────────────────────────────────────
    // A neutral rail with the in-tune window marked on it. The bands are the
    // judgement thresholds, so the target is literal, not decorative.
    renderer.drawRoundedRect(trackX, trackY, trackWidth, trackH, trackH * 0.5f,
                             kPanelRaised);

    const float perfectHalf = trackWidth * 0.5f * (kPerfectCents / kScaleCents);
    const float greatHalf   = trackWidth * 0.5f * (kGreatCents / kScaleCents);
    const float centerX     = trackX + trackWidth * 0.5f;

    renderer.drawRoundedRect(centerX - greatHalf, trackY, greatHalf * 2.0f, trackH,
                             trackH * 0.5f, kTextSecondary.withAlpha(0.22f));
    renderer.drawRoundedRect(centerX - perfectHalf, trackY, perfectHalf * 2.0f, trackH,
                             trackH * 0.5f, kPerfect.withAlpha(0.55f));

    // Centre tick, taller than the rail so it reads as the target.
    renderer.drawRoundedRect(centerX - 1.0f, trackY - 7.0f, 2.0f, trackH + 14.0f, 1.0f,
                             kTextSecondary);

    // Quarter ticks, unlabelled: the numbers are on the readout below and
    // repeating them here would be noise.
    for (const float mark : {-1.0f, -0.5f, 0.5f, 1.0f}) {
        renderer.drawRoundedRect(centerX + mark * trackWidth * 0.5f - 0.5f,
                                 trackY - 3.0f, 1.0f, trackH + 6.0f, 0.5f,
                                 kTextMuted.withAlpha(0.5f));
    }

    renderer.drawText(*fonts.label, trackX, trackY - 12.0f, "BAIXO", kTextMuted);
    renderer.drawTextAligned(*fonts.label, trackX, trackY - 12.0f, trackWidth,
                             render::TextAlign::Right, "ALTO", kTextMuted);

    // ── Dead line ─────────────────────────────────────────────────────────
    // An indicator that never moves is this app's most confusing failure, and
    // the cause is almost always a muted or wrong input. Say so, and say what
    // to press. It sits over the scale rather than below it: there is nothing
    // to read on a scale that cannot move.
    if (noSignal()) {
        const float boxW = 300.0f;
        const float boxX = bounds_.centerX() - boxW * 0.5f;
        const float boxY = trackY - 6.0f;
        renderer.drawRoundedRect(boxX, boxY, boxW, 30.0f, layout::kRadiusMd,
                                 kMiss.withAlpha(0.16f));
        renderer.drawTextAligned(*fonts.body, boxX, boxY + 20.0f, boxW,
                                 render::TextAlign::Center,
                                 "Sem sinal - aperte I para escolher a entrada", kMiss);
    }

    // ── Indicator ─────────────────────────────────────────────────────────
    const auto accent = active_ ? colorForCents(cents_) : kTextMuted;
    if (active_) {
        const float indicatorX = centerX + position_ * trackWidth * 0.5f;
        renderer.drawRoundedRect(indicatorX - 2.0f, trackY - 9.0f, 4.0f, trackH + 18.0f,
                                 2.0f, accent);
        renderer.drawCircle(indicatorX, trackY + trackH * 0.5f, 9.0f,
                            accent.withAlpha(0.22f));
    }

    // ── Readout ───────────────────────────────────────────────────────────
    // One hero element. The note name is the answer to the question the player
    // is actually asking, so it gets the largest type on the screen.
    //
    // Anchored to the bottom of the strip rather than offset from its top: at
    // 68 px the glyph box is most of the strip's height, and measuring down
    // from the top let the descenders fall off the screen.
    const float captionBaseline = bounds_.bottom() - layout::kSpaceMd;
    const float baseline        = captionBaseline - 18.0f;

    // With nothing sounding there is no reading to show. Two dashes set at
    // 68 px look like a rendering fault, so the idle state says what to do
    // instead of displaying an empty measurement.
    if (!active_) {
        renderer.drawTextAligned(*fonts.title, bounds_.x, baseline - 12.0f, bounds_.w,
                                 render::TextAlign::Center,
                                 noSignal() ? "" : "Toque uma nota", kTextMuted);
        return;
    }

    const char* name = noteName_[0] != '\0' ? noteName_ : "--";
    const float nameWidth = fonts.hero->measure(name);

    char cents[32];
    std::snprintf(cents, sizeof(cents), "%+.0f", static_cast<double>(cents_));
    const float centsWidth = fonts.title->measure(cents);

    // Note name and deviation are one group, centred together.
    const float groupWidth = nameWidth + layout::kSpaceMd + centsWidth + 14.0f;
    const float groupX     = bounds_.centerX() - groupWidth * 0.5f;

    renderer.drawText(*fonts.hero, groupX, baseline, name,
                      active_ ? kTextPrimary : kTextMuted);

    const float centsX = groupX + nameWidth + layout::kSpaceMd;
    renderer.drawText(*fonts.title, centsX, baseline - 4.0f, cents, accent);
    renderer.drawText(*fonts.label, centsX + centsWidth + 3.0f, baseline - 4.0f,
                      "CENTS", kTextMuted);

    // What the deviation is measured against. Silent about it and the reading
    // is ambiguous: 0 cents from the nearest semitone and 0 cents from the
    // written note mean very different things.
    const char* caption = referenced_ ? "da nota escrita"
                                      : "do semitom mais próximo";
    renderer.drawText(*fonts.label, centsX, captionBaseline, caption, kTextMuted);
}

}  // namespace fretless::view
