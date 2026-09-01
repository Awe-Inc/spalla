"""
main.py — Entry point do Violin Hero.

Uso:
    python main.py                     # abre a janela principal
    python main.py --test-audio        # testa captura de microfone por 5s
    python main.py --test-score FILE   # testa parse de MusicXML
"""

import sys
import argparse


def _test_audio() -> None:
    import time
    from core.audio_engine import AudioEngine, PitchResult

    def on_pitch(result: PitchResult) -> None:
        if not result.is_silent and result.frequency > 0:
            arrow = "▲" if result.cents_offset > 0 else ("▼" if result.cents_offset < 0 else "–")
            print(
                f"  {result.note_name:<4}  {result.frequency:7.2f} Hz  "
                f"{result.cents_offset:+.1f}¢ {arrow}  conf={result.confidence:.2f}"
            )

    print("Capturando por 5 segundos — toque uma nota no violino...\n")
    engine = AudioEngine(callback=on_pitch)
    engine.start()
    time.sleep(5)
    engine.stop()
    print("\nEncerrado.")


def _test_score(filepath: str) -> None:
    from core.score_engine import ScoreEngine

    engine = ScoreEngine(filepath)
    print(engine)
    for n in engine.notes[:30]:
        if n.is_rest:
            print(f"  [c{n.measure:02}] t={n.start_time:6.3f}s  PAUSA  dur={n.duration:.3f}s")
        else:
            print(
                f"  [c{n.measure:02}] t={n.start_time:6.3f}s  "
                f"{n.note_name:<4}  {n.frequency:7.2f} Hz  dur={n.duration:.3f}s"
            )


def _launch_ui() -> None:
    import os

    # WebEngine: variáveis de ambiente (antes de tudo)
    os.environ.setdefault("QTWEBENGINE_CHROMIUM_FLAGS", "--no-sandbox")
    os.environ.setdefault("QTWEBENGINE_DISABLE_SANDBOX", "1")

    # DLLs do Qt no Windows
    try:
        import PyQt6 as _pq6
        _qt_dir = os.path.dirname(_pq6.__file__)
        os.add_dll_directory(_qt_dir)
        _bin = os.path.join(_qt_dir, "Qt6", "bin")
        if os.path.isdir(_bin):
            os.add_dll_directory(_bin)
    except Exception:
        pass

    # ── DEVE vir antes de criar QApplication ──────────────────────────
    from PyQt6.QtCore import Qt
    from PyQt6.QtWidgets import QApplication

    # Obrigatório para WebEngine antes de QApplication
    QApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts)

    # Pré-importa WebEngine antes de QApplication (exigência do Qt)
    try:
        from PyQt6.QtWebEngineWidgets import QWebEngineView  # noqa: F401
    except Exception:
        pass
    # ─────────────────────────────────────────────────────────────────

    from ui.main_window import MainWindow

    app = QApplication(sys.argv)
    win = MainWindow()
    win.show()
    sys.exit(app.exec())


def main() -> None:
    parser = argparse.ArgumentParser(description="Violin Hero")
    parser.add_argument("--test-audio", action="store_true", help="Testa captura de microfone")
    parser.add_argument("--test-score", metavar="FILE", help="Testa parse de MusicXML")
    args = parser.parse_args()

    if args.test_audio:
        _test_audio()
    elif args.test_score:
        _test_score(args.test_score)
    else:
        _launch_ui()


if __name__ == "__main__":
    main()
