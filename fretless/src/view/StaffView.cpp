#include "fretless/view/StaffView.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

#include "fretless/app/Theme.h"

namespace fretless::view {
namespace {

using namespace fretless::app::theme;

/// Diatonic ladder index: C=0 … B=6. The staff cares about the letter, not
/// the pitch class, which is why F# and Gb sit on different lines.
[[nodiscard]] int letterIndex(char letter) noexcept {
    switch (letter) {
        case 'C': return 0;
        case 'D': return 1;
        case 'E': return 2;
        case 'F': return 3;
        case 'G': return 4;
        case 'A': return 5;
        case 'B': return 6;
        default:  return -1;
    }
}

/// Staff steps above the bottom line (E4). Two steps per line space.
[[nodiscard]] int staffPosition(const score::ScoreEvent& note) noexcept {
    const char letter = note.noteName[0];
    const int  index  = letterIndex(letter);
    if (index < 0) {
        return 0;
    }
    // Trailing digits are the octave; the accidental sits between.
    const char* cursor = note.noteName + 1;
    while (*cursor == '#' || *cursor == 'b') {
        ++cursor;
    }
    const int octave = std::atoi(cursor);
    constexpr int kBottomLine = 4 * 7 + 2;   // E4
    return (octave * 7 + index) - kBottomLine;
}

[[nodiscard]] render::Color gradeColor(game::HitGrade grade) noexcept {
    switch (grade) {
        case game::HitGrade::Perfect: return kPerfect;
        case game::HitGrade::Great:   return kGreat;
        case game::HitGrade::Good:    return kGood;
        case game::HitGrade::Miss:    return kMiss;
        case game::HitGrade::None:    break;
    }
    return kTextPrimary;
}

/// Order in which sharps and flats appear in a key signature.
constexpr int kSharpPositions[7] = {8, 5, 9, 6, 3, 7, 4};   // F C G D A E B
constexpr int kFlatPositions[7]  = {4, 7, 3, 6, 2, 5, 1};   // B E A D G C F

}  // namespace

void StaffView::drawEmpty(render::Renderer2D& renderer, const render::FontSet& fonts) {
    const render::Font& fontSmall = *fonts.label;

    renderer.drawRect(bounds_.x, bounds_.y, bounds_.w, bounds_.h, kStaffPaper);

    const float spacing  = std::clamp(bounds_.h / 10.0f, 9.0f, 18.0f);
    const float staffTop = bounds_.centerY() - spacing * 2.0f;
    const auto  ink      = kStaffInkLight;

    for (int line = 0; line < 5; ++line) {
        renderer.drawRect(bounds_.x, staffTop + spacing * static_cast<float>(line),
                          bounds_.w, 1.2f, ink.withAlpha(0.35f));
    }
    renderer.drawText(fontSmall, bounds_.x + 8.0f, staffTop - 6.0f, "TREBLE",
                      ink.withAlpha(0.30f));
    renderer.drawTextAligned(fontSmall, bounds_.x, bounds_.centerY() + 4.0f, bounds_.w,
                             render::TextAlign::Center,
                             "the score appears here", ink.withAlpha(0.35f));
}

void StaffView::draw(render::Renderer2D& renderer,
                     const render::FontSet& fonts,
                     const score::Score&  score,
                     const game::GameEngine& game) {
    const render::Font& fontSmall = *fonts.label;

    // Dark staff, light ink. A paper-white panel in a dark interface is a
    // magnet: it pulled the eye away from the highway, which is where the
    // player actually has to look to play in time.
    renderer.drawRect(bounds_.x, bounds_.y, bounds_.w, bounds_.h, kStaffPaper);
    renderer.pushClip(bounds_.x, bounds_.y, bounds_.w, bounds_.h);

    // Sized so the five lines plus two ledger lines either side fit the panel;
    // a violin part rarely strays further than that from the staff.
    const float spacing   = std::clamp(bounds_.h / 10.0f, 9.0f, 18.0f);
    const float staffTop  = bounds_.centerY() - spacing * 2.0f;
    const float bottomY   = staffTop + spacing * 4.0f;   // E4 line
    const float cursorX   = bounds_.x + bounds_.w * kCursorFraction;
    const float pps       = (bounds_.w - (cursorX - bounds_.x)) / kSecondsVisible;
    const double songTime = game.songTime();

    const auto ink = kStaffInkLight;

    // ── Five lines ────────────────────────────────────────────────────────
    for (int line = 0; line < 5; ++line) {
        const float y = staffTop + spacing * static_cast<float>(line);
        renderer.drawRect(bounds_.x, y, bounds_.w, 1.2f, ink.withAlpha(0.75f));
    }

    // ── Clef label and key signature ──────────────────────────────────────
    // The label sits above the staff, clear of the accidentals: at seven
    // sharps the signature reaches high enough to collide with it otherwise.
    renderer.drawText(fontSmall, bounds_.x + 8.0f, bounds_.y + 16.0f, "TREBLE",
                      ink.withAlpha(0.40f));

    const int fifths = std::clamp(score.keyFifths, -7, 7);
    for (int i = 0; i < std::abs(fifths); ++i) {
        const int position = (fifths > 0) ? kSharpPositions[i] : kFlatPositions[i];
        const float y = bottomY - static_cast<float>(position) * spacing * 0.5f;
        renderer.drawText(fontSmall, bounds_.x + 12.0f + static_cast<float>(i) * 9.0f,
                          y + 5.0f, (fifths > 0) ? "#" : "b", ink.withAlpha(0.75f));
    }

    // ── Barlines ──────────────────────────────────────────────────────────
    if (score.beatsPerMinute > 0.0) {
        const double secondsPerMeasure =
            60.0 / score.beatsPerMinute * score.beatsPerMeasure * 4.0 / score.beatUnit;
        if (secondsPerMeasure > 0.05) {
            const double leftTime = songTime - (cursorX - bounds_.x) / pps;
            int measureIndex = static_cast<int>(std::floor(leftTime / secondsPerMeasure));
            for (double t = measureIndex * secondsPerMeasure;
                 t <= songTime + kSecondsVisible;
                 t += secondsPerMeasure, ++measureIndex) {
                if (t < 0.0) {
                    continue;
                }
                const float x = cursorX + static_cast<float>(t - songTime) * pps;
                if (x < bounds_.x || x > bounds_.right()) {
                    continue;
                }
                renderer.drawRect(x, staffTop, 1.2f, spacing * 4.0f, ink.withAlpha(0.45f));
            }
        }
    }

    // ── Notes ─────────────────────────────────────────────────────────────
    const double windowStart = songTime - (cursorX - bounds_.x) / pps - 0.5;
    const double windowEnd   = songTime + kSecondsVisible + 0.5;
    score.notesInWindow(windowStart, windowEnd, visible_);

    const std::size_t cursorIndex = game.currentNoteIndex();
    const auto& history = game.allJudgements();

    const float headHeight = spacing * 0.92f;
    const float headWidth  = headHeight * 1.32f;

    for (const std::size_t index : visible_) {
        const auto& note = score.events[index];
        const float x = cursorX + static_cast<float>(note.startSeconds - songTime) * pps;
        if (x < bounds_.x - 30.0f || x > bounds_.right() + 30.0f) {
            continue;
        }

        const int   position = staffPosition(note);
        const float y = bottomY - static_cast<float>(position) * spacing * 0.5f;

        render::Color color = ink;
        if (index < cursorIndex) {
            const auto it = std::find_if(history.begin(), history.end(),
                                         [index](const game::NoteJudgement& j) {
                                             return j.eventIndex == index;
                                         });
            color = (it != history.end()) ? gradeColor(it->grade).scaled(0.85f)
                                          : ink.withAlpha(0.4f);
        } else if (index == cursorIndex) {
            color = kPerfect;
        }

        // ── Ledger lines ──────────────────────────────────────────────────
        for (int p = 10; p <= position; p += 2) {
            const float ly = bottomY - static_cast<float>(p) * spacing * 0.5f;
            renderer.drawRect(x - headWidth * 0.85f, ly, headWidth * 1.7f, 1.0f,
                              ink.withAlpha(0.55f));
        }
        for (int p = -2; p >= position; p -= 2) {
            const float ly = bottomY - static_cast<float>(p) * spacing * 0.5f;
            renderer.drawRect(x - headWidth * 0.85f, ly, headWidth * 1.7f, 1.0f,
                              ink.withAlpha(0.55f));
        }

        // ── Head, stem, accidental ────────────────────────────────────────
        const double quarters = (note.durationSeconds * score.beatsPerMinute) / 60.0;
        const bool   isHollow = quarters >= 1.75;
        const bool   hasStem  = quarters < 3.5;

        if (isHollow) {
            renderer.drawRoundedRect(x - headWidth * 0.5f, y - headHeight * 0.5f,
                                     headWidth, headHeight, headHeight * 0.5f, color);
            renderer.drawRoundedRect(x - headWidth * 0.5f + 2.0f, y - headHeight * 0.5f + 2.0f,
                                     headWidth - 4.0f, headHeight - 4.0f,
                                     (headHeight - 4.0f) * 0.5f, kStaffPaper);
        } else {
            renderer.drawRoundedRect(x - headWidth * 0.5f, y - headHeight * 0.5f,
                                     headWidth, headHeight, headHeight * 0.5f, color);
        }

        if (hasStem) {
            const bool stemUp = position < 4;
            const float stemLength = spacing * 3.3f;
            const float stemX = stemUp ? (x + headWidth * 0.44f) : (x - headWidth * 0.44f);
            const float stemY = stemUp ? (y - stemLength) : y;
            renderer.drawRect(stemX - 0.75f, stemY, 1.5f, stemLength, color);

            // A single flag for anything shorter than a quarter. Beaming
            // groups properly is a notation engine's job, not a trainer's.
            if (quarters < 0.9) {
                const float flagY = stemUp ? stemY : (stemY + stemLength - spacing * 0.9f);
                renderer.drawLine(stemX, flagY, stemX + spacing * 0.75f,
                                  flagY + (stemUp ? spacing * 0.9f : -spacing * 0.9f),
                                  1.8f, color);
            }
        }

        if (note.noteName[1] == '#' || note.noteName[1] == 'b') {
            const char accidental[2] = {note.noteName[1], '\0'};
            renderer.drawText(fontSmall, x - headWidth * 1.35f, y + 4.0f, accidental, color);
        }
    }

    // ── Playhead ──────────────────────────────────────────────────────────
    renderer.drawRect(cursorX - 1.0f, bounds_.y, 2.0f, bounds_.h, kCursor.withAlpha(0.85f));
    renderer.drawRoundedRect(cursorX - 5.0f, bounds_.y, 10.0f, 6.0f, 2.0f, kCursor);

    renderer.popClip();
}

}  // namespace fretless::view
