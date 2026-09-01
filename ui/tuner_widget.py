"""
tuner_widget.py — Medidor visual de afinação estilo ponteiro analógico.

Desenha via QPainter:
  - Arco colorido: vermelho (desafinado) → amarelo → verde (afinado)
  - Agulha animada que aponta o desvio em cents
  - Nome da nota no centro
  - Valor em cents no display digital
  - Indicadores flat / in tune / sharp
"""

from __future__ import annotations

import math
from typing import Optional

from PyQt6.QtCore import Qt, QTimer, QRectF, QPointF
from PyQt6.QtGui import (
    QPainter, QPainterPath, QColor, QPen, QBrush,
    QFont, QLinearGradient, QConicalGradient,
)
from PyQt6.QtWidgets import QWidget

from core.tuner import TunerReading


# ---------------------------------------------------------------------------
# Paleta de cores
# ---------------------------------------------------------------------------

COLOR_BG         = QColor(20, 20, 30)
COLOR_ARC_MISS   = QColor(220, 50, 50)
COLOR_ARC_OK     = QColor(220, 180, 40)
COLOR_ARC_TUNE   = QColor(50, 200, 80)
COLOR_NEEDLE     = QColor(240, 240, 255)
COLOR_NEEDLE_TIP = QColor(255, 80, 80)
COLOR_TEXT       = QColor(220, 220, 240)
COLOR_DIM        = QColor(80, 80, 100)
COLOR_GLOW_TUNE  = QColor(50, 200, 80, 60)


