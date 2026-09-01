// ═══════════════════════════════════════════════════════════════════════════
//  Theme.h — one palette, used by every view.
//
//  Deep indigo ground with per-string hues that stay distinguishable for the
//  common colour-vision deficiencies: the four lanes differ in lightness as
//  well as hue, and grade feedback never relies on red-vs-green alone (the
//  judgement text carries the verdict in words too).
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include "fretless/render/Renderer2D.h"

namespace fretless::app::theme {

using render::Color;
using render::rgb;

// ── Ground ────────────────────────────────────────────────────────────────
inline constexpr Color kBackground   = rgb(0x0A0A12);
inline constexpr Color kPanel        = rgb(0x11111F);
inline constexpr Color kPanelRaised  = rgb(0x181829);
inline constexpr Color kDivider      = rgb(0x23233A);

// ── Text ──────────────────────────────────────────────────────────────────
inline constexpr Color kTextPrimary  = rgb(0xE6E6F2);
inline constexpr Color kTextSecondary = rgb(0x8C8CB0);
inline constexpr Color kTextMuted    = rgb(0x4E4E70);

// ── Strings, low to high: G D A E ────────────────────────────────────────
inline constexpr Color kStringColor[4] = {
    rgb(0x4ECB8F),   // G — green
    rgb(0x3FA9E0),   // D — cyan
    rgb(0x8B7CF0),   // A — violet
    rgb(0xE8814A),   // E — amber
};

inline constexpr Color kLaneBackground[4] = {
    rgb(0x0D1410),
    rgb(0x0C1219),
    rgb(0x110F1B),
    rgb(0x181209),
};

// ── Judgement ─────────────────────────────────────────────────────────────
inline constexpr Color kPerfect = rgb(0x3DDC84);
inline constexpr Color kGreat   = rgb(0x6BD5E1);
inline constexpr Color kGood    = rgb(0xEFC44F);
inline constexpr Color kMiss    = rgb(0xE85D5D);

// ── Accents ───────────────────────────────────────────────────────────────
inline constexpr Color kHitLine  = rgb(0xC8C8FF);
inline constexpr Color kProgress = rgb(0x5A8CFF);
inline constexpr Color kCursor   = rgb(0xE05050);

// ── Staff ─────────────────────────────────────────────────────────────────
// Notation is conventionally black on white, but a paper-white panel inside a
// dark interface becomes the brightest thing on screen and steals attention
// from the highway. Inverting it keeps the staff readable and subordinate.
inline constexpr Color kStaffPaper    = rgb(0x0E0E1A);
inline constexpr Color kStaffInkLight = rgb(0xB9B9D4);

}  // namespace fretless::app::theme
