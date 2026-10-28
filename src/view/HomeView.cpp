#include "fretless/view/HomeView.h"

#include <SDL_keycode.h>

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "fretless/app/Layout.h"
#include "fretless/app/Theme.h"

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

}  // namespace

// ═══════════════════════════════════════════════════════════════════════════
//  Geometry
// ═══════════════════════════════════════════════════════════════════════════

float HomeView::contentWidth() const noexcept {
    return std::min(bounds_.w - layout::kGutter * 2.0f, 1440.0f);
}

float HomeView::contentX() const noexcept {
    return bounds_.centerX() - contentWidth() * 0.5f;
}

render::Rect HomeView::sidePanel() const noexcept {
    const float width = std::min(340.0f, contentWidth() * 0.26f);
    return {contentX() + contentWidth() - width, bounds_.y + kHeaderHeight,
            width, bounds_.h - kHeaderHeight - layout::kSpaceXl};
}

float HomeView::columnWidth() const noexcept {
    return sidePanel().x - contentX() - layout::kSpaceLg;
}

std::size_t HomeView::moduleRows() const noexcept {
    const std::size_t count = (curriculum_ == nullptr) ? 1 : curriculum_->modules.size();
    const std::size_t columns = std::max<std::size_t>(1, moduleColumns());
    return std::max<std::size_t>(1, (count + columns - 1) / columns);
}

float HomeView::moduleMinHeight() const noexcept {
    const auto rows = static_cast<float>(moduleRows());
    return kPanelHeader + rows * kCardMinHeight + (rows - 1.0f) * kCardGap +
           layout::kSpaceMd;
}

render::Rect HomeView::planPanel() const noexcept {
    const render::Rect side = sidePanel();

    // The shelf is fixed content: nine cards that must all be visible, because
    // a card row cut off halfway is indistinguishable from a rendering fault.
    // The session list can scroll, so it yields first and takes what is left.
    const float rows = static_cast<float>(std::max<std::size_t>(1, plan_.items.size()));
    const float wanted = kPanelHeader + rows * kPlanRowHeight + layout::kSpaceSm;
    const float ceiling =
        std::max(140.0f, side.h - moduleMinHeight() - layout::kSpaceLg);
    const float height = std::clamp(wanted, 140.0f, ceiling);
    return {contentX(), bounds_.y + kHeaderHeight, columnWidth(), height};
}

render::Rect HomeView::modulePanel() const noexcept {
    const render::Rect plan = planPanel();
    const render::Rect side = sidePanel();
    return {plan.x, plan.bottom() + layout::kSpaceLg, plan.w,
            side.bottom() - plan.bottom() - layout::kSpaceLg};
}

std::size_t HomeView::moduleColumns() const noexcept {
    const float available = columnWidth() - layout::kSpaceLg * 2.0f;
    // 250 px is the width at which a two-line tagline stops wrapping into
    // something unreadable; below three columns the cards look like a list.
    return static_cast<std::size_t>(
        std::clamp(static_cast<int>((available + kCardGap) / (250.0f + kCardGap)), 1, 4));
}

float HomeView::cardHeight() const noexcept {
    const auto rows = static_cast<float>(moduleRows());
    const float available = modulePanel().h - kPanelHeader - layout::kSpaceMd;
    const float perRow = (available - kCardGap * (rows - 1.0f)) / rows;
    return std::clamp(perRow, kCardMinHeight, kCardMaxHeight);
}

render::Rect HomeView::cardRect(std::size_t index) const noexcept {
    const render::Rect panel = modulePanel();
    const std::size_t columns = moduleColumns();
    const float inner = panel.w - layout::kSpaceLg * 2.0f;
    const float width = (inner - kCardGap * static_cast<float>(columns - 1)) /
                        static_cast<float>(columns);
    const float height = cardHeight();

    const std::size_t column = index % columns;
    const std::size_t row    = index / columns;
    return {panel.x + layout::kSpaceLg +
                static_cast<float>(column) * (width + kCardGap),
            panel.y + kPanelHeader + static_cast<float>(row) * (height + kCardGap),
            width, height};
}

