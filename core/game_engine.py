"""
game_engine.py — Motor de jogo do Violin Hero.

Coordena ScoreEngine + AudioEngine, avalia precisão de pitch e timing,
e emite eventos via callbacks para a UI atualizar em tempo real.

Fluxo:
    engine = GameEngine(score_engine, audio_engine)
    engine.on_hit    = lambda result: ui.update(result)
    engine.on_tick   = lambda state:  ui.refresh(state)
    engine.start()
    ...
    engine.stop()

Pontuação por nota:
    Perfeito  → pitch ≤ CENTS_PERFECT  → 100 pts × combo
    Ok        → pitch ≤ CENTS_OK       →  50 pts × combo
    Errou     → fora ou silêncio       →   0 pts (quebra combo)
"""

from __future__ import annotations

import time
import threading
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Callable, Optional

from .audio_engine import AudioEngine, PitchResult
from .score_engine import ScoreEngine, ScoreNote


# ---------------------------------------------------------------------------
# Configurações de tolerância (ajustáveis)
# ---------------------------------------------------------------------------

CENTS_PERFECT: float = 10.0   # ±10 cents → Perfeito
CENTS_OK: float      = 25.0   # ±25 cents → Ok
MS_PERFECT: float    = 50.0   # ±50 ms de timing → Perfeito
MS_OK: float         = 150.0  # ±150 ms de timing → Ok

POINTS_PERFECT = 100
POINTS_OK      = 50
POINTS_MISS    = 0

TICK_RATE_HZ   = 30           # frequência de on_tick (fps da UI)


# ---------------------------------------------------------------------------
# Tipos de dados
# ---------------------------------------------------------------------------

class GameState(Enum):
    IDLE     = auto()
    PLAYING  = auto()
    PAUSED   = auto()
    FINISHED = auto()


class HitGrade(Enum):
    PERFECT = "Perfeito"
    OK      = "Ok"
    MISS    = "Errou"
    REST    = "Pausa"   # nota esperada é pausa


@dataclass
class HitResult:
    """Resultado de avaliação de uma nota detectada."""
    expected_note:    Optional[ScoreNote]  # None se entre notas
    detected_freq:    float                # Hz detectado
    detected_name:    str                  # ex.: "A4"
    cents_offset:     float                # desvio em cents
    timing_offset_ms: float                # desvio de timing em ms
    grade:            HitGrade
    score_delta:      int                  # pontos ganhos
    timestamp:        float                # time.monotonic()


@dataclass
class GameSnapshot:
    """Estado do jogo num instante — enviado via on_tick."""
    state:          GameState
    elapsed_sec:    float             # tempo de jogo atual
    total_score:    int
    combo:          int               # notas consecutivas sem erro
    max_combo:      int
    perfect_count:  int
    ok_count:       int
    miss_count:     int
    last_hit:       Optional[HitResult]
    current_note:   Optional[ScoreNote]   # nota esperada agora
    next_notes:     list[ScoreNote]       # próximas N notas (para UI)
    accuracy_pct:   float             # % de notas corretas (perfect+ok)


# ---------------------------------------------------------------------------
# Motor principal
# ---------------------------------------------------------------------------

