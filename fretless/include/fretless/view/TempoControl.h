// ═══════════════════════════════════════════════════════════════════════════
//  TempoControl.h — the metronome: tempo stepper plus a visible beat.
//
//  Tempo used to be two unlabelled keys, "[" and "]", with the current value
//  printed somewhere else entirely. Nothing on screen suggested it could be
//  changed, and nothing connected the number to the music. That is a
//  recall-not-recognition problem and it is why the control felt confusing.
//
//  The fix is direct manipulation: a stepper you can see and click, sitting
//  next to beat dots that light in time with the piece, so the number and its
//  effect occupy the same place.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include "fretless/render/Font.h"
#include "fretless/render/Rect.h"
#include "fretless/render/Renderer2D.h"

namespace fretless::view {

class TempoControl {
public:
    static constexpr int kMinBpm  = 30;
    static constexpr int kMaxBpm  = 240;
    static constexpr int kStepBpm = 4;

    void setBounds(const render::Rect& bounds) noexcept { bounds_ = bounds; }
    [[nodiscard]] const render::Rect& bounds() const noexcept { return bounds_; }

    /// Preferred width for the whole widget at the given beats-per-bar.
    [[nodiscard]] static float preferredWidth(int beatsPerBar) noexcept;

    void setTempo(int bpm) noexcept;
    [[nodiscard]] int tempo() const noexcept { return bpm_; }

    /// The tempo printed in the score, shown as a reference when the player
    /// has moved away from it.
    void setWrittenTempo(double bpm) noexcept { writtenBpm_ = bpm; }

    /// Position in the bar. `beat` is zero-based; pass -1 when not playing.
    void setBeat(int beat, int beatsPerBar) noexcept;

    void update(double deltaSeconds);

    /// Returns true when the click changed the tempo, so the caller can react.
    [[nodiscard]] bool handleMouseMove(float x, float y) noexcept;
    [[nodiscard]] bool handleMouseClick(float x, float y);
    [[nodiscard]] bool handleScroll(float x, float y, int amount);

    void draw(render::Renderer2D& renderer,
              const render::Font& fontLabel,
              const render::Font& fontBody,
              const render::Font& fontLead);

private:
    [[nodiscard]] render::Rect minusButton() const noexcept;
    [[nodiscard]] render::Rect plusButton() const noexcept;

    render::Rect bounds_{};
    int    bpm_          = 120;
    double writtenBpm_   = 120.0;
    int    beat_         = -1;
    int    beatsPerBar_  = 4;
    float  beatFlash_    = 0.0f;
    int    hovered_      = 0;   ///< -1 minus, +1 plus, 0 none
    float  valueFlash_   = 0.0f;
};

}  // namespace fretless::view
