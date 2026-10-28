#!/usr/bin/env python3
"""
fetch_library.py - pull freely-licensed real repertoire into assets/songs.

The generated exercises in the Practice modules cover technique. They do not
cover *music*, and a practice tool that never puts a real piece in front of you
teaches you to play scales.

The source is the OpenScore Lieder Corpus: 1400+ nineteenth-century songs,
engraved by volunteers and released under CC0 1.0 (public domain dedication),
so redistributing them inside this repository is unambiguously allowed.

They are songs, not violin parts, which is exactly what makes them useful here:
a vocal line is a single melodic voice, phrased to be breathed, and most of it
sits inside the violin's comfortable range. That is the definition of good
sight-reading material.

    python tools/fetch_library.py                 # default: 40 pieces
    python tools/fetch_library.py --count 120
    python tools/fetch_library.py --list          # show what would be fetched

Everything downloaded lands in assets/songs/community/ next to an
ATTRIBUTION.md naming the source. Files already present are left alone, so
re-running is cheap.
"""

from __future__ import annotations

import argparse
import io
import json
import pathlib
import random
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from xml.etree import ElementTree

REPO = "OpenScore/Lieder"
BRANCH = "main"
TREE_URL = f"https://api.github.com/repos/{REPO}/git/trees/{BRANCH}?recursive=1"
RAW_BASE = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/"

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "songs" / "community"

# The violin's open G is MIDI 55. Anything under it cannot be played at pitch,
# and anything above the top of third position is a different kind of exercise,
# so a piece is only accepted when its whole range fits comfortably between.
MIN_MIDI = 55
MAX_MIDI = 88

# Too few notes and it is a fragment; too many and it is a twenty-minute sit.
MIN_NOTES = 40
MAX_NOTES = 400