class GameEngine:
    """
    Coordena ScoreEngine e AudioEngine para avaliar a performance do violinista.

    Callbacks disponíveis (todos opcionais):
        on_hit(HitResult)       — chamado a cada avaliação de nota
        on_tick(GameSnapshot)   — chamado ~30x/s com o estado atual
        on_state_change(GameState) — chamado ao mudar de estado
        on_finished()           — chamado quando a música termina
    """

    def __init__(
        self,
        score_engine: ScoreEngine,
        audio_engine: AudioEngine,
        cents_perfect: float = CENTS_PERFECT,
        cents_ok: float      = CENTS_OK,
        ms_ok: float         = MS_OK,
    ) -> None:
        self._score  = score_engine
        self._audio  = audio_engine

        self.cents_perfect = cents_perfect
        self.cents_ok      = cents_ok
        self.ms_ok         = ms_ok

        # Callbacks públicos
        self.on_hit:          Optional[Callable[[HitResult], None]]     = None
        self.on_tick:         Optional[Callable[[GameSnapshot], None]]   = None
        self.on_state_change: Optional[Callable[[GameState], None]]     = None
        self.on_finished:     Optional[Callable[[], None]]               = None
        self.on_pitch_raw:    Optional[Callable[[PitchResult], None]]   = None  # para o tuner

        # Estado interno
        self._state       = GameState.IDLE
        self._start_time  = 0.0
        self._pause_time  = 0.0
        self._paused_acc  = 0.0   # tempo acumulado em pause

        # Pontuação
        self._total_score  = 0
        self._combo        = 0
        self._max_combo    = 0
        self._perfect_cnt  = 0
        self._ok_cnt       = 0
        self._miss_cnt     = 0
        self._last_hit: Optional[HitResult] = None

        # Thread do tick timer
        self._tick_thread: Optional[threading.Thread] = None
        self._stop_event  = threading.Event()

        # Conecta ao audio engine
        self._audio._callback = self._on_pitch  # type: ignore

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Inicia o jogo do começo."""
        self._reset_score()
        self._state      = GameState.PLAYING
        self._start_time = time.monotonic()
        self._paused_acc = 0.0
        self._audio.start()
        self._start_tick_loop()
        self._emit_state_change()

    def pause(self) -> None:
        if self._state != GameState.PLAYING:
            return
        self._state      = GameState.PAUSED
        self._pause_time = time.monotonic()
        self._emit_state_change()

    def resume(self) -> None:
        if self._state != GameState.PAUSED:
            return
        self._paused_acc += time.monotonic() - self._pause_time
        self._state = GameState.PLAYING
        self._emit_state_change()

    def stop(self) -> None:
        self._audio.stop()
        self._stop_event.set()
        if self._tick_thread and self._tick_thread.is_alive():
            self._tick_thread.join(timeout=1.0)
        self._state = GameState.IDLE
        self._emit_state_change()

    @property
    def state(self) -> GameState:
        return self._state

    @property
    def elapsed(self) -> float:
        """Tempo de jogo em segundos (excluindo pausas)."""
        if self._state == GameState.IDLE:
            return 0.0
        if self._state == GameState.PAUSED:
            return self._pause_time - self._start_time - self._paused_acc
        return time.monotonic() - self._start_time - self._paused_acc

    # ------------------------------------------------------------------
    # Processamento de áudio (callback do AudioEngine)
    # ------------------------------------------------------------------

    def _on_pitch(self, result: PitchResult) -> None:
        # Repassa para o tuner mesmo durante o jogo
        if self.on_pitch_raw:
            try:
                self.on_pitch_raw(result)
            except Exception:
                pass

        if self._state != GameState.PLAYING:
            return

        elapsed = self.elapsed

        # Verifica se a música terminou
        if elapsed >= self._score.duration_seconds:
            self._finish()
            return

        # Nota esperada neste instante
        expected = self._score.note_at(elapsed)

        # Sem nota esperada (entre notas ou após última nota)
        if expected is None:
            return

        # Pausa esperada — não avalia pitch
        if expected.is_rest:
            return

        # Avalia pitch
        cents = abs(result.cents_offset) if not result.is_silent else 999.0
        timing_ms = abs((elapsed - expected.start_time) * 1000.0)

        if result.is_silent or result.frequency <= 0:
            grade = HitGrade.MISS
        elif cents <= self.cents_perfect:
            grade = HitGrade.PERFECT
        elif cents <= self.cents_ok:
            grade = HitGrade.OK
        else:
            grade = HitGrade.MISS

        # Atualiza pontuação
        if grade == HitGrade.PERFECT:
            self._combo += 1
            self._perfect_cnt += 1
            delta = POINTS_PERFECT * max(1, self._combo // 5)
        elif grade == HitGrade.OK:
            self._combo += 1
            self._ok_cnt += 1
            delta = POINTS_OK * max(1, self._combo // 5)
        else:
            self._combo = 0
            self._miss_cnt += 1
            delta = 0

        self._max_combo = max(self._max_combo, self._combo)
        self._total_score += delta

        hit = HitResult(
            expected_note    = expected,
            detected_freq    = result.frequency,
            detected_name    = result.note_name,
            cents_offset     = result.cents_offset,
            timing_offset_ms = timing_ms,
            grade            = grade,
            score_delta      = delta,
            timestamp        = result.timestamp,
        )
        self._last_hit = hit

        if self.on_hit:
            try:
                self.on_hit(hit)
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Loop de tick (30 Hz)
    # ------------------------------------------------------------------

    def _start_tick_loop(self) -> None:
        self._stop_event.clear()
        self._tick_thread = threading.Thread(
            target=self._tick_loop, daemon=True, name="GameEngineTick"
        )
        self._tick_thread.start()

    def _tick_loop(self) -> None:
        interval = 1.0 / TICK_RATE_HZ
        while not self._stop_event.is_set():
            if self._state == GameState.PLAYING and self.on_tick:
                try:
                    self.on_tick(self._snapshot())
                except Exception:
                    pass
            time.sleep(interval)

    def _snapshot(self) -> GameSnapshot:
        elapsed = self.elapsed
        total   = self._perfect_cnt + self._ok_cnt + self._miss_cnt
        acc     = ((self._perfect_cnt + self._ok_cnt) / total * 100.0) if total > 0 else 0.0

        return GameSnapshot(
            state         = self._state,
            elapsed_sec   = elapsed,
            total_score   = self._total_score,
            combo         = self._combo,
            max_combo     = self._max_combo,
            perfect_count = self._perfect_cnt,
            ok_count      = self._ok_cnt,
            miss_count    = self._miss_cnt,
            last_hit      = self._last_hit,
            current_note  = self._score.note_at(elapsed),
            next_notes    = self._score.notes_in_window(elapsed - 1.0, elapsed + 8.0),
            accuracy_pct  = acc,
        )

    # ------------------------------------------------------------------
    # Helpers internos
    # ------------------------------------------------------------------

    def _finish(self) -> None:
        self._audio.stop()
        self._stop_event.set()
        self._state = GameState.FINISHED
        self._emit_state_change()
        if self.on_finished:
            try:
                self.on_finished()
            except Exception:
                pass

    def _reset_score(self) -> None:
        self._total_score = 0
        self._combo       = 0
        self._max_combo   = 0
        self._perfect_cnt = 0
        self._ok_cnt      = 0
        self._miss_cnt    = 0
        self._last_hit    = None

    def _emit_state_change(self) -> None:
        if self.on_state_change:
            try:
                self.on_state_change(self._state)
            except Exception:
                pass
