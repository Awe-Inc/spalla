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

/// The middle line. Notes below it take a stem up, as in any engraving.
constexpr int kMiddleLinePosition = 4;

/// Where on screen a note lands this frame. Shared by the note pass and the
/// beam pass, which must agree to the pixel or stems miss their beam.
struct StaffGeometry {
    float  spacing   = 0.0f;
    float  bottomY   = 0.0f;
    float  cursorX   = 0.0f;
    float  pps       = 0.0f;
    float  headWidth = 0.0f;
    double songTime  = 0.0;

    [[nodiscard]] float x(const score::ScoreEvent& note) const noexcept {
        return cursorX + static_cast<float>(note.startSeconds - songTime) * pps;
    }
    [[nodiscard]] float y(const score::ScoreEvent& note) const noexcept {
        return bottomY - static_cast<float>(staffPosition(note)) * spacing * 0.5f;
    }
    [[nodiscard]] float stemX(const score::ScoreEvent& note, bool stemUp) const noexcept {
        return x(note) + (stemUp ? headWidth * 0.44f : -headWidth * 0.44f);
    }
    [[nodiscard]] float stemLength() const noexcept { return spacing * 3.3f; }
    [[nodiscard]] float beamThickness() const noexcept { return spacing * 0.42f; }
    [[nodiscard]] float beamGap() const noexcept { return spacing * 0.72f; }
};

/// The straight line a beam group's stems end on, as y = y0 + slope·(x − x0).
struct BeamLine {
    bool  stemUp = true;
    int   levels = 1;
    float x0     = 0.0f;
    float y0     = 0.0f;
    float slope  = 0.0f;

    [[nodiscard]] float yAt(float x) const noexcept { return y0 + slope * (x - x0); }
};

/// One stem direction for the whole group, decided by where the group sits
/// on average, then a beam from the first stem tip to the last. The slope is
/// capped at a line space so a leap does not stand the beam on end, and the
/// whole line slides away from the heads until the shortest stem still reads.
[[nodiscard]] BeamLine layoutBeam(const score::Score& score, const score::BeamGroup& group,
                                  const StaffGeometry& geometry) {
    const auto& events = score.events;
    BeamLine    beam;
    int         positionSum = 0;
    for (std::size_t i = group.first; i <= group.last; ++i) {
        positionSum += staffPosition(events[i]);
        beam.levels = std::max(beam.levels,
                               score::beamCount(score::durationQuarters(score, i)));
    }
    const int count = static_cast<int>(group.last - group.first + 1);
    beam.stemUp     = positionSum < kMiddleLinePosition * count;

    const float direction = beam.stemUp ? -1.0f : 1.0f;
    const auto& first     = events[group.first];
    const auto& last      = events[group.last];
    beam.x0 = geometry.stemX(first, beam.stemUp);
    beam.y0 = geometry.y(first) + direction * geometry.stemLength();

    const float x1 = geometry.stemX(last, beam.stemUp);
    if (x1 > beam.x0) {
        const float idealRise = geometry.y(last) - geometry.y(first);
        const float rise      = std::clamp(idealRise, -geometry.spacing, geometry.spacing);
        beam.slope            = rise / (x1 - beam.x0);
    }

    // Inner beams sit closer to the heads, so the stems need room for them.
    const float shortestStem = geometry.spacing * 2.5f +
                               static_cast<float>(beam.levels - 1) * geometry.beamGap();
    float shift = 0.0f;
    for (std::size_t i = group.first; i <= group.last; ++i) {
        const float tip   = beam.yAt(geometry.stemX(events[i], beam.stemUp));
        const float reach = (geometry.y(events[i]) - tip) * -direction;
        shift = std::max(shift, shortestStem - reach);
    }
    beam.y0 += direction * shift;
    return beam;
}

/// The beam group holding `index`, or nullptr when the note stands alone.
[[nodiscard]] const score::BeamGroup* groupOf(const std::vector<score::BeamGroup>& groups,
                                              std::size_t index) noexcept {
    const auto after = std::upper_bound(
        groups.begin(), groups.end(), index,
        [](std::size_t value, const score::BeamGroup& group) { return value < group.first; });
    if (after == groups.begin()) {
        return nullptr;
    }
    const auto& candidate = *(after - 1);
    return index <= candidate.last ? &candidate : nullptr;
}

