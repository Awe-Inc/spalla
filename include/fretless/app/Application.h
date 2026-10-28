// ═══════════════════════════════════════════════════════════════════════════
//  Application.h — window, main loop, and the wiring between subsystems.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "fretless/audio/AudioEngine.h"
#include "fretless/audio/ToneEngine.h"
#include "fretless/curriculum/Exercise.h"
#include "fretless/curriculum/PracticePlan.h"
#include "fretless/curriculum/Progress.h"
#include "fretless/game/GameEngine.h"
#include "fretless/game/SyntheticPlayer.h"
#include "fretless/platform/SteamService.h"
#include "fretless/render/Font.h"
#include "fretless/render/Renderer2D.h"
#include "fretless/score/Score.h"
#include "fretless/view/HighwayView.h"
#include "fretless/view/HomeView.h"
#include "fretless/view/HudView.h"
#include "fretless/view/MenuView.h"
#include "fretless/view/ModuleView.h"
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
    ///
    /// Home is the hub, Module is one module's exercise list, Library is the
    /// file browser the old menu used to be, and Game is a run in progress.
    /// The back key walks this backwards, which is the only navigation rule
    /// the player has to learn.
    enum class Screen : std::uint8_t { Home, Module, Library, Game };

    /// Loads a generated exercise and starts it. Public so --exercise can
    /// reach it without going through the menus.
    [[nodiscard]] bool startExercise(const std::string& exerciseId);

    /// Opens a module's exercise list. Public for --module, which is both a
    /// deep link and how the module screen gets screenshotted.
    [[nodiscard]] bool openModule(const std::string& moduleId);

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
    void openFileDialog();

    // ── Menu ──────────────────────────────────────────────────────────────
    /// Scans assets/songs for scores. Only reads the directory; each entry is
    /// parsed the first time it is highlighted.
    void scanSongLibrary();
    /// Rebuilds the practice plan from the current progress. Cheap, and worth
    /// doing whenever progress changes so the home screen never shows a
    /// session that has already been completed.
    void refreshPlan();
    /// Folds a completed run into the progress store and writes it out. Saving
    /// on every run rather than at exit means a crash costs nothing.
    void commitRun();
    /// Starts or silences the drone and click for whatever is loaded.
    void applyAccompaniment();
    /// Clicks per minute for the loaded score at the chosen tempo. Not the
    /// same number as the tempo whenever the beat is not a quarter note.
    [[nodiscard]] double metronomeClicksPerMinute() const noexcept;
    /// Starts the click at the rate, meter and beat of the bar sounding at
    /// `songTime` (the first bar during the count-in).
    void startMetronomeAt(double songTime);
    /// Follows the click into a new bar when the meter or the tempo changes
    /// there, or when the bar before it was cut short.
    void followMetronomeBar();
    void handleHomeAction(view::HomeAction action);
    void handleModuleAction(view::ModuleAction action);
    void enterHome();
    void enterModule(const std::string& moduleId);
    void enterLibrary();
    /// Fills in the summary fields for the highlighted entry.
    void ensureSongParsed(std::size_t index);
    /// Reopens the audio engine on the device the menu has selected.
    void applyMenuDevice();
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
    audio::ToneEngine      tone_;
    game::GameEngine       game_;
    game::SyntheticPlayer  synthetic_;
    platform::SteamService steam_;
    std::optional<score::Score> score_;

    /// Guards against reporting the same completed run more than once: the
    /// Finished state persists across frames.
    bool runReported_ = false;
    /// The same guard for the progress store. Separate from runReported_
    /// because a run can be filed on the way out without ever finishing, and
    /// a finished run is then filed again by the exit path.
    bool runCommitted_ = false;

    view::HighwayView highway_;
    view::TunerView   tuner_;
    view::StaffView   staff_;
    view::HudView      hud_;
    view::MenuView     menu_;
    view::HomeView     home_;
    view::ModuleView   moduleView_;
    view::TempoControl tempo_;

    curriculum::Curriculum   curriculum_{};
    curriculum::Progress     progress_{};
    curriculum::PracticePlan plan_{};

    /// What is loaded right now, if it came from the curriculum rather than
    /// from a file. Empty while playing a score off disk.
    std::string currentExerciseId_;
    std::string currentModuleId_;
    /// Which screen Escape should return to from the game.
    Screen      returnScreen_ = Screen::Home;
    /// Bumped every attempt so a "fresh every time" exercise really is.
    std::uint32_t attemptSeed_ = 1;

    Screen screen_ = Screen::Home;

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
    /// Bar the click was last set for; `score_->measures.size()` or more
    /// means none yet.
    std::size_t metronomeBar_ = static_cast<std::size_t>(-1);

    std::string statusMessage_;
    double      statusExpiry_ = 0.0;
    double      elapsedTotal_ = 0.0;

    // Frame pacing diagnostics shown with F3.
    bool   showDebug_      = false;
    double frameTimeAvgMs_ = 0.0;
};

}  // namespace fretless::app
