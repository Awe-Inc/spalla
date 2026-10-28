// ═══════════════════════════════════════════════════════════════════════════
//  MusicXmlParser.h — MusicXML 3.x/4.x -> Score, built on pugixml.
//
//  Replaces music21. Handles the parts of the format that actually occur in
//  violin repertoire: divisions changes, multi-voice backup/forward, chords,
//  ties, dots, grace notes, mid-piece tempo changes, pickup measures, and
//  repeats, voltas, D.C., D.S., Fine and Coda expanded into performance order.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <optional>
#include <string>

#include "fretless/score/Score.h"

namespace fretless::score {

struct ParseOptions {
    /// Which <part> to extract. 0 = first, which is the solo line in every
    /// violin edition worth practising against.
    int partIndex = 0;

    /// MusicXML lets several notes start at the same instant (chords, double
    /// stops). A violinist reading a melody wants the top line.
    bool takeTopNoteOfChord = true;

    /// Merge tied notes into a single sustained event instead of re-attacking.
    bool mergeTies = true;

    /// Play repeats, voltas, D.C., D.S., Fine and Coda in performance order.
    /// Off gives the page as printed, measure after measure, which is what a
    /// player wants when drilling one passage rather than playing the piece.
    bool expandRepeats = true;
};

/// Parses `path` (.musicxml, .xml, or .mxl). Returns nullopt and fills
/// `error` on failure.
[[nodiscard]] std::optional<Score> parseMusicXml(const std::string& path,
                                                 std::string*       error   = nullptr,
                                                 const ParseOptions& options = {});

/// Parses MusicXML already held in memory.
[[nodiscard]] std::optional<Score> parseMusicXmlBuffer(const char*        data,
                                                       std::size_t        size,
                                                       std::string*       error   = nullptr,
                                                       const ParseOptions& options = {});

}  // namespace fretless::score
