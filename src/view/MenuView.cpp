#include "fretless/view/MenuView.h"

#include <SDL_keycode.h>

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <map>

#include "fretless/app/Layout.h"
#include "fretless/app/Theme.h"

namespace fretless::view {
namespace {

using namespace fretless::app::theme;
namespace layout = fretless::app::layout;

void formatDuration(char* out, std::size_t size, double seconds) {
    const int total = static_cast<int>(seconds + 0.5);
    std::snprintf(out, size, "%d:%02d", total / 60, total % 60);
}

/// Truncates to at most `maxChars` codepoints. Cutting a std::string at a byte
/// offset can split a multi-byte sequence, which renders as a stray glyph.
std::string truncate(const std::string& text, std::size_t maxChars) {
    std::size_t index = 0;
    std::size_t chars = 0;
    while (index < text.size() && chars < maxChars) {
        (void)render::nextCodepoint(text, index);
        ++chars;
    }
    return (index >= text.size()) ? text : text.substr(0, index) + "...";
}

/// Key signature as musicians name it, from the circle of fifths.
const char* keyName(int fifths) noexcept {
    constexpr const char* kMajor[15] = {
        "Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F",
        "C",
        "G", "D", "A", "E", "B", "F#", "C#",
    };
    return kMajor[std::clamp(fifths + 7, 0, 14)];
}

/// Lower is better. WASAPI and WDM-KS reach the hardware; MME and DirectSound
/// go through the system mixer and cost tens of milliseconds.
int hostApiRank(const std::string& hostApi) noexcept {
    if (hostApi.find("WASAPI")      != std::string::npos) { return 0; }
    if (hostApi.find("WDM-KS")      != std::string::npos) { return 1; }
    if (hostApi.find("ASIO")        != std::string::npos) { return 0; }
    if (hostApi.find("DirectSound") != std::string::npos) { return 2; }
    if (hostApi.find("MME")         != std::string::npos) { return 3; }
    return 4;
}

/// Device names differ only by their driver suffix across host APIs, and MME
/// truncates them to 31 characters. Folding on a normalized prefix groups the
/// same physical microphone together.
std::string deviceKey(const std::string& name) {
    std::string key;
    key.reserve(name.size());
    for (const unsigned char ch : name) {
        if (std::isalnum(ch) != 0) {
            key.push_back(static_cast<char>(std::tolower(ch)));
        }
        if (key.size() >= 24) {   // MME's 31-char cap lands well past this
            break;
        }
    }
    return key;
}

}  // namespace

// ═══════════════════════════════════════════════════════════════════════════
//  Data
// ═══════════════════════════════════════════════════════════════════════════

void MenuView::setSongs(std::vector<SongEntry> songs) {
    songs_      = std::move(songs);
    songIndex_  = 0;
    songScroll_ = 0;
}

const SongEntry* MenuView::selectedSong() const noexcept {
    return (songIndex_ < songs_.size()) ? &songs_[songIndex_] : nullptr;
}

void MenuView::setDevices(const std::vector<audio::AudioDeviceInfo>& devices) {
    std::map<std::string, DeviceRow> best;

    for (const auto& device : devices) {
        DeviceRow row;
        row.engineIndex = device.index;
        row.name        = device.name;
        row.hostApi     = device.hostApi;
        row.latencyMs   = device.lowInputLatencySec * 1000.0;
        row.isDefault   = device.isDefault;

        const std::string key = deviceKey(device.name);
        const auto it = best.find(key);
        if (it == best.end()) {
            best.emplace(key, std::move(row));
            continue;
        }
        // Keep the better host API; on a tie keep the lower latency. The
        // default device always wins so the list agrees with what is open.
        const int existing = hostApiRank(it->second.hostApi);
        const int candidate = hostApiRank(row.hostApi);
        if (row.isDefault ||
            candidate < existing ||
            (candidate == existing && row.latencyMs < it->second.latencyMs)) {
            const bool keepDefault = it->second.isDefault && !row.isDefault;
            if (!keepDefault) {
                it->second = std::move(row);
            }
        }
    }

    deviceRows_.clear();
    deviceRows_.reserve(best.size());
    for (auto& [key, row] : best) {
        deviceRows_.push_back(std::move(row));
    }

    // The device the engine has open sorts first; the rest by how close to the
    // hardware they sit, which is the only thing that matters for latency.
    std::sort(deviceRows_.begin(), deviceRows_.end(),
              [](const DeviceRow& a, const DeviceRow& b) {
                  if (a.isDefault != b.isDefault) { return a.isDefault; }
                  const int ra = hostApiRank(a.hostApi);
                  const int rb = hostApiRank(b.hostApi);
                  if (ra != rb) { return ra < rb; }
                  return a.name < b.name;
              });

    deviceRow_    = 0;
    deviceScroll_ = 0;
}

int MenuView::deviceIndexForRow(std::size_t row) const noexcept {
    return (row < deviceRows_.size()) ? deviceRows_[row].engineIndex : -1;
}

void MenuView::selectDeviceByEngineIndex(int engineIndex) noexcept {
    for (std::size_t i = 0; i < deviceRows_.size(); ++i) {
        if (deviceRows_[i].engineIndex == engineIndex) {
            deviceRow_ = i;
            return;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Geometry
// ═══════════════════════════════════════════════════════════════════════════

// Panels are sized to their content and the pair is centred. Stretching a
// list of short device names across half a 1600 px window reads as an
// unfinished layout, and pinning both to the left edge leaves the right third
// of the screen visibly empty.
float MenuView::contentWidth() const noexcept {
    return std::min(bounds_.w - layout::kGutter * 2.0f, 1340.0f);
}

float MenuView::contentX() const noexcept {
    return bounds_.centerX() - contentWidth() * 0.5f;
}

render::Rect MenuView::songPanel() const noexcept {
    const float inputW = std::min(400.0f, contentWidth() * 0.30f);
    return {contentX(), bounds_.y + kPanelTop,
            contentWidth() - inputW - layout::kSpaceLg,
            bounds_.h - kPanelTop - 148.0f};
}

render::Rect MenuView::inputPanel() const noexcept {
    const render::Rect songs = songPanel();
    return {songs.right() + layout::kSpaceLg, songs.y,
            std::min(400.0f, contentWidth() * 0.30f), songs.h};
}

void MenuView::clampScroll() {
    const float listTop = 46.0f;
    const auto visibleSongs = static_cast<std::size_t>(
        std::max(0.0f, (songPanel().h - listTop) / kRowHeight));
    const auto visibleDevices = static_cast<std::size_t>(
        std::max(0.0f, (inputPanel().h - listTop) / kRowHeight));

    if (visibleSongs > 0) {
        if (songIndex_ < songScroll_) {
            songScroll_ = songIndex_;
        } else if (songIndex_ >= songScroll_ + visibleSongs) {
            songScroll_ = songIndex_ - visibleSongs + 1;
        }
    }
    if (visibleDevices > 0) {
        if (deviceRow_ < deviceScroll_) {
            deviceScroll_ = deviceRow_;
        } else if (deviceRow_ >= deviceScroll_ + visibleDevices) {
            deviceScroll_ = deviceRow_ - visibleDevices + 1;
        }
    }
}

void MenuView::update(double deltaSeconds, float inputLevel, bool noSignal) {
    elapsed_   += deltaSeconds;
    inputLevel_ = inputLevel;
    noSignal_   = noSignal;
    tempo_.update(deltaSeconds);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Input
// ═══════════════════════════════════════════════════════════════════════════

MenuAction MenuView::handleKey(int key) {
    switch (key) {
        case SDLK_ESCAPE:
            return MenuAction::Quit;

        case SDLK_RETURN:
        case SDLK_KP_ENTER:
        case SDLK_SPACE:
            return songs_.empty() ? MenuAction::Browse : MenuAction::Play;

        case SDLK_o:
            return MenuAction::Browse;

        case SDLK_TAB:
        case SDLK_RIGHT:
        case SDLK_LEFT:
        case SDLK_i:
            pane_ = (pane_ == MenuPane::Songs) ? MenuPane::Inputs : MenuPane::Songs;
            return MenuAction::None;

        case SDLK_UP:
        case SDLK_DOWN: {
            const int step = (key == SDLK_UP) ? -1 : 1;
            if (pane_ == MenuPane::Songs) {
                if (songs_.empty()) {
                    return MenuAction::None;
                }
                const auto count = static_cast<int>(songs_.size());
                songIndex_ = static_cast<std::size_t>(
                    ((static_cast<int>(songIndex_) + step) % count + count) % count);
                clampScroll();
                return MenuAction::SelectionChanged;
            }
            if (deviceRows_.empty()) {
                return MenuAction::None;
            }
            const auto count = static_cast<int>(deviceRows_.size());
            deviceRow_ = static_cast<std::size_t>(
                ((static_cast<int>(deviceRow_) + step) % count + count) % count);
            clampScroll();
            return MenuAction::DeviceChanged;
        }

        case SDLK_LEFTBRACKET:
        case SDLK_MINUS:
            tempo_.setTempo(tempo_.tempo() - TempoControl::kStepBpm);
            return MenuAction::None;
        case SDLK_RIGHTBRACKET:
        case SDLK_EQUALS:
            tempo_.setTempo(tempo_.tempo() + TempoControl::kStepBpm);
            return MenuAction::None;

        default:
            return MenuAction::None;
    }
}

MenuAction MenuView::handleMouseMove(float x, float y) {
    (void)tempo_.handleMouseMove(x, y);

    const render::Rect songs  = songPanel();
    const render::Rect inputs = inputPanel();
    const float listTop = 46.0f;

    hoveredSongRow_   = -1;
    hoveredDeviceRow_ = -1;

    if (songs.contains(x, y) && y > songs.y + listTop) {
        hoveredSongRow_ = static_cast<int>((y - songs.y - listTop) / kRowHeight);
    } else if (inputs.contains(x, y) && y > inputs.y + listTop) {
        hoveredDeviceRow_ = static_cast<int>((y - inputs.y - listTop) / kRowHeight);
    }
    return MenuAction::None;
}

MenuAction MenuView::handleMouseClick(float x, float y) {
    (void)handleMouseMove(x, y);

    if (tempo_.handleMouseClick(x, y)) {
        return MenuAction::None;
    }

    if (hoveredSongRow_ >= 0) {
        const std::size_t index = songScroll_ + static_cast<std::size_t>(hoveredSongRow_);
        if (index < songs_.size()) {
            // Clicking the row that is already selected means "play it", which
            // makes a double click work the way a file list trains people to
            // expect without needing a separate double-click path.
            const bool alreadySelected = (index == songIndex_);
            songIndex_ = index;
            pane_      = MenuPane::Songs;
            clampScroll();
            return alreadySelected ? MenuAction::Play : MenuAction::SelectionChanged;
        }
    }
    if (hoveredDeviceRow_ >= 0) {
        const std::size_t row = deviceScroll_ + static_cast<std::size_t>(hoveredDeviceRow_);
        if (row < deviceRows_.size()) {
            deviceRow_ = row;
            pane_      = MenuPane::Inputs;
            clampScroll();
            return MenuAction::DeviceChanged;
        }
    }
    return MenuAction::None;
}

MenuAction MenuView::handleScroll(int amount) {
    const float listTop = 46.0f;
    if (pane_ == MenuPane::Songs) {
        const auto visible = static_cast<int>(
            std::max(0.0f, (songPanel().h - listTop) / kRowHeight));
        const int maximum = static_cast<int>(songs_.size()) - visible;
        songScroll_ = static_cast<std::size_t>(
            std::clamp(static_cast<int>(songScroll_) - amount, 0, std::max(0, maximum)));
    } else {
        const auto visible = static_cast<int>(
            std::max(0.0f, (inputPanel().h - listTop) / kRowHeight));
        const int maximum = static_cast<int>(deviceRows_.size()) - visible;
        deviceScroll_ = static_cast<std::size_t>(
            std::clamp(static_cast<int>(deviceScroll_) - amount, 0, std::max(0, maximum)));
    }
    return MenuAction::None;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Drawing
// ═══════════════════════════════════════════════════════════════════════════

void MenuView::draw(render::Renderer2D& renderer, const render::FontSet& fonts) {
    renderer.drawRect(bounds_.x, bounds_.y, bounds_.w, bounds_.h, kBackground);

    // The four string colours across the top tie the menu to the highway
    // without repeating its layout.
    for (int i = 0; i < 4; ++i) {
        renderer.drawRect(bounds_.x + bounds_.w * (static_cast<float>(i) / 4.0f),
                          bounds_.y, bounds_.w * 0.25f, 3.0f,
                          kStringColor[i].withAlpha(0.85f));
    }

    // ── Title ─────────────────────────────────────────────────────────────
    renderer.drawText(*fonts.hero, contentX(),
                      bounds_.y + layout::kSpaceXx + 24.0f, "FRETLESS", kTextPrimary);
    renderer.drawText(*fonts.body, contentX(),
                      bounds_.y + layout::kSpaceXx + 50.0f,
                      "violin practice, judged note by note", kTextMuted);

    const render::Rect songs  = songPanel();
    const render::Rect inputs = inputPanel();
    const float listTop = 46.0f;

    const auto visibleSongs = static_cast<std::size_t>(
        std::max(0.0f, (songs.h - listTop) / kRowHeight));
    const auto visibleDevices = static_cast<std::size_t>(
        std::max(0.0f, (inputs.h - listTop) / kRowHeight));

    char buffer[224];

    auto drawPanel = [&](const render::Rect& panel, const char* heading, bool focused) {
        renderer.drawRoundedRect(panel.x, panel.y, panel.w, panel.h, layout::kRadiusLg,
                                 kPanel);
        // Focus is shown by a rule under the heading rather than a full border:
        // a border around the active panel fights the selected row inside it.
        renderer.drawText(*fonts.label, panel.x + layout::kSpaceLg,
                          panel.y + 28.0f, heading,
                          focused ? kTextSecondary : kTextMuted);
        if (focused) {
            renderer.drawRoundedRect(panel.x + layout::kSpaceLg, panel.y + 36.0f,
                                     28.0f, 2.0f, 1.0f, kStringColor[2]);
        }
    };

    auto drawRow = [&](const render::Rect& panel, float y, bool selected, bool hovered,
                       const render::Color& accent) {
        if (selected) {
            renderer.drawRoundedRect(panel.x + layout::kSpaceSm, y,
                                     panel.w - layout::kSpaceSm * 2.0f,
                                     kRowHeight - 6.0f, layout::kRadiusMd,
                                     accent.withAlpha(0.14f));
            renderer.drawRoundedRect(panel.x + layout::kSpaceSm, y + 8.0f, 3.0f,
                                     kRowHeight - 22.0f, 1.5f, accent);
        } else if (hovered) {
            renderer.drawRoundedRect(panel.x + layout::kSpaceSm, y,
                                     panel.w - layout::kSpaceSm * 2.0f,
                                     kRowHeight - 6.0f, layout::kRadiusMd, kPanelRaised);
        }
    };

    // ── Pieces ────────────────────────────────────────────────────────────
    drawPanel(songs, "CHOOSE A PIECE", pane_ == MenuPane::Songs);

    if (songs_.empty()) {
        renderer.drawText(*fonts.body, songs.x + layout::kSpaceLg,
                          songs.y + listTop + 30.0f,
                          "No scores in assets/songs.", kTextSecondary);
        renderer.drawText(*fonts.body, songs.x + layout::kSpaceLg,
                          songs.y + listTop + 54.0f,
                          "Press O to browse, or drop a file on the window.", kTextMuted);
    }

    for (std::size_t row = 0; row < visibleSongs; ++row) {
        const std::size_t index = songScroll_ + row;
        if (index >= songs_.size()) {
            break;
        }
        const auto& song = songs_[index];
        const float y = songs.y + listTop + static_cast<float>(row) * kRowHeight;
        const bool selected = (index == songIndex_);

        drawRow(songs, y, selected, static_cast<int>(row) == hoveredSongRow_,
                kStringColor[2]);

        const char* label = song.title.empty() ? song.fileName.c_str()
                                               : song.title.c_str();
        renderer.drawText(*fonts.body, songs.x + layout::kSpaceLg + 12.0f, y + 21.0f,
                          truncate(label, 40),
                          selected ? kTextPrimary : kTextSecondary);

        // Each row carries its own summary, so nothing has to be read from a
        // separate detail strip elsewhere on the screen.
        if (song.parsed) {
            char duration[16];
            formatDuration(duration, sizeof(duration), song.durationSec);
            std::snprintf(buffer, sizeof(buffer), "%zu notes   %s major   %d/%d   %.0f BPM",
                          song.noteCount, keyName(song.keyFifths),
                          song.beats, song.beatUnit, song.bpm);
            renderer.drawText(*fonts.label, songs.x + layout::kSpaceLg + 12.0f,
                              y + 37.0f, buffer, kTextMuted);
            renderer.drawTextAligned(*fonts.body, songs.x, y + 21.0f,
                                     songs.w - layout::kSpaceLg - 12.0f,
                                     render::TextAlign::Right, duration, kTextMuted);
        } else if (song.failed) {
            renderer.drawText(*fonts.label, songs.x + layout::kSpaceLg + 12.0f,
                              y + 37.0f, "unreadable", kMiss);
        }
    }

    // ── Inputs ────────────────────────────────────────────────────────────
    drawPanel(inputs, "INPUT", pane_ == MenuPane::Inputs);

    for (std::size_t row = 0; row < visibleDevices; ++row) {
        const std::size_t index = deviceScroll_ + row;
        if (index >= deviceRows_.size()) {
            break;
        }
        const auto& device = deviceRows_[index];
        const float y = inputs.y + listTop + static_cast<float>(row) * kRowHeight;
        const bool isCurrent = (index == deviceRow_);

        drawRow(inputs, y, isCurrent, static_cast<int>(row) == hoveredDeviceRow_,
                kStringColor[0]);

        renderer.drawText(*fonts.body, inputs.x + layout::kSpaceLg + 12.0f, y + 21.0f,
                          truncate(device.name, 24),
                          isCurrent ? kTextPrimary : kTextSecondary);

        std::snprintf(buffer, sizeof(buffer), "%s   %.0f ms",
                      device.hostApi.c_str(), device.latencyMs);
        renderer.drawText(*fonts.label, inputs.x + layout::kSpaceLg + 12.0f, y + 37.0f,
                          buffer, kTextMuted);

        // The meter runs only on the open device. Opening every endpoint at
        // once is not possible, and selecting a row reopens the engine, so
        // moving the cursor is how you test an input.
        if (isCurrent) {
            const float meterW = 62.0f;
            const float meterX = inputs.right() - layout::kSpaceLg - 12.0f - meterW;
            renderer.drawRoundedRect(meterX, y + 16.0f, meterW, 6.0f, 3.0f, kPanelRaised);
            const auto color = noSignal_ ? kMiss : kPerfect;
            renderer.drawRoundedRect(meterX, y + 16.0f, meterW * inputLevel_, 6.0f, 3.0f,
                                     color);
            renderer.drawTextAligned(*fonts.label, meterX, y + 38.0f, meterW,
                                     render::TextAlign::Right,
                                     noSignal_ ? "no signal" : "live", color);
        }
    }

    // ── Tempo, then the key map, on the baseline ──────────────────────────
    const float footerY = bounds_.bottom() - layout::kSpaceXl;
    const float tempoY = songs.bottom() + layout::kSpaceMd;
    renderer.drawText(*fonts.label, songs.x, tempoY + 12.0f, "TEMPO", kTextMuted);
    tempo_.setBounds({songs.x + 58.0f, tempoY, TempoControl::preferredWidth(4), 48.0f});
    tempo_.draw(renderer, *fonts.label, *fonts.body, *fonts.lead);

    renderer.drawRect(contentX(), footerY - layout::kSpaceLg,
                      contentWidth(), layout::kHairline, kDivider);
    renderer.drawText(*fonts.label, contentX(), footerY,
                      "ENTER  play          TAB  switch panel          "
                      "UP / DOWN  select          O  browse          ESC  quit",
                      kTextMuted);

    if (noSignal_) {
        renderer.drawTextAligned(*fonts.label, contentX(), footerY,
                                 contentWidth(), render::TextAlign::Right,
                                 "play something - if no meter moves, try another input",
                                 kMiss.withAlpha(0.7f + 0.3f *
                                     std::sin(static_cast<float>(elapsed_) * 3.0f)));
    }
}

}  // namespace fretless::view
