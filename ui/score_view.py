"""
score_view.py — Partitura em tempo real.

Modo 1 (WebEngine): verovio gera o SVG; Chromium embutido renderiza
                    notação real (pauta, clave, cabeças de nota).
                    Requer: pip install PyQt6-WebEngine

Modo 2 (Piano roll): fallback QPainter se WebEngine não estiver disponível.
"""

from __future__ import annotations

from typing import Optional

from PyQt6.QtCore    import Qt, QRectF, QPointF
from PyQt6.QtGui     import (
    QPainter, QColor, QPen, QFont, QBrush, QPolygon,
)
from PyQt6.QtWidgets import QWidget, QVBoxLayout

from core.score_engine import ScoreEngine, ScoreNote


# ---------------------------------------------------------------------------
# Paleta piano roll
# ---------------------------------------------------------------------------

COLOR_BG_ROLL  = QColor(12, 10, 20)
COLOR_GRID     = QColor(28, 28, 48)
COLOR_MEASURE  = QColor(50, 50, 80)
COLOR_TXT_ROLL = QColor(70, 70, 110)
COLOR_NOTE_FUT = QColor(70, 110, 230)
COLOR_NOTE_NOW = QColor(50, 220,  80)
COLOR_NOTE_PST = QColor(45,  45,  70)
COLOR_CURSOR   = QColor(200,  50,  50, 220)
COLOR_PROG_BG  = QColor(30,  30,  48)
COLOR_PROGRESS = QColor(90, 150, 255)

VIOLIN_STRINGS     = ["E", "A", "D", "G"]
STRING_MIDI_RANGES = {
    "G": (43, 62), "D": (50, 69), "A": (57, 76), "E": (64, 84),
}
LANE_BG = [
    QColor(10, 10, 20), QColor(12, 12, 22),
    QColor(10, 12, 20), QColor(12, 10, 20),
]

CURSOR_X_FRAC = 0.18
PX_PER_SECOND = 70.0
NOTE_H_FRAC   = 0.55
NOTE_RADIUS   = 4


def _lane_for_note(midi: int) -> int:
    for i, s in enumerate(VIOLIN_STRINGS):
        lo, hi = STRING_MIDI_RANGES[s]
        if lo <= midi <= hi:
            return i
    return 0


# ---------------------------------------------------------------------------
# ScoreView
# ---------------------------------------------------------------------------