// ═══════════════════════════════════════════════════════════════════════════
//  Input
// ═══════════════════════════════════════════════════════════════════════════

void HomeView::update(double deltaSeconds, float inputLevel, bool noSignal) {
    elapsed_   += deltaSeconds;
    inputLevel_ = inputLevel;
    noSignal_   = noSignal;
}

HomeAction HomeView::handleKey(int key) {
    const std::size_t moduleCount =
        (curriculum_ == nullptr) ? 0 : curriculum_->modules.size();

    switch (key) {
        case SDLK_ESCAPE:
            return HomeAction::Quit;

        case SDLK_o:
        case SDLK_l:
            return HomeAction::OpenLibrary;

        case SDLK_TAB:
            focus_ = (focus_ == Focus::Plan) ? Focus::Modules : Focus::Plan;
            return HomeAction::None;

        case SDLK_RETURN:
        case SDLK_KP_ENTER:
        case SDLK_SPACE:
            if (focus_ == Focus::Plan && planIndex_ < plan_.items.size()) {
                chosenModule_   = plan_.items[planIndex_].moduleId;
                chosenExercise_ = plan_.items[planIndex_].exerciseId;
                return HomeAction::StartPlanItem;
            }
            if (moduleIndex_ < moduleCount) {
                chosenModule_ = curriculum_->modules[moduleIndex_].id;
                return HomeAction::OpenModule;
            }
            return HomeAction::None;

        case SDLK_UP:
        case SDLK_DOWN: {
            const int step = (key == SDLK_UP) ? -1 : 1;
            if (focus_ == Focus::Plan) {
                if (plan_.items.empty()) {
                    focus_ = Focus::Modules;
                    return HomeAction::None;
                }
                const auto count = static_cast<int>(plan_.items.size());
                planIndex_ = static_cast<std::size_t>(
                    ((static_cast<int>(planIndex_) + step) % count + count) % count);
            } else if (moduleCount > 0) {
                // Up and down move a whole row in a grid; left and right move
                // one card. Treating a grid as a list is the classic way to
                // make a card layout feel broken under the keyboard.
                const auto columns = static_cast<int>(moduleColumns());
                const auto count   = static_cast<int>(moduleCount);
                moduleIndex_ = static_cast<std::size_t>(
                    std::clamp(static_cast<int>(moduleIndex_) + step * columns, 0, count - 1));
            }
            return HomeAction::None;
        }

        case SDLK_LEFT:
        case SDLK_RIGHT: {
            if (focus_ != Focus::Modules || moduleCount == 0) {
                focus_ = Focus::Modules;
                return HomeAction::None;
            }
            const int step  = (key == SDLK_LEFT) ? -1 : 1;
            const auto count = static_cast<int>(moduleCount);
            moduleIndex_ = static_cast<std::size_t>(
                ((static_cast<int>(moduleIndex_) + step) % count + count) % count);
            return HomeAction::None;
        }

        default:
            return HomeAction::None;
    }
}

HomeAction HomeView::handleMouseMove(float x, float y) {
    hoveredPlanRow_ = -1;
    hoveredCard_    = -1;

    const render::Rect plan = planPanel();
    if (plan.contains(x, y) && y > plan.y + kPanelHeader) {
        const int row = static_cast<int>((y - plan.y - kPanelHeader) / kPlanRowHeight);
        if (row >= 0 && row < static_cast<int>(plan_.items.size())) {
            hoveredPlanRow_ = row;
        }
    }
    if (curriculum_ != nullptr) {
        for (std::size_t i = 0; i < curriculum_->modules.size(); ++i) {
            if (cardRect(i).contains(x, y)) {
                hoveredCard_ = static_cast<int>(i);
                break;
            }
        }
    }
    return HomeAction::None;
}

