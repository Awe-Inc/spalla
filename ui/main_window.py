"""
main_window.py — Janela principal do Violin Hero.

Layout:
  ┌─────────────────────────────────────────────────────────────┐
  │ [📂 Abrir] [▶] [⏸] [⏹]  🥁 BPM: [−][120][+]  🎤 [mic]  │
  ├──────────────────────────────────────────────┬──────────────┤
  │  Highway horizontal (E A D G de cima p/ baixo)│  Afinador   │
  │  notas vêm da direita  →  hit line  →  saem  │  (tuner)    │
  ├──────────────────────────────────────────────┴──────────────┤
  │  Partitura real (verovio) — notação musical scrolling       │
  └─────────────────────────────────────────────────────────────┘
  │ Nota: A4 440Hz  ·  0:12/3:45  ·  95% precisão  ·  ×3 combo│
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from PyQt6.QtCore import Qt, pyqtSignal, QObject
from PyQt6.QtGui import QAction, QColor, QFont
from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QToolBar, QStatusBar, QFileDialog, QComboBox,
    QLabel, QMessageBox, QSplitter, QSpinBox, QPushButton,
)

from core.audio_engine import AudioEngine
from core.score_engine  import ScoreEngine
from core.game_engine   import GameEngine, GameState, HitResult, HitGrade, GameSnapshot
from core.tuner         import Tuner, TunerReading
from core.audio_engine  import PitchResult

from ui.game_view    import GameView
from ui.tuner_widget import TunerWidget
from ui.score_view   import ScoreView


# ---------------------------------------------------------------------------
# Bridge thread-safe
# ---------------------------------------------------------------------------

class GameBridge(QObject):
    hit_signal      = pyqtSignal(object)
    tick_signal     = pyqtSignal(object)
    state_signal    = pyqtSignal(object)
    finished_signal = pyqtSignal()
    reading_signal  = pyqtSignal(object)   # TunerReading
    pitch_signal    = pyqtSignal(object)   # PitchResult raw (para tuner durante jogo)


# ---------------------------------------------------------------------------
# Janela principal
# ---------------------------------------------------------------------------

class MainWindow(QMainWindow):

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Violin Hero 🎻")
        self.resize(1440, 840)
        self._apply_theme()

        # Engines
        self._audio_engine: Optional[AudioEngine] = None
        self._score_engine: Optional[ScoreEngine] = None
        self._game_engine:  Optional[GameEngine]  = None
        self._tuner:        Optional[Tuner]        = None

        # BPM original da partitura (para calcular scale)
        self._score_original_bpm: float = 120.0

        # Bridge thread → main
        self._bridge = GameBridge()
        self._bridge.hit_signal.connect(self._on_hit)
        self._bridge.tick_signal.connect(self._on_tick)
        self._bridge.state_signal.connect(self._on_state_change)
        self._bridge.finished_signal.connect(self._on_finished)
        self._bridge.reading_signal.connect(self._on_tuner_reading)
        self._bridge.pitch_signal.connect(self._on_pitch_raw)

        self._build_ui()
        self._init_audio()

    # ──────────────────────────────────────────────────────────────────
    # Construção da UI
    # ──────────────────────────────────────────────────────────────────

    def _build_ui(self) -> None:
        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        self._build_toolbar()

        # ── Área principal ────────────────────────────────────────────
        # Splitter vertical: cima = highway+tuner, baixo = partitura
        v_splitter = QSplitter(Qt.Orientation.Vertical)
        v_splitter.setHandleWidth(2)

        # -- Painel superior: highway (esquerda) + tuner (direita) ----
        top_widget = QWidget()
        top_layout = QHBoxLayout(top_widget)
        top_layout.setContentsMargins(0, 0, 0, 0)
        top_layout.setSpacing(0)

        self._game_view    = GameView()
        self._tuner_widget = TunerWidget()
        self._tuner_widget.setMinimumWidth(150)
        self._tuner_widget.setMaximumWidth(195)

        top_layout.addWidget(self._game_view, stretch=1)
        top_layout.addWidget(self._tuner_widget, stretch=0)

        # -- Painel inferior: partitura real ---------------------------
        self._score_view = ScoreView()
        self._score_view.setMinimumHeight(140)

        v_splitter.addWidget(top_widget)
        v_splitter.addWidget(self._score_view)
        v_splitter.setSizes([520, 220])
        v_splitter.setCollapsible(0, False)
        v_splitter.setCollapsible(1, False)

        root.addWidget(v_splitter)

        # ── Status bar ────────────────────────────────────────────────
        self._status = QStatusBar()
        self._status.setFixedHeight(28)
        self.setStatusBar(self._status)

        self._lbl_note  = QLabel("—")
        self._lbl_time  = QLabel("0:00 / 0:00")
        self._lbl_acc   = QLabel("")
        self._lbl_combo = QLabel("")

        for lbl in (self._lbl_note, self._lbl_time, self._lbl_acc, self._lbl_combo):
            lbl.setFont(QFont("Segoe UI", 10))
            self._status.addWidget(lbl)
            self._status.addWidget(_dot())

        self._status.showMessage("Abra uma partitura MusicXML para começar  ·  🎤 Afinador ativo")

    def _build_toolbar(self) -> None:
        tb = QToolBar()
        tb.setMovable(False)
        tb.setFloatable(False)
        tb.setFixedHeight(50)
        tb.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextBesideIcon)
        self.addToolBar(tb)

        # Abrir
        self._act_open = QAction("📂  Abrir", self)
        self._act_open.setToolTip("Abrir partitura MusicXML")
        self._act_open.triggered.connect(self._open_score)
        tb.addAction(self._act_open)

        tb.addSeparator()

        # Playback
        self._act_play = QAction("▶  Play", self)
        self._act_play.setEnabled(False)
        self._act_play.triggered.connect(self._play)
        tb.addAction(self._act_play)

        self._act_pause = QAction("⏸  Pausa", self)
        self._act_pause.setEnabled(False)
        self._act_pause.triggered.connect(self._pause)
        tb.addAction(self._act_pause)

        self._act_stop = QAction("⏹  Stop", self)
        self._act_stop.setEnabled(False)
        self._act_stop.triggered.connect(self._stop)
        tb.addAction(self._act_stop)

        tb.addSeparator()

        # BPM — estilo metrônomo
        tb.addWidget(_tb_label("🥁  BPM:"))

        self._btn_bpm_minus = QPushButton("−")
        self._btn_bpm_minus.setFixedSize(28, 28)
        self._btn_bpm_minus.setStyleSheet(_btn_style())
        self._btn_bpm_minus.clicked.connect(lambda: self._bpm_spin.setValue(
            self._bpm_spin.value() - 5))
        tb.addWidget(self._btn_bpm_minus)

        self._bpm_spin = QSpinBox()
        self._bpm_spin.setRange(20, 300)
        self._bpm_spin.setValue(120)
        self._bpm_spin.setFixedWidth(68)
        self._bpm_spin.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._bpm_spin.setFont(QFont("Segoe UI", 13, QFont.Weight.Bold))
        self._bpm_spin.setStyleSheet("""
            QSpinBox {
                background: #1a1a2e;
                color: #c0c0ff;
                border: 1px solid #3a3a6a;
                border-radius: 5px;
                padding: 2px 4px;
            }
            QSpinBox::up-button, QSpinBox::down-button { width: 0; }
        """)
        self._bpm_spin.valueChanged.connect(self._on_bpm_changed)
        tb.addWidget(self._bpm_spin)

        self._btn_bpm_plus = QPushButton("+")
        self._btn_bpm_plus.setFixedSize(28, 28)
        self._btn_bpm_plus.setStyleSheet(_btn_style())
        self._btn_bpm_plus.clicked.connect(lambda: self._bpm_spin.setValue(
            self._bpm_spin.value() + 5))
        tb.addWidget(self._btn_bpm_plus)

        tb.addSeparator()

        # Microfone
        tb.addWidget(_tb_label("🎤  Mic:"))
        self._mic_combo = QComboBox()
        self._mic_combo.setMinimumWidth(200)
        self._mic_combo.setMaximumWidth(340)
        tb.addWidget(self._mic_combo)

    # ──────────────────────────────────────────────────────────────────
    # Áudio / Tuner
    # ──────────────────────────────────────────────────────────────────

    def _init_audio(self) -> None:
        try:
            import sounddevice as sd

            try:
                default_info = sd.query_devices(kind='input')
                default_name = default_info.get('name', '')
            except Exception:
                default_name = ''

            devices = AudioEngine.list_input_devices()
            default_combo_idx  = 0
            default_device_idx = None

            for i, dev in enumerate(devices):
                self._mic_combo.addItem(f"[{dev['index']}] {dev['name']}", dev['index'])
                if default_name and default_name in dev['name']:
                    default_combo_idx  = i
                    default_device_idx = dev['index']

            self._mic_combo.setCurrentIndex(default_combo_idx)

            self._audio_engine = AudioEngine(
                callback=lambda r: None, device=default_device_idx
            )

            # Tuner inicia IMEDIATAMENTE
            self._tuner = Tuner(self._audio_engine)
            self._tuner.on_reading = lambda r: self._bridge.reading_signal.emit(r)
            self._tuner.start()

            self._mic_combo.currentIndexChanged.connect(self._on_mic_changed)

        except Exception as e:
            self._status.showMessage(f"⚠  Microfone não disponível — {e}")

    def _on_mic_changed(self) -> None:
        if not self._audio_engine:
            return
        idx = self._mic_combo.currentData()
        if self._tuner:
            self._tuner.stop()
        if self._audio_engine.is_running:
            self._audio_engine.stop()
        self._audio_engine = AudioEngine(callback=lambda r: None, device=idx)
        if self._tuner:
            self._tuner._audio = self._audio_engine
            self._tuner.start()

    # ──────────────────────────────────────────────────────────────────
    # Ações da toolbar
    # ──────────────────────────────────────────────────────────────────

    def _open_score(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self, "Abrir Partitura",
            str(Path.home()),
            "MusicXML (*.xml *.musicxml *.mxl);;Todos (*)",
        )
        if not path:
            return
        try:
            self._score_engine = ScoreEngine(path)
            self._score_original_bpm = self._score_engine.bpm

            # Popula o spinbox com o BPM da partitura (sem disparar on_bpm_changed)
            self._bpm_spin.blockSignals(True)
            self._bpm_spin.setValue(int(round(self._score_original_bpm)))
            self._bpm_spin.blockSignals(False)
            self._score_engine.tempo_scale = 1.0

            self._game_view.set_score_duration(self._score_engine.duration_seconds)
            self._score_view.load_score(self._score_engine)

            self._act_play.setEnabled(True)
            name = Path(path).stem
            d = self._score_engine.duration_seconds
            self._status.showMessage(
                f"✓  {name}   ·   "
                f"{self._score_engine.bpm:.0f} BPM original   ·   "
                f"{self._score_engine.time_signature}   ·   "
                f"{int(d)//60}:{int(d)%60:02d}   ·   "
                f"{len(self._score_engine.notes)} notas"
            )
        except Exception as e:
            QMessageBox.critical(self, "Erro ao abrir partitura", str(e))

    def _play(self) -> None:
        if not self._score_engine or not self._audio_engine:
            return

        if self._game_engine and self._game_engine.state == GameState.PAUSED:
            self._game_engine.resume()
            return

        # Aplica BPM selecionado
        target_bpm = self._bpm_spin.value()
        scale = target_bpm / max(1.0, self._score_original_bpm)
        self._score_engine.tempo_scale = scale
        self._game_view.set_score_duration(self._score_engine.duration_seconds)
        # Só recarrega a partitura se o BPM mudou (evita reload desnecessário)
        if abs(scale - 1.0) > 0.01:
            self._score_view.load_score(self._score_engine)

        self._game_engine = GameEngine(self._score_engine, self._audio_engine)
        self._game_engine.on_hit          = lambda r: self._bridge.hit_signal.emit(r)
        self._game_engine.on_tick         = lambda s: self._bridge.tick_signal.emit(s)
        self._game_engine.on_state_change = lambda s: self._bridge.state_signal.emit(s)
        self._game_engine.on_finished     = lambda:   self._bridge.finished_signal.emit()

        # Tuner continua funcionando durante o jogo via on_pitch_raw
        self._game_engine.on_pitch_raw = lambda pr: self._bridge.pitch_signal.emit(pr)

        # Para o tuner standalone (game engine assume o audio)
        if self._tuner:
            self._tuner.stop()

        self._game_engine.start()

    def _pause(self) -> None:
        if self._game_engine:
            if self._game_engine.state == GameState.PLAYING:
                self._game_engine.pause()
            elif self._game_engine.state == GameState.PAUSED:
                self._game_engine.resume()

    def _stop(self) -> None:
        if self._game_engine:
            self._game_engine.stop()

    def _on_bpm_changed(self, value: int) -> None:
        # Feedback visual apenas — scale aplicado ao pressionar Play
        pass

    # ──────────────────────────────────────────────────────────────────
    # Slots
    #
    def _on_hit(self, hit: HitResult) -> None:
        self._game_view.update_hit(hit)
        if hit.expected_note:
            color_map = {
                HitGrade.PERFECT: QColor(50, 220, 80),
                HitGrade.OK:      QColor(230, 200, 40),
                HitGrade.MISS:    QColor(220, 50,  50),
            }
            self._game_view.set_note_color(
                hit.expected_note.midi_number,
                color_map.get(hit.grade, QColor(100, 140, 255)),
            )

    def _on_tick(self, snap: GameSnapshot) -> None:
        self._game_view.update_snapshot(snap)
        self._score_view.set_elapsed(snap.elapsed_sec)

        e = snap.elapsed_sec
        total = self._score_engine.duration_seconds if self._score_engine else 0
        self._lbl_time.setText(
            f"{int(e)//60}:{int(e)%60:02d} / {int(total)//60}:{int(total)%60:02d}"
        )
        n = snap.current_note
        self._lbl_note.setText(
            f"{n.note_name}  {n.frequency:.0f} Hz" if n and not n.is_rest else "—"
        )
        if snap.accuracy_pct > 0:
            self._lbl_acc.setText(f"{snap.accuracy_pct:.0f}% precisao")
        self._lbl_combo.setText(f"x{snap.combo}" if snap.combo > 1 else "")

    def _on_state_change(self, state: GameState) -> None:
        playing  = state == GameState.PLAYING
        paused   = state == GameState.PAUSED
        active   = playing or paused
        has_score = self._score_engine is not None

        self._act_play.setEnabled(has_score and not playing)
        self._act_pause.setEnabled(active)
        self._act_stop.setEnabled(active)
        self._act_pause.setText("Pausa" if playing else "Retomar")

        if not active and self._tuner and self._audio_engine:
            self._tuner._audio = self._audio_engine
            self._tuner.start()

    def _on_finished(self) -> None:
        if not self._game_engine:
            return
        QMessageBox.information(
            self, "Musica concluida",
            f"Pontuacao    {self._game_engine._total_score:,}\n"
            f"Perfeitos    {self._game_engine._perfect_cnt}\n"
            f"Ok           {self._game_engine._ok_cnt}\n"
            f"Erros        {self._game_engine._miss_cnt}\n"
            f"Maior combo  {self._game_engine._max_combo}",
        )
        self._act_play.setEnabled(True)
        self._act_pause.setEnabled(False)
        self._act_stop.setEnabled(False)

        if self._tuner and self._audio_engine:
            self._tuner._audio = self._audio_engine
            self._tuner.start()

    def _on_tuner_reading(self, reading: TunerReading) -> None:
        self._tuner_widget.update_reading(reading)

    def _on_pitch_raw(self, pitch: PitchResult) -> None:
        if self._tuner:
            self._tuner._on_pitch(pitch)

    # ──────────────────────────────────────────────────────────────────
    # Tema
    # ──────────────────────────────────────────────────────────────────

    def _apply_theme(self) -> None:
        self.setStyleSheet("""
            QMainWindow, QWidget {
                background-color: #0a0a14;
                color: #d0d0ee;
                font-family: "Segoe UI", Arial, sans-serif;
            }
            QToolBar {
                background-color: #0e0e1c;
                border-bottom: 1px solid #18182c;
                spacing: 4px;
                padding: 4px 10px;
            }
            QToolButton {
                background-color: #16162a;
                color: #b8b8d8;
                border: 1px solid #242444;
                border-radius: 7px;
                padding: 5px 16px;
                font-size: 13px;
                font-weight: 500;
            }
            QToolButton:hover   { background-color: #1e1e3a; border-color: #4444aa; }
            QToolButton:pressed { background-color: #0e0e22; }
            QToolButton:disabled{ color: #303050; border-color: #181830; }
            QComboBox {
                background-color: #16162a;
                color: #b8b8d8;
                border: 1px solid #242444;
                border-radius: 6px;
                padding: 4px 10px;
                font-size: 12px;
            }
            QComboBox::drop-down { border: none; width: 18px; }
            QComboBox QAbstractItemView {
                background-color: #16162a;
                color: #b8b8d8;
                selection-background-color: #2e2e5a;
                border: 1px solid #242444;
            }
            QStatusBar {
                background-color: #0e0e1c;
                color: #505080;
                border-top: 1px solid #18182c;
                font-size: 11px;
                padding: 2px 8px;
            }
            QSplitter::handle { background-color: #18182c; }
            QLabel { background: transparent; }
            QPushButton {
                background-color: #16162a;
                color: #b8b8d8;
                border: 1px solid #242444;
                border-radius: 5px;
            }
            QPushButton:hover  { background-color: #1e1e3a; }
            QPushButton:pressed{ background-color: #0e0e22; }
        """)

    # ──────────────────────────────────────────────────────────────────
    # Cleanup
    # ──────────────────────────────────────────────────────────────────

    def closeEvent(self, event) -> None:
        if self._game_engine:
            self._game_engine.stop()
        if self._tuner:
            self._tuner.stop()
        if self._audio_engine:
            self._audio_engine.stop()
        event.accept()


# ---------------------------------------------------------------------------
# Helpers visuais
# ---------------------------------------------------------------------------

def _tb_label(text: str) -> QLabel:
    lbl = QLabel(text)
    lbl.setStyleSheet("color: #505080; font-size: 12px; padding: 0 2px;")
    return lbl


def _dot() -> QLabel:
    lbl = QLabel("  .  ")
    lbl.setStyleSheet("color: #282848;")
    return lbl


def _btn_style() -> str:
    return (
        "QPushButton {"
        "  background: #1e1e3a; color: #a0a0e0;"
        "  border: 1px solid #303060; border-radius: 5px;"
        "  font-size: 16px; font-weight: bold;"
        "}"
        "QPushButton:hover  { background: #28285a; }"
        "QPushButton:pressed{ background: #141430; }"
    )
