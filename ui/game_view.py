"""
game_view.py — Highway horizontal do Violin Hero.

4 faixas horizontais (E A D G de cima para baixo, como o violino ao segurar).
Notas vêm da direita, cruzam a linha de hit (vertical à esquerda) e saem à esquerda.
"""

from __future__ import annotations

from collections import deque
from typing import Optional

from PyQt6.QtCore import Qt, QTimer, QRectF, QPointF
from PyQt6.QtGui import (
    QPainter, QColor, QPen, QBrush,
    QFont, QLinearGradient,
)
from PyQt6.QtWidgets import QWidget

from core.game_engine import GameSnapshot, HitResult, HitGrade, GameState
from core.score_engine import ScoreNote


# ---------------------------------------------------------------------------
# Paleta
# ---------------------------------------------------------------------------

COLOR_BG           = QColor(10, 10, 18)
COLOR_LANE_ODD     = QColor(16, 16, 28)
COLOR_LANE_EVEN    = QColor(20, 20, 36)
COLOR_LANE_LINE    = QColor(38, 38, 58)
COLOR_HIT_LINE     = QColor(180, 180, 255)
COLOR_NOTE_DEFAULT = QColor(90, 130, 255)
COLOR_PERFECT      = QColor(50, 220, 80)
COLOR_OK           = QColor(230, 200, 40)
COLOR_MISS         = QColor(220, 50,  50)
COLOR_TEXT         = QColor(210, 210, 235)
COLOR_DIM          = QColor(60,  60,  90)
COLOR_PROGRESS_BG  = QColor(30,  30,  48)
COLOR_PROGRESS_FG  = QColor(90, 150, 255)

# Cordas do violino: de cima para baixo como o instrumento é segurado
VIOLIN_STRINGS = ["E", "A", "D", "G"]

# Faixa MIDI por corda (aproximada)
STRING_MIDI_RANGES = {
    "G": (43, 62),
    "D": (50, 69),
    "A": (57, 76),
    "E": (64, 84),
}

# Cores de fundo por faixa (E, A, D, G)
LANE_BG_COLORS = [
    QColor(14, 14, 26),   # E — roxo-escuro
    QColor(18, 16, 28),   # A
    QColor(14, 18, 26),   # D
    QColor(16, 14, 28),   # G
]

LANE_ACCENT_COLORS = [
    QColor(100, 80, 220, 30),   # E — roxo sutil
    QColor(80, 120, 220, 30),   # A — azul
    QColor(60, 160, 200, 30),   # D — ciano
    QColor(80, 200, 140, 30),   # G — verde
]


def _lane_for_note(midi: int) -> int:
    """Retorna índice de faixa 0-3 (0=E topo, 3=G baixo)."""
    # Prioriza a corda mais grave que ainda cobre a nota
    for i, string in enumerate(VIOLIN_STRINGS):
        lo, hi = STRING_MIDI_RANGES[string]
        if lo <= midi <= hi:
            return i
    return 0


def _note_color(grade: Optional[HitGrade]) -> QColor:
    if grade == HitGrade.PERFECT:
        return COLOR_PERFECT
    if grade == HitGrade.OK:
        return COLOR_OK
    if grade == HitGrade.MISS:
        return COLOR_MISS
    return COLOR_NOTE_DEFAULT


# ---------------------------------------------------------------------------
# Flash de hit
# ---------------------------------------------------------------------------

class HitFlash:
    def __init__(self, grade: HitGrade, lane: int) -> None:
        self.grade = grade
        self.lane  = lane
        self.alpha = 1.0
        self.color = _note_color(grade)

    def tick(self, dt: float = 0.016) -> bool:
        self.alpha -= dt * 3.5
        return self.alpha > 0.0


# ---------------------------------------------------------------------------
# GameView
# ---------------------------------------------------------------------------

