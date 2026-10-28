// ═══════════════════════════════════════════════════════════════════════════
//  StaffView.h — scrolling treble-clef notation, drawn natively.
//
//  Replaces the Verovio + embedded-Chromium pipeline. Note heads, stems,
//  beams, ledger lines, accidentals and barlines are primitives in the same
//  batch as everything else, so the staff scrolls at display rate instead of
//  being a web page told to translate itself.
//
//  Staff geometry follows the convention: the bottom line is E4, every step
//  up the diatonic ladder moves half a line space.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstddef>
#include <vector>

#include "fretless/game/GameEngine.h"
#include "fretless/render/FontSet.h"
#include "fretless/render/Rect.h"
#include "fretless/render/Renderer2D.h"
#include "fretless/score/Beaming.h"
#include "fretless/score/Score.h"

namespace fretless::view {

class StaffView {
public:
    /// Where the playhead sits, as a fraction of the width.
    static constexpr float kCursorFraction = 0.20f;
    static constexpr float kSecondsVisible = 6.0f;

    void setBounds(const render::Rect& bounds) noexcept { bounds_ = bounds; }

    void draw(render::Renderer2D& renderer,
              const render::FontSet& fonts,
              const score::Score&  score,
              const game::GameEngine& game);

    /// Bare staff, so the panel does not read as a rendering failure while
    /// the player is still choosing a piece.
    void drawEmpty(render::Renderer2D& renderer, const render::FontSet& fonts);

private:
    render::Rect bounds_{};
    std::vector<std::size_t> visible_;
    std::vector<score::BeamGroup> beams_;
    std::vector<double> barlines_;
};

}  // namespace fretless::view