HomeAction HomeView::handleMouseClick(float x, float y) {
    (void)handleMouseMove(x, y);

    if (hoveredPlanRow_ >= 0) {
        planIndex_ = static_cast<std::size_t>(hoveredPlanRow_);
        focus_     = Focus::Plan;
        chosenModule_   = plan_.items[planIndex_].moduleId;
        chosenExercise_ = plan_.items[planIndex_].exerciseId;
        return HomeAction::StartPlanItem;
    }
    if (hoveredCard_ >= 0 && curriculum_ != nullptr) {
        moduleIndex_ = static_cast<std::size_t>(hoveredCard_);
        focus_       = Focus::Modules;
        chosenModule_ = curriculum_->modules[moduleIndex_].id;
        return HomeAction::OpenModule;
    }
    if (sidePanel().contains(x, y)) {
        return HomeAction::OpenLibrary;
    }
    return HomeAction::None;
}

HomeAction HomeView::handleScroll(int /*amount*/) {
    return HomeAction::None;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Drawing
// ═══════════════════════════════════════════════════════════════════════════

void HomeView::draw(render::Renderer2D& renderer, const render::FontSet& fonts) {
    renderer.drawRect(bounds_.x, bounds_.y, bounds_.w, bounds_.h, kBackground);
    for (int i = 0; i < 4; ++i) {
        renderer.drawRect(bounds_.x + bounds_.w * (static_cast<float>(i) / 4.0f),
                          bounds_.y, bounds_.w * 0.25f, 3.0f,
                          kStringColor[i].withAlpha(0.85f));
    }

    drawHeader(renderer, fonts);
    drawPlan(renderer, fonts);
    drawModules(renderer, fonts);
    drawSide(renderer, fonts);

    const float footerY = bounds_.bottom() - layout::kSpaceMd;
    renderer.drawText(*fonts.label, contentX(), footerY,
                      "ENTER  começar          TAB  alternar          SETAS  navegar"
                      "          L  biblioteca          ESC  sair", kTextMuted);
}

void HomeView::drawHeader(render::Renderer2D& renderer, const render::FontSet& fonts) {
    renderer.drawText(*fonts.hero, contentX(), bounds_.y + layout::kSpaceXx,
                      "FRETLESS", kTextPrimary);
    renderer.drawText(*fonts.body, contentX(), bounds_.y + layout::kSpaceXx + 26.0f,
                      "prática de violino, avaliada nota por nota", kTextMuted);

    if (progress_ == nullptr || curriculum_ == nullptr) {
        return;
    }

    // Three numbers, right aligned, in decreasing order of how much a player
    // cares. The streak is first because it is the only one that can be broken.
    const float right = contentX() + contentWidth();
    const float y     = bounds_.y + layout::kSpaceXx;

    struct Stat { const char* label; std::string value; render::Color color; };
    const int streak = progress_->streakDays();
    const Stat stats[3] = {
        {"DIAS SEGUIDOS", std::to_string(streak),
         streak > 0 ? kPerfect : kTextMuted},
        {"EXERCÍCIOS", std::to_string(progress_->playedCount()) + " / " +
                          std::to_string(curriculum_->exerciseCount()),
         kTextPrimary},
        {"ESTRELAS", std::to_string(progress_->starCount()), kGood},
    };

    // Laid out right to left so the rightmost number sits on the content edge
    // whatever the others are wide. Measured rather than estimated: a
    // four-digit star count would otherwise collide with the exercise count.
    float x = right;
    for (int i = 2; i >= 0; --i) {
        const Stat& stat = stats[static_cast<std::size_t>(i)];
        const float width = std::max({fonts.lead->measure(stat.value),
                                      fonts.label->measure(stat.label),
                                      70.0f}) + layout::kSpaceXl;
        x -= width;
        renderer.drawText(*fonts.lead, x, y, stat.value, stat.color);
        renderer.drawText(*fonts.label, x, y + 18.0f, stat.label, kTextMuted);
    }
}

void HomeView::drawPlan(render::Renderer2D& renderer, const render::FontSet& fonts) {
    const render::Rect panel = planPanel();
    const bool focused = (focus_ == Focus::Plan);

    renderer.drawRoundedRect(panel.x, panel.y, panel.w, panel.h,
                             layout::kRadiusLg, kPanel);
    renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg, panel.y + 24.0f,
                      "SESSÃO DE HOJE", focused ? kTextSecondary : kTextMuted);
    if (focused) {
        renderer.drawRoundedRect(panel.x + layout::kSpaceLg, panel.y + 32.0f,
                                 28.0f, 2.0f, 1.0f, kStringColor[2]);
    }

    char buffer[64];
    std::snprintf(buffer, sizeof(buffer), "%d min   nível %d",
                  plan_.totalMinutes, plan_.level);
    renderer.drawTextAligned(*fonts.label, panel.x, panel.y + 24.0f,
                             panel.w - layout::kSpaceLg, render::TextAlign::Right,
                             buffer, kTextMuted);

    if (plan_.items.empty()) {
        renderer.drawText(*fonts.body, panel.x + layout::kSpaceLg, panel.y + 76.0f,
                          "Nada planejado - escolha um módulo abaixo.", kTextSecondary);
        return;
    }

    // One row is given up when the list overflows, so the "N more" line has
    // somewhere to go: a session that silently stops at five items looks like
    // a five-item session.
    auto visible = static_cast<std::size_t>(
        std::max(0.0f, (panel.h - kPanelHeader - layout::kSpaceSm) / kPlanRowHeight));
    if (visible < plan_.items.size() && visible > 0) {
        --visible;
    }

    for (std::size_t i = 0; i < plan_.items.size() && i < visible; ++i) {
        const auto& item = plan_.items[i];
        const float y = panel.y + kPanelHeader + static_cast<float>(i) * kPlanRowHeight;
        const bool selected = focused && (i == planIndex_);
        const bool hovered  = (static_cast<int>(i) == hoveredPlanRow_);

        if (selected) {
            renderer.drawRoundedRect(panel.x + layout::kSpaceSm, y,
                                     panel.w - layout::kSpaceSm * 2.0f,
                                     kPlanRowHeight - 4.0f, layout::kRadiusMd,
                                     kStringColor[2].withAlpha(0.14f));
            renderer.drawRoundedRect(panel.x + layout::kSpaceSm, y + 7.0f, 3.0f,
                                     kPlanRowHeight - 18.0f, 1.5f, kStringColor[2]);
        } else if (hovered) {
            renderer.drawRoundedRect(panel.x + layout::kSpaceSm, y,
                                     panel.w - layout::kSpaceSm * 2.0f,
                                     kPlanRowHeight - 4.0f, layout::kRadiusMd,
                                     kPanelRaised);
        }

        std::snprintf(buffer, sizeof(buffer), "%zu", i + 1);
        renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg + 6.0f, y + 20.0f,
                          buffer, kTextMuted);
        renderer.drawText(*fonts.body, panel.x + layout::kSpaceLg + 26.0f, y + 20.0f,
                          truncate(item.title, 38),
                          selected ? kTextPrimary : kTextSecondary);
        renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg + 26.0f, y + 34.0f,
                          truncate(item.reason, 52), kTextMuted);

        std::snprintf(buffer, sizeof(buffer), "%d min", item.minutes);
        renderer.drawTextAligned(*fonts.label, panel.x, y + 20.0f,
                                 panel.w - layout::kSpaceLg, render::TextAlign::Right,
                                 buffer, kTextMuted);
    }

    if (visible < plan_.items.size()) {
        int minutes = 0;
        for (std::size_t i = visible; i < plan_.items.size(); ++i) {
            minutes += plan_.items[i].minutes;
        }
        std::snprintf(buffer, sizeof(buffer), "+ %zu adiante, %d min",
                      plan_.items.size() - visible, minutes);
        renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg + 26.0f,
                          panel.y + kPanelHeader +
                              static_cast<float>(visible) * kPlanRowHeight + 20.0f,
                          buffer, kTextMuted);
    }
}

