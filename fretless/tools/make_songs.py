#!/usr/bin/env python3
"""
make_songs.py - generates the MusicXML exercises that ship with Fretless.

Everything here is public domain (Suzuki Book 1 openers and plain scales), so
the repository stays clean of licensed engravings.

    python tools/make_songs.py
"""

from __future__ import annotations

import pathlib
import textwrap

OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "assets" / "songs"

# Semitone offsets within the octave, keyed by letter.
STEP_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# MusicXML <type> names, keyed by duration in quarter notes.
TYPE_FOR_QUARTERS = {
    4.0: "whole",
    3.0: "half",       # dotted, flagged separately
    2.0: "half",
    1.5: "quarter",    # dotted
    1.0: "quarter",
    0.75: "eighth",    # dotted
    0.5: "eighth",
    0.25: "16th",
}

DIVISIONS = 4  # divisions per quarter note -> 16th note resolution


def parse_note(token: str) -> tuple[str, int, int] | None:
    """'C#5' -> ('C', 1, 5). 'r' -> None (a rest)."""
    if token == "r":
        return None
    letter = token[0].upper()
    cursor = 1
    alter = 0
    while cursor < len(token) and token[cursor] in "#b":
        alter += 1 if token[cursor] == "#" else -1
        cursor += 1
    return letter, alter, int(token[cursor:])


def note_xml(token: str, quarters: float) -> str:
    duration = int(round(quarters * DIVISIONS))
    dotted = quarters in (3.0, 1.5, 0.75)
    note_type = TYPE_FOR_QUARTERS.get(quarters, "quarter")
    dot = "        <dot/>\n" if dotted else ""

    parsed = parse_note(token)
    if parsed is None:
        return (
            "      <note>\n"
            "        <rest/>\n"
            f"        <duration>{duration}</duration>\n"
            f"        <type>{note_type}</type>\n"
            f"{dot}"
            "      </note>\n"
        )

    letter, alter, octave = parsed
    alter_xml = f"          <alter>{alter}</alter>\n" if alter else ""
    return (
        "      <note>\n"
        "        <pitch>\n"
        f"          <step>{letter}</step>\n"
        f"{alter_xml}"
        f"          <octave>{octave}</octave>\n"
        "        </pitch>\n"
        f"        <duration>{duration}</duration>\n"
        "        <voice>1</voice>\n"
        f"        <type>{note_type}</type>\n"
        f"{dot}"
        "      </note>\n"
    )


def build(title: str, composer: str, fifths: int, beats: int, beat_type: int,
          tempo: int, measures: list[list[tuple[str, float]]]) -> str:
    body = []
    for index, measure in enumerate(measures, start=1):
        attributes = ""
        if index == 1:
            attributes = textwrap.dedent(f"""\
                      <attributes>
                        <divisions>{DIVISIONS}</divisions>
                        <key><fifths>{fifths}</fifths></key>
                        <time><beats>{beats}</beats><beat-type>{beat_type}</beat-type></time>
                        <clef><sign>G</sign><line>2</line></clef>
                      </attributes>
                      <direction placement="above">
                        <direction-type>
                          <metronome><beat-unit>quarter</beat-unit><per-minute>{tempo}</per-minute></metronome>
                        </direction-type>
                        <sound tempo="{tempo}"/>
                      </direction>
                """)
            attributes = textwrap.indent(attributes, "")

        notes = "".join(note_xml(token, quarters) for token, quarters in measure)
        body.append(f'    <measure number="{index}">\n{attributes}{notes}    </measure>\n')

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN"\n'
        '  "http://www.musicxml.org/dtds/partwise.dtd">\n'
        '<score-partwise version="4.0">\n'
        f"  <work><work-title>{title}</work-title></work>\n"
        "  <identification>\n"
        f'    <creator type="composer">{composer}</creator>\n'
        "    <encoding><software>Fretless make_songs.py</software></encoding>\n"
        "  </identification>\n"
        "  <part-list>\n"
        '    <score-part id="P1">\n'
        "      <part-name>Violin</part-name>\n"
        '      <score-instrument id="P1-I1"><instrument-name>Violin</instrument-name></score-instrument>\n'
        "    </score-part>\n"
        "  </part-list>\n"
        '  <part id="P1">\n'
        + "".join(body) +
        "  </part>\n"
        "</score-partwise>\n"
    )


