#include "fretless/app/Application.h"

#include <glad/gl.h>
#include <SDL.h>
#include <miniz.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <vector>

#include "fretless/app/Layout.h"
#include "fretless/app/Theme.h"
#include "fretless/curriculum/Generators.h"
#include "fretless/platform/FileDialog.h"
#include "fretless/score/MusicXmlParser.h"

namespace fretless::app {
namespace {

constexpr double kStatusDuration = 3.0;
constexpr double kStatusFadeSec  = 0.6;
constexpr std::size_t kMaxFramesPerTick = 64;

/// Two click rates closer than this are the same tempo; re-syncing for a
/// rounding difference would only add jitter at the barline.
constexpr double kClickRateTolerance = 0.005;

/// Dots the tempo control has to fit: the longest bar, not the first one.
[[nodiscard]] int widestBar(const score::Score& score) noexcept {
    int widest = score.beatsPerMeasure;
    for (const auto& bar : score.measures) {
        widest = std::max(widest, bar.beats);
    }
    return widest;
}

[[nodiscard]] bool barIsShort(const score::MeasureMark& bar) noexcept {
    const double full = bar.beats * 4.0 / std::max(1, bar.beatUnit);
    return bar.beatOffset <= 0.0 && bar.lengthQuarters < full - 1e-3;
}

}  // namespace

Application::Application() = default;

Application::~Application() {
    shutdown();
}

// ═══════════════════════════════════════════════════════════════════════════
//  Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

bool Application::initialize(const ApplicationConfig& config, std::string* error) {
    config_ = config;
    const bool offscreen = !config_.screenshotPath.empty();

    // ── Audio first: a missing microphone is worth knowing before we open a
    //    window and make the failure look like a graphics problem. Capture
    //    runs are fed by the synthetic player, so they skip the device
    //    entirely and work on a machine with no sound hardware at all.
    // Enumeration opens no stream, so it is safe even on a capture run and
    // keeps the menu's input list populated for screenshots.
    devices_ = audio::AudioEngine::enumerateInputDevices();

    if (!offscreen) {
        if (!audio_.initialize(config_.audio, error)) {
            return false;
        }
        for (std::size_t i = 0; i < devices_.size(); ++i) {
            if (config_.audio.deviceIndex < 0
                    ? devices_[i].isDefault
                    : devices_[i].index == config_.audio.deviceIndex) {
                currentDeviceSlot_ = static_cast<int>(i);
                break;
            }
        }
        if (!audio_.start(error)) {
            return false;
        }
    }

    // ── Window and GL ─────────────────────────────────────────────────────
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER) != 0) {
        if (error != nullptr) { *error = SDL_GetError(); }
        return false;
    }

    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
    SDL_GL_SetAttribute(SDL_GL_MULTISAMPLEBUFFERS, 0);   // the SDF does our AA

    const Uint32 windowFlags = SDL_WINDOW_OPENGL | SDL_WINDOW_ALLOW_HIGHDPI |
                               (offscreen ? SDL_WINDOW_HIDDEN : SDL_WINDOW_RESIZABLE);
    window_ = SDL_CreateWindow(config_.title.c_str(),
                               SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                               config_.windowWidth, config_.windowHeight,
                               windowFlags);
    if (window_ == nullptr) {
        if (error != nullptr) { *error = SDL_GetError(); }
        return false;
    }
    SDL_SetWindowMinimumSize(window_, 960, 540);

    glContext_ = SDL_GL_CreateContext(window_);
    if (glContext_ == nullptr) {
        if (error != nullptr) { *error = SDL_GetError(); }
        return false;
    }
    if (gladLoadGL(reinterpret_cast<GLADloadfunc>(SDL_GL_GetProcAddress)) == 0) {
        if (error != nullptr) { *error = "Failed to load OpenGL 3.3 core."; }
        return false;
    }
    SDL_GL_SetSwapInterval(config_.vsync ? 1 : 0);
    SDL_EventState(SDL_DROPFILE, SDL_ENABLE);

    if (!renderer_.initialize(error)) {
        return false;
    }

    // ── Fonts ─────────────────────────────────────────────────────────────
    const std::string fontPath = render::Font::findFontFile(config_.assetsDir);
    if (fontPath.empty()) {
        if (error != nullptr) {
            *error = "No usable font found. Put a .ttf in " + config_.assetsDir + "/fonts.";
        }
        return false;
    }
    std::string fontError;
    if (!fontLabel_.load(fontPath, layout::kFontLabel, &fontError) ||
        !fontBody_.load(fontPath,  layout::kFontBody,  &fontError) ||
        !fontTitle_.load(fontPath, layout::kFontTitle, &fontError) ||
        !fontLead_.load(fontPath,  layout::kFontLead,  &fontError) ||
        !fontHero_.load(fontPath,  layout::kFontHero,  &fontError)) {
        if (error != nullptr) { *error = fontError; }
        return false;
    }
    fonts_ = {&fontLabel_, &fontBody_, &fontTitle_, &fontLead_, &fontHero_};

    frameScratch_.resize(kMaxFramesPerTick);

    // Steam is optional at every level: not built, not installed, not running.
    // None of those is an error the player needs to see.
    if (!offscreen) {
        std::string steamError;
        if (steam_.initialize(&steamError)) {
            std::printf("[steam] connected as %s\n", steam_.playerName().c_str());
        } else {
            std::printf("[steam] offline: %s\n", steamError.c_str());
        }
    }

    // ── Output: the drone and the click ───────────────────────────────────
    // Optional at every level. A machine with no output device, or one whose
    // default endpoint is busy, still gets a fully working practice tool; it
    // just gets a quiet one.
    if (!offscreen) {
        std::string toneError;
        audio::ToneConfig toneConfig;
        toneConfig.sampleRate = config_.audio.sampleRate;
        if (tone_.initialize(toneConfig, &toneError) && tone_.start(&toneError)) {
            std::printf("[tone] output ready\n");
        } else {
            std::printf("[tone] silent: %s\n", toneError.c_str());
        }
    }

    // ── Curriculum and progress ───────────────────────────────────────────
    curriculum_ = curriculum::buildCurriculum();
    progress_.load(curriculum::Progress::defaultPath());
    for (const auto& module : curriculum_.modules) {
        for (const auto& exercise : module.exercises) {
            progress_.setTargetBpm(exercise.id, exercise.defaultBpm);
        }
    }
    home_.setCurriculum(&curriculum_);
    home_.setProgress(&progress_);
    moduleView_.setProgress(&progress_);
    refreshPlan();
    if (currentDeviceSlot_ >= 0 && currentDeviceSlot_ < static_cast<int>(devices_.size())) {
        home_.setInput(devices_[static_cast<std::size_t>(currentDeviceSlot_)].name,
                       audio_.isRunning());
    } else {
        home_.setInput(offscreen ? "modo captura" : "nenhuma entrada escolhida", false);
    }

    statusMessage_ = "Afinador ativo.";
    statusExpiry_  = kStatusDuration * 2.0;

    menu_.setDevices(devices_);
    if (currentDeviceSlot_ >= 0 && currentDeviceSlot_ < static_cast<int>(devices_.size())) {
        menu_.selectDeviceByEngineIndex(devices_[static_cast<std::size_t>(currentDeviceSlot_)].index);
    }
    scanSongLibrary();

    // Naming a song means "skip the menu". A capture run with no song stays on
    // the menu, which is how the menu itself gets screenshotted.
    if (!config_.initialSong.empty()) {
        std::string songError;
        if (loadSong(config_.initialSong, &songError)) {
            enterGame();
        } else {
            statusMessage_ = songError;
            statusExpiry_  = elapsedTotal_ + kStatusDuration * 2.0;
        }
    }

    layout();
    running_ = true;
    return true;
}

