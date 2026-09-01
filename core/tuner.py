"""
tuner.py — Afinador isolado do Violin Hero.

Recebe PitchResult do AudioEngine e produz TunerReading,
que a UI usa para desenhar o medidor de ponteiro.

Uso:
    tuner = Tuner(audio_engine)
    tuner.on_reading = lambda r: widget.update(r)
    tuner.start()
    ...
    tuner.stop()
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from .audio_engine import AudioEngine, PitchResult, hz_to_note


# ---------------------------------------------------------------------------
# Tipo de dados
# ---------------------------------------------------------------------------

@dataclass
class TunerReading:
    """Leitura do afinador num instante."""
    frequency:    float   # Hz detectado (0 = silêncio)
    note_name:    str     # ex.: "A4", "" se silêncio
    cents_offset: float   # desvio em cents (-50 a +50)
    is_silent:    bool
    confidence:   float   # 0.0–1.0

    @property
    def direction(self) -> str:
        """'flat' (bemol), 'sharp' (sustenido) ou 'in_tune'."""
        if abs(self.cents_offset) <= 5.0:
            return "in_tune"
        return "sharp" if self.cents_offset > 0 else "flat"

    @property
    def normalized_offset(self) -> float:
        """Desvio normalizado em [-1.0, +1.0] para posição do ponteiro."""
        import math
        return max(-1.0, min(1.0, self.cents_offset / 50.0))


# ---------------------------------------------------------------------------
# Afinador
# ---------------------------------------------------------------------------

class Tuner:
    """
    Afinador que opera em modo standalone (sem partitura).

    Pode ser usado fora do jogo para o violinista afinar antes de tocar.
    Reutiliza o mesmo AudioEngine do jogo se fornecido.

    Parameters
    ----------
    audio_engine : AudioEngine
        Engine de captura de áudio compartilhado.
    """

    def __init__(self, audio_engine: AudioEngine) -> None:
        self._audio = audio_engine
        self.on_reading: Optional[Callable[[TunerReading], None]] = None
        self._active = False

    def start(self) -> None:
        """Ativa o afinador (inicia captura se ainda não iniciada)."""
        self._active = True
        self._audio._callback = self._on_pitch  # type: ignore
        if not self._audio.is_running:
            self._audio.start()

    def stop(self) -> None:
        """Para o afinador (mas mantém o AudioEngine rodando se foi iniciado externamente)."""
        self._active = False

    def _on_pitch(self, result: PitchResult) -> None:
        if not self._active or not self.on_reading:
            return

        reading = TunerReading(
            frequency    = result.frequency,
            note_name    = result.note_name,
            cents_offset = result.cents_offset,
            is_silent    = result.is_silent,
            confidence   = result.confidence,
        )

        try:
            self.on_reading(reading)
        except Exception:
            pass
