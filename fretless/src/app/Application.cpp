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
#include "fretless/platform/FileDialog.h"
#include "fretless/score/MusicXmlParser.h"

namespace fretless::app {
namespace {

constexpr double kStatusDuration = 3.0;
constexpr double kStatusFadeSec  = 0.6;
constexpr std::size_t kMaxFramesPerTick = 64;

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

    statusMessage_ = "Tuner live.";
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
    steam_.shutdown();
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
    std::snprintf(message, sizeof(message), "Loaded %zu notes", score_->noteCount());
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
        statusMessage_ = "Input failed: " + error;
        statusExpiry_  = elapsedTotal_ + kStatusDuration;
        return;
    }
    config_.audio   = audioConfig;
    hasLatestFrame_ = false;
    latestFrame_    = audio::PitchFrame{};
    statusMessage_  = "Input: " + devices_[static_cast<std::size_t>(currentDeviceSlot_)].name;
    statusExpiry_   = elapsedTotal_ + kStatusDuration;
    // The dead-line timer must not carry over: the new device deserves its
    // own grace period before we accuse it of being silent.
    tuner_.resetSignalWatch();
}

void Application::enterMenu() {
    screen_ = Screen::Menu;
    game_.stop();
    scanSongLibrary();
    menu_.setDevices(devices_);
    if (currentDeviceSlot_ >= 0 && currentDeviceSlot_ < static_cast<int>(devices_.size())) {
        menu_.selectDeviceByEngineIndex(devices_[static_cast<std::size_t>(currentDeviceSlot_)].index);
    }
}

void Application::enterGame() {
    screen_ = Screen::Game;
}

bool Application::startSelectedSong() {
    const view::SongEntry* entry = menu_.selectedSong();
    if (entry == nullptr) {
        return false;
    }
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

    if (screen_ == Screen::Menu) {
        // The menu is one full-bleed surface. The tuner rides along the bottom
        // so the input meter is visible while an input is being chosen —
        // testing a microphone means watching it respond while you play.
        const float tunerHeight = layout::kReadoutHeight;
        menu_.setBounds({0.0f, 0.0f, w, h - tunerHeight});
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
        view::TempoControl::preferredWidth(score_.has_value() ? score_->beatsPerMeasure : 4)));

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
                    enterGame();
                    layout();
                    runReported_ = false;
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
                if (screen_ == Screen::Menu) {
                    (void)menu_.handleMouseMove(mx, my);
                } else {
                    (void)tempo_.handleMouseMove(mx, my);
                }
                break;
            }

            case SDL_MOUSEBUTTONDOWN: {
                if (event.button.button != SDL_BUTTON_LEFT) {
                    break;
                }
                const auto mx = static_cast<float>(event.button.x);
                const auto my = static_cast<float>(event.button.y);
                if (screen_ == Screen::Menu) {
                    handleMenuAction(menu_.handleMouseClick(mx, my));
                } else if (tempo_.handleMouseClick(mx, my)) {
                    applyTempo(tempo_.tempo());
                }
                break;
            }

            case SDL_MOUSEWHEEL: {
                if (screen_ == Screen::Menu) {
                    (void)menu_.handleScroll(event.wheel.y);
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

                if (screen_ == Screen::Menu) {
                    handleMenuAction(menu_.handleKey(key));
                    break;
                }

                switch (key) {
                    // Escape leaves the run rather than the program: quitting
                    // outright from mid-song is never what a player means.
                    case SDLK_ESCAPE:
                        enterMenu();
                        layout();
                        break;
                    case SDLK_SPACE: togglePlay(); break;
                    case SDLK_r:
                        if (score_.has_value()) {
                            runReported_ = false;
                            game_.start();
                        }
                        break;
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

                    // Choosing an input is a menu decision; sending the player
                    // there beats cycling blind through seventeen endpoints.
                    case SDLK_i:
                        enterMenu();
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
        case view::MenuAction::Quit:
            running_ = false;
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

    if (game_.state() == game::GameState::Finished &&
        stateBefore != game::GameState::Finished && !runReported_ && score_.has_value()) {
        runReported_ = true;
        steam_.reportRunComplete(score_.value(), game_.stats(),
                                 static_cast<double>(targetBpm_) /
                                     std::max(1.0, originalBpm_));
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

    if (screen_ == Screen::Menu) {
        menu_.update(deltaSeconds, tuner_.level(), tuner_.noSignal());
    } else {
        // Drive the metronome from the song clock, so the beat dots and the
        // notes crossing the hit line are the same event.
        int beat = -1;
        if (score_.has_value() && game_.state() == game::GameState::Playing &&
            score_->beatsPerMinute > 0.0) {
            const double secondsPerBeat =
                60.0 / score_->beatsPerMinute * 4.0 / score_->beatUnit;
            if (secondsPerBeat > 0.0 && game_.songTime() >= 0.0) {
                const auto elapsedBeats =
                    static_cast<long long>(game_.songTime() / secondsPerBeat);
                beat = static_cast<int>(elapsedBeats % score_->beatsPerMeasure);
            }
        }
        tempo_.setBeat(beat, score_.has_value() ? score_->beatsPerMeasure : 4);
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

    if (screen_ == Screen::Menu) {
        menu_.draw(renderer_, fonts_);
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
        statusMessage_ = "Restarted at the new tempo";
        statusExpiry_  = elapsedTotal_ + kStatusDuration;
    }
}

void Application::cycleInputDevice(int direction) {
    if (devices_.empty()) {
        return;
    }
    const int count = static_cast<int>(devices_.size());
    currentDeviceSlot_ = ((currentDeviceSlot_ + direction) % count + count) % count;

    audio_.stop();
    audio_.shutdown();

    auto audioConfig = config_.audio;
    audioConfig.deviceIndex = devices_[static_cast<std::size_t>(currentDeviceSlot_)].index;

    std::string error;
    if (!audio_.initialize(audioConfig, &error) || !audio_.start(&error)) {
        statusMessage_ = "Input device failed: " + error;
        statusExpiry_  = elapsedTotal_ + kStatusDuration;
        return;
    }
    config_.audio  = audioConfig;
    statusMessage_ = "Input: " + devices_[static_cast<std::size_t>(currentDeviceSlot_)].name;
    statusExpiry_  = elapsedTotal_ + kStatusDuration;
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
