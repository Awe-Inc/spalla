// ═══════════════════════════════════════════════════════════════════════════
//  ModuleView.h — the exercises inside one module, and what each is for.
//
//  A list and a detail pane, which is the oldest layout there is and the right
//  one here: the list has to be long enough to show a whole level band at
//  once, and the detail has to be long enough to say why the exercise exists.
//  Putting the explanation in a tooltip, or on a screen you reach after
//  starting, would mean nobody ever reads it — and the explanation is the part
//  that turns a drill into practice.
//
//  The tempo control is in the detail pane rather than in the game, because
//  choosing a tempo is a decision about the exercise and it should be made
//  before the count-in, not during it.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstddef>
#include <string>

#include "fretless/curriculum/Exercise.h"
#include "fretless/curriculum/Progress.h"
#include "fretless/render/FontSet.h"
#include "fretless/render/Rect.h"
#include "fretless/render/Renderer2D.h"
#include "fretless/view/TempoControl.h"

namespace fretless::view {

enum class ModuleAction : std::uint8_t {
    None,
    Play,       ///< start the highlighted exercise
    Back,       ///< return to the home screen
    Quit,
};

class ModuleView {
public:
    void setBounds(const render::Rect& bounds) noexcept { bounds_ = bounds; }

    /// Points at a module owned by the curriculum. Resets the selection, so
    /// call it when the module actually changes, not every frame.
    void setModule(const curriculum::Module* module);
    void setProgress(const curriculum::Progress* progress) noexcept {
        progress_ = progress;
    }

    [[nodiscard]] const curriculum::Module*   module() const noexcept { return module_; }
    [[nodiscard]] const curriculum::Exercise* selected() const noexcept;

    /// Moves the highlight onto `exerciseId` if the module contains it. Used
    /// when the home screen starts a planned item, so backing out of the run
    /// lands on the row the player came from.
    void selectExercise(const std::string& exerciseId);

    [[nodiscard]] int tempo() const noexcept { return tempo_.tempo(); }

    void update(double deltaSeconds);

    [[nodiscard]] ModuleAction handleKey(int key);
    [[nodiscard]] ModuleAction handleMouseMove(float x, float y);
    [[nodiscard]] ModuleAction handleMouseClick(float x, float y);
    [[nodiscard]] ModuleAction handleScroll(int amount);

    void draw(render::Renderer2D& renderer, const render::FontSet& fonts);

private:
    [[nodiscard]] float contentWidth() const noexcept;
    [[nodiscard]] float contentX() const noexcept;
    [[nodiscard]] render::Rect listPanel() const noexcept;
    [[nodiscard]] render::Rect detailPanel() const noexcept;
    void clampScroll();
    /// Follows the highlighted row: each exercise carries its own tempo, and
    /// inheriting the previous one silently changes what the drill is.
    void syncTempoToSelection();

    void drawDetail(render::Renderer2D& renderer, const render::FontSet& fonts);

    static constexpr float kRowHeight = 52.0f;
    static constexpr float kListTop   = 56.0f;
    static constexpr float kPanelTop  = 120.0f;

    render::Rect bounds_{};
    const curriculum::Module*   module_   = nullptr;
    const curriculum::Progress* progress_ = nullptr;

    std::size_t index_  = 0;
    std::size_t scroll_ = 0;
    int  hoveredRow_    = -1;
    std::size_t visibleRows_ = 0;

    TempoControl tempo_;
    double       elapsed_ = 0.0;
};

}  // namespace fretless::view
