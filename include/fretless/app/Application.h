// ═══════════════════════════════════════════════════════════════════════════
//  Application.h — window, main loop, and the wiring between subsystems.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "fretless/audio/AudioEngine.h"
#include "fretless/game/GameEngine.h"
#include "fretless/game/SyntheticPlayer.h"
#include "fretless/platform/SteamService.h"
#include "fretless/render/Font.h"
#include "fretless/render/Renderer2D.h"
#include "fretless/score/Score.h"
#include "fretless/view/HighwayView.h"
#include "fretless/view/HudView.h"
#include "fretless/view/MenuView.h"
#include "fretless/view/StaffView.h"
#include "fretless/view/TempoControl.h"
#include "fretless/view/TunerView.h"

struct SDL_Window;
using SDL_GLContext = void*;

namespace fretless::app {

struct ApplicationConfig {
    int         windowWidth  = 1600;
    int         windowHeight = 900;
    std::string title        = "Fretless";
    std::string assetsDir    = "assets";
    std::string initialSong;
    bool        vsync        = true;

    /// Offscreen capture mode: simulate a performance up to
    /// `screenshotAtSeconds`, render one frame, write a PNG and exit. The
    /// window is created hidden and no microphone is opened, so this runs on
    /// a build machine.
    std::string screenshotPath;
    double      screenshotAtSeconds = 0.0;

    audio::AudioConfig audio{};
};

class Application {
public:
    Application();
    ~Application();

    Application(const Application&)            = delete;
    Application& operator=(const Application&) = delete;

    [[nodiscard]] bool initialize(const ApplicationConfig& config, std::string* error = nullptr);
    void run();
    void shutdown() noexcept;

    [[nodiscard]] bool loadSong(const std::string& path, std::string* error = nullptr);

    /// Reads the default framebuffer back and writes a PNG.
    [[nodiscard]] bool captureScreenshot(const std::string& path, std::string* error = nullptr);

    /// Which screen owns the window right now.
    enum class Screen : std::uint8_t { Menu, Game };

private:
    /// Drives the game with a synthetic performance up to `targetSeconds`,
    /// then renders and captures. Used by --screenshot.
    void runOffscreenCapture();

    void handleEvents();
    void update(double deltaSeconds);
    void render();
    void layout();

    void togglePlay();
    void adjustTempo(int deltaBpm);
    /// Rescales the loaded score's timeline to `bpm` and restarts if running.
    void applyTempo(int bpm);
    void cycleInputDevice(int direction);
    void openFileDialog();

    // ── Menu ──────────────────────────────────────────────────────────────
    /// Scans assets/songs for scores. Only reads the directory; each entry is
    /// parsed the first time it is highlighted.
    void scanSongLibrary();
    /// Fills in the summary fields for the highlighted entry.
    void ensureSongParsed(std::size_t index);
    /// Reopens the audio engine on the device the menu has selected.
    void applyMenuDevice();
    void enterMenu();
    void enterGame();
    [[nodiscard]] bool startSelectedSong();
    void handleMenuAction(view::MenuAction action);

    ApplicationConfig config_{};

    SDL_Window*   window_    = nullptr;
    SDL_GLContext glContext_ = nullptr;
    bool          running_   = false;

    render::Renderer2D renderer_;
    render::Font       fontLabel_;
    render::Font       fontBody_;
    render::Font       fontTitle_;
    render::Font       fontLead_;
    render::Font       fontHero_;
    render::FontSet    fonts_{};

    audio::AudioEngine     audio_;
    game::GameEngine       game_;
    game::SyntheticPlayer  synthetic_;
    platform::SteamService steam_;
    std::optional<score::Score> score_;

    /// Guards against reporting the same completed run more than once: the
    /// Finished state persists across frames.
    bool runReported_ = false;

    view::HighwayView highway_;
    view::TunerView   tuner_;
    view::StaffView   staff_;
    view::HudView      hud_;
    view::MenuView     menu_;
    view::TempoControl tempo_;

    Screen screen_ = Screen::Menu;

    /// The staff is reading practice, not gameplay. It is worth a lot to some
    /// players and is pure clutter to others, so it toggles.
    bool showStaff_ = true;

    /// Left and right zones of the readout strip.
    render::Rect expectedZone_{};
    render::Rect statsZone_{};

    std::vector<audio::PitchFrame> frameScratch_;
    audio::PitchFrame              latestFrame_{};
    bool                           hasLatestFrame_ = false;

    std::vector<audio::AudioDeviceInfo> devices_;
    int  currentDeviceSlot_ = -1;

    /// Target BPM chosen by the player; the score timeline is rescaled to it.
    int    targetBpm_   = 120;
    double originalBpm_ = 120.0;

    std::string statusMessage_;
    double      statusExpiry_ = 0.0;
    double      elapsedTotal_ = 0.0;

    // Frame pacing diagnostics shown with F3.
    bool   showDebug_      = false;
    double frameTimeAvgMs_ = 0.0;
};

}  // namespace fretless::app
