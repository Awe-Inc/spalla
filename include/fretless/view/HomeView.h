// ═══════════════════════════════════════════════════════════════════════════
//  HomeView.h — the screen the app opens on.
//
//  The old start screen asked one question: which file do you want to play?
//  That is the right question for a game and the wrong one for a practice
//  tool, where the honest answer most days is "I do not know, that is why I
//  opened this."
//
//  So the first thing on the page is a session that has already been decided,
//  and the second is the shelf you would go to if you disagreed with it. Both
//  are reachable with one keypress. The device meter sits underneath because a
//  microphone that is not working looks exactly like a player who is not
//  playing, and that confusion costs a beginner an entire session.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstddef>
#include <string>
#include <vector>

#include "fretless/curriculum/Exercise.h"
#include "fretless/curriculum/PracticePlan.h"
#include "fretless/curriculum/Progress.h"
#include "fretless/render/FontSet.h"
#include "fretless/render/Rect.h"
#include "fretless/render/Renderer2D.h"

namespace fretless::view {

/// What the home screen is asking the application to do this frame.
enum class HomeAction : std::uint8_t {
    None,
    OpenModule,     ///< selectedModule() is the module id
    StartPlanItem,  ///< selectedExercise() is the exercise id
    OpenLibrary,
    Quit,
};

class HomeView {
public:
    void setBounds(const render::Rect& bounds) noexcept { bounds_ = bounds; }

    /// Handed the whole curriculum once; the view keeps a pointer, so the
    /// owner must outlive it. It never mutates it.
    void setCurriculum(const curriculum::Curriculum* curriculum) noexcept {
        curriculum_ = curriculum;
    }
    void setProgress(const curriculum::Progress* progress) noexcept {
        progress_ = progress;
    }
    void setPlan(curriculum::PracticePlan plan) { plan_ = std::move(plan); }

    /// The device the engine currently has open, for the status strip.
    void setInput(std::string name, bool ok) {
        inputName_ = std::move(name);
        inputOk_   = ok;
    }

    [[nodiscard]] const std::string& selectedModule() const noexcept { return chosenModule_; }
    [[nodiscard]] const std::string& selectedExercise() const noexcept { return chosenExercise_; }

    void update(double deltaSeconds, float inputLevel, bool noSignal);

    [[nodiscard]] HomeAction handleKey(int key);
    [[nodiscard]] HomeAction handleMouseMove(float x, float y);
    [[nodiscard]] HomeAction handleMouseClick(float x, float y);
    [[nodiscard]] HomeAction handleScroll(int amount);

    void draw(render::Renderer2D& renderer, const render::FontSet& fonts);

private:
    /// Which of the two lists has the keyboard.
    enum class Focus : std::uint8_t { Plan, Modules };

    [[nodiscard]] float contentWidth() const noexcept;
    [[nodiscard]] float contentX() const noexcept;
    /// Width of the left column. Both stacked panels share it, and computing
    /// it separately is what stops planPanel and modulePanel from having to
    /// ask each other for their sizes.
    [[nodiscard]] float columnWidth() const noexcept;
    [[nodiscard]] std::size_t moduleRows() const noexcept;
    /// The height the shelf cannot go below without clipping a card.
    [[nodiscard]] float moduleMinHeight() const noexcept;
    [[nodiscard]] render::Rect planPanel() const noexcept;
    [[nodiscard]] render::Rect modulePanel() const noexcept;
    [[nodiscard]] render::Rect sidePanel() const noexcept;
    /// Geometry of module card `index` inside the module panel.
    [[nodiscard]] render::Rect cardRect(std::size_t index) const noexcept;
    [[nodiscard]] std::size_t moduleColumns() const noexcept;
    /// Card height that makes every module fit without scrolling, which is
    /// what a fixed shelf of nine should do.
    [[nodiscard]] float cardHeight() const noexcept;

    void drawHeader(render::Renderer2D& renderer, const render::FontSet& fonts);
    void drawPlan(render::Renderer2D& renderer, const render::FontSet& fonts);
    void drawModules(render::Renderer2D& renderer, const render::FontSet& fonts);
    void drawSide(render::Renderer2D& renderer, const render::FontSet& fonts);

    static constexpr float kHeaderHeight  = 118.0f;
    static constexpr float kPlanRowHeight = 42.0f;
    /// Enough for a 21 px title, a 12 px tagline and the progress bar. Below
    /// this the card stops being readable, so the layout must find the space
    /// elsewhere rather than squeezing further.
    static constexpr float kCardMinHeight = 62.0f;
    static constexpr float kCardMaxHeight = 104.0f;
    static constexpr float kCardGap       = 12.0f;
    static constexpr float kPanelHeader   = 44.0f;

    render::Rect bounds_{};

    const curriculum::Curriculum* curriculum_ = nullptr;
    const curriculum::Progress*   progress_   = nullptr;
    curriculum::PracticePlan      plan_{};

    std::string chosenModule_;
    std::string chosenExercise_;

    Focus       focus_      = Focus::Plan;
    std::size_t planIndex_  = 0;
    std::size_t moduleIndex_ = 0;

    int hoveredPlanRow_ = -1;
    int hoveredCard_    = -1;

    std::string inputName_ = "sem entrada";
    bool        inputOk_   = false;
    float       inputLevel_ = 0.0f;
    bool        noSignal_   = false;
    double      elapsed_    = 0.0;
};

}  // namespace fretless::view