class TunerWidget(QWidget):
    """
    Widget de afinador analógico.

    Use update_reading(TunerReading) para atualizar o display.
    Anima suavemente a agulha via interpolação.
    """

    # Arco vai de -135° a +135° (270° total), centro em 270° (apontando para baixo)
    ARC_SPAN_DEG  = 135.0   # metade do arco total
    NEEDLE_SMOOTH = 0.15    # fator de suavização (0=sem, 1=instantâneo)

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setMinimumSize(200, 160)

        self._reading: Optional[TunerReading] = None
        self._needle_pos  = 0.0   # posição atual da agulha [-1, +1] (animada)
        self._target_pos  = 0.0   # posição alvo

        # Timer de animação
        self._anim_timer = QTimer(self)
        self._anim_timer.setInterval(16)  # ~60 fps
        self._anim_timer.timeout.connect(self._animate)
        self._anim_timer.start()

    def update_reading(self, reading: TunerReading) -> None:
        """Chamado pelo Tuner com cada nova leitura."""
        self._reading = reading
        self._target_pos = reading.normalized_offset if not reading.is_silent else 0.0

    # ------------------------------------------------------------------
    # Animação da agulha
    # ------------------------------------------------------------------

    def _animate(self) -> None:
        diff = self._target_pos - self._needle_pos
        if abs(diff) > 0.001:
            self._needle_pos += diff * 0.2
            self.update()

    # ------------------------------------------------------------------
    # Pintura
    # ------------------------------------------------------------------

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)

        w, h = self.width(), self.height()
        cx = w / 2
        cy = h * 0.62   # centro do arco um pouco abaixo do meio

        r = min(w, h) * 0.40   # raio do arco

        # Fundo
        p.fillRect(self.rect(), COLOR_BG)

        # --- Arco colorido ---
        self._draw_arc(p, cx, cy, r)

        # --- Marcadores de cents ---
        self._draw_ticks(p, cx, cy, r)

        # --- Agulha ---
        self._draw_needle(p, cx, cy, r)

        # --- Ponto central ---
        p.setBrush(QBrush(COLOR_DIM))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawEllipse(QPointF(cx, cy), 6, 6)

        # --- Nome da nota ---
        self._draw_note_name(p, cx, cy, r)

        # --- Display de cents ---
        self._draw_cents_display(p, cx, w, h)

        p.end()

    def _draw_arc(self, p: QPainter, cx, cy, r) -> None:
        """Arco colorido de fundo (gradiente vermelho→verde→vermelho)."""
        arc_r = QRectF(cx - r, cy - r, r * 2, r * 2)

        # Arco em 3 segmentos: esquerda (miss), centro (ok→tune), direita (ok→miss)
        pen_width = max(8, r * 0.12)

        # Segmento esquerdo (desafinado)
        self._draw_arc_segment(p, arc_r, 180 + 45, 45, COLOR_ARC_MISS, pen_width)
        # Segmento centro-esquerdo (ok)
        self._draw_arc_segment(p, arc_r, 180 + 45 + 45, 30, COLOR_ARC_OK, pen_width)
        # Segmento centro (afinado)
        self._draw_arc_segment(p, arc_r, 180 + 45 + 45 + 30, 30, COLOR_ARC_TUNE, pen_width)
        # Segmento centro-direito (ok)
        self._draw_arc_segment(p, arc_r, 180 + 45 + 45 + 30 + 30, 30, COLOR_ARC_OK, pen_width)
        # Segmento direito (desafinado)
        self._draw_arc_segment(p, arc_r, 180 + 45 + 45 + 30 + 30 + 30, 45, COLOR_ARC_MISS, pen_width)

    def _draw_arc_segment(self, p, rect, start_deg, span_deg, color, width) -> None:
        pen = QPen(color, width, Qt.PenStyle.SolidLine, Qt.PenCapStyle.FlatCap)
        p.setPen(pen)
        p.setBrush(Qt.BrushStyle.NoBrush)
        # Qt usa ângulos em 1/16 de grau, sentido anti-horário
        p.drawArc(rect, int(start_deg * 16), int(span_deg * 16))

    def _draw_ticks(self, p: QPainter, cx, cy, r) -> None:
        """Marcadores em -50, -25, 0, +25, +50 cents."""
        p.setPen(QPen(COLOR_DIM, 1.5))
        marks = [-1.0, -0.5, 0.0, 0.5, 1.0]
        for norm in marks:
            angle_deg = 270.0 + norm * self.ARC_SPAN_DEG
            angle_rad = math.radians(angle_deg)
            tick_len = r * 0.12 if norm != 0.0 else r * 0.18
            x1 = cx + math.cos(angle_rad) * (r - tick_len)
            y1 = cy - math.sin(angle_rad) * (r - tick_len)
            x2 = cx + math.cos(angle_rad) * r
            y2 = cy - math.sin(angle_rad) * r
            pen = QPen(COLOR_TEXT if norm == 0.0 else COLOR_DIM, 2.0 if norm == 0.0 else 1.0)
            p.setPen(pen)
            p.drawLine(QPointF(x1, y1), QPointF(x2, y2))

    def _draw_needle(self, p: QPainter, cx, cy, r) -> None:
        """Agulha animada."""
        angle_deg = 270.0 + self._needle_pos * self.ARC_SPAN_DEG
        angle_rad = math.radians(angle_deg)

        needle_len = r * 0.88
        tip_len    = r * 0.10

        tx = cx + math.cos(angle_rad) * needle_len
        ty = cy - math.sin(angle_rad) * needle_len

        bx = cx - math.cos(angle_rad) * tip_len
        by = cy + math.sin(angle_rad) * tip_len

        # Sombra
        p.setPen(QPen(QColor(0, 0, 0, 80), 4))
        p.drawLine(QPointF(bx + 1, by + 1), QPointF(tx + 1, ty + 1))

        # Agulha principal
        p.setPen(QPen(COLOR_NEEDLE, 2.5))
        p.drawLine(QPointF(bx, by), QPointF(tx, ty))

        # Ponta colorida
        p.setPen(QPen(COLOR_NEEDLE_TIP, 3))
        tip_x = cx + math.cos(angle_rad) * (needle_len - r * 0.15)
        tip_y = cy - math.sin(angle_rad) * (needle_len - r * 0.15)
        p.drawLine(QPointF(tip_x, tip_y), QPointF(tx, ty))

    def _draw_note_name(self, p: QPainter, cx, cy, r) -> None:
        """Nome da nota no centro do arco."""
        if self._reading and not self._reading.is_silent and self._reading.note_name:
            name = self._reading.note_name
            color = COLOR_ARC_TUNE if abs(self._needle_pos) < 0.2 else COLOR_TEXT
        else:
            name = "—"
            color = COLOR_DIM

        font = QFont("Arial", int(r * 0.28), QFont.Weight.Bold)
        p.setFont(font)
        p.setPen(QPen(color))
        rect = QRectF(cx - r * 0.5, cy - r * 0.5, r, r * 0.7)
        p.drawText(rect, Qt.AlignmentFlag.AlignCenter, name)

    def _draw_cents_display(self, p: QPainter, cx, w, h) -> None:
        """Display digital de cents na parte inferior."""
        if self._reading and not self._reading.is_silent and self._reading.frequency > 0:
            cents = self._reading.cents_offset
            text  = f"{cents:+.1f}¢"
            if abs(cents) <= 5:
                color = COLOR_ARC_TUNE
            elif abs(cents) <= 25:
                color = COLOR_ARC_OK
            else:
                color = COLOR_ARC_MISS
        else:
            text  = "—"
            color = COLOR_DIM

        font = QFont("Courier New", 11, QFont.Weight.Bold)
        p.setFont(font)
        p.setPen(QPen(color))
        p.drawText(
            QRectF(0, h - 28, w, 24),
            Qt.AlignmentFlag.AlignCenter,
            text,
        )
