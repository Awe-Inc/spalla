#include "fretless/view/HudView.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "fretless/app/Layout.h"
#include "fretless/app/Theme.h"

namespace fretless::view {
namespace {

using namespace fretless::app::theme;
namespace layout = fretless::app::layout;

[[nodiscard]] render::Color accuracyColor(float percent) noexcept {
    if (percent >= 90.0f) { return kPerfect; }
    if (percent >= 75.0f) { return kGreat; }
    if (percent >= 55.0f) { return kGood; }
    return kMiss;
}

/// The shorthand a rhythm-game player reads before anything else. Intonation
/// gates the top grades: a run can be 100% "played" and still be sour.
[[nodiscard]] const char* letterGrade(float accuracy, float meanCents) noexcept {
    if (accuracy >= 97.0f && meanCents <= 8.0f)  { return "S"; }
    if (accuracy >= 92.0f && meanCents <= 12.0f) { return "A"; }
    if (accuracy >= 80.0f) { return "B"; }
    if (accuracy >= 65.0f) { return "C"; }
    if (accuracy >= 45.0f) { return "D"; }
    return "F";
}

/// A pill-shaped status chip. Used sparingly — one per state, never a row.
void drawChip(render::Renderer2D& renderer, const render::Font& font,
              float x, float y, float height, std::string_view text,
              const render::Color& color) {
    const float width = font.measure(text) + layout::kSpaceMd * 2.0f;
    renderer.drawRoundedRect(x, y, width, height, height * 0.5f, color.withAlpha(0.16f));
    renderer.drawTextAligned(font, x, y + height * 0.5f + font.ascender() * 0.34f,
                             width, render::TextAlign::Center, text, color);
}

}  // namespace

render::Rect HudView::tempoSlot(float widgetWidth) const noexcept {
    return {header_.centerX() - widgetWidth * 0.5f, header_.y, widgetWidth, header_.h};
}

void HudView::update(double deltaSeconds, const game::GameEngine& game) {
    const auto& stats = game.stats();

    const double gap = static_cast<double>(stats.score) - displayedScore_;
    displayedScore_ += gap * std::min(1.0, 9.0 * deltaSeconds);
    if (std::fabs(gap) < 1.0) {
        displayedScore_ = stats.score;
    }

    if (stats.combo > lastCombo_) {
        comboPulse_ = 1.0f;
    }
    lastCombo_  = stats.combo;
    comboPulse_ = std::max(0.0f, comboPulse_ - static_cast<float>(deltaSeconds) * 3.0f);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Header
// ═══════════════════════════════════════════════════════════════════════════

void HudView::drawHeader(render::Renderer2D& renderer, const render::FontSet& fonts,
                         const HudContext& context) {
    renderer.drawRect(header_.x, header_.y, header_.w, header_.h, kPanel);
    renderer.drawRect(header_.x, header_.bottom() - layout::kHairline, header_.w,
                      layout::kHairline, kDivider);

    const float baseline = header_.centerY() + fonts.title->ascender() * 0.34f;

    // ── Left: the piece. Title only; the composer is a menu-level detail. ──
    const char* title = (context.score != nullptr && !context.score->title.empty())
        ? context.score->title.c_str()
        : "Fretless";
    renderer.drawText(*fonts.title, header_.x + layout::kGutter, baseline, title,
                      kTextPrimary);

    // ── Right: state, then the two toggles, right-aligned as a group. ─────
    float cursor = header_.right() - layout::kGutter;
    const float chipHeight = 24.0f;
    const float chipY = header_.centerY() - chipHeight * 0.5f;

    auto chipFromRight = [&](std::string_view text, const render::Color& color) {
        const float width = fonts.label->measure(text) + layout::kSpaceMd * 2.0f;
        cursor -= width;
        drawChip(renderer, *fonts.label, cursor, chipY, chipHeight, text, color);
        cursor -= layout::kSpaceSm;
    };

    chipFromRight(context.showStaff ? "S  PAUTA" : "S  SEM PAUTA",
                  context.showStaff ? kTextSecondary : kTextMuted);

    if (context.game != nullptr) {
        switch (context.game->state()) {
            case game::GameState::Playing:
                chipFromRight("ESPAÇO  PAUSAR", kTextMuted);
                break;
            case game::GameState::Paused:
                chipFromRight("PAUSADO", kGood);
                break;
            case game::GameState::Countdown:
                chipFromRight("PREPARE-SE", kGreat);
                break;
            case game::GameState::Finished:
                chipFromRight("FIM", kProgress);
                break;
            case game::GameState::Idle:
                chipFromRight("ESPAÇO  COMEÇAR", kTextMuted);
                break;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Readout zones
// ═══════════════════════════════════════════════════════════════════════════

void HudView::drawExpectedNote(render::Renderer2D& renderer, const render::FontSet& fonts,
                               const render::Rect& zone, const HudContext& context) {
    if (context.game == nullptr) {
        return;
    }
    const score::ScoreEvent* note = context.game->currentNote();

    renderer.drawText(*fonts.label, zone.x, zone.y + layout::kSpaceLg, "TOQUE",
                      kTextMuted);

    if (note == nullptr || note->isRest) {
        renderer.drawText(*fonts.lead, zone.x, zone.y + layout::kSpaceXx + 4.0f,
                          note != nullptr ? "pausa" : "--", kTextMuted);
        return;
    }

    // The string is part of the instruction: on a violin "Lá4" and "which
    // string" together are what the hand needs.
    const auto color = kStringColor[note->suggestedString];
    char latin[16] = {};
    score::toLatinName(note->noteName, latin, sizeof(latin));
    renderer.drawText(*fonts.lead, zone.x, zone.y + layout::kSpaceXx + 4.0f,
                      latin, kTextPrimary);

    const float nameWidth = fonts.lead->measure(latin);
    const float chipX = zone.x + nameWidth + layout::kSpaceMd;
    const char* label = score::kStringName[note->suggestedString];
    drawChip(renderer, *fonts.label, chipX, zone.y + layout::kSpaceXl + 2.0f, 30.0f,
             label, color);
    renderer.drawText(*fonts.label, chipX, zone.y + layout::kSpaceXx + 22.0f,
                      "CORDA", kTextMuted);
}

void HudView::drawStats(render::Renderer2D& renderer, const render::FontSet& fonts,
                        const render::Rect& zone, const HudContext& context) {
    if (context.game == nullptr) {
        return;
    }
    const auto& stats = context.game->stats();

    char buffer[48];

    // Score, right-aligned so the digits do not shuffle as it grows.
    std::snprintf(buffer, sizeof(buffer), "%d", static_cast<int>(displayedScore_ + 0.5));
    renderer.drawTextAligned(*fonts.lead, zone.x, zone.y + layout::kSpaceXx + 4.0f,
                             zone.w, render::TextAlign::Right, buffer, kTextPrimary);
    renderer.drawTextAligned(*fonts.label, zone.x, zone.y + layout::kSpaceLg, zone.w,
                             render::TextAlign::Right, "PONTOS", kTextMuted);

    // Accuracy and combo on one line below, as supporting detail.
    float cursor = zone.right();

    if (stats.combo > 1) {
        std::snprintf(buffer, sizeof(buffer), "x%d", stats.combo);
        const float width = fonts.body->measure(buffer);
        cursor -= width;
        const float pulse = 1.0f + comboPulse_ * 0.3f;
        renderer.drawText(*fonts.body, cursor, zone.y + layout::kSpaceXx + 26.0f,
                          buffer, kGood.scaled(pulse));
        cursor -= layout::kSpaceMd;
    }

    if (stats.judgedNotes > 0) {
        std::snprintf(buffer, sizeof(buffer), "%.0f%%",
                      static_cast<double>(stats.accuracyPct));
        const float width = fonts.body->measure(buffer);
        cursor -= width;
        renderer.drawText(*fonts.body, cursor, zone.y + layout::kSpaceXx + 26.0f,
                          buffer, accuracyColor(stats.accuracyPct));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Results
// ═══════════════════════════════════════════════════════════════════════════

void HudView::drawResults(render::Renderer2D& renderer, const render::FontSet& fonts,
                          const render::Rect& screen, const HudContext& context) {
    if (context.game == nullptr) {
        return;
    }
    const auto& stats = context.game->stats();

    renderer.drawRect(screen.x, screen.y, screen.w, screen.h,
                      render::Color{0.02f, 0.02f, 0.05f, 0.90f});

    const float panelW = std::min(560.0f, screen.w - layout::kSpaceXx * 2.0f);
    const float panelH = std::min(404.0f, screen.h - layout::kSpaceXl * 2.0f);
    const float px = screen.centerX() - panelW * 0.5f;
    const float py = screen.centerY() - panelH * 0.5f;

    const auto accent = accuracyColor(stats.accuracyPct);

    renderer.drawRoundedRect(px, py, panelW, panelH, layout::kRadiusLg, kPanelRaised);
    renderer.drawRoundedRect(px, py, panelW, 4.0f, 2.0f, accent);

    char buffer[128];
    float y = py + layout::kSpaceXl;

    const char* title = (context.score != nullptr && !context.score->title.empty())
        ? context.score->title.c_str() : "Execução concluída";
    renderer.drawTextAligned(*fonts.body, px, y, panelW, render::TextAlign::Center,
                             title, kTextSecondary);
    // Enough room for the badge ring, which reaches well above its baseline.
    y += layout::kSpaceXx + layout::kSpaceLg;

    // Grade badge: the one hero element on this panel.
    const char* grade = letterGrade(stats.accuracyPct, stats.meanAbsCents);
    renderer.drawRing(screen.centerX(), y - fonts.hero->ascender() * 0.34f, 46.0f, 3.0f,
                      accent.withAlpha(0.55f));
    renderer.drawTextAligned(*fonts.hero, px, y, panelW, render::TextAlign::Center,
                             grade, accent);
    y += layout::kSpaceXl + layout::kSpaceMd;

    // Three headline numbers, evenly spaced. Anything finer belongs in the
    // breakdown below, not competing at this size.
    struct Headline { const char* label; char value[32]; render::Color color; };
    Headline headlines[3];
    std::snprintf(headlines[0].value, sizeof(headlines[0].value), "%d", stats.score);
    std::snprintf(headlines[1].value, sizeof(headlines[1].value), "%.0f%%",
                  static_cast<double>(stats.accuracyPct));
    std::snprintf(headlines[2].value, sizeof(headlines[2].value), "%d", stats.maxCombo);
    headlines[0].label = "PONTOS";     headlines[0].color = kTextPrimary;
    headlines[1].label = "PRECISÃO";   headlines[1].color = accent;
    headlines[2].label = "MAIOR SEQUÊNCIA"; headlines[2].color = kTextPrimary;

    const float columnW = (panelW - layout::kSpaceXl * 2.0f) / 3.0f;
    for (int i = 0; i < 3; ++i) {
        const float cx = px + layout::kSpaceXl + columnW * static_cast<float>(i);
        renderer.drawTextAligned(*fonts.lead, cx, y, columnW, render::TextAlign::Center,
                                 headlines[i].value, headlines[i].color);
        renderer.drawTextAligned(*fonts.label, cx, y + 18.0f, columnW,
                                 render::TextAlign::Center, headlines[i].label,
                                 kTextMuted);
    }
    y += layout::kSpaceXl + layout::kSpaceMd;

    // Judgement breakdown as a single proportional bar: four numbers in a
    // column made the reader do the arithmetic themselves.
    const int total = std::max(1, stats.judgedNotes);
    const float barX = px + layout::kSpaceXl;
    const float barW = panelW - layout::kSpaceXl * 2.0f;
    float segX = barX;

    struct Segment { int count; render::Color color; const char* label; };
    const Segment segments[] = {
        {stats.perfect, kPerfect, "perfeitas"},
        {stats.great,   kGreat,   "ótimas"},
        {stats.good,    kGood,    "boas"},
        {stats.miss,    kMiss,    "erradas"},
        {stats.unheard, kTextMuted, "não ouvidas"},
    };
    for (const auto& segment : segments) {
        const float width = barW * static_cast<float>(segment.count) /
                            static_cast<float>(total);
        if (width > 0.5f) {
            renderer.drawRoundedRect(segX, y, width - 1.0f, 10.0f, 2.0f, segment.color);
        }
        segX += width;
    }
    y += layout::kSpaceLg + layout::kSpaceXs;

    float legendX = barX;
    for (const auto& segment : segments) {
        std::snprintf(buffer, sizeof(buffer), "%d %s", segment.count, segment.label);
        renderer.drawRoundedRect(legendX, y - 8.0f, 3.0f, 9.0f, 1.5f, segment.color);
        renderer.drawText(*fonts.label, legendX + layout::kSpaceSm, y, buffer,
                          kTextSecondary);
        legendX += fonts.label->measure(buffer) + layout::kSpaceLg;
    }
    y += layout::kSpaceLg + layout::kSpaceSm;

    // The single most actionable line on the panel for a string player.
    if (stats.judgedNotes > 0) {
        const float drift = stats.meanSignedCents;
        if (std::fabs(drift) > 5.0f) {
            std::snprintf(buffer, sizeof(buffer),
                          "Sua afinação ficou %.0f cents %s, em média.",
                          std::fabs(static_cast<double>(drift)),
                          drift > 0.0f ? "acima" : "abaixo");
        } else {
            std::snprintf(buffer, sizeof(buffer),
                          "Afinação centrada, %+.1f cents em média.",
                          static_cast<double>(drift));
        }
        renderer.drawTextAligned(*fonts.body, px, y, panelW, render::TextAlign::Center,
                                 buffer, std::fabs(drift) > 5.0f ? kGood : kPerfect);
    }

    renderer.drawTextAligned(*fonts.label, px, py + panelH - layout::kSpaceLg, panelW,
                             render::TextAlign::Center,
                             "R  tocar de novo          ESC  voltar", kTextMuted);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Overlays
// ═══════════════════════════════════════════════════════════════════════════

void HudView::drawCountdown(render::Renderer2D& renderer, const render::FontSet& fonts,
                            const render::Rect& screen, double songTime) {
    if (songTime >= 0.0) {
        return;
    }
    const int count = std::max(1, static_cast<int>(std::ceil(-songTime)));
    const double fraction = -songTime - std::floor(-songTime);

    char buffer[8];
    std::snprintf(buffer, sizeof(buffer), "%d", count);

    // Each digit swells as its beat begins, so the countdown carries the pulse
    // the player is about to play to.
    const auto alpha = static_cast<float>(0.30 + fraction * 0.70);
    renderer.drawCircle(screen.centerX(), screen.centerY() - 18.0f,
                        56.0f + static_cast<float>(1.0 - fraction) * 10.0f,
                        kStringColor[2].withAlpha(alpha * 0.14f));
    renderer.drawTextAligned(*fonts.hero, screen.x, screen.centerY(), screen.w,
                             render::TextAlign::Center, buffer,
                             kTextPrimary.withAlpha(alpha));
}

void HudView::drawToast(render::Renderer2D& renderer, const render::FontSet& fonts,
                        const render::Rect& screen, const HudContext& context) {
    if (context.toast.empty() || context.toastAlpha <= 0.01f) {
        return;
    }
    const float width  = fonts.body->measure(context.toast) + layout::kSpaceLg * 2.0f;
    const float height = 38.0f;
    const float x = screen.centerX() - width * 0.5f;

    // Sits above the readout strip, never over it: the tuner is the one thing
    // that must stay legible while a message is passing.
    const float floor = (readout_.h > 0.0f) ? readout_.y : screen.bottom();
    // Rises slightly as it fades, which reads as "leaving" rather than "gone".
    const float y = floor - height - layout::kSpaceMd -
                    (1.0f - context.toastAlpha) * 8.0f;

    renderer.drawRoundedRect(x, y, width, height, height * 0.5f,
                             kPanelRaised.withAlpha(context.toastAlpha * 0.96f));
    renderer.drawTextAligned(*fonts.body, x, y + 24.0f, width, render::TextAlign::Center,
                             context.toast,
                             kTextPrimary.withAlpha(context.toastAlpha));
}

void HudView::drawDebug(render::Renderer2D& renderer, const render::FontSet& fonts,
                        const render::Rect& screen, const HudContext& context) {
    if (!context.showDebug) {
        return;
    }
    char buffer[160];
    std::snprintf(buffer, sizeof(buffer), "%.2f ms  %zu draws  %llu audio drops",
                  context.frameTimeMs, context.drawCalls,
                  static_cast<unsigned long long>(context.droppedFrames));

    const float width = fonts.label->measure(buffer) + layout::kSpaceMd * 2.0f;
    const float x = screen.right() - width - layout::kSpaceSm;
    const float y = screen.bottom() - 26.0f;
    renderer.drawRoundedRect(x, y, width, 20.0f, layout::kRadiusSm,
                             render::Color{0.0f, 0.0f, 0.0f, 0.55f});
    renderer.drawTextAligned(*fonts.label, x, y + 14.0f, width, render::TextAlign::Center,
                             buffer, kTextSecondary);
}

}  // namespace fretless::view