void HomeView::drawModules(render::Renderer2D& renderer, const render::FontSet& fonts) {
    const render::Rect panel = modulePanel();
    const bool focused = (focus_ == Focus::Modules);

    renderer.drawRoundedRect(panel.x, panel.y, panel.w, panel.h,
                             layout::kRadiusLg, kPanel);
    renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg, panel.y + 24.0f,
                      "MÓDULOS DE ESTUDO", focused ? kTextSecondary : kTextMuted);
    if (focused) {
        renderer.drawRoundedRect(panel.x + layout::kSpaceLg, panel.y + 32.0f,
                                 28.0f, 2.0f, 1.0f, kStringColor[2]);
    }

    if (curriculum_ == nullptr) {
        return;
    }

    // Cards below the panel are clipped rather than scrolled: the module list
    // is fixed and short, so a scrollbar here would be chrome for a case that
    // does not arise.
    renderer.pushClip(panel.x, panel.y + kPanelHeader - 6.0f, panel.w,
                      panel.h - kPanelHeader + 6.0f);

    char buffer[96];
    for (std::size_t i = 0; i < curriculum_->modules.size(); ++i) {
        const auto& module = curriculum_->modules[i];
        const render::Rect card = cardRect(i);
        if (card.y > panel.bottom()) {
            break;
        }
        const auto accent = kStringColor[std::clamp(module.accent, 0, 3)];
        const bool selected = focused && (i == moduleIndex_);
        const bool hovered  = (static_cast<int>(i) == hoveredCard_);

        renderer.drawRoundedRect(card.x, card.y, card.w, card.h, layout::kRadiusMd,
                                 selected ? accent.withAlpha(0.16f)
                                          : (hovered ? kPanelRaised
                                                     : kPanelRaised.withAlpha(0.55f)));
        renderer.drawRoundedRect(card.x, card.y, 3.0f, card.h, 1.5f,
                                 accent.withAlpha(selected ? 1.0f : 0.55f));

        renderer.drawText(*fonts.title, card.x + layout::kSpaceMd, card.y + 26.0f,
                          truncate(module.title, 22),
                          selected ? kTextPrimary : kTextSecondary);
        // Measured, not counted: "Warm-up" and "Scales and arpeggios" fit very
        // different numbers of characters into the same card.
        std::string tagline = module.tagline;
        const float taglineRoom = card.w - layout::kSpaceMd * 2.0f;
        while (!tagline.empty() && fonts.label->measure(tagline) > taglineRoom) {
            tagline.pop_back();
        }
        renderer.drawText(*fonts.label, card.x + layout::kSpaceMd, card.y + 43.0f,
                          tagline, kTextMuted);

        // Progress as a bar plus a count. The bar answers "am I nearly done"
        // at a glance; the count answers "how much is left" when it matters.
        std::size_t played = 0;
        std::size_t total  = 0;
        for (const auto& exercise : module.exercises) {
            if (!curriculum::isPlayable(exercise.kind)) {
                continue;
            }
            ++total;
            if (progress_ != nullptr) {
                const auto* record = progress_->find(exercise.id);
                if (record != nullptr && record->played()) {
                    ++played;
                }
            }
        }

        const float barY = card.y + card.h - 13.0f;
        const float barW = card.w - layout::kSpaceMd * 2.0f - 52.0f;
        renderer.drawRoundedRect(card.x + layout::kSpaceMd, barY, barW, 4.0f, 2.0f,
                                 kDivider);
        if (total > 0 && played > 0) {
            renderer.drawRoundedRect(
                card.x + layout::kSpaceMd, barY,
                barW * static_cast<float>(played) / static_cast<float>(total),
                4.0f, 2.0f, accent);
        }
        std::snprintf(buffer, sizeof(buffer), "%zu/%zu", played, total);
        renderer.drawTextAligned(*fonts.label, card.x, barY + 5.0f,
                                 card.w - layout::kSpaceMd, render::TextAlign::Right,
                                 buffer, kTextMuted);
    }

    renderer.popClip();
}