class ScoreView(QWidget):
    """
    Painel de partitura inferior.

    Prefere WebEngine + verovio (notação real).
    Cai no piano roll QPainter se WebEngine não estiver instalado.
    """

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setMinimumSize(200, 120)

        self._web_view   = None          # QWebEngineView quando disponível
        self._mode       = "empty"       # "webengine" | "roll" | "empty"
        self._page_ready = False         # True só após loadFinished
        self._duration   = 1.0
        self._elapsed    = 0.0
        self._notes:    list[ScoreNote] = []
        self._bpm:      float = 120.0

        self._try_init_webengine()

    # ------------------------------------------------------------------
    # WebEngine init
    # ------------------------------------------------------------------

    def _try_init_webengine(self) -> None:
        try:
            # Windows: expõe as DLLs do Qt ao loader do Python
            import os, PyQt6 as _pq6
            _qt_dir = os.path.dirname(_pq6.__file__)
            try:
                os.add_dll_directory(_qt_dir)
                _bin = os.path.join(_qt_dir, "Qt6", "bin")
                if os.path.isdir(_bin):
                    os.add_dll_directory(_bin)
            except (AttributeError, OSError):
                pass

            from PyQt6.QtWebEngineWidgets import QWebEngineView

            self._web_view = QWebEngineView(self)
            self._web_view.loadFinished.connect(self._on_page_loaded)
            layout = QVBoxLayout(self)
            layout.setContentsMargins(0, 0, 0, 0)
            layout.addWidget(self._web_view)
            self._mode = "webengine_empty"
            print("[ScoreView] WebEngine ativo ✓")

        except Exception as e:
            print(f"[ScoreView] WebEngine falhou ({type(e).__name__}): {e}")
            print("[ScoreView] Piano roll ativo como fallback")

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------

    def load_score(self, score_engine: ScoreEngine) -> None:
        self._notes    = score_engine.notes
        self._duration = max(score_engine.duration_seconds, 1.0)
        self._bpm      = score_engine.bpm
        self._elapsed  = 0.0

        if self._web_view is not None:
            self._load_notation(score_engine)
        else:
            self._mode = "roll"
            self.update()

    def _on_page_loaded(self, ok: bool) -> None:
        self._page_ready = True
        # Posiciona imediatamente no tempo atual
        if self._mode == "webengine":
            progress = max(0.0, min(1.0, self._elapsed / self._duration))
            self._web_view.page().runJavaScript(f"seek({progress:.5f})")

    def set_elapsed(self, elapsed: float) -> None:
        self._elapsed = elapsed
        if self._mode == "webengine" and self._web_view is not None and self._page_ready:
            progress = max(0.0, min(1.0, elapsed / self._duration))
            # Guard JS: só chama se seek estiver definido
            self._web_view.page().runJavaScript(
                f"if(typeof seek==='function')seek({progress:.5f})"
            )
        elif self._mode not in ("webengine", "webengine_empty"):
            self.update()

    # ------------------------------------------------------------------
    # WebEngine: carrega verovio → HTML com SVG scrollável
    # ------------------------------------------------------------------

    def _load_notation(self, score_engine: ScoreEngine) -> None:
        try:
            import verovio
            tk = verovio.toolkit()
            tk.setOptions({
                "pageWidth":       80_000,
                "pageHeight":      1200,
                "scale":           65,
                "adjustPageWidth": True,
                "breaks":          "none",
                "spacingSystem":   12,
                "spacingStaff":    12,
            })
            tk.loadFile(str(score_engine.filepath))
            svg_str = tk.renderToSVG(1)
            if not svg_str:
                raise ValueError("SVG vazio")

            self._page_ready = False   # reseta: nova página a carregar
            self._web_view.setHtml(self._build_html(svg_str))
            self._mode = "webengine"
            print("[ScoreView] notação real carregada ✓")

        except ImportError:
            print("[ScoreView] verovio não instalado")
            self._mode = "roll"
            self.update()
        except Exception as e:
            print(f"[ScoreView] erro verovio: {e}")
            self._mode = "roll"
            self.update()

    def _build_html(self, svg_str: str) -> str:
        import re as _re
        # Verovio embeds a scoped <style> tag that uses its own random id, e.g.:
        #   #abc123 path { stroke:currentColor }
        # If we later change svgEl.id in JS (to 'score-svg'), that scoped rule
        # stops matching and ALL strokes disappear — staff lines, barlines, stems.
        # Fix: replace the random id with 'score-svg' in the SVG string itself,
        # so the embedded style already targets the correct id before the page loads.
        _m = _re.match(r'<svg[^>]+\bid="([^"]+)"', svg_str)
        if _m:
            svg_str = svg_str.replace(_m.group(1), "score-svg")

        cp = CURSOR_X_FRAC
        return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  html, body {{
    width:100%; height:100%;
    background:#f8f4ec;
    overflow:hidden;
  }}
  #score-svg {{
    position:absolute;
    top:0; left:0;
    height:100vh;
    width:auto;
    transform-origin:0 0;
    display:block;
  }}
  /* NOTE: vector-effect:non-scaling-stroke was removed — it defeats the viewBox
     scaling and would make stroke-width=13 render as 13 screen pixels (blobs). */
  #cursor {{
    position:fixed;
    left:{cp*100:.1f}%;
    top:0; bottom:0;
    width:2px;
    background:rgba(200,50,50,0.80);
    pointer-events:none;
    z-index:999;
  }}
  #cursor::before {{
    content:'';
    position:absolute;
    top:0; left:-5px;
    border-left:6px solid transparent;
    border-right:6px solid transparent;
    border-top:10px solid rgba(200,50,50,0.85);
  }}
</style>
</head>
<body>
<div id="cursor"></div>
{svg_str}
<script>
var svgEl = null;
var totalW = 0;
var cursorFrac = {cp:.5f};

function computeWidth() {{
  if (!svgEl) return 0;
  /* Use the inner SVG's viewBox aspect ratio to compute the rendered content width.
     The inner SVG (class="definition-scale") has a viewBox but no explicit w/h,
     so it fills the outer SVG. The outer SVG is sized to 100vh tall by CSS.
     Content width = innerHeight * (viewBoxW / viewBoxH). */
  var inner = svgEl.querySelector('svg');
  var vb = inner && inner.viewBox && inner.viewBox.baseVal;
  if (vb && vb.height > 0) {{
    return window.innerHeight * (vb.width / vb.height);
  }}
  return svgEl.getBoundingClientRect().width;
}}

function init() {{
  /* The SVG id was pre-set to 'score-svg' in Python before injecting into HTML,
     so the embedded verovio style rules (#score-svg path {{ stroke:currentColor }})
     already match. Do NOT change svgEl.id here — that would break those rules. */
  svgEl = document.getElementById('score-svg');
  if (!svgEl) return;
  totalW = computeWidth();
}}

function seek(progress) {{
  if (!svgEl) init();
  if (!svgEl) return;
  if (totalW <= 0) totalW = computeWidth();
  if (totalW <= 0) return;
  var cursorX = window.innerWidth * cursorFrac;
  svgEl.style.transform = 'translateX(' + (cursorX - progress * totalW) + 'px)';
}}

window.addEventListener('load', function() {{
  init();
  seek(0);
}});

