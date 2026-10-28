#include "fretless/view/ModuleView.h"

#include <SDL_keycode.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <vector>

#include "fretless/app/Layout.h"
#include "fretless/app/Theme.h"
#include "fretless/curriculum/Generators.h"

namespace fretless::view {
namespace {

using namespace fretless::app::theme;
namespace layout = fretless::app::layout;

std::string truncate(const std::string& text, std::size_t maxChars) {
    std::size_t index = 0;
    std::size_t chars = 0;
    while (index < text.size() && chars < maxChars) {
        (void)render::nextCodepoint(text, index);
        ++chars;
    }
    return (index >= text.size()) ? text : text.substr(0, index) + "...";
}

/// Filled dots rather than a fraction: "3 of 3" is read, a row of filled dots
/// is seen. The empty ones are drawn too, so the row does not reflow as the
/// count changes.
void drawStars(render::Renderer2D& renderer, float x, float y, int stars,
               const render::Color& color) {
    for (int i = 0; i < 3; ++i) {
        const float cx = x + static_cast<float>(i) * 12.0f;
        if (i < stars) {
            renderer.drawCircle(cx, y, 4.0f, color);
        } else {
            renderer.drawRing(cx, y, 4.0f, 1.0f, kTextMuted.withAlpha(0.45f), 14);
        }
    }
}

/// Greedy word wrap. Returns the lines, which the caller draws itself so it
/// controls the leading.
std::vector<std::string> wrap(const render::Font& font, const std::string& text,
                              float maxWidth) {
    std::vector<std::string> lines;
    std::string line;
    std::size_t start = 0;

    while (start <= text.size()) {
        const std::size_t space = text.find(' ', start);
        const std::string word =
            text.substr(start, (space == std::string::npos) ? std::string::npos
                                                            : space - start);
        const std::string candidate = line.empty() ? word : line + " " + word;
        if (!line.empty() && font.measure(candidate) > maxWidth) {
            lines.push_back(line);
            line = word;
        } else {
            line = candidate;
        }
        if (space == std::string::npos) {
            break;
        }
        start = space + 1;
    }
    if (!line.empty()) {
        lines.push_back(line);
    }
    return lines;
}

const char* kindLabel(curriculum::ExerciseKind kind) noexcept {
    using K = curriculum::ExerciseKind;
    switch (kind) {
        case K::Piece:           return "PEÇA";
        case K::LongTone:        return "NOTAS LONGAS";
        case K::Scale:           return "ESCALA";
        case K::StringCrossing:  return "MUDANÇA DE CORDA";
        case K::SingleString:    return "UMA CORDA SÓ";
        case K::FingerPattern:   return "PADRÃO DE DEDOS";
        case K::RingTone:        return "RESSONÂNCIA";
        case K::DroneInterval:   return "BORDÃO";
        case K::Rhythm:          return "RITMO";
        case K::SightReading:    return "LEITURA À PRIMEIRA VISTA";
        case K::IntervalReading: return "NOMEAR NOTAS";
        case K::Reference:       return "REFERÊNCIA";
    }
    return "EXERCÍCIO";
}

}  // namespace

// ═══════════════════════════════════════════════════════════════════════════
//  Data
// ═══════════════════════════════════════════════════════════════════════════

void ModuleView::setModule(const curriculum::Module* module) {
    module_ = module;
    index_  = 0;
    scroll_ = 0;
    syncTempoToSelection();
}

const curriculum::Exercise* ModuleView::selected() const noexcept {
    if (module_ == nullptr || index_ >= module_->exercises.size()) {
        return nullptr;
    }
    return &module_->exercises[index_];
}

void ModuleView::selectExercise(const std::string& exerciseId) {
    if (module_ == nullptr) {
        return;
    }
    for (std::size_t i = 0; i < module_->exercises.size(); ++i) {
        if (module_->exercises[i].id == exerciseId) {
            index_ = i;
            clampScroll();
            syncTempoToSelection();
            return;
        }
    }
}

void ModuleView::syncTempoToSelection() {
    const curriculum::Exercise* exercise = selected();
    if (exercise == nullptr) {
        return;
    }
    tempo_.setTempo(exercise->defaultBpm);
    tempo_.setWrittenTempo(static_cast<double>(exercise->defaultBpm));
}

void ModuleView::update(double deltaSeconds) {
    elapsed_ += deltaSeconds;
    tempo_.update(deltaSeconds);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Geometry
// ═══════════════════════════════════════════════════════════════════════════

float ModuleView::contentWidth() const noexcept {
    return std::min(bounds_.w - layout::kGutter * 2.0f, 1440.0f);
}

float ModuleView::contentX() const noexcept {
    return bounds_.centerX() - contentWidth() * 0.5f;
}

render::Rect ModuleView::listPanel() const noexcept {
    const float detailW = std::min(460.0f, contentWidth() * 0.36f);
    return {contentX(), bounds_.y + kPanelTop,
            contentWidth() - detailW - layout::kSpaceLg,
            bounds_.h - kPanelTop - layout::kSpaceXl};
}

render::Rect ModuleView::detailPanel() const noexcept {
    const render::Rect list = listPanel();
    return {list.right() + layout::kSpaceLg, list.y,
            std::min(460.0f, contentWidth() * 0.36f), list.h};
}

void ModuleView::clampScroll() {
    const auto visible = static_cast<std::size_t>(
        std::max(0.0f, (listPanel().h - kListTop) / kRowHeight));
    if (visible == 0) {
        return;
    }
    if (index_ < scroll_) {
        scroll_ = index_;
    } else if (index_ >= scroll_ + visible) {
        scroll_ = index_ - visible + 1;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Input
// ═══════════════════════════════════════════════════════════════════════════

ModuleAction ModuleView::handleKey(int key) {
    const std::size_t count = (module_ == nullptr) ? 0 : module_->exercises.size();

    switch (key) {
        case SDLK_ESCAPE:
        case SDLK_BACKSPACE:
            return ModuleAction::Back;

        case SDLK_RETURN:
        case SDLK_KP_ENTER:
        case SDLK_SPACE: {
            const curriculum::Exercise* exercise = selected();
            // A reference card has nothing to play. Silently doing nothing is
            // worse than not offering it, so the row is drawn differently and
            // the key is a no-op rather than a broken start.
            if (exercise == nullptr || !curriculum::isPlayable(exercise->kind)) {
                return ModuleAction::None;
            }
            return ModuleAction::Play;
        }

        case SDLK_UP:
        case SDLK_DOWN: {
            if (count == 0) {
                return ModuleAction::None;
            }
            const int step = (key == SDLK_UP) ? -1 : 1;
            index_ = static_cast<std::size_t>(
                ((static_cast<int>(index_) + step) % static_cast<int>(count) +
                 static_cast<int>(count)) % static_cast<int>(count));
            clampScroll();
            syncTempoToSelection();
            return ModuleAction::None;
        }

        case SDLK_PAGEUP:
        case SDLK_PAGEDOWN: {
            if (count == 0) {
                return ModuleAction::None;
            }
            const int page = static_cast<int>(std::max<std::size_t>(1, visibleRows_));
            const int step = (key == SDLK_PAGEUP) ? -page : page;
            index_ = static_cast<std::size_t>(
                std::clamp(static_cast<int>(index_) + step, 0, static_cast<int>(count) - 1));
            clampScroll();
            syncTempoToSelection();
            return ModuleAction::None;
        }

        case SDLK_LEFTBRACKET:
        case SDLK_MINUS:
        case SDLK_KP_MINUS:
            tempo_.setTempo(tempo_.tempo() - TempoControl::kStepBpm);
            return ModuleAction::None;

        case SDLK_RIGHTBRACKET:
        case SDLK_EQUALS:
        case SDLK_KP_PLUS:
            tempo_.setTempo(tempo_.tempo() + TempoControl::kStepBpm);
            return ModuleAction::None;

        default:
            return ModuleAction::None;
    }
}

ModuleAction ModuleView::handleMouseMove(float x, float y) {
    (void)tempo_.handleMouseMove(x, y);

    hoveredRow_ = -1;
    const render::Rect list = listPanel();
    if (list.contains(x, y) && y > list.y + kListTop) {
        const int row = static_cast<int>((y - list.y - kListTop) / kRowHeight);
        if (row >= 0 && static_cast<std::size_t>(row) < visibleRows_) {
            hoveredRow_ = row;
        }
    }
    return ModuleAction::None;
}

ModuleAction ModuleView::handleMouseClick(float x, float y) {
    (void)handleMouseMove(x, y);

    if (tempo_.handleMouseClick(x, y)) {
        return ModuleAction::None;
    }
    if (hoveredRow_ >= 0 && module_ != nullptr) {
        const std::size_t target = scroll_ + static_cast<std::size_t>(hoveredRow_);
        if (target < module_->exercises.size()) {
            // Clicking the already-selected row plays it, so a double click
            // does what a file list has trained everyone to expect without a
            // separate double-click path.
            const bool again = (target == index_);
            index_ = target;
            clampScroll();
            if (!again) {
                syncTempoToSelection();
                return ModuleAction::None;
            }
            const curriculum::Exercise* exercise = selected();
            if (exercise != nullptr && curriculum::isPlayable(exercise->kind)) {
                return ModuleAction::Play;
            }
        }
    }
    return ModuleAction::None;
}

ModuleAction ModuleView::handleScroll(int amount) {
    if (module_ == nullptr) {
        return ModuleAction::None;
    }
    // Derived from the geometry rather than from visibleRows_, which is only
    // assigned while drawing: scrolling a module before its first frame would
    // otherwise clamp against zero and run off the end of the list.
    const auto visible = static_cast<int>(
        std::max(0.0f, (listPanel().h - kListTop) / kRowHeight));
    const int maximum = static_cast<int>(module_->exercises.size()) - visible;
    scroll_ = static_cast<std::size_t>(
        std::clamp(static_cast<int>(scroll_) - amount, 0, std::max(0, maximum)));
    return ModuleAction::None;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Drawing
// ═══════════════════════════════════════════════════════════════════════════

void ModuleView::draw(render::Renderer2D& renderer, const render::FontSet& fonts) {
    renderer.drawRect(bounds_.x, bounds_.y, bounds_.w, bounds_.h, kBackground);
    if (module_ == nullptr) {
        return;
    }

    const auto accent = kStringColor[std::clamp(module_->accent, 0, 3)];
    renderer.drawRect(bounds_.x, bounds_.y, bounds_.w, 3.0f, accent.withAlpha(0.85f));

    // ── Header ────────────────────────────────────────────────────────────
    renderer.drawText(*fonts.label, contentX(), bounds_.y + 40.0f,
                      "ESC  voltar", kTextMuted);
    renderer.drawText(*fonts.lead, contentX(), bounds_.y + 76.0f,
                      module_->title, kTextPrimary);
    renderer.drawText(*fonts.body, contentX(), bounds_.y + 98.0f,
                      module_->tagline, kTextMuted);

    const render::Rect list = listPanel();
    renderer.drawRoundedRect(list.x, list.y, list.w, list.h, layout::kRadiusLg, kPanel);

    // Reference cards are counted separately. A module that says "16
    // exercises" and then offers six playable ones is lying by omission.
    std::size_t playable = 0;
    for (const auto& exercise : module_->exercises) {
        playable += curriculum::isPlayable(exercise.kind) ? 1u : 0u;
    }
    char buffer[160];
    if (playable == module_->exercises.size()) {
        std::snprintf(buffer, sizeof(buffer), "%zu EXERCÍCIOS", playable);
    } else {
        std::snprintf(buffer, sizeof(buffer), "%zu EXERCÍCIOS   %zu DE REFERÊNCIA",
                      playable, module_->exercises.size() - playable);
    }
    renderer.drawText(*fonts.label, list.x + layout::kSpaceLg, list.y + 30.0f,
                      buffer, kTextSecondary);
    renderer.drawRoundedRect(list.x + layout::kSpaceLg, list.y + 38.0f, 28.0f, 2.0f,
                             1.0f, accent);

    visibleRows_ = static_cast<std::size_t>(
        std::max(0.0f, (list.h - kListTop) / kRowHeight));

    int lastLevel = -1;
    for (std::size_t row = 0; row < visibleRows_; ++row) {
        const std::size_t i = scroll_ + row;
        if (i >= module_->exercises.size()) {
            break;
        }
        const auto& exercise = module_->exercises[i];
        const float y = list.y + kListTop + static_cast<float>(row) * kRowHeight;
        const bool selected = (i == index_);
        const bool playable = curriculum::isPlayable(exercise.kind);

        if (selected) {
            renderer.drawRoundedRect(list.x + layout::kSpaceSm, y,
                                     list.w - layout::kSpaceSm * 2.0f,
                                     kRowHeight - 6.0f, layout::kRadiusMd,
                                     accent.withAlpha(0.14f));
            renderer.drawRoundedRect(list.x + layout::kSpaceSm, y + 8.0f, 3.0f,
                                     kRowHeight - 24.0f, 1.5f, accent);
        } else if (static_cast<int>(row) == hoveredRow_) {
            renderer.drawRoundedRect(list.x + layout::kSpaceSm, y,
                                     list.w - layout::kSpaceSm * 2.0f,
                                     kRowHeight - 6.0f, layout::kRadiusMd, kPanelRaised);
        }

        // A thin level marker in the gutter. A separator row per level would
        // be more explicit and would also break the fixed row height that the
        // hit testing and scrolling depend on.
        if (exercise.level != lastLevel) {
            std::snprintf(buffer, sizeof(buffer), "L%d", exercise.level);
            renderer.drawText(*fonts.label, list.x + layout::kSpaceMd, y + 22.0f,
                              buffer, kTextMuted);
            lastLevel = exercise.level;
        }

        const float textX = list.x + layout::kSpaceLg + 30.0f;
        renderer.drawText(*fonts.body, textX, y + 22.0f, truncate(exercise.title, 44),
                          playable ? (selected ? kTextPrimary : kTextSecondary)
                                   : kTextMuted);
        renderer.drawText(*fonts.label, textX, y + 38.0f,
                          truncate(exercise.subtitle, 62), kTextMuted);

        if (!playable) {
            renderer.drawTextAligned(*fonts.label, list.x, y + 22.0f,
                                     list.w - layout::kSpaceLg,
                                     render::TextAlign::Right, "referência", kTextMuted);
            continue;
        }

        const auto* record = (progress_ == nullptr) ? nullptr
                                                    : progress_->find(exercise.id);
        const int stars = (record == nullptr) ? 0 : record->stars(exercise.defaultBpm);
        drawStars(renderer, list.right() - layout::kSpaceLg - 74.0f, y + 20.0f,
                  stars, stars >= 3 ? kPerfect : kGood);

        if (record != nullptr && record->played()) {
            std::snprintf(buffer, sizeof(buffer), "%.0f%%",
                          static_cast<double>(record->bestAccuracy));
            renderer.drawTextAligned(*fonts.label, list.x, y + 38.0f,
                                     list.w - layout::kSpaceLg,
                                     render::TextAlign::Right, buffer, kTextMuted);
        }
    }

    drawDetail(renderer, fonts);
}

void ModuleView::drawDetail(render::Renderer2D& renderer, const render::FontSet& fonts) {
    const render::Rect panel = detailPanel();
    renderer.drawRoundedRect(panel.x, panel.y, panel.w, panel.h,
                             layout::kRadiusLg, kPanel);

    const curriculum::Exercise* exercise = selected();
    if (exercise == nullptr) {
        return;
    }
    const auto accent = kStringColor[std::clamp(module_->accent, 0, 3)];
    const float x     = panel.x + layout::kSpaceLg;
    const float width = panel.w - layout::kSpaceLg * 2.0f;
    float y = panel.y + 30.0f;

    renderer.drawText(*fonts.label, x, y, kindLabel(exercise->kind), accent);
    y += 28.0f;

    for (const auto& line : wrap(*fonts.title, exercise->title, width)) {
        renderer.drawText(*fonts.title, x, y, line, kTextPrimary);
        y += 26.0f;
    }
    y += 6.0f;

    char buffer[192];
    std::snprintf(buffer, sizeof(buffer), "Nível %d   %d BPM", exercise->level,
                  exercise->defaultBpm);
    renderer.drawText(*fonts.label, x, y, buffer, kTextMuted);
    y += 24.0f;

    if (!exercise->focus.empty()) {
        renderer.drawText(*fonts.label, x, y, "FOCO", kTextMuted);
        y += 17.0f;
        for (const auto& line : wrap(*fonts.body, exercise->focus, width)) {
            renderer.drawText(*fonts.body, x, y, line, kTextSecondary);
            y += 19.0f;
        }
        y += 10.0f;
    }

    if (!exercise->howTo.empty()) {
        renderer.drawText(*fonts.label, x, y, "COMO ESTUDAR", kTextMuted);
        y += 17.0f;
        for (const auto& line : wrap(*fonts.body, exercise->howTo, width)) {
            // The detail pane is not scrollable; the longest text has to fit.
            // Stopping cleanly at the boundary beats drawing over the tempo
            // control below it.
            if (y > panel.bottom() - 190.0f) {
                break;
            }
            renderer.drawText(*fonts.body, x, y, line, kTextSecondary);
            y += 19.0f;
        }
        y += 10.0f;
    }

    // ── What the app will do while you play ───────────────────────────────
    const float footerY = curriculum::isPlayable(exercise->kind)
        ? panel.bottom() - 152.0f
        : panel.bottom() - 210.0f;
    renderer.drawRect(x, footerY - layout::kSpaceMd, width, layout::kHairline, kDivider);

    float badgeX = x;
    auto badge = [&](const std::string& text, const render::Color& color) {
        const float w = fonts.label->measure(text) + 18.0f;
        if (badgeX + w > x + width) {
            return;
        }
        renderer.drawRoundedRect(badgeX, footerY - 2.0f, w, 20.0f, layout::kRadiusSm,
                                 color.withAlpha(0.16f));
        renderer.drawText(*fonts.label, badgeX + 9.0f, footerY + 12.0f, text, color);
        badgeX += w + 6.0f;
    };

    if (exercise->droneMidi >= 0) {
        char note[16] = {};
        score::writeLatinName(note, sizeof(note), exercise->droneMidi,
                              exercise->recipe.fifths);
        badge(std::string("bordão ") + note, kStringColor[1]);
    }
    if (exercise->metronome) {
        badge("metrônomo", kStringColor[3]);
    }
    if (exercise->freshEveryTime) {
        badge("nova a cada vez", kStringColor[0]);
    }
    if (exercise->recipe.bow != curriculum::BowPattern::Separate) {
        badge(curriculum::toString(exercise->recipe.bow), kStringColor[2]);
    }

    // The headphone warning is not decoration. A drone through speakers is
    // picked up by the microphone, and the pitch detector will grade the
    // drone rather than the player.
    if (exercise->droneMidi >= 0) {
        renderer.drawText(*fonts.label, x, footerY + 38.0f,
                          "Use fones: o microfone também escuta o bordão.",
                          kGood);
    } else if (!exercise->source.empty()) {
        // A reference card has no tempo control under it, so its whole footer
        // is free — which is where the contents of a printed volume go.
        const bool playableHere = curriculum::isPlayable(exercise->kind);
        const std::size_t maxLines = playableHere ? 2u : 10u;
        const auto lines = wrap(*fonts.label, exercise->source, width);
        float sourceY = footerY + 38.0f;
        for (std::size_t i = 0; i < lines.size() && i < maxLines; ++i) {
            if (sourceY > panel.bottom() - 26.0f) {
                break;
            }
            renderer.drawText(*fonts.label, x, sourceY, lines[i], kTextMuted);
            sourceY += 15.0f;
        }
    }

    // ── Tempo ─────────────────────────────────────────────────────────────
    const bool playable = curriculum::isPlayable(exercise->kind);
    if (playable) {
        renderer.drawText(*fonts.label, x, panel.bottom() - 68.0f, "ANDAM.", kTextMuted);
        tempo_.setBounds({x + 54.0f, panel.bottom() - 88.0f,
                          std::min(width - 54.0f, TempoControl::preferredWidth(4)),
                          44.0f});
        tempo_.draw(renderer, *fonts.label, *fonts.body, *fonts.lead);
        renderer.drawText(*fonts.label, x, panel.bottom() - 20.0f,
                          "ENTER  tocar          [ ]  andamento", kTextMuted);
    } else {
        renderer.drawText(*fonts.label, x, panel.bottom() - 20.0f,
                          "Só referência - não há o que tocar aqui", kTextMuted);
    }
}

}  // namespace fretless::view