void HomeView::drawSide(render::Renderer2D& renderer, const render::FontSet& fonts) {
    const render::Rect panel = sidePanel();
    renderer.drawRoundedRect(panel.x, panel.y, panel.w, panel.h,
                             layout::kRadiusLg, kPanel);

    float y = panel.y + 26.0f;
    renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg, y, "ENTRADA", kTextMuted);
    y += 26.0f;

    renderer.drawText(*fonts.body, panel.x + layout::kSpaceLg, y,
                      truncate(inputName_, 26),
                      inputOk_ ? kTextPrimary : kMiss);
    y += 22.0f;

    // The meter is the whole reason this block is on the home screen: a
    // beginner whose interface is muted sees a dead tuner and concludes the
    // app is broken, or worse, that they are.
    const float meterW = panel.w - layout::kSpaceLg * 2.0f;
    renderer.drawRoundedRect(panel.x + layout::kSpaceLg, y, meterW, 6.0f, 3.0f,
                             kPanelRaised);
    const auto color = noSignal_ ? kMiss : kPerfect;
    renderer.drawRoundedRect(panel.x + layout::kSpaceLg, y,
                             meterW * std::clamp(inputLevel_, 0.0f, 1.0f), 6.0f, 3.0f,
                             color);
    y += 22.0f;
    renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg, y,
                      noSignal_ ? "sem sinal - toque alguma coisa"
                                : "ao vivo",
                      noSignal_ ? kMiss.withAlpha(
                                      0.7f + 0.3f * std::sin(static_cast<float>(elapsed_) * 3.0f))
                                : kPerfect);
    y += 40.0f;

    renderer.drawRect(panel.x + layout::kSpaceLg, y, meterW, layout::kHairline, kDivider);
    y += 30.0f;

    renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg, y, "BIBLIOTECA", kTextMuted);
    y += 24.0f;
    renderer.drawText(*fonts.body, panel.x + layout::kSpaceLg, y,
                      "Partituras e entradas", kTextSecondary);
    y += 20.0f;
    renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg, y,
                      "Aperte L, ou clique aqui", kTextMuted);
    y += 34.0f;

    renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg, y,
                      "Arraste um arquivo MusicXML para", kTextMuted);
    renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg, y + 15.0f,
                      "a janela para tocar na hora.", kTextMuted);
    y += 50.0f;

    // ── Recently practised ────────────────────────────────────────────────
    // The plan says what to do next; this says what you actually did. Seeing
    // the last few sessions is what makes a streak feel earned rather than
    // asserted, and on a first run it is replaced by what to do instead.
    renderer.drawRect(panel.x + layout::kSpaceLg, y - layout::kSpaceMd, meterW,
                      layout::kHairline, kDivider);
    renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg, y, "RECENTES", kTextMuted);
    y += 24.0f;

    if (progress_ == nullptr || curriculum_ == nullptr) {
        return;
    }
    const auto recent = progress_->recent(6);
    if (recent.empty()) {
        renderer.drawText(*fonts.body, panel.x + layout::kSpaceLg, y,
                          "Nada ainda.", kTextSecondary);
        renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg, y + 20.0f,
                          "Aperte ENTER para começar o", kTextMuted);
        renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg, y + 35.0f,
                          "primeiro item da sessão de hoje.", kTextMuted);
        return;
    }

    char buffer[96];
    for (const auto& id : recent) {
        if (y > panel.bottom() - 24.0f) {
            break;
        }
        const curriculum::Exercise* exercise = curriculum_->findExercise(id);
        if (exercise == nullptr) {
            continue;   // an id from an older build; skip it rather than guess
        }
        std::string title = exercise->title;
        const float room = meterW - 46.0f;
        while (!title.empty() && fonts.body->measure(title) > room) {
            title.pop_back();
        }
        renderer.drawText(*fonts.body, panel.x + layout::kSpaceLg, y, title,
                          kTextSecondary);

        const auto* record = progress_->find(id);
        if (record != nullptr) {
            std::snprintf(buffer, sizeof(buffer), "%.0f%%",
                          static_cast<double>(record->bestAccuracy));
            renderer.drawTextAligned(*fonts.label, panel.x, y,
                                     panel.w - layout::kSpaceLg,
                                     render::TextAlign::Right, buffer, kTextMuted);
        }
        y += 22.0f;
    }
}

}  // namespace fretless::view
