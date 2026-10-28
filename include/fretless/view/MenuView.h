// ═══════════════════════════════════════════════════════════════════════════
//  MenuView.h — the start screen.
//
//  Two lists side by side: the pieces to play, and the audio input to play
//  them into. The input list carries a live level meter for the device under
//  the cursor, because "the tuner does not move" is almost always a muted or
//  wrong endpoint, and the only way a player can tell is to see the meter
//  respond while they make a sound.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstddef>
#include <string>
#include <vector>

#include "fretless/audio/AudioEngine.h"
#include "fretless/render/FontSet.h"
#include "fretless/view/TempoControl.h"
#include "fretless/render/Rect.h"
#include "fretless/render/Renderer2D.h"

namespace fretless::view {

/// One row in the song list. The summary fields are filled in the first time
/// the entry is selected, so a folder of 200 scores does not stall startup.
struct SongEntry {
    std::string path;
    std::string fileName;
    std::string title;
    std::string composer;
    std::size_t noteCount   = 0;
    double      durationSec = 0.0;
    double      bpm         = 0.0;
    int         beats       = 4;
    int         beatUnit    = 4;
    int         keyFifths   = 0;
    bool        parsed      = false;
    bool        failed      = false;
    std::string error;
};

/// Which list has keyboard focus.
enum class MenuPane : std::uint8_t { Songs, Inputs };

/// What the menu is asking the application to do this frame.
enum class MenuAction : std::uint8_t {
    None,
    Play,            ///< start the selected song
    Browse,          ///< open the file dialog
    Back,            ///< return to the home screen
    SelectionChanged,///< a different song is highlighted; parse it
    DeviceChanged,   ///< a different input is highlighted; reopen the engine
};

class MenuView {
public:
    void setBounds(const render::Rect& bounds) noexcept { bounds_ = bounds; }

    void setSongs(std::vector<SongEntry> songs);
    [[nodiscard]] std::vector<SongEntry>& songs() noexcept { return songs_; }
    [[nodiscard]] const SongEntry* selectedSong() const noexcept;
    [[nodiscard]] std::size_t selectedSongIndex() const noexcept { return songIndex_; }
    /// Restores a selection across a rescan. Without it, every return to this
    /// screen sends the cursor back to the first file, which is the sort of
    /// small betrayal that makes a list feel untrustworthy.
    void selectSongByPath(const std::string& path) noexcept;

    /// Takes the raw PortAudio list and keeps one row per physical input,
    /// preferring the lowest-latency host API. Seventeen rows, most of them
    /// the same three microphones seen through four drivers, is a list nobody
    /// can choose from.
    void setDevices(const std::vector<audio::AudioDeviceInfo>& devices);
    /// Maps a row back to its index in the engine's full device list.
    [[nodiscard]] int deviceIndexForRow(std::size_t row) const noexcept;
    /// Selects the row that corresponds to an engine device index.
    void selectDeviceByEngineIndex(int engineIndex) noexcept;
    [[nodiscard]] std::size_t selectedDeviceRow() const noexcept { return deviceRow_; }

    void setTempo(int bpm) noexcept { tempo_.setTempo(bpm); }
    void setWrittenTempo(double bpm) noexcept { tempo_.setWrittenTempo(bpm); }
    [[nodiscard]] int tempo() const noexcept { return tempo_.tempo(); }

    void update(double deltaSeconds, float inputLevel, bool noSignal);

    /// Keyboard. `key` is an SDL keycode.
    [[nodiscard]] MenuAction handleKey(int key);
    /// Mouse. Returns an action when a click lands on something actionable.
    [[nodiscard]] MenuAction handleMouseMove(float x, float y);
    [[nodiscard]] MenuAction handleMouseClick(float x, float y);
    [[nodiscard]] MenuAction handleScroll(int amount);

    void draw(render::Renderer2D& renderer, const render::FontSet& fonts);

private:
    /// One presented input, after deduplication.
    struct DeviceRow {
        int         engineIndex = -1;   ///< index into the engine's device list
        std::string name;
        std::string hostApi;
        double      latencyMs = 0.0;
        bool        isDefault = false;
    };

    /// Everything on the page aligns to one centred column, so the layout
    /// does not drift to the left edge of a wide window.
    [[nodiscard]] float contentWidth() const noexcept;
    [[nodiscard]] float contentX() const noexcept;
    [[nodiscard]] render::Rect songPanel() const noexcept;
    [[nodiscard]] render::Rect inputPanel() const noexcept;
    void clampScroll();

    /// Two lines per row: the name, and what it is. A single line forced the
    /// detail somewhere else, which made every row look identical.
    static constexpr float kRowHeight = 50.0f;
    static constexpr float kPanelTop  = 176.0f;

    render::Rect bounds_{};
    std::vector<SongEntry> songs_;
    std::vector<DeviceRow> deviceRows_;

    std::size_t songIndex_    = 0;
    std::size_t deviceRow_    = 0;
    std::size_t songScroll_   = 0;
    std::size_t deviceScroll_ = 0;
    MenuPane    pane_         = MenuPane::Songs;

    /// The same control the game header uses, so the interaction is learned
    /// once. Placed where the eye lands after choosing a piece.
    TempoControl tempo_;

    float  inputLevel_ = 0.0f;
    bool   noSignal_   = false;
    double elapsed_    = 0.0;

    /// Rows currently on screen, for hit testing.
    int hoveredSongRow_   = -1;
    int hoveredDeviceRow_ = -1;
    std::size_t visibleSongRows_   = 0;
    std::size_t visibleDeviceRows_ = 0;
};

}  // namespace fretless::view
