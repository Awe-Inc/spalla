"""
score_engine.py — Leitura e parse de partituras MusicXML.

Usa music21 para extrair notas com:
  - pitch (Hz e nome MIDI-style: "A4", "E5" …)
  - duração em segundos
  - timestamp absoluto de início (segundos desde o começo da música)
  - número do compasso e posição no compasso

Uso típico:
    engine = ScoreEngine("mysong.musicxml")
    notes = engine.notes          # lista de ScoreNote ordenada por tempo
    bpm   = engine.bpm
    ts    = engine.time_signature  # ex.: "4/4"
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import music21
from music21 import converter, note, chord, tempo, meter, stream


# ---------------------------------------------------------------------------
# Tipos de dados
# ---------------------------------------------------------------------------

@dataclass(order=True)
class ScoreNote:
    """Representa uma nota extraída da partitura."""

    # Ordenação pelo tempo de início
    start_time: float          # segundos desde o início da música
    frequency: float           # Hz (A4 = 440.0)
    note_name: str             # ex.: "A4", "E5"
    midi_number: int           # MIDI note number (A4 = 69)
    duration: float            # duração em segundos
    measure: int               # número do compasso (1-based)
    beat: float                # posição no compasso (1.0, 1.5, 2.0 …)
    is_rest: bool = False      # True para pausas


# ---------------------------------------------------------------------------
# Engine principal
# ---------------------------------------------------------------------------

class ScoreEngine:
    """
    Carrega um arquivo MusicXML e extrai todas as notas em ordem cronológica.

    Parameters
    ----------
    filepath : str | Path
        Caminho para o arquivo .musicxml / .xml / .mxl
    instrument_part : int
        Índice da parte a extrair (0 = primeira parte, normalmente o violino).
        Se None, extrai todas as partes mescladas.
    """

    def __init__(
        self,
        filepath: str | Path,
        instrument_part: int = 0,
    ) -> None:
        self._filepath = Path(filepath)
        self._instrument_part = instrument_part
        self._score: Optional[stream.Score] = None
        self._notes: list[ScoreNote] = []
        self._bpm: float = 120.0
        self._time_signature: str = "4/4"
        self._tempo_scale: float = 1.0

        if not self._filepath.exists():
            raise FileNotFoundError(f"Partitura não encontrada: {self._filepath}")

        self._load()
        self._extract()

    # ------------------------------------------------------------------
    # Propriedades públicas
    # ------------------------------------------------------------------

    @property
    def notes(self) -> list[ScoreNote]:
        """Lista de ScoreNote ordenada por start_time."""
        return self._notes

    @property
    def bpm(self) -> float:
        """Andamento em BPM (usa o primeiro marking encontrado, padrão 120)."""
        return self._bpm

    @property
    def time_signature(self) -> str:
        """Fórmula de compasso como string, ex.: '4/4', '3/4'."""
        return self._time_signature

    @property
    def duration_seconds(self) -> float:
        """Duração total da música em segundos."""
        if not self._notes:
            return 0.0
        last = self._notes[-1]
        return last.start_time + last.duration

    @property
    def filepath(self) -> Path:
        return self._filepath

    @property
    def tempo_scale(self) -> float:
        """Multiplicador de velocidade (0.5 = metade, 1.0 = original, 1.5 = +50%)."""
        return self._tempo_scale

    @tempo_scale.setter
    def tempo_scale(self, value: float) -> None:
        self._tempo_scale = max(0.25, min(2.0, value))
        self._extract()   # re-calcula tempos sem reler o disco

    # ------------------------------------------------------------------
    # Parse interno
    # ------------------------------------------------------------------

    def _load(self) -> None:
        """Lê o arquivo MusicXML do disco (feito apenas uma vez)."""
        self._score = converter.parse(str(self._filepath))

    def _extract(self) -> None:
        """Extrai notas do score já carregado. Chamado ao mudar tempo_scale."""
        # Seleciona parte
        parts = self._score.parts
        if not parts:
            raise ValueError("Nenhuma parte encontrada na partitura.")

        if self._instrument_part >= len(parts):
            raise ValueError(
                f"Parte {self._instrument_part} não existe "
                f"(a partitura tem {len(parts)} parte(s))."
            )

        target_part = parts[self._instrument_part]

        # Extrai BPM do primeiro TempoIndication encontrado
        for element in self._score.flatten().getElementsByClass(tempo.MetronomeMark):
            if element.number is not None:
                self._bpm = float(element.number)
                break

        # Extrai fórmula de compasso
        for element in target_part.flatten().getElementsByClass(meter.TimeSignature):
            self._time_signature = element.ratioString
            break

        # Extrai notas e pausas aplicando tempo_scale
        self._notes = []
        for element in target_part.flatten().notesAndRests:
            start_sec = self._offset_to_seconds(element.offset)
            dur_sec = self._offset_to_seconds(element.quarterLength)

            if isinstance(element, note.Rest):
                self._notes.append(ScoreNote(
                    start_time=start_sec,
                    frequency=0.0,
                    note_name="rest",
                    midi_number=-1,
                    duration=dur_sec,
                    measure=self._get_measure(element),
                    beat=float(element.beat) if element.beat else 1.0,
                    is_rest=True,
                ))
            elif isinstance(element, note.Note):
                freq = self._midi_to_hz(element.pitch.midi)
                self._notes.append(ScoreNote(
                    start_time=start_sec,
                    frequency=freq,
                    note_name=element.pitch.nameWithOctave,   # ex.: "A4"
                    midi_number=element.pitch.midi,
                    duration=dur_sec,
                    measure=self._get_measure(element),
                    beat=float(element.beat) if element.beat else 1.0,
                ))
            elif isinstance(element, chord.Chord):
                # Para acordes, usa a nota mais alta (violino toca melodia no topo)
                top_note = max(element.notes, key=lambda n: n.pitch.midi)
                freq = self._midi_to_hz(top_note.pitch.midi)
                self._notes.append(ScoreNote(
                    start_time=start_sec,
                    frequency=freq,
                    note_name=top_note.pitch.nameWithOctave,
                    midi_number=top_note.pitch.midi,
                    duration=dur_sec,
                    measure=self._get_measure(element),
                    beat=float(element.beat) if element.beat else 1.0,
                ))

        self._notes.sort()

    # ------------------------------------------------------------------
    # Utilitários
    # ------------------------------------------------------------------

    def _offset_to_seconds(self, quarter_length: float) -> float:
        """Converte quarter-length (beats) em segundos usando BPM × tempo_scale."""
        return (quarter_length / self._bpm) * 60.0 / self._tempo_scale

    @staticmethod
    def _midi_to_hz(midi: int) -> float:
        """Converte número MIDI em frequência Hz. A4=69=440Hz."""
        return 440.0 * (2.0 ** ((midi - 69) / 12.0))

    @staticmethod
    def _get_measure(element) -> int:
        """Retorna o número do compasso de um elemento music21."""
        m = element.measureNumber
        return int(m) if m is not None else 0

    # ------------------------------------------------------------------
    # Helpers de busca (usados pelo game_engine)
    # ------------------------------------------------------------------

    def note_at(self, time_sec: float) -> Optional[ScoreNote]:
        """
        Retorna a nota ativa no instante `time_sec`, ou None se for pausa/
        entre notas.
        """
        for n in self._notes:
            if n.is_rest:
                continue
            if n.start_time <= time_sec < n.start_time + n.duration:
                return n
        return None

    def notes_in_window(self, start: float, end: float) -> list[ScoreNote]:
        """
        Retorna notas cujo início cai dentro de [start, end] (segundos).
        Útil para o game_view renderizar a janela visível de notas.
        """
        return [
            n for n in self._notes
            if start <= n.start_time <= end and not n.is_rest
        ]

    # ------------------------------------------------------------------
    # Representação
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        return (
            f"<ScoreEngine file='{self._filepath.name}' "
            f"bpm={self._bpm} ts='{self._time_signature}' "
            f"notes={len(self._notes)} "
            f"duration={self.duration_seconds:.1f}s>"
        )


# ---------------------------------------------------------------------------
# Teste rápido de linha de comando
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Uso: python score_engine.py <arquivo.musicxml>")
        sys.exit(1)

    engine = ScoreEngine(sys.argv[1])
    print(f"\nPartitura carregada: {engine}")
    print(f"BPM: {engine.bpm}  |  Compasso: {engine.time_signature}")
    print(f"Total de eventos: {len(engine.notes)}")
    print(f"Dura\u00e7\u00e3o: {engine.duration_seconds:.2f}s\n")

    print("Primeiras 20 notas:")
    for n in engine.notes[:20]:
        if n.is_rest:
            print(f"  [{n.measure:3}] t={n.start_time:6.3f}s  PAUSA  dur={n.duration:.3f}s")
        else:
            print(
                f"  [{n.measure:3}] t={n.start_time:6.3f}s  "
                f"{n.note_name:<4}  {n.frequency:7.2f} Hz  "
                f"dur={n.duration:.3f}s  beat={n.beat}"
            )
