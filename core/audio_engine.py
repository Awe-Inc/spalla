"""
audio_engine.py — Captura de microfone + detecção de pitch em tempo real.

Usa sounddevice (PortAudio) para captura e aubio (YIN) para pitch detection.
Se aubio não estiver disponível, usa implementação YIN pura em numpy.
Latência alvo: ~11 ms por bloco (512 samples @ 44100 Hz).

Uso típico:
    engine = AudioEngine(callback=minha_funcao)
    engine.start()
    ...
    engine.stop()

O callback recebe um PitchResult a cada bloco de áudio processado.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np
import sounddevice as sd

# Tenta importar aubio; se não disponível usa fallback numpy
try:
    import aubio as _aubio
    _AUBIO_AVAILABLE = True
except ImportError:
    _aubio = None
    _AUBIO_AVAILABLE = False


# ---------------------------------------------------------------------------
# Constantes de configuração
# ---------------------------------------------------------------------------

SAMPLE_RATE: int = 44100          # Hz
HOP_SIZE: int = 512               # samples por bloco (~11.6 ms)
WINDOW_SIZE: int = 2048           # janela de análise
PITCH_METHOD: str = "yin"
CONFIDENCE_THRESHOLD: float = 0.7
SILENCE_THRESHOLD: float = 0.001  # RMS abaixo disto = silêncio


# ---------------------------------------------------------------------------
# Tipos de dados
# ---------------------------------------------------------------------------

@dataclass
class PitchResult:
    """Resultado de um bloco de áudio analisado."""
    frequency: float          # Hz detectado (0.0 = silêncio / sem sinal)
    note_name: str            # ex.: "A4", "E5", "" se silêncio
    cents_offset: float       # desvio em cents da nota mais próxima (-50 a +50)
    confidence: float         # 0.0–1.0
    timestamp: float          # time.monotonic() no momento da captura
    is_silent: bool


# ---------------------------------------------------------------------------
# Helpers de conversão
# ---------------------------------------------------------------------------

_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def hz_to_note(frequency: float) -> tuple[str, float]:
    """
    Converte frequência (Hz) em nome de nota e desvio em cents.

    Returns:
        (note_name, cents_offset)  — ex.: ("A4", +3.2)
    """
    if frequency <= 0:
        return ("", 0.0)

    midi_float = 12.0 * np.log2(frequency / 440.0) + 69.0
    midi_round = round(midi_float)
    cents = (midi_float - midi_round) * 100.0
    octave = (midi_round // 12) - 1
    note = _NOTE_NAMES[midi_round % 12]
    return (f"{note}{octave}", cents)


# ---------------------------------------------------------------------------
# Detector YIN em numpy puro (fallback sem aubio)
# ---------------------------------------------------------------------------

class _NumpyYIN:
    """
    Implementação YIN para detecção de pitch sem aubio.
    Referência: de Cheveigné & Kawahara (2002).
    """

    def __init__(self, sample_rate: int, window_size: int,
                 threshold: float = 0.15) -> None:
        self._sr = sample_rate
        self._w = window_size
        self._thresh = threshold
        self._last_confidence = 0.0
        # Buffer acumulador: mantém samples suficientes para uma janela
        self._buf = np.zeros(window_size, dtype=np.float32)

    def __call__(self, samples: np.ndarray) -> tuple[float, float]:
        """Retorna (frequency_hz, confidence)."""
        # Desloca buffer e insere novos samples
        n = len(samples)
        if n >= self._w:
            self._buf[:] = samples[-self._w:]
        else:
            self._buf[:-n] = self._buf[n:]
            self._buf[-n:] = samples

        frame = self._buf
        W = self._w // 2   # metade da janela para a função de diferença

        # 1. Função de diferença (YIN step 2)
        d = np.zeros(W, dtype=np.float64)
        for tau in range(1, W):
            diff = frame[:W] - frame[tau:tau + W]
            d[tau] = np.dot(diff, diff)

        # 2. Diferença normalizada cumulativa (YIN step 3)
        d_prime = np.zeros(W, dtype=np.float64)
        d_prime[0] = 1.0
        running_sum = 0.0
        for tau in range(1, W):
            running_sum += d[tau]
            d_prime[tau] = d[tau] * tau / running_sum if running_sum > 0 else 1.0

        # 3. Primeiro mínimo abaixo do threshold (YIN step 4)
        tau_est = -1
        for tau in range(2, W - 1):
            if d_prime[tau] < self._thresh:
                # Verifica que é um mínimo local
                while tau + 1 < W and d_prime[tau + 1] < d_prime[tau]:
                    tau += 1
                tau_est = tau
                break

        if tau_est <= 0:
            self._last_confidence = 0.0
            return 0.0, 0.0

        # 4. Interpolação parabólica (YIN step 5)
        if 0 < tau_est < W - 1:
            s0, s1, s2 = d_prime[tau_est - 1], d_prime[tau_est], d_prime[tau_est + 1]
            denom = (2 * s1 - s2 - s0)
            if denom != 0:
                tau_est = tau_est + (s0 - s2) / (2 * denom)

        freq = self._sr / tau_est if tau_est > 0 else 0.0

        # Confiança = 1 - valor mínimo normalizado (clampado)
        confidence = max(0.0, min(1.0, 1.0 - d_prime[int(round(tau_est))] if
                         0 < int(round(tau_est)) < W else 0.0))
        self._last_confidence = confidence
        return float(freq), float(confidence)

    def get_confidence(self) -> float:
        return self._last_confidence


# ---------------------------------------------------------------------------
# Engine principal
# ---------------------------------------------------------------------------

class AudioEngine:
    """
    Captura microfone em thread separada e chama `callback` com PitchResult
    a cada HOP_SIZE amostras capturadas (~11.6 ms).

    Usa aubio YIN se disponível, senão usa implementação numpy interna.
    """

    def __init__(
        self,
        callback: Callable[[PitchResult], None],
        device: Optional[int | str] = None,
        sample_rate: int = SAMPLE_RATE,
        hop_size: int = HOP_SIZE,
    ) -> None:
        self._callback = callback
        self._device = device
        self._hop_size = hop_size
        self._running = False
        self._stream: Optional[sd.InputStream] = None
        self._lock = threading.Lock()

        # Auto-detecta sample rate suportada pelo dispositivo
        self._sample_rate = self._detect_sample_rate(device, sample_rate)

        # Detector de pitch
        if _AUBIO_AVAILABLE:
            self._pitch_obj = _aubio.pitch(
                PITCH_METHOD, WINDOW_SIZE, self._hop_size, self._sample_rate
            )
            self._pitch_obj.set_unit("Hz")
            self._pitch_obj.set_silence(-60)
            self._use_aubio = True
        else:
            self._pitch_obj = _NumpyYIN(self._sample_rate, WINDOW_SIZE)
            self._use_aubio = False

    # ------------------------------------------------------------------
    # Detecção de sample rate compatível
    # ------------------------------------------------------------------

    @staticmethod
    def _detect_sample_rate(device, preferred: int) -> int:
        """
        Retorna a melhor sample rate suportada pelo dispositivo.
        Tenta preferred primeiro; se falhar usa a taxa nativa do dispositivo.
        """
        candidates = [preferred, 48000, 44100, 16000, 22050]
        # Coloca a taxa nativa do dispositivo logo após a preferida
        try:
            info = sd.query_devices(device, kind='input') if device is not None \
                   else sd.query_devices(kind='input')
            native = int(info.get('default_samplerate', preferred))
            if native not in candidates:
                candidates.insert(1, native)
            else:
                # Move native para a frente se já estiver na lista
                candidates.remove(native)
                candidates.insert(0, native)
        except Exception:
            pass

        for rate in candidates:
            try:
                sd.check_input_settings(device=device, samplerate=rate, channels=1)
                return rate
            except Exception:
                continue

        return preferred  # último recurso

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._stream = sd.InputStream(
            samplerate=self._sample_rate,
            blocksize=self._hop_size,
            device=self._device,
            channels=1,
            dtype="float32",
            callback=self._sd_callback,
            latency="low",
        )
        self._stream.start()

    def stop(self) -> None:
        self._running = False
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None

    @property
    def is_running(self) -> bool:
        return self._running

    @staticmethod
    def list_input_devices() -> list[dict]:
        devices = sd.query_devices()
        return [
            {"index": i, "name": d["name"], "channels": d["max_input_channels"]}
            for i, d in enumerate(devices)
            if d["max_input_channels"] > 0
        ]

    # ------------------------------------------------------------------
    # Callback interno (roda na thread de áudio do sounddevice)
    # ------------------------------------------------------------------

    def _sd_callback(self, indata, frames, time_info, status) -> None:
        if not self._running:
            return

        samples = indata[:, 0].astype("float32")
        timestamp = time.monotonic()

        rms = float(np.sqrt(np.mean(samples ** 2)))
        is_silent = rms < SILENCE_THRESHOLD

        if self._use_aubio:
            freq = float(self._pitch_obj(samples)[0])
            confidence = float(self._pitch_obj.get_confidence())
        else:
            freq, confidence = self._pitch_obj(samples)

        if freq < 20.0 or confidence < CONFIDENCE_THRESHOLD or is_silent:
            freq = 0.0
            note_name = ""
            cents_offset = 0.0
        else:
            note_name, cents_offset = hz_to_note(freq)

        result = PitchResult(
            frequency=freq,
            note_name=note_name,
            cents_offset=cents_offset,
            confidence=confidence,
            timestamp=timestamp,
            is_silent=is_silent,
        )

        try:
            self._callback(result)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Teste rápido de linha de comando
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    backend = "aubio" if _AUBIO_AVAILABLE else "numpy YIN (fallback)"
    print(f"Backend de pitch: {backend}")
    print("\nDispositivos de entrada:")
    for dev in AudioEngine.list_input_devices():
        print(f"  [{dev['index']}] {dev['name']}  ({dev['channels']} ch)")

    print("\nCapturando por 5 segundos... toque uma nota no violino.\n")

    def on_pitch(result: PitchResult) -> None:
        if not result.is_silent and result.frequency > 0:
            arrow = "▲" if result.cents_offset > 0 else ("▼" if result.cents_offset < 0 else "–")
            print(
                f"  {result.note_name:<4}  {result.frequency:7.2f} Hz  "
                f"{result.cents_offset:+.1f}¢ {arrow}  conf={result.confidence:.2f}"
            )

    engine = AudioEngine(callback=on_pitch)
    engine.start()
    time.sleep(5)
    engine.stop()
    print("\nCaptura encerrada.")