STEP_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def http_get(url: str, binary: bool = False):
    request = urllib.request.Request(
        url, headers={"User-Agent": "fretless-fetch-library/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = response.read()
    return payload if binary else payload.decode("utf-8")


def list_scores() -> list[str]:
    """Every .mxl path in the corpus, from one tree request."""
    tree = json.loads(http_get(TREE_URL))
    if tree.get("truncated"):
        print("warning: GitHub truncated the tree listing", file=sys.stderr)
    return sorted(entry["path"] for entry in tree["tree"]
                  if entry["path"].endswith(".mxl"))


def describe(path: str) -> tuple[str, str]:
    """('Schubert, Franz/.../Erlkonig') -> ('Franz Schubert', 'Erlkonig')."""
    parts = path.split("/")
    composer = parts[1] if len(parts) > 2 else "Unknown"
    if "," in composer:
        last, first = composer.split(",", 1)
        composer = f"{first.strip()} {last.strip()}".replace("_", " ").strip()
    else:
        composer = composer.replace("_", " ")
    title = parts[-2].replace("_", " ") if len(parts) > 2 else parts[-1]
    return composer, title


def read_mxl(payload: bytes) -> ElementTree.Element | None:
    """Unwraps a compressed MusicXML container and returns the score root."""
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        target = None
        try:
            container = archive.read("META-INF/container.xml")
            root = ElementTree.fromstring(container)
            for rootfile in root.iter("rootfile"):
                candidate = rootfile.get("full-path")
                if candidate:
                    target = candidate
                    break
        except KeyError:
            target = None
        if target is None:
            names = [n for n in archive.namelist()
                     if n.lower().endswith((".xml", ".musicxml"))
                     and not n.startswith("META-INF")]
            if not names:
                return None
            target = names[0]
        # ZIP mandates forward slashes but real writers store backslashes; the
        # engine hit this too, so mirror its tolerance here.
        try:
            data = archive.read(target)
        except KeyError:
            fixed = target.replace("/", "\\")
            data = archive.read(fixed)
    return ElementTree.fromstring(data)


def first_part_range(root: ElementTree.Element) -> tuple[int, int, int]:
    """(lowest midi, highest midi, note count) of the first part."""
    part = root.find("part")
    if part is None:
        return (0, 0, 0)
    low, high, count = 128, -1, 0
    for note in part.iter("note"):
        pitch = note.find("pitch")
        if pitch is None:
            continue
        step = pitch.findtext("step", "C")
        alter = int(float(pitch.findtext("alter", "0") or 0))
        octave = int(pitch.findtext("octave", "4"))
        midi = (octave + 1) * 12 + STEP_SEMITONE.get(step, 0) + alter
        low, high, count = min(low, midi), max(high, midi), count + 1
    return (low, high, count) if count else (0, 0, 0)


def safe_name(composer: str, title: str) -> str:
    stem = f"{title}_{composer}"
    stem = re.sub(r"[^A-Za-z0-9]+", "_", stem).strip("_")
    return (stem[:72] or "untitled") + ".mxl"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=40,
                        help="how many pieces to keep (default 40)")
    parser.add_argument("--seed", type=int, default=7,
                        help="shuffle seed, so a re-run is reproducible")
    parser.add_argument("--list", action="store_true",
                        help="print candidates without downloading")
    args = parser.parse_args()

    try:
        paths = list_scores()
    except urllib.error.URLError as error:
        print(f"cannot reach GitHub: {error}", file=sys.stderr)
        return 1
    print(f"corpus: {len(paths)} scores")

    if args.list:
        for path in paths[:args.count]:
            composer, title = describe(path)
            print(f"  {title} - {composer}")
        return 0

    # Shuffled rather than alphabetical, so a small fetch is not forty songs by
    # the three composers whose surnames start with A.
    random.Random(args.seed).shuffle(paths)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    kept, scanned = 0, 0
    manifest: list[tuple[str, str, str, int, int]] = []

    for path in paths:
        if kept >= args.count:
            break
        scanned += 1
        composer, title = describe(path)
        name = safe_name(composer, title)
        destination = OUT_DIR / name
        if destination.exists():
            kept += 1
            continue

        url = RAW_BASE + urllib.parse.quote(path)
        try:
            payload = http_get(url, binary=True)
            root = read_mxl(payload)
        except (urllib.error.URLError, zipfile.BadZipFile,
                ElementTree.ParseError) as error:
            print(f"  skip {title}: {error}")
            continue
        if root is None:
            continue

        low, high, count = first_part_range(root)
        if count < MIN_NOTES or count > MAX_NOTES:
            continue
        if low < MIN_MIDI or high > MAX_MIDI:
            continue

        destination.write_bytes(payload)
        manifest.append((title, composer, name, count, high - low))
        kept += 1
        print(f"  + {title} - {composer}  ({count} notes, range {high - low} st)")

    write_attribution(manifest)
    print(f"\n{kept} pieces in {OUT_DIR.relative_to(ROOT)} "
          f"(scanned {scanned})")
    return 0


def write_attribution(manifest: list[tuple[str, str, str, int, int]]) -> None:
    lines = [
        "# Community library",
        "",
        "Downloaded by `tools/fetch_library.py` from the **OpenScore Lieder",
        "Corpus**, released under [CC0 1.0 Universal]"
        "(https://creativecommons.org/publicdomain/zero/1.0/) — a public domain",
        "dedication, so these files may be copied, modified and redistributed",
        "without restriction.",
        "",
        "- Source: <https://github.com/OpenScore/Lieder>",
        "- Project: <https://fourscoreandmore.org/openscore/>",
        "",
        "Credit is not legally required under CC0 and is given anyway: the",
        "engraving work behind these files was done by volunteers.",
        "",
        "Only songs whose entire melody fits between the violin's open G and",
        "the top of third position are kept, so every file here is playable as",
        "written, with no transposition.",
        "",
    ]
    if manifest:
        lines += ["| Piece | Composer | Notes |", "|---|---|---|"]
        lines += [f"| {title} | {composer} | {count} |"
                  for title, composer, _, count, _ in sorted(manifest)]
        lines.append("")
    (OUT_DIR / "ATTRIBUTION.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
