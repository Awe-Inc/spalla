// ═══════════════════════════════════════════════════════════════════════════
//  HudView.h — header chrome, the live readout, and the end-of-run report.
//
//  The previous HUD showed everything at once: title, composer, state, key
//  hints, tempo, score, combo, an accuracy bar, four tallies, drift, filename,
//  note count, time signature, duration, device name, input latency and more
//  key hints. All of it at roughly the same weight, so nothing led the eye.
//
//  This version applies progressive disclosure. While playing you are shown
//  what you cannot recover later — the note coming up and your intonation.
//  The full breakdown moves to the results screen, where there is time to read
//  it. Device and latency move to the menu, where they are actually chosen.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstdint>
#include <string_view>

#include "fretless/game/GameEngine.h"
#include "fretless/render/FontSet.h"
#include "fretless/render/Rect.h"
#include "fretless/render/Renderer2D.h"
#include "fretless/score/Score.h"

namespace fretless::view {

struct HudContext {
    const score::Score*     score = nullptr;
    const game::GameEngine* game  = nullptr;

    /// Transient message. Empty most of the time; never a permanent bar.
    std::string_view toast;
    float            toastAlpha = 0.0f;

    bool showStaff = true;
    bool showDebug = false;

    double        frameTimeMs   = 0.0;
    std::size_t   drawCalls     = 0;
    std::uint64_t droppedFrames = 0;
};

class HudView {
public:
    void setHeader(const render::Rect& bounds) noexcept  { header_ = bounds; }
    void setReadout(const render::Rect& bounds) noexcept { readout_ = bounds; }
    [[nodiscard]] const render::Rect& header() const noexcept { return header_; }

    /// Where the tempo control should sit inside the header.
    [[nodiscard]] render::Rect tempoSlot(float widgetWidth) const noexcept;

    void update(double deltaSeconds, const game::GameEngine& game);

    void drawHeader(render::Renderer2D& renderer, const render::FontSet& fonts,
                    const HudContext& context);

    /// Left zone of the readout: the note the score expects next. This is the
    /// one thing a player cannot get from anywhere else on screen in time.
    void drawExpectedNote(render::Renderer2D& renderer, const render::FontSet& fonts,
                          const render::Rect& zone, const HudContext& context);

    /// Right zone: score and accuracy, and nothing more.
    void drawStats(render::Renderer2D& renderer, const render::FontSet& fonts,
                   const render::Rect& zone, const HudContext& context);

    void drawResults(render::Renderer2D& renderer, const render::FontSet& fonts,
                     const render::Rect& screen, const HudContext& context);
    void drawCountdown(render::Renderer2D& renderer, const render::FontSet& fonts,
                       const render::Rect& screen, double songTime);
    void drawToast(render::Renderer2D& renderer, const render::FontSet& fonts,
                   const render::Rect& screen, const HudContext& context);
    void drawDebug(render::Renderer2D& renderer, const render::FontSet& fonts,
                   const render::Rect& screen, const HudContext& context);

private:
    render::Rect header_{};
    render::Rect readout_{};

    /// The score counts up towards its target so a big combo lands as an event.
    double displayedScore_ = 0.0;
    float  comboPulse_     = 0.0f;
    int    lastCombo_      = 0;
};

}  // namespace fretless::view