def scale(tonic_letter: str, alter: str, octave: int, pattern: list[int],
          quarters: float = 1.0) -> list[list[tuple[str, float]]]:
    """Ascending then descending scale, four notes per measure."""
    names = ["C", "D", "E", "F", "G", "A", "B"]
    start = names.index(tonic_letter)

    tokens: list[str] = []
    for degree in range(8):
        index = (start + degree) % 7
        oct_offset = (start + degree) // 7
        accidental = alter if index in pattern else ""
        tokens.append(f"{names[index]}{accidental}{octave + oct_offset}")
    tokens += list(reversed(tokens[:-1]))

    measures: list[list[tuple[str, float]]] = []
    for i in range(0, len(tokens), 4):
        measures.append([(token, quarters) for token in tokens[i:i + 4]])
    # Pad the last measure with a rest so the bar is complete.
    while sum(q for _, q in measures[-1]) < 4.0:
        measures[-1].append(("r", 1.0))
    return measures


# ── Suzuki Twinkle, theme only. A major, first position, A and E strings. ──
TWINKLE = [
    [("A4", 1), ("A4", 1), ("E5", 1), ("E5", 1)],
    [("F#5", 1), ("F#5", 1), ("E5", 2)],
    [("D5", 1), ("D5", 1), ("C#5", 1), ("C#5", 1)],
    [("B4", 1), ("B4", 1), ("A4", 2)],
    [("E5", 1), ("E5", 1), ("D5", 1), ("D5", 1)],
    [("C#5", 1), ("C#5", 1), ("B4", 2)],
    [("E5", 1), ("E5", 1), ("D5", 1), ("D5", 1)],
    [("C#5", 1), ("C#5", 1), ("B4", 2)],
    [("A4", 1), ("A4", 1), ("E5", 1), ("E5", 1)],
    [("F#5", 1), ("F#5", 1), ("E5", 2)],
    [("D5", 1), ("D5", 1), ("C#5", 1), ("C#5", 1)],
    [("B4", 1), ("B4", 1), ("A4", 2)],
]

# ── Open strings: the first thing anyone should play into a tuner. ─────────
OPEN_STRINGS = [
    [("G3", 4)], [("G3", 4)],
    [("D4", 4)], [("D4", 4)],
    [("A4", 4)], [("A4", 4)],
    [("E5", 4)], [("E5", 4)],
]

SONGS = {
    "twinkle_suzuki.musicxml": build(
        "Twinkle, Twinkle, Little Star", "Traditional (Suzuki Book 1)",
        fifths=3, beats=4, beat_type=4, tempo=88, measures=TWINKLE),

    "open_strings.musicxml": build(
        "Open Strings", "Fretless", fifths=0, beats=4, beat_type=4,
        tempo=60, measures=OPEN_STRINGS),

    "scale_a_major.musicxml": build(
        "A Major Scale (one octave)", "Fretless", fifths=3, beats=4, beat_type=4,
        tempo=72, measures=scale("A", "#", 4, pattern=[0, 1, 4])),

    "scale_d_major.musicxml": build(
        "D Major Scale (one octave)", "Fretless", fifths=2, beats=4, beat_type=4,
        tempo=72, measures=scale("D", "#", 4, pattern=[0, 3])),
}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, content in SONGS.items():
        path = OUT_DIR / name
        path.write_text(content, encoding="utf-8")
        print(f"wrote {path.relative_to(OUT_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