class GameView(QWidget):
    """
    Highway horizontal estilo piano-roll.

    Notas vêm da direita, cruzam a hit line e saem pela esquerda.
    """

    SCROLL_SPEED   = 220.0   # px por segundo
    HIT_LINE_X     = 0.20    # posição da hit line (fração da largura)
    NOTE_H_FRAC    = 0.60    # altura da nota como fração da faixa
    NOTE_RADIUS    = 6
    LABEL_ZONE_W   = 32      # largura reservada para o nome da corda (px)

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setMinimumSize(500, 300)

        self._snapshot: Optional[GameSnapshot] = None
        self._flashes: deque[HitFlash] = deque()
        self._note_colors: dict[int, QColor] = {}
        self._total_duration: float = 0.0

        self._render_timer = QTimer(self)
        self._render_timer.setInterval(16)
        self._render_timer.timeout.connect(self._tick)
        self._render_timer.start()

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------

    def update_snapshot(self, snap: GameSnapshot) -> None:
        self._snapshot = snap

    def update_hit(self, hit: HitResult) -> None:
        if hit.expected_note is None:
            return
        lane = _lane_for_note(hit.expected_note.midi_number)
        self._flashes.append(HitFlash(hit.grade, lane))
        while len(self._flashes) > 20:
            self._flashes.popleft()

    def set_note_color(self, midi: int, color: QColor) -> None:
        self._note_colors[midi] = color

    def set_score_duration(self, duration: float) -> None:
        self._total_duration = duration

    # ------------------------------------------------------------------
    # Timer interno
    # ------------------------------------------------------------------

    def _tick(self) -> None:
        self._flashes = deque(f for f in self._flashes if f.tick())
        self.update()

    # ------------------------------------------------------------------
    # Pintura
    # ------------------------------------------------------------------

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)

        w, h = self.width(), self.height()
        p.fillRect(self.rect(), COLOR_BG)

        lane_h  = h / 4
        hit_x   = w * self.HIT_LINE_X

        self._draw_lanes(p, w, h, lane_h, hit_x)
        self._draw_notes(p, w, h, lane_h, hit_x)
        self._draw_hit_line(p, h, lane_h, hit_x)
        self._draw_flashes(p, h, lane_h, hit_x)
        self._draw_hud(p, w, h)
        self._draw_progress_bar(p, w, h)

        p.end()

    def _draw_lanes(self, p, w, h, lane_h, hit_x) -> None:
        for i in range(4):
            y = i * lane_h

            # Fundo
            p.fillRect(QRectF(0, y, w, lane_h), LANE_BG_COLORS[i])

            # Destaque sutil
            p.fillRect(QRectF(hit_x, y, w - hit_x, lane_h), LANE_ACCENT_COLORS[i])

            # Linha divisória
            p.setPen(QPen(COLOR_LANE_LINE, 1))
            p.drawLine(QPointF(0, y + lane_h), QPointF(w, y + lane_h))

            # Nome da corda (à esquerda da hit line)
            p.setPen(QPen(COLOR_DIM))
            p.setFont(QFont("Arial", 13, QFont.Weight.Bold))
            p.drawText(
                QRectF(6, y, hit_x - 10, lane_h),
                Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft,
                VIOLIN_STRINGS[i],
            )

    def _draw_notes(self, p, w, h, lane_h, hit_x) -> None:
        if not self._snapshot or self._snapshot.state not in (
            GameState.PLAYING, GameState.PAUSED
        ):
            return

        elapsed = self._snapshot.elapsed_sec
        note_h  = lane_h * self.NOTE_H_FRAC
        pad_y   = (lane_h - note_h) / 2

        for note in self._snapshot.next_notes:
            if note.is_rest:
                continue

            lane   = _lane_for_note(note.midi_number)
            y      = lane * lane_h + pad_y
            dt     = note.start_time - elapsed
            x      = hit_x + dt * self.SCROLL_SPEED
            note_w = max(16, note.duration * self.SCROLL_SPEED - 4)

            # Pula se fora da tela
            if x + note_w < 0 or x > w:
                continue

            color = self._note_colors.get(note.midi_number, COLOR_NOTE_DEFAULT)
            rect  = QRectF(x, y, note_w, note_h)

            # Gradiente vertical
            grad = QLinearGradient(x, y, x, y + note_h)
            grad.setColorAt(0.0, color.lighter(125))
            grad.setColorAt(1.0, color.darker(115))

            p.setBrush(QBrush(grad))
            p.setPen(QPen(color.lighter(160), 1.2))
            p.drawRoundedRect(rect, self.NOTE_RADIUS, self.NOTE_RADIUS)

            # Nome da nota
            if note_w > 28:
                p.setPen(QPen(Qt.GlobalColor.white))
                p.setFont(QFont("Arial", 8, QFont.Weight.Bold))
                p.drawText(rect, Qt.AlignmentFlag.AlignCenter, note.note_name)

    def _draw_hit_line(self, p, h, lane_h, hit_x) -> None:
        # Sombra
        p.setPen(QPen(QColor(0, 0, 0, 80), 6))
        p.drawLine(QPointF(hit_x - 1, 0), QPointF(hit_x - 1, h))

        # Linha principal
        p.setPen(QPen(COLOR_HIT_LINE, 2))
        p.drawLine(QPointF(hit_x, 0), QPointF(hit_x, h))

        # Círculo indicador em cada faixa
        for i in range(4):
            cy = i * lane_h + lane_h / 2
            p.setBrush(QBrush(LANE_BG_COLORS[i]))
            p.setPen(QPen(COLOR_HIT_LINE, 2))
            p.drawEllipse(QPointF(hit_x, cy), 13, 13)

    def _draw_flashes(self, p, h, lane_h, hit_x) -> None:
        for flash in self._flashes:
            alpha = int(flash.alpha * 160)
            c = QColor(flash.color)
            c.setAlpha(alpha)

            y = flash.lane * lane_h
            p.fillRect(QRectF(hit_x - 28, y + 4, 56, lane_h - 8), c)

            if flash.alpha > 0.5:
                tc = QColor(flash.color)
                tc.setAlpha(int(flash.alpha * 255))
                p.setPen(QPen(tc))
                p.setFont(QFont("Arial", 12, QFont.Weight.Bold))
                p.drawText(
                    QRectF(hit_x + 18, y, 90, lane_h),
                    Qt.AlignmentFlag.AlignVCenter,
                    flash.grade.value,
                )

    def _draw_hud(self, p, w, h) -> None:
        if not self._snapshot:
            return
        snap = self._snapshot

        pw, ph = 150, 88
        px = w - pw - 10
        py = 10
        p.fillRect(QRectF(px, py, pw, ph), QColor(0, 0, 0, 140))

        p.setPen(QPen(COLOR_TEXT))
        p.setFont(QFont("Arial", 15, QFont.Weight.Bold))
        p.drawText(QRectF(px, py + 4, pw, 26), Qt.AlignmentFlag.AlignCenter,
                   f"{snap.total_score:,}")

        color_combo = COLOR_OK if snap.combo > 0 else COLOR_DIM
        p.setPen(QPen(color_combo))
        p.setFont(QFont("Arial", 10))
        p.drawText(QRectF(px, py + 30, pw, 20), Qt.AlignmentFlag.AlignCenter,
                   f"×{snap.combo} combo")

        p.setPen(QPen(COLOR_DIM))
        p.setFont(QFont("Arial", 9))
        p.drawText(QRectF(px, py + 50, pw, 18), Qt.AlignmentFlag.AlignCenter,
                   f"✓{snap.perfect_count}  ~{snap.ok_count}  ✗{snap.miss_count}")

        acc_c = (COLOR_PERFECT if snap.accuracy_pct >= 90 else
                 COLOR_OK      if snap.accuracy_pct >= 70 else COLOR_MISS)
        p.setPen(QPen(acc_c))
        p.setFont(QFont("Arial", 9, QFont.Weight.Bold))
        p.drawText(QRectF(px, py + 68, pw, 18), Qt.AlignmentFlag.AlignCenter,
                   f"{snap.accuracy_pct:.0f}% precisão")

    def _draw_progress_bar(self, p, w, h) -> None:
        bar_h = 4
        bar_y = h - bar_h
        p.fillRect(QRectF(0, bar_y, w, bar_h), COLOR_PROGRESS_BG)
        if self._total_duration > 0 and self._snapshot:
            ratio = min(1.0, self._snapshot.elapsed_sec / self._total_duration)
            p.fillRect(QRectF(0, bar_y, w * ratio, bar_h), COLOR_PROGRESS_FG)
