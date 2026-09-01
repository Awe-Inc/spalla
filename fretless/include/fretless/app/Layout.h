// ═══════════════════════════════════════════════════════════════════════════
//  Layout.h — the design tokens every view measures against.
//
//  The first version of this UI had no scale: a section label, a song title
//  and the score were all within a few pixels of each other in size, so the
//  eye had nothing to grab. Everything competed and nothing led.
//
//  Two scales fix that. Type is a ratio ladder, so sizes are obviously
//  different rather than nearly the same. Spacing is a 4 px grid, so gaps read
//  as deliberate groupings instead of arbitrary padding.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

namespace fretless::app::layout {

// ── Type scale ────────────────────────────────────────────────────────────
// Roughly a 1.4 ratio. Each step is unmistakably a different level.
inline constexpr int kFontLabel = 12;   ///< ALL-CAPS section labels, units
inline constexpr int kFontBody  = 15;   ///< lists, captions, secondary text
inline constexpr int kFontTitle = 21;   ///< song title, panel headings
inline constexpr int kFontLead  = 34;   ///< score, tempo value, grade
inline constexpr int kFontHero  = 68;   ///< the detected note. One per screen.

// ── Spacing, on a 4 px grid ───────────────────────────────────────────────
inline constexpr float kSpaceXs = 4.0f;
inline constexpr float kSpaceSm = 8.0f;
inline constexpr float kSpaceMd = 16.0f;
inline constexpr float kSpaceLg = 24.0f;
inline constexpr float kSpaceXl = 40.0f;
inline constexpr float kSpaceXx = 64.0f;

// ── Shape ─────────────────────────────────────────────────────────────────
inline constexpr float kRadiusSm = 4.0f;
inline constexpr float kRadiusMd = 8.0f;
inline constexpr float kRadiusLg = 14.0f;
inline constexpr float kHairline = 1.0f;

// ── Structure ─────────────────────────────────────────────────────────────
/// Slim, because the header is chrome and the highway is the product.
inline constexpr float kHeaderHeight = 56.0f;
/// The readout strip: expected note, tuner, score. One row, three zones.
/// Tall enough for the hero note plus the tuner scale above it — at 68 px the
/// note alone needs about 90 px of box once ascender and descender are in.
inline constexpr float kReadoutHeight = 158.0f;
/// The staff is optional and collapses away entirely.
inline constexpr float kStaffHeight = 128.0f;
/// Page gutter. Content never touches the window edge.
inline constexpr float kGutter = 28.0f;

// ── Motion ────────────────────────────────────────────────────────────────
/// Follow rates for exponential smoothing, in units of "per second".
/// Fast enough to feel connected to the bow, slow enough not to jitter.
inline constexpr float kFollowFast = 18.0f;
inline constexpr float kFollowSlow = 6.0f;

}  // namespace fretless::app::layout
