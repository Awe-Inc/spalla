// ═══════════════════════════════════════════════════════════════════════════
//  Font.h — FreeType glyph atlas.
//
//  Rasterizes a fixed character set once into a single R8 texture at load
//  time, so text costs exactly the same as any other quad in the batch.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <unordered_map>

namespace fretless::render {

/// Decodes the UTF-8 sequence starting at `index` and advances past it.
///
/// Device names, score titles and composer names all arrive as UTF-8. Walking
/// a std::string byte by byte and treating each byte as a codepoint turns
/// "Mixagem estereo" into "Mixagem estAcreo" for every accented character, so
/// text has to be decoded before it is looked up in the atlas.
///
/// Malformed input yields the raw byte rather than throwing or stopping, so a
/// bad name degrades to mojibake instead of vanishing.
[[nodiscard]] inline char32_t nextCodepoint(std::string_view text,
                                            std::size_t& index) noexcept {
    if (index >= text.size()) {
        return 0;
    }
    const auto first = static_cast<unsigned char>(text[index]);

    auto continuation = [&text](std::size_t at) -> bool {
        return at < text.size() &&
               (static_cast<unsigned char>(text[at]) & 0xC0u) == 0x80u;
    };
    auto sixBits = [&text](std::size_t at) -> char32_t {
        return static_cast<char32_t>(static_cast<unsigned char>(text[at]) & 0x3Fu);
    };

    if (first < 0x80u) {
        ++index;
        return first;
    }
    if ((first & 0xE0u) == 0xC0u && continuation(index + 1)) {
        const char32_t cp = ((first & 0x1Fu) << 6) | sixBits(index + 1);
        index += 2;
        return cp;
    }
    if ((first & 0xF0u) == 0xE0u && continuation(index + 1) && continuation(index + 2)) {
        const char32_t cp = ((first & 0x0Fu) << 12) | (sixBits(index + 1) << 6) |
                            sixBits(index + 2);
        index += 3;
        return cp;
    }
    if ((first & 0xF8u) == 0xF0u && continuation(index + 1) &&
        continuation(index + 2) && continuation(index + 3)) {
        const char32_t cp = ((first & 0x07u) << 18) | (sixBits(index + 1) << 12) |
                            (sixBits(index + 2) << 6) | sixBits(index + 3);
        index += 4;
        return cp;
    }
    ++index;
    return first;
}

class Font {
public:
    struct Glyph {
        float u0 = 0.0f, v0 = 0.0f, u1 = 0.0f, v1 = 0.0f;
        float width = 0.0f, height = 0.0f;
        float bearingX = 0.0f, bearingY = 0.0f;
        float advance = 0.0f;
    };

    Font() = default;
    ~Font();

    Font(const Font&)            = delete;
    Font& operator=(const Font&) = delete;
    Font(Font&&) noexcept;
    Font& operator=(Font&&) noexcept;

    /// Rasterizes Latin-1 printable characters at `pixelHeight`.
    [[nodiscard]] bool load(const std::string& path, int pixelHeight,
                            std::string* error = nullptr);

    /// Tries each path in turn, then falls back to a system UI font. Returns
    /// the path that worked, or an empty string.
    [[nodiscard]] static std::string findFontFile(const std::string& assetsDir);

    void unload() noexcept;

    [[nodiscard]] bool  valid()      const noexcept { return texture_ != 0; }
    [[nodiscard]] std::uint32_t texture() const noexcept { return texture_; }
    [[nodiscard]] float lineHeight() const noexcept { return lineHeight_; }
    [[nodiscard]] float ascender()   const noexcept { return ascender_; }
    [[nodiscard]] int   pixelHeight() const noexcept { return pixelHeight_; }

    [[nodiscard]] const Glyph* glyph(char32_t codepoint) const noexcept;
    [[nodiscard]] float measure(std::string_view text) const noexcept;

private:
    std::unordered_map<char32_t, Glyph> glyphs_;
    std::uint32_t texture_     = 0;
    float         lineHeight_  = 0.0f;
    float         ascender_    = 0.0f;
    int           pixelHeight_ = 0;
};

}  // namespace fretless::render
