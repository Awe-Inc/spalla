#!/usr/bin/env python3
"""
make_test_tone.py - writes a WAV that sounds enough like a bowed string to
exercise the pitch detector end to end through a loopback device.

A pure sine is a bad test signal: a real violin puts more energy in the second
and third partials than in the fundamental, which is exactly the condition that
makes naive autocorrelation report an octave error.

    python tools/make_test_tone.py out.wav
"""

from __future__ import annotations

import math
import struct
import sys
import wave

SAMPLE_RATE = 48000

# The open strings, held two seconds each.
NOTES = [("G3", 196.00), ("D4", 293.66), ("A4", 440.00), ("E5", 659.26)]
NOTE_SECONDS = 2.0

# Relative partial amplitudes measured off a violin spectrum: the fundamental
# is deliberately not the strongest component.
PARTIALS = [0.55, 1.00, 0.70, 0.45, 0.30, 0.22, 0.15, 0.10]


def render_note(frequency: float, seconds: float) -> list[float]:
    total = int(SAMPLE_RATE * seconds)
    attack = int(SAMPLE_RATE * 0.06)
    release = int(SAMPLE_RATE * 0.10)
    samples = []

    for i in range(total):
        t = i / SAMPLE_RATE
        value = 0.0
        for index, amplitude in enumerate(PARTIALS, start=1):
            partial = frequency * index
            if partial >= SAMPLE_RATE / 2:      # stay below Nyquist
                break
            value += amplitude * math.sin(2 * math.pi * partial * t)

        # Bow envelope, so onsets are not clicks.
        if i < attack:
            value *= i / attack
        elif i > total - release:
            value *= (total - i) / release

        # A slow, shallow vibrato: 5 Hz, +/- 8 cents.
        value *= 1.0 + 0.02 * math.sin(2 * math.pi * 5.0 * t)
        samples.append(value)

    peak = max(abs(s) for s in samples) or 1.0
    return [s / peak * 0.6 for s in samples]


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else "test_tone.wav"

    frames = bytearray()
    for name, frequency in NOTES:
        print(f"  {name:<3} {frequency:7.2f} Hz")
        for sample in render_note(frequency, NOTE_SECONDS):
            value = int(max(-1.0, min(1.0, sample)) * 32767)
            frames += struct.pack("<hh", value, value)   # stereo

    with wave.open(out, "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(bytes(frames))

    print(f"wrote {out} ({len(frames) / 4 / SAMPLE_RATE:.1f} s)")


if __name__ == "__main__":
    main()
