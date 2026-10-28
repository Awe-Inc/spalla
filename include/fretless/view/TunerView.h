// ═══════════════════════════════════════════════════════════════════════════
//  TunerView.h — linear intonation readout.
//
//  This was a circular dial tucked into a sidebar. Two problems: an angle is
//  harder to read at a glance than a position on a line, and a corner is the
//  last place the eye goes. Every tuner app worth using is a horizontal strip
//  for the same reason — flat is left, sharp is right, and the mapping needs
//  no learning.
//
//  Now it runs across the bottom of the screen with the note name as the
//  single hero element, because "which note am I on and am I in tune" is the
//  only question a player asks mid-phrase.
//
//  While a song is playing it measures against the note the score expects;
//  idle, it measures against the nearest semitone. Those are different
//  questions and the caption says which one is being answered.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include "fretless/audio/AudioEngine.h"
#include "fretless/render/FontSet.h"
#include "fretless/render/Rect.h"
#include "fretless/render/Renderer2D.h"

namespace fretless::view {

class TunerView {
public:
    /// Full-scale deflection, in cents. Wider than this and small errors are
    /// invisible; narrower and the needle pins constantly while learning.
    static constexpr float kScaleCents = 50.0f;

    /// Below this RMS the input is indistinguishable from a dead line. A muted
    /// Windows endpoint returns exactly 0, and a live-but-quiet room still
    /// sits well above it, so the two cases are cleanly separable.
    static constexpr float kNoSignalRms = 1.0e-4f;
    static constexpr double kNoSignalDelaySec = 1.5;

    void setBounds(const render::Rect& bounds) noexcept { bounds_ = bounds; }

    void update(double deltaSeconds, const audio::PitchFrame& frame, bool hasFrame,
                float referenceCents, bool hasReference);

    void draw(render::Renderer2D& renderer, const render::FontSet& fonts);

    [[nodiscard]] bool noSignal() const noexcept {
        return silentSeconds_ > kNoSignalDelaySec;
    }
    [[nodiscard]] float level() const noexcept { return level_; }
    void resetSignalWatch() noexcept { silentSeconds_ = 0.0; }

private:
    render::Rect bounds_{};
    float  position_      = 0.0f;   ///< smoothed indicator, in [-1, 1]
    float  target_        = 0.0f;
    float  cents_         = 0.0f;
    float  level_         = 0.0f;
    double silentSeconds_ = 0.0;
    /// Latin spelling, so "Sol#5" and its two-byte accented letters fit.
    char   noteName_[16]  = {};
    bool   active_        = false;
    bool   referenced_    = false;
};

}  // namespace fretless::view
