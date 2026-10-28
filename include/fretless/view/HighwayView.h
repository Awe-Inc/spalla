// ═══════════════════════════════════════════════════════════════════════════
//  HighwayView.h — the scrolling note highway.
//
//  Four horizontal lanes, E at the top down to G, matching how the instrument
//  sits under the chin. Notes travel right to left and are judged as they
//  cross the hit line.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstddef>
#include <deque>
#include <vector>

#include "fretless/game/GameEngine.h"
#include "fretless/render/FontSet.h"
#include "fretless/render/Rect.h"
#include "fretless/render/Renderer2D.h"
#include "fretless/score/Score.h"

namespace fretless::view {

class HighwayView {
public:
    /// Fraction of the width where the hit line sits.
    static constexpr float kHitLineFraction = 0.22f;
    /// Seconds of music visible to the right of the hit line. Constant lead
    /// time rather than constant pixel speed, so the runway means the same
    /// thing at 60 BPM and at 160.
    static constexpr float kLookAheadSeconds = 3.2f;

    void setBounds(const render::Rect& bounds) noexcept { bounds_ = bounds; }
    [[nodiscard]] const render::Rect& bounds() const noexcept { return bounds_; }

    /// Spawns the flash effects for judgements emitted since the last call.
    void syncJudgements(const game::GameEngine& game, const score::Score& score);

    void update(double deltaSeconds);

    void draw(render::Renderer2D& renderer,
              const render::FontSet& fonts,
              const score::Score&  score,
              const game::GameEngine& game,
              float                liveCents,
              bool                 hasLiveCents);

private:
    struct Flash {
        int   lane      = 0;
        float life      = 1.0f;
        game::HitGrade grade = game::HitGrade::None;
    };

    struct Popup {
        float          life  = 1.0f;
        int            lane  = 0;
        game::HitGrade grade = game::HitGrade::None;
        int            combo = 0;
    };

    [[nodiscard]] float laneHeight() const noexcept { return bounds_.h / 4.0f; }
    [[nodiscard]] float laneTop(int laneFromTop) const noexcept;
    [[nodiscard]] float hitLineX() const noexcept;
    [[nodiscard]] float pixelsPerSecond() const noexcept;

    render::Rect bounds_{};
    std::deque<Flash> flashes_;
    std::deque<Popup> popups_;
    std::vector<std::size_t> visible_;
    std::vector<double>      barlines_;
    std::size_t lastJudgementCount_ = 0;
    float       hitLinePulse_       = 0.0f;
};

}  // namespace fretless::view
