#!/usr/bin/env python3
"""
fetch_violin_samples.py - the violin the web app plays when the player listens.

Source: VSCO 2 Community Edition, Solo Violin / Arco Vib, forte layer, released
under CC0 1.0 by Versilian Studios. Fifteen recorded pitches from G3 to C7; the
web sampler reaches every other note by playbackRate, never more than two
semitones away.

    python tools/fetch_violin_samples.py

Needs ffmpeg on PATH. Writes apps/web/public/amostras/violino/<midi>.m4a (mono
AAC, leading silence removed, cut to the first seconds with a fade) and a
LICENSE.txt naming the source. The originals are downloaded to a temporary
folder and discarded.
"""

from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "apps" / "web" / "public" / "amostras" / "violino"
BASE_URL = "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/"
NOTES = {"G3": 55, "A3": 57, "C4": 60, "E4": 64, "G4": 67, "A4": 69, "C5": 72, "E5": 76,
         "G5": 79, "A5": 81, "C6": 84, "E6": 88, "G6": 91, "A6": 93, "C7": 96}
KEEP_SECONDS = 6.0
FADE_SECONDS = 0.3

LICENSE = """Amostras de violino: VSCO 2 Community Edition, Solo Violin / Arco Vib (dinâmica f).
Versilian Studios, https://versilian-studios.com/vsco-community/
Repositório: https://github.com/sgossner/VSCO-2-CE
Licença: Creative Commons Zero v1.0 Universal (CC0 1.0), domínio público.

Convertidas por tools/fetch_violin_samples.py: mono, AAC, silêncio inicial removido,
cortadas em {keep:.0f} s com fade de {fade:.1f} s e volume normalizado.
"""


def download(name: str, target: pathlib.Path) -> None:
    url = BASE_URL + urllib.parse.quote(name)
    with urllib.request.urlopen(url, timeout=60) as response, target.open("wb") as out:
        shutil.copyfileobj(response, out)


def convert(source: pathlib.Path, target: pathlib.Path) -> None:
    fade_start = KEEP_SECONDS - FADE_SECONDS
    filters = ",".join([
        "silenceremove=start_periods=1:start_threshold=-50dB",
        f"atrim=0:{KEEP_SECONDS}",
        "loudnorm=I=-20:TP=-2:LRA=7",
        f"afade=t=out:st={fade_start}:d={FADE_SECONDS}",
        "aresample=44100",
    ])
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
         "-ac", "1", "-af", filters, "-c:a", "aac", "-b:a", "96k", str(target)],
        check=True,
    )


def main() -> int:
    if shutil.which("ffmpeg") is None:
        print("ffmpeg não encontrado no PATH", file=sys.stderr)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="violino-") as tmp:
        for note, midi in NOTES.items():
            source = pathlib.Path(tmp) / f"{note}.wav"
            download(f"LLVln_ArcoVib_{note}_f.wav", source)
            convert(source, OUT_DIR / f"{midi}.m4a")
            print(f"{note} -> {midi}.m4a")
    (OUT_DIR / "LICENSE.txt").write_text(LICENSE.format(keep=KEEP_SECONDS, fade=FADE_SECONDS), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