void Application::shutdown() noexcept {
    // Progress is saved after every run, so this only catches a session that
    // ended without finishing anything. Cheap insurance either way.
    if (progress_.dirty()) {
        (void)progress_.save();
    }
    steam_.shutdown();
    tone_.stop();
    tone_.shutdown();
    audio_.stop();
    audio_.shutdown();

    fontLabel_.unload();
    fontBody_.unload();
    fontTitle_.unload();
    fontLead_.unload();
    fontHero_.unload();
    renderer_.shutdown();

    if (glContext_ != nullptr) {
        SDL_GL_DeleteContext(glContext_);
        glContext_ = nullptr;
    }
    if (window_ != nullptr) {
        SDL_DestroyWindow(window_);
        window_ = nullptr;
    }
    if (SDL_WasInit(0) != 0) {
        SDL_Quit();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Song loading
// ═══════════════════════════════════════════════════════════════════════════

bool Application::loadSong(const std::string& path, std::string* error) {
    std::string parseError;
    auto parsed = score::parseMusicXml(path, &parseError);
    if (!parsed.has_value()) {
        if (error != nullptr) { *error = parseError; }
        return false;
    }

    score_       = std::move(parsed);
    originalBpm_ = score_->beatsPerMinute;
    targetBpm_   = static_cast<int>(std::lround(originalBpm_));

    game_.setScore(&score_.value());
    game_.setLeadInSeconds(3.0);

    tempo_.setTempo(targetBpm_);
    tempo_.setWrittenTempo(originalBpm_);

    // Short, because the menu row already carries the full summary and the
    // header carries the title. A toast is an acknowledgement, not a report.
    char message[160];
    std::snprintf(message, sizeof(message), "%zu notas carregadas", score_->noteCount());
    statusMessage_ = message;
    statusExpiry_  = elapsedTotal_ + kStatusDuration;
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Menu
// ═══════════════════════════════════════════════════════════════════════════

void Application::scanSongLibrary() {
    namespace fs = std::filesystem;

    std::vector<view::SongEntry> entries;
    std::error_code ec;
    const fs::path songsDir = fs::path(config_.assetsDir) / "songs";

    if (fs::is_directory(songsDir, ec)) {
        for (const auto& item : fs::directory_iterator(songsDir, ec)) {
            if (!item.is_regular_file(ec)) {
                continue;
            }
            std::string extension = item.path().extension().string();
            std::transform(extension.begin(), extension.end(), extension.begin(),
                           [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
            if (extension != ".musicxml" && extension != ".xml" && extension != ".mxl") {
                continue;
            }
            view::SongEntry entry;
            entry.path     = item.path().string();
            entry.fileName = item.path().filename().string();
            entries.push_back(std::move(entry));
        }
    }

    std::sort(entries.begin(), entries.end(),
              [](const view::SongEntry& a, const view::SongEntry& b) {
                  return a.fileName < b.fileName;
              });

    const std::size_t count = entries.size();
    menu_.setSongs(std::move(entries));

    // Parse the whole library up front when it is small, so the list shows
    // real titles instead of filenames. Past this many, parsing stays lazy —
    // a folder of hundreds of scores should not stall the menu appearing.
    constexpr std::size_t kEagerParseLimit = 64;
    if (count <= kEagerParseLimit) {
        for (std::size_t i = 0; i < count; ++i) {
            ensureSongParsed(i);
        }
    }
    ensureSongParsed(menu_.selectedSongIndex());
}

void Application::ensureSongParsed(std::size_t index) {
    auto& entries = menu_.songs();
    if (index >= entries.size()) {
        return;
    }
    auto& entry = entries[index];
    if (entry.parsed || entry.failed) {
        return;
    }

    std::string error;
    const auto parsed = score::parseMusicXml(entry.path, &error);
    if (!parsed.has_value()) {
        entry.failed = true;
        entry.error  = error;
        return;
    }
    entry.title       = parsed->title;
    entry.composer    = parsed->composer;
    entry.noteCount   = parsed->noteCount();
    entry.durationSec = parsed->durationSeconds();
    entry.bpm         = parsed->beatsPerMinute;
    entry.beats       = parsed->beatsPerMeasure;
    entry.beatUnit    = parsed->beatUnit;
    entry.keyFifths   = parsed->keyFifths;
    entry.parsed      = true;

    // The tempo box follows the highlighted piece. Guarded on the selection so
    // that pre-parsing the library does not leave it showing the last file's
    // tempo instead of the selected one's.
    if (index == menu_.selectedSongIndex()) {
        menu_.setTempo(static_cast<int>(std::lround(parsed->beatsPerMinute)));
        menu_.setWrittenTempo(parsed->beatsPerMinute);
    }
}

void Application::applyMenuDevice() {
    const int engineIndex = menu_.deviceIndexForRow(menu_.selectedDeviceRow());
    if (engineIndex < 0) {
        return;
    }
    for (std::size_t i = 0; i < devices_.size(); ++i) {
        if (devices_[i].index == engineIndex) {
            currentDeviceSlot_ = static_cast<int>(i);
            break;
        }
    }

    audio_.stop();
    audio_.shutdown();

    auto audioConfig = config_.audio;
    audioConfig.deviceIndex = engineIndex;

    std::string error;
    if (!audio_.initialize(audioConfig, &error) || !audio_.start(&error)) {
        statusMessage_ = "Falha na entrada: " + error;
        statusExpiry_  = elapsedTotal_ + kStatusDuration;
        return;
    }
    config_.audio   = audioConfig;
    hasLatestFrame_ = false;
    latestFrame_    = audio::PitchFrame{};
    home_.setInput(devices_[static_cast<std::size_t>(currentDeviceSlot_)].name,
                   audio_.isRunning());
    statusMessage_  = "Entrada: " + devices_[static_cast<std::size_t>(currentDeviceSlot_)].name;
    statusExpiry_   = elapsedTotal_ + kStatusDuration;
    // The dead-line timer must not carry over: the new device deserves its
    // own grace period before we accuse it of being silent.
    tuner_.resetSignalWatch();
}

void Application::enterLibrary() {
    screen_ = Screen::Library;
    game_.stop();
    tone_.clearDrone();
    tone_.clearMetronome();

    // Rescanning on every visit is what keeps a file dropped into
    // assets/songs while the app is open from being invisible. The previous
    // selection is restored below so it is not also a reset.
    const std::string previous =
        (menu_.selectedSong() != nullptr) ? menu_.selectedSong()->path : std::string{};
    scanSongLibrary();
    if (!previous.empty()) {
        menu_.selectSongByPath(previous);
        ensureSongParsed(menu_.selectedSongIndex());
    }

    menu_.setDevices(devices_);
    if (currentDeviceSlot_ >= 0 && currentDeviceSlot_ < static_cast<int>(devices_.size())) {
        menu_.selectDeviceByEngineIndex(devices_[static_cast<std::size_t>(currentDeviceSlot_)].index);
    }
}

void Application::enterHome() {
    screen_ = Screen::Home;
    game_.stop();
    tone_.clearDrone();
    tone_.clearMetronome();
    refreshPlan();
    if (currentDeviceSlot_ >= 0 && currentDeviceSlot_ < static_cast<int>(devices_.size())) {
        home_.setInput(devices_[static_cast<std::size_t>(currentDeviceSlot_)].name,
                       audio_.isRunning());
    } else {
        home_.setInput("nenhuma entrada escolhida", false);
    }
}

bool Application::openModule(const std::string& moduleId) {
    if (curriculum_.findModule(moduleId) == nullptr) {
        return false;
    }
    enterModule(moduleId);
    layout();
    return true;
}

void Application::enterModule(const std::string& moduleId) {
    const curriculum::Module* module = curriculum_.findModule(moduleId);
    if (module == nullptr) {
        return;
    }
    currentModuleId_ = moduleId;
    moduleView_.setModule(module);
    screen_ = Screen::Module;
    game_.stop();
    tone_.clearDrone();
    tone_.clearMetronome();
}

void Application::enterGame() {
    screen_ = Screen::Game;
}

void Application::refreshPlan() {
    plan_ = curriculum::buildPracticePlan(curriculum_, progress_);
    home_.setPlan(plan_);
}

void Application::commitRun() {
    if (currentExerciseId_.empty() || runCommitted_) {
        return;
    }
    const auto& stats = game_.stats();
    // A run nobody played is not a result. Without this, walking away from a
    // count-in would file a zero and pull the exercise's best down with it.
    if (stats.judgedNotes == 0) {
        return;
    }
    runCommitted_ = true;
    progress_.record(currentExerciseId_, stats.score, stats.accuracyPct,
                     stats.meanAbsCents, targetBpm_);
    (void)progress_.save();
    refreshPlan();
}

double Application::metronomeClicksPerMinute() const noexcept {
    // The tempo map counts quarter notes; the click counts beats. In 6/8 a
    // beat is an eighth, so sixty quarters a minute is a hundred and twenty
    // clicks - not thirty, which is what dividing by the beat unit gave.
    const int beatUnit = score_.has_value() ? std::max(1, score_->beatUnit) : 4;
    return static_cast<double>(targetBpm_) * static_cast<double>(beatUnit) / 4.0;
}

void Application::startMetronomeAt(double songTime) {
    if (!score_.has_value()) {
        return;
    }
    const auto& measures = score_->measures;
    if (measures.empty()) {
        tone_.setMetronome(metronomeClicksPerMinute(), score_->beatsPerMeasure);
        tone_.resyncMetronome();
        metronomeBar_ = static_cast<std::size_t>(-1);
        return;
    }
    std::size_t index = score_->measureIndexAt(songTime);
    if (index >= measures.size()) {
        index = songTime < measures.front().startSeconds ? 0 : measures.size() - 1;
    }
    const score::MeasureMark& bar = measures[index];
    const int beat = songTime < bar.startSeconds
                         ? static_cast<int>(std::lround(bar.beatOffset))
                         : std::max(0, score_->beatAt(songTime));
    tone_.setMetronome(bar.clicksPerMinute(), bar.beats);
    tone_.resyncMetronome(beat);
    metronomeBar_ = index;
}

void Application::followMetronomeBar() {
    if (!score_.has_value() || !tone_.metronomeRunning() ||
        game_.state() != game::GameState::Playing) {
        return;
    }
    const auto&       measures = score_->measures;
    const std::size_t index    = score_->measureIndexAt(game_.songTime());
    if (index >= measures.size() || index == metronomeBar_) {
        return;
    }
    const bool follows = metronomeBar_ < measures.size() && index == metronomeBar_ + 1;
    if (follows) {
        const score::MeasureMark& previous = measures[metronomeBar_];
        const score::MeasureMark& current  = measures[index];
        const double rate = previous.clicksPerMinute();
        const bool   same = current.beats == previous.beats &&
                          current.beatUnit == previous.beatUnit && rate > 0.0 &&
                          std::abs(current.clicksPerMinute() - rate) <= rate * kClickRateTolerance;
        // A free-running click carries a steady bar on its own; touching it
        // at every barline would add a callback's worth of jitter for nothing.
        if (same && !barIsShort(previous)) {
            metronomeBar_ = index;
            return;
        }
    }
    startMetronomeAt(game_.songTime());
}

void Application::applyAccompaniment() {
    if (!tone_.available()) {
        return;
    }
    const curriculum::Exercise* exercise =
        currentExerciseId_.empty() ? nullptr
                                   : curriculum_.findExercise(currentExerciseId_);

    if (exercise != nullptr && exercise->droneMidi >= 0) {
        tone_.setDrone(exercise->droneMidi);
    } else {
        tone_.clearDrone();
    }

    // The click follows the tempo the player chose, not the one written in the
    // exercise: a metronome that disagrees with the notes is worse than none.
    if (exercise != nullptr && exercise->metronome && score_.has_value()) {
        startMetronomeAt(game_.songTime());
    } else {
        tone_.clearMetronome();
    }
}

bool Application::startExercise(const std::string& exerciseId) {
    const curriculum::Exercise* exercise = curriculum_.findExercise(exerciseId);
    if (exercise == nullptr || !curriculum::isPlayable(exercise->kind)) {
        return false;
    }

    // A fresh seed per attempt is what makes sight reading actually sight
    // reading; every other kind ignores it and builds the same score.
    ++attemptSeed_;
    score::Score built = curriculum::buildScore(
        *exercise, exercise->freshEveryTime ? attemptSeed_ : 1u);
    if (built.events.empty()) {
        statusMessage_ = "Este exercício não gerou notas.";
        statusExpiry_  = elapsedTotal_ + kStatusDuration;
        return false;
    }

    score_       = std::move(built);
    originalBpm_ = score_->beatsPerMinute;

    // The module screen owns the tempo choice, so honour it here rather than
    // resetting to the exercise default the player just moved away from.
    const int requested = (screen_ == Screen::Module) ? moduleView_.tempo()
                                                      : exercise->defaultBpm;
    targetBpm_ = std::clamp(requested, view::TempoControl::kMinBpm,
                            view::TempoControl::kMaxBpm);
    score_->applyTempoScale(static_cast<double>(targetBpm_) /
                            std::max(1.0, originalBpm_));

    game_.setScore(&score_.value());
    game_.setLeadInSeconds(3.0);
    tempo_.setTempo(targetBpm_);
    tempo_.setWrittenTempo(static_cast<double>(exercise->defaultBpm));

    currentExerciseId_ = exercise->id;
    runReported_       = false;
    runCommitted_      = false;

    enterGame();
    layout();
    applyAccompaniment();
    game_.start();

    statusMessage_ = exercise->focus;
    statusExpiry_  = elapsedTotal_ + kStatusDuration * 1.5;
    return true;
}

void Application::handleHomeAction(view::HomeAction action) {
    switch (action) {
        case view::HomeAction::OpenModule:
            enterModule(home_.selectedModule());
            layout();
            break;
        case view::HomeAction::StartPlanItem: {
            enterModule(home_.selectedModule());
            moduleView_.selectExercise(home_.selectedExercise());
            returnScreen_ = Screen::Module;
            if (!startExercise(home_.selectedExercise())) {
                layout();
            }
            break;
        }
        case view::HomeAction::OpenLibrary:
            enterLibrary();
            layout();
            break;
        case view::HomeAction::Quit:
            running_ = false;
            break;
        case view::HomeAction::None:
            break;
    }
}

void Application::handleModuleAction(view::ModuleAction action) {
    switch (action) {
        case view::ModuleAction::Play: {
            const curriculum::Exercise* exercise = moduleView_.selected();
            if (exercise != nullptr) {
                returnScreen_ = Screen::Module;
                (void)startExercise(exercise->id);
            }
            break;
        }
        case view::ModuleAction::Back:
            enterHome();
            layout();
            break;
        case view::ModuleAction::Quit:
            running_ = false;
            break;
        case view::ModuleAction::None:
            break;
    }
}

bool Application::startSelectedSong() {
    const view::SongEntry* entry = menu_.selectedSong();
    if (entry == nullptr) {
        return false;
    }
    currentExerciseId_.clear();   // a file is not a curriculum exercise
    returnScreen_ = Screen::Library;
    std::string error;
    if (!loadSong(entry->path, &error)) {
        statusMessage_ = error;
        statusExpiry_  = elapsedTotal_ + kStatusDuration;
        return false;
    }

    // Honour the tempo the player set in the menu.
    targetBpm_ = menu_.tempo();
    tempo_.setTempo(targetBpm_);
    score_->applyTempoScale(static_cast<double>(targetBpm_) / std::max(1.0, originalBpm_));

    enterGame();
    layout();
    runReported_ = false;
    applyAccompaniment();
    game_.start();
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Layout
// ═══════════════════════════════════════════════════════════════════════════

void Application::layout() {
    int width = 0;
    int height = 0;
    SDL_GL_GetDrawableSize(window_, &width, &height);

    const auto w = static_cast<float>(width);
    const auto h = static_cast<float>(height);

    if (screen_ != Screen::Game) {
        // Every screen outside a run is one full-bleed surface with the tuner
        // riding along the bottom. Keeping the tuner visible everywhere means
        // a player can check a note, or check that the microphone is alive,
        // without first deciding what they are practising.
        const float tunerHeight = layout::kReadoutHeight;
        const render::Rect page{0.0f, 0.0f, w, h - tunerHeight};
        menu_.setBounds(page);
        home_.setBounds(page);
        moduleView_.setBounds(page);
        tuner_.setBounds({0.0f, h - tunerHeight, w, tunerHeight});
        hud_.setReadout({0.0f, h - tunerHeight, w, tunerHeight});
        return;
    }

    // ── Game: three stacked bands, top to bottom ──────────────────────────
    //   header   thin chrome
    //   highway  the product, given every pixel that is left
    //   staff    optional reading practice
    //   readout  expected note | tuner | score
    const float headerHeight  = layout::kHeaderHeight;
    const float readoutHeight = layout::kReadoutHeight;
    const float staffHeight   = showStaff_ ? layout::kStaffHeight : 0.0f;

    const float highwayTop    = headerHeight;
    const float highwayBottom = h - readoutHeight - staffHeight;

    hud_.setHeader({0.0f, 0.0f, w, headerHeight});
    tempo_.setBounds(hud_.tempoSlot(
        view::TempoControl::preferredWidth(score_.has_value() ? widestBar(*score_) : 4)));

    highway_.setBounds({0.0f, highwayTop, w, highwayBottom - highwayTop});
    if (showStaff_) {
        staff_.setBounds({0.0f, highwayBottom, w, staffHeight});
    }

    const render::Rect readout{0.0f, h - readoutHeight, w, readoutHeight};
    hud_.setReadout(readout);
    tuner_.setBounds(readout);

    // The tuner keeps the centre; the two side zones take what remains, and
    // are never allowed to encroach on it.
    const float sideWidth = std::max(150.0f, (w - 560.0f) * 0.5f - layout::kSpaceLg);
    expectedZone_ = {layout::kGutter, readout.y, sideWidth, readoutHeight};
    statsZone_    = {w - layout::kGutter - sideWidth, readout.y, sideWidth, readoutHeight};
}

// ═══════════════════════════════════════════════════════════════════════════
//  Main loop
// ═══════════════════════════════════════════════════════════════════════════

void Application::run() {
    if (!config_.screenshotPath.empty()) {
        runOffscreenCapture();
        return;
    }

    std::uint64_t previous = SDL_GetPerformanceCounter();
    const double frequency = static_cast<double>(SDL_GetPerformanceFrequency());

    while (running_) {
        const std::uint64_t now = SDL_GetPerformanceCounter();
        double delta = static_cast<double>(now - previous) / frequency;
        previous = now;

        // A breakpoint, a dragged window or a stalled driver must not teleport
        // the song forward: clamp to a plausible worst-case frame.
        delta = std::min(delta, 0.1);
        elapsedTotal_ += delta;

        handleEvents();
        update(delta);
        render();
    }
}

void Application::handleEvents() {
    SDL_Event event;
    while (SDL_PollEvent(&event) != 0) {
        switch (event.type) {
            case SDL_QUIT:
                running_ = false;
                break;

            case SDL_WINDOWEVENT:
                if (event.window.event == SDL_WINDOWEVENT_SIZE_CHANGED ||
                    event.window.event == SDL_WINDOWEVENT_RESIZED) {
                    layout();
                }
                break;

            case SDL_DROPFILE: {
                std::string path = event.drop.file;
                SDL_free(event.drop.file);
                std::string error;
                if (loadSong(path, &error)) {
                    // A dropped file is an explicit request to play it.
                    currentExerciseId_.clear();
                    returnScreen_ = Screen::Home;
                    enterGame();
                    layout();
                    runReported_ = false;
                    applyAccompaniment();
                    game_.start();
                } else {
                    statusMessage_ = error;
                    statusExpiry_  = elapsedTotal_ + kStatusDuration;
                }
                break;
            }

            case SDL_MOUSEMOTION: {
                const auto mx = static_cast<float>(event.motion.x);
                const auto my = static_cast<float>(event.motion.y);
                switch (screen_) {
                    case Screen::Home:    (void)home_.handleMouseMove(mx, my); break;
                    case Screen::Module:  (void)moduleView_.handleMouseMove(mx, my); break;
                    case Screen::Library: (void)menu_.handleMouseMove(mx, my); break;
                    case Screen::Game:    (void)tempo_.handleMouseMove(mx, my); break;
                }
                break;
            }

            case SDL_MOUSEBUTTONDOWN: {
                if (event.button.button != SDL_BUTTON_LEFT) {
                    break;
                }
                const auto mx = static_cast<float>(event.button.x);
                const auto my = static_cast<float>(event.button.y);
                switch (screen_) {
                    case Screen::Home:
                        handleHomeAction(home_.handleMouseClick(mx, my));
                        break;
                    case Screen::Module:
                        handleModuleAction(moduleView_.handleMouseClick(mx, my));
                        break;
                    case Screen::Library:
                        handleMenuAction(menu_.handleMouseClick(mx, my));
                        break;
                    case Screen::Game:
                        if (tempo_.handleMouseClick(mx, my)) {
                            applyTempo(tempo_.tempo());
                        }
                        break;
                }
                break;
            }

            case SDL_MOUSEWHEEL: {
                if (screen_ == Screen::Library) {
                    (void)menu_.handleScroll(event.wheel.y);
                    break;
                }
                if (screen_ == Screen::Module) {
                    (void)moduleView_.handleScroll(event.wheel.y);
                    break;
                }
                if (screen_ == Screen::Home) {
                    (void)home_.handleScroll(event.wheel.y);
                    break;
                }
                int mx = 0;
                int my = 0;
                SDL_GetMouseState(&mx, &my);
                if (tempo_.handleScroll(static_cast<float>(mx), static_cast<float>(my),
                                        event.wheel.y)) {
                    applyTempo(tempo_.tempo());
                }
                break;
            }

            case SDL_KEYDOWN: {
                const SDL_Keycode key = event.key.keysym.sym;

                // F3 and F11 belong to the window, not to a screen.
                if (key == SDLK_F3) {
                    showDebug_ = !showDebug_;
                    break;
                }
                if (key == SDLK_F11) {
                    const bool fullscreen =
                        (SDL_GetWindowFlags(window_) & SDL_WINDOW_FULLSCREEN_DESKTOP) != 0;
                    SDL_SetWindowFullscreen(
                        window_, fullscreen ? 0 : SDL_WINDOW_FULLSCREEN_DESKTOP);
                    break;
                }

                switch (screen_) {
                    case Screen::Home:
                        handleHomeAction(home_.handleKey(key));
                        break;
                    case Screen::Module:
                        handleModuleAction(moduleView_.handleKey(key));
                        break;
                    case Screen::Library:
                        handleMenuAction(menu_.handleKey(key));
                        break;
                    case Screen::Game:
                        break;
                }
                if (screen_ != Screen::Game) {
                    break;
                }

                switch (key) {
                    // Escape leaves the run rather than the program: quitting
                    // outright from mid-song is never what a player means. It
                    // returns to wherever the run was started from, so the
                    // player lands back on the row they chose.
                    case SDLK_ESCAPE:
                        commitRun();
                        if (returnScreen_ == Screen::Module) {
                            enterModule(currentModuleId_);
                        } else if (returnScreen_ == Screen::Library) {
                            enterLibrary();
                        } else {
                            enterHome();
                        }
                        layout();
                        break;
                    case SDLK_SPACE: togglePlay(); break;
                    case SDLK_r: {
                        // Restarting a sight-reading exercise has to deal a
                        // new page, or the second read is not a first read.
                        const curriculum::Exercise* exercise =
                            currentExerciseId_.empty()
                                ? nullptr
                                : curriculum_.findExercise(currentExerciseId_);
                        if (exercise != nullptr && exercise->freshEveryTime) {
                            commitRun();
                            (void)startExercise(currentExerciseId_);
                        } else if (score_.has_value()) {
                            commitRun();          // file what was played so far
                            runReported_  = false;
                            runCommitted_ = false;
                            game_.start();
                            if (tone_.metronomeRunning()) {
                                startMetronomeAt(game_.songTime());
                            }
                        }
                        break;
                    }
                    case SDLK_o: openFileDialog(); break;

                    // Both the bracket pair and the minus/plus keys, because
                    // the on-screen buttons are labelled "-" and "+".
                    case SDLK_LEFTBRACKET:
                    case SDLK_MINUS:
                    case SDLK_KP_MINUS:
                        adjustTempo(-view::TempoControl::kStepBpm);
                        break;
                    case SDLK_RIGHTBRACKET:
                    case SDLK_EQUALS:
                    case SDLK_KP_PLUS:
                        adjustTempo(+view::TempoControl::kStepBpm);
                        break;

                    case SDLK_s:
                        showStaff_ = !showStaff_;
                        layout();
                        break;

                    // The drone and the click are the two things a player
                    // wants to change mid-exercise without stopping, so they
                    // get their own keys rather than living in a menu.
                    case SDLK_d:
                        if (tone_.available()) {
                            if (tone_.droneMidi() >= 0) {
                                tone_.clearDrone();
                                statusMessage_ = "Bordão desligado";
                            } else {
                                const curriculum::Exercise* exercise =
                                    currentExerciseId_.empty()
                                        ? nullptr
                                        : curriculum_.findExercise(currentExerciseId_);
                                // Falling back to the tonic of whatever is
                                // loaded means the key works on a file opened
                                // from the library too, not just on exercises
                                // that happen to ship with a drone.
                                const int midi =
                                    (exercise != nullptr && exercise->droneMidi >= 0)
                                        ? exercise->droneMidi
                                        : 45 + (((score_.has_value() ? score_->keyFifths : 0) * 7)
                                                % 12 + 12) % 12;
                                tone_.setDrone(midi);
                                char note[16] = {};
                                score::writeLatinName(note, sizeof(note), midi,
                                                      score_.has_value() ? score_->keyFifths : 0);
                                statusMessage_ = std::string("Bordão ") + note +
                                                 " - use fones de ouvido";
                            }
                            statusExpiry_ = elapsedTotal_ + kStatusDuration;
                        }
                        break;

                    case SDLK_m:
                        if (tone_.available()) {
                            if (tone_.metronomeRunning()) {
                                tone_.clearMetronome();
                                statusMessage_ = "Metrônomo desligado";
                            } else if (score_.has_value()) {
                                startMetronomeAt(game_.songTime());
                                statusMessage_ = "Metrônomo ligado";
                            }
                            statusExpiry_ = elapsedTotal_ + kStatusDuration;
                        }
                        break;

                    // Choosing an input is a library decision; sending the
                    // player there beats cycling blind through seventeen
                    // endpoints. The run is filed on the way out, exactly as
                    // Escape does - leaving by a different door should not
                    // cost the attempt.
                    case SDLK_i:
                        commitRun();
                        enterLibrary();
                        layout();
                        break;

                    default: break;
                }
                break;
            }

            default:
                break;
        }
    }
}

void Application::handleMenuAction(view::MenuAction action) {
    switch (action) {
        case view::MenuAction::Play:
            (void)startSelectedSong();
            break;
        case view::MenuAction::Browse:
            openFileDialog();
            break;
        case view::MenuAction::Back:
            enterHome();
            layout();
            break;
        case view::MenuAction::SelectionChanged:
            ensureSongParsed(menu_.selectedSongIndex());
            break;
        case view::MenuAction::DeviceChanged:
            applyMenuDevice();
            break;
        case view::MenuAction::None:
            break;
    }
}

void Application::update(double deltaSeconds) {
    // Steam delivers its callbacks here; skipping it is why achievements
    // "sometimes" fail to unlock.
    steam_.pump();

    // ── Drain the audio queue exactly once per frame ──────────────────────
    const std::size_t frameCount = audio_.poll(frameScratch_.data(), frameScratch_.size());
    if (frameCount > 0) {
        latestFrame_    = frameScratch_[frameCount - 1];
        hasLatestFrame_ = true;
    }

    const auto stateBefore = game_.state();
    game_.update(deltaSeconds, frameScratch_.data(), frameCount);

    // The click free-runs on the sound card's clock and the notes run on the
    // game's, so they have to be introduced to each other. The moment the
    // count-in ends is the only one where both agree on where beat one is.
    if (stateBefore == game::GameState::Countdown &&
        game_.state() == game::GameState::Playing) {
        if (tone_.metronomeRunning()) {
            startMetronomeAt(game_.songTime());
        }
    } else {
        followMetronomeBar();
    }

    if (game_.state() == game::GameState::Finished &&
        stateBefore != game::GameState::Finished && !runReported_ && score_.has_value()) {
        runReported_ = true;
        steam_.reportRunComplete(score_.value(), game_.stats(),
                                 static_cast<double>(targetBpm_) /
                                     std::max(1.0, originalBpm_));
        commitRun();
        // Both belong to the exercise, not to the results screen. Left
        // running, they cover the silence a player wants after a take - and
        // a drone still sounding while the report is up is genuinely
        // confusing about whether the run is over.
        tone_.clearMetronome();
        tone_.clearDrone();
    }

    if (score_.has_value()) {
        highway_.syncJudgements(game_, score_.value());
    }
    highway_.update(deltaSeconds);
    hud_.update(deltaSeconds, game_);

    // While a note is expected, the dial should answer "am I on THAT note",
    // not "am I near some note".
    float referenceCents = 0.0f;
    const bool hasReference =
        game_.state() == game::GameState::Playing && game_.liveCents(referenceCents);

    tuner_.update(deltaSeconds, latestFrame_, hasLatestFrame_, referenceCents, hasReference);

    if (screen_ == Screen::Library) {
        menu_.update(deltaSeconds, tuner_.level(), tuner_.noSignal());
    } else if (screen_ == Screen::Home) {
        home_.update(deltaSeconds, tuner_.level(), tuner_.noSignal());
    } else if (screen_ == Screen::Module) {
        moduleView_.update(deltaSeconds);
    } else {
        // Drive the metronome from the song clock, so the beat dots and the
        // notes crossing the hit line are the same event.
        int beat        = -1;
        int beatsPerBar = score_.has_value() ? score_->beatsPerMeasure : 4;
        if (score_.has_value() && game_.state() == game::GameState::Playing) {
            const std::size_t bar = score_->measureIndexAt(game_.songTime());
            if (bar < score_->measures.size()) {
                beat        = score_->beatAt(game_.songTime());
                beatsPerBar = score_->measures[bar].beats;
            }
        }
        tempo_.setBeat(beat, beatsPerBar);
        tempo_.update(deltaSeconds);
    }

    const double frameMs = deltaSeconds * 1000.0;
    frameTimeAvgMs_ += (frameMs - frameTimeAvgMs_) * 0.05;
}

void Application::render() {
    int width = 0;
    int height = 0;
    SDL_GL_GetDrawableSize(window_, &width, &height);

    glClearColor(theme::kBackground.r, theme::kBackground.g, theme::kBackground.b, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT);

    renderer_.beginFrame(width, height);

    const render::Rect screen{0.0f, 0.0f, static_cast<float>(width),
                              static_cast<float>(height)};

    view::HudContext context;
    context.game          = &game_;
    context.score         = score_.has_value() ? &score_.value() : nullptr;
    context.showStaff     = showStaff_;
    context.showDebug     = showDebug_;
    context.droppedFrames = audio_.droppedFrames();
    context.frameTimeMs   = frameTimeAvgMs_;
    context.drawCalls     = renderer_.drawCallsLastFrame();

    // The message fades out instead of vanishing, so it reads as an
    // announcement that is finishing rather than a glitch.
    const double remaining = statusExpiry_ - elapsedTotal_;
    if (remaining > 0.0) {
        context.toast      = statusMessage_;
        context.toastAlpha = static_cast<float>(
            std::clamp(remaining / kStatusFadeSec, 0.0, 1.0));
    }

    float liveCents = 0.0f;
    const bool hasLiveCents = game_.liveCents(liveCents);

    if (screen_ != Screen::Game) {
        switch (screen_) {
            case Screen::Home:    home_.draw(renderer_, fonts_); break;
            case Screen::Module:  moduleView_.draw(renderer_, fonts_); break;
            case Screen::Library: menu_.draw(renderer_, fonts_); break;
            case Screen::Game:    break;
        }
        // The tuner strip gets its own ground so it reads as a fixed tool
        // rather than as part of the scrolling list above it.
        const float tunerY = screen.h - layout::kReadoutHeight;
        renderer_.drawRect(0.0f, tunerY, screen.w, layout::kReadoutHeight, theme::kPanel);
        renderer_.drawRect(0.0f, tunerY, screen.w, 1.0f, theme::kDivider);
        tuner_.draw(renderer_, fonts_);
    } else {
        if (score_.has_value()) {
            highway_.draw(renderer_, fonts_, score_.value(), game_,
                          liveCents, hasLiveCents);
            if (showStaff_) {
                staff_.draw(renderer_, fonts_, score_.value(), game_);
            }
        }

        // The readout strip sits on its own ground so the three zones read as
        // one band rather than as things floating over the highway.
        const render::Rect readout{0.0f, screen.h - layout::kReadoutHeight,
                                   screen.w, layout::kReadoutHeight};
        renderer_.drawRect(readout.x, readout.y, readout.w, readout.h, theme::kPanel);
        renderer_.drawRect(readout.x, readout.y, readout.w, 1.0f, theme::kDivider);

        hud_.drawExpectedNote(renderer_, fonts_, expectedZone_, context);
        tuner_.draw(renderer_, fonts_);
        hud_.drawStats(renderer_, fonts_, statsZone_, context);

        hud_.drawHeader(renderer_, fonts_, context);
        tempo_.draw(renderer_, fontLabel_, fontBody_, fontLead_);

        if (game_.state() == game::GameState::Countdown) {
            hud_.drawCountdown(renderer_, fonts_, screen, game_.songTime());
        }
        if (game_.state() == game::GameState::Finished) {
            hud_.drawResults(renderer_, fonts_, screen, context);
        }
    }

    hud_.drawToast(renderer_, fonts_, screen, context);
    hud_.drawDebug(renderer_, fonts_, screen, context);

    renderer_.endFrame();
    SDL_GL_SwapWindow(window_);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Commands
// ═══════════════════════════════════════════════════════════════════════════

void Application::togglePlay() {
    if (!score_.has_value()) {
        openFileDialog();
        return;
    }
    switch (game_.state()) {
        case game::GameState::Playing:
        case game::GameState::Countdown:
            game_.pause();
            break;
        case game::GameState::Paused:
            game_.resume();
            break;
        case game::GameState::Idle:
        case game::GameState::Finished:
            runReported_ = false;
            game_.start();
            break;
    }
}

void Application::adjustTempo(int deltaBpm) {
    tempo_.setTempo(tempo_.tempo() + deltaBpm);
    applyTempo(tempo_.tempo());
}

void Application::applyTempo(int bpm) {
    if (!score_.has_value()) {
        return;
    }
    targetBpm_ = std::clamp(bpm, view::TempoControl::kMinBpm, view::TempoControl::kMaxBpm);
    tempo_.setTempo(targetBpm_);
    score_->applyTempoScale(static_cast<double>(targetBpm_) / std::max(1.0, originalBpm_));

    // The judged timeline and the one the player has been reading must agree,
    // so a tempo change restarts the run rather than shifting it underneath.
    if (game_.state() != game::GameState::Idle) {
        runReported_ = false;
        game_.start();
        statusMessage_ = "Reiniciado no novo andamento";
        statusExpiry_  = elapsedTotal_ + kStatusDuration;
    }
    // The click has to follow, or the tempo control silently means two
    // different things depending on whether you can hear it.
    if (tone_.metronomeRunning() && score_.has_value()) {
        startMetronomeAt(game_.songTime());
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Offscreen capture
// ═══════════════════════════════════════════════════════════════════════════

void Application::runOffscreenCapture() {
    constexpr double kStep = 1.0 / 120.0;   // fixed step: capture is deterministic

    if (score_.has_value()) {
        game_.setLeadInSeconds(0.5);
        runReported_ = false;
        game_.start();
        synthetic_.reset();

        std::vector<audio::PitchFrame> frames(256);
        for (double t = game_.songTime(); t < config_.screenshotAtSeconds; t += kStep) {
            const std::size_t count = (t >= 0.0)
                ? synthetic_.generate(score_.value(), t, t + kStep, frames.data(), frames.size())
                : 0;
            game_.update(kStep, frames.data(), count);
            if (count > 0) {
                latestFrame_    = frames[count - 1];
                hasLatestFrame_ = true;
            }
            highway_.syncJudgements(game_, score_.value());
            highway_.update(kStep);
            hud_.update(kStep, game_);

            float referenceCents = 0.0f;
            const bool hasReference = game_.liveCents(referenceCents);
            tuner_.update(kStep, latestFrame_, hasLatestFrame_, referenceCents, hasReference);
        }
    }

    // Two frames: the first warms up the driver and any lazily-created GL
    // objects, so the captured one is what a steady-state frame looks like.
    render();
    render();

    std::string error;
    if (captureScreenshot(config_.screenshotPath, &error)) {
        std::printf("wrote %s\n", config_.screenshotPath.c_str());
        if (score_.has_value()) {
            const auto& stats = game_.stats();
            std::printf("  simulated to %.2fs: %d pts, %d judged, %.0f%% accuracy\n",
                        game_.songTime(), stats.score, stats.judgedNotes,
                        static_cast<double>(stats.accuracyPct));
        }
    } else {
        std::fprintf(stderr, "screenshot failed: %s\n", error.c_str());
    }
}

bool Application::captureScreenshot(const std::string& path, std::string* error) {
    int width = 0;
    int height = 0;
    SDL_GL_GetDrawableSize(window_, &width, &height);
    if (width <= 0 || height <= 0) {
        if (error != nullptr) { *error = "Drawable has zero area."; }
        return false;
    }

    std::vector<unsigned char> pixels(static_cast<std::size_t>(width) *
                                      static_cast<std::size_t>(height) * 4u);
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glReadBuffer(GL_BACK);
    glReadPixels(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());

    // GL hands back bottom-up rows; PNG wants top-down.
    const std::size_t stride = static_cast<std::size_t>(width) * 4u;
    std::vector<unsigned char> flipped(pixels.size());
    for (int row = 0; row < height; ++row) {
        std::copy_n(pixels.begin() + static_cast<std::size_t>(height - 1 - row) * stride,
                    stride, flipped.begin() + static_cast<std::size_t>(row) * stride);
    }

    std::size_t pngSize = 0;
    void* png = tdefl_write_image_to_png_file_in_memory_ex(
        flipped.data(), width, height, 4, &pngSize, 6, MZ_FALSE);
    if (png == nullptr) {
        if (error != nullptr) { *error = "PNG encoding failed."; }
        return false;
    }

    std::ofstream file(path, std::ios::binary);
    const bool ok = file.write(static_cast<const char*>(png),
                               static_cast<std::streamsize>(pngSize)).good();
    mz_free(png);

    if (!ok && error != nullptr) {
        *error = "Cannot write " + path;
    }
    return ok;
}

void Application::openFileDialog() {
    const std::string songsDir =
        (std::filesystem::path(config_.assetsDir) / "songs").string();
    const std::string path = platform::openScoreDialog(songsDir);
    if (path.empty()) {
        return;
    }
    std::string error;
    if (!loadSong(path, &error)) {
        statusMessage_ = error;
        statusExpiry_  = elapsedTotal_ + kStatusDuration;
    }
}

}  // namespace fretless::app