/// Beams, inner levels included. A level runs across every stretch of notes
/// short enough to carry it; a single such note gets a stub pointing into
/// the group, the way a dotted eighth and sixteenth are engraved.
void drawBeams(render::Renderer2D& renderer, const score::Score& score,
               const score::BeamGroup& group, const BeamLine& beam,
               const StaffGeometry& geometry, render::Color color) {
    const auto& events    = score.events;
    const float inward    = beam.stemUp ? 1.0f : -1.0f;
    const float thickness = geometry.beamThickness();
    const float stub      = geometry.headWidth * 0.9f;

    const auto drawSegment = [&](float xa, float xb, int level) {
        const float offset = inward * (thickness * 0.5f +
                                       static_cast<float>(level) * geometry.beamGap());
        renderer.drawLine(xa, beam.yAt(xa) + offset, xb, beam.yAt(xb) + offset,
                          thickness, color);
    };
    const auto carries = [&](std::size_t i, int level) {
        return score::beamCount(score::durationQuarters(score, i)) > level;
    };

    drawSegment(beam.x0, geometry.stemX(events[group.last], beam.stemUp), 0);
    for (int level = 1; level < beam.levels; ++level) {
        std::size_t i = group.first;
        while (i <= group.last) {
            if (!carries(i, level)) {
                ++i;
                continue;
            }
            std::size_t end = i;
            while (end < group.last && carries(end + 1, level)) {
                ++end;
            }
            const float xa = geometry.stemX(events[i], beam.stemUp);
            if (end > i) {
                drawSegment(xa, geometry.stemX(events[end], beam.stemUp), level);
            } else if (i == group.last) {
                drawSegment(xa - stub, xa, level);
            } else {
                drawSegment(xa, xa + stub, level);
            }
            i = end + 1;
        }
    }
}

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
    renderer.drawText(fontSmall, bounds_.x + 8.0f, staffTop - 6.0f, "CLAVE DE SOL",
                      ink.withAlpha(0.30f));
    renderer.drawTextAligned(fontSmall, bounds_.x, bounds_.centerY() + 4.0f, bounds_.w,
                             render::TextAlign::Center,
                             "a partitura aparece aqui", ink.withAlpha(0.35f));
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
    renderer.drawText(fontSmall, bounds_.x + 8.0f, bounds_.y + 16.0f, "CLAVE DE SOL",
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

    const StaffGeometry geometry{spacing, bottomY, cursorX, pps, headWidth, songTime};
    score::findBeamGroups(score, beams_);

    for (const std::size_t index : visible_) {
        const auto& note = score.events[index];
        const float x = geometry.x(note);
        if (x < bounds_.x - 30.0f || x > bounds_.right() + 30.0f) {
            continue;
        }

        const int   position = staffPosition(note);
        const float y = geometry.y(note);

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
        const double quarters = score::durationQuarters(score, index);
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

        if (const auto* group = groupOf(beams_, index); group != nullptr) {
            // The stem runs to the group's beam; the beam pass draws the rest.
            const BeamLine beam  = layoutBeam(score, *group, geometry);
            const float    stemX = geometry.stemX(note, beam.stemUp);
            const float    tip   = beam.yAt(stemX);
            renderer.drawRect(stemX - 0.75f, std::min(tip, y), 1.5f, std::abs(y - tip), color);
        } else if (hasStem) {
            const bool stemUp = position < kMiddleLinePosition;
            const float stemLength = geometry.stemLength();
            const float stemX = geometry.stemX(note, stemUp);
            const float stemY = stemUp ? (y - stemLength) : y;
            renderer.drawRect(stemX - 0.75f, stemY, 1.5f, stemLength, color);

            // A note with no neighbour to share a beam keeps one flag per
            // beam it would have carried.
            const int flags = score::beamCount(quarters);
            for (int flag = 0; flag < flags; ++flag) {
                const float step  = static_cast<float>(flag) * geometry.beamGap();
                const float flagY = stemUp ? (stemY + step)
                                           : (stemY + stemLength - spacing * 0.9f - step);
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

    // ── Beams ─────────────────────────────────────────────────────────────
    // In ink rather than the notes' grade colours: one beam spans notes that
    // were judged differently, and a beam can only be one colour.
    if (!visible_.empty()) {
        const std::size_t firstVisible = visible_.front();
        const std::size_t lastVisible  = visible_.back();
        for (const auto& group : beams_) {
            if (group.last < firstVisible) {
                continue;
            }
            if (group.first > lastVisible) {
                break;
            }
            drawBeams(renderer, score, group, layoutBeam(score, group, geometry), geometry, ink);
        }
    }

    // ── Slurs ─────────────────────────────────────────────────────────────
    // Drawn as a flat arc above the top line rather than hugging the note
    // heads. A bow group can span an octave, and a curve that followed the
    // pitches would cross the stem of every note it covers.
    const float slurY = bottomY - spacing * 4.0f - 12.0f;
    for (const std::size_t index : visible_) {
        const auto& first = score.events[index];
        if (first.bowSpan <= 1 || first.bowSlot != 0) {
            continue;
        }
        const std::size_t last = index + first.bowSpan - 1u;
        if (last >= score.events.size()) {
            continue;
        }
        const auto& end = score.events[last];
        if (end.bowSpan != first.bowSpan || end.bowSlot != first.bowSpan - 1) {
            continue;   // the group was cut short by a rest
        }

        const float x0 = cursorX +
            static_cast<float>(first.startSeconds - songTime) * pps;
        const float x1 = cursorX +
            static_cast<float>(end.startSeconds - songTime) * pps;
        if (x1 < bounds_.x - 30.0f || x0 > bounds_.right() + 30.0f || x1 <= x0) {
            continue;
        }

        // A quadratic through a control point above the midpoint. Twelve
        // segments is past the point where the joins are visible at this size.
        constexpr int kSegments = 12;
        const float cx = (x0 + x1) * 0.5f;
        const float cy = slurY - std::min(18.0f, (x1 - x0) * 0.18f) * 2.0f;
        float px = x0;
        float py = slurY;
        for (int step = 1; step <= kSegments; ++step) {
            const float t = static_cast<float>(step) / static_cast<float>(kSegments);
            const float u = 1.0f - t;
            const float qx = u * u * x0 + 2.0f * u * t * cx + t * t * x1;
            const float qy = u * u * slurY + 2.0f * u * t * cy + t * t * slurY;
            renderer.drawLine(px, py, qx, qy, 1.4f, ink.withAlpha(0.7f));
            px = qx;
            py = qy;
        }
    }

    // ── Playhead ──────────────────────────────────────────────────────────
    renderer.drawRect(cursorX - 1.0f, bounds_.y, 2.0f, bounds_.h, kCursor.withAlpha(0.85f));
    renderer.drawRoundedRect(cursorX - 5.0f, bounds_.y, 10.0f, 6.0f, 2.0f, kCursor);

    renderer.popClip();
}

}  // namespace fretless::view