/* Recalcula ao redimensionar — Qt reajusta o widget após o layout estabilizar */
window.addEventListener('resize', function() {{
  totalW = computeWidth();
}});
</script>
</body>
</html>"""

    # ------------------------------------------------------------------
    # Piano roll fallback (paintEvent)
    # ------------------------------------------------------------------

    def paintEvent(self, event) -> None:
        if self._mode == "webengine" or self._mode == "webengine_empty":
            # WebEngine tem seu próprio widget, não precisa de paintEvent
            return

        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)

        if self._mode == "roll":
            self._paint_roll(p)
        else:
            p.fillRect(self.rect(), COLOR_BG_ROLL)
            p.setPen(QPen(QColor(60, 60, 100)))
            p.setFont(QFont("Segoe UI", 11))
            p.drawText(
                self.rect(), Qt.AlignmentFlag.AlignCenter,
                "Abra uma partitura MusicXML para começar\n\n"
                "Para notação real: pip install PyQt6-WebEngine",
            )

        p.end()

    def _paint_roll(self, p: QPainter) -> None:
        w, h = self.width(), self.height()
        p.fillRect(self.rect(), COLOR_BG_ROLL)

        if not self._notes:
            p.setPen(QPen(QColor(60, 60, 100)))
            p.setFont(QFont("Segoe UI", 11))
            p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter,
                       "Nenhuma nota na partitura")
            return

        lane_h   = h / 4
        cursor_x = w * CURSOR_X_FRAC
        note_h   = lane_h * NOTE_H_FRAC
        pad_y    = (lane_h - note_h) / 2
        elapsed  = self._elapsed

        # Faixas
        for i in range(4):
            y = i * lane_h
            p.fillRect(QRectF(0, y, w, lane_h), LANE_BG[i])
            p.setPen(QPen(COLOR_GRID, 1))
            p.drawLine(QPointF(0, y + lane_h), QPointF(w, y + lane_h))
            p.setPen(QPen(COLOR_TXT_ROLL))
            p.setFont(QFont("Arial", 9, QFont.Weight.Bold))
            p.drawText(
                QRectF(4, y, cursor_x - 6, lane_h),
                Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft,
                VIOLIN_STRINGS[i],
            )

        # Linhas de compasso
        if self._bpm > 0:
            ms = (4 * 60.0) / self._bpm
            lt = elapsed - cursor_x / PX_PER_SECOND
            rt = lt + w / PX_PER_SECOND
            p.setPen(QPen(COLOR_MEASURE, 1))
            p.setFont(QFont("Arial", 7))
            for m_idx in range(max(0, int(lt / ms)), int(rt / ms) + 2):
                t = m_idx * ms
                x = cursor_x + (t - elapsed) * PX_PER_SECOND
                if 0 <= x <= w:
                    p.drawLine(QPointF(x, 0), QPointF(x, h))
                    p.setPen(QPen(COLOR_TXT_ROLL))
                    p.drawText(QPointF(x + 2, 10), str(m_idx + 1))
                    p.setPen(QPen(COLOR_MEASURE, 1))

        # Notas
        for note in self._notes:
            if note.is_rest:
                continue
            dt = note.start_time - elapsed
            x  = cursor_x + dt * PX_PER_SECOND
            nw = max(4, note.duration * PX_PER_SECOND - 2)
            if x + nw < 0 or x > w:
                continue
            lane = _lane_for_note(note.midi_number)
            y    = lane * lane_h + pad_y
            rect = QRectF(x, y, nw, note_h)
            if dt < -0.1:
                color = COLOR_NOTE_PST
            elif abs(dt) <= 0.1:
                color = COLOR_NOTE_NOW
            else:
                px = max(0.0, min(1.0, 1.0 - dt / 8.0))
                color = QColor(int(70 + px * 20), int(110 + px * 10),
                               int(230 - px * 30))
            p.setBrush(QBrush(color))
            p.setPen(Qt.PenStyle.NoPen)
            p.drawRoundedRect(rect, NOTE_RADIUS, NOTE_RADIUS)
            if nw > 22 and note_h > 12:
                p.setPen(QPen(QColor(255, 255, 255, 180)))
                p.setFont(QFont("Arial", 7))
                p.drawText(rect, Qt.AlignmentFlag.AlignCenter, note.note_name)

        # Cursor
        p.setPen(QPen(QColor(0, 0, 0, 60), 5))
        p.drawLine(QPointF(cursor_x + 1, 0), QPointF(cursor_x + 1, h))
        p.setPen(QPen(COLOR_CURSOR, 2))
        p.drawLine(QPointF(cursor_x, 0), QPointF(cursor_x, h))
        from PyQt6.QtCore import QPoint
        cx = int(cursor_x)
        tri = QPolygon([QPoint(cx - 5, 0), QPoint(cx + 5, 0), QPoint(cx, 9)])
        p.setBrush(QBrush(COLOR_CURSOR))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawPolygon(tri)

        # Barra de progresso
        progress = max(0.0, min(1.0, elapsed / self._duration))
        bar_y = h - 3
        p.fillRect(QRectF(0, bar_y, w, 3),         COLOR_PROG_BG)
        p.fillRect(QRectF(0, bar_y, w * progress, 3), COLOR_PROGRESS)
