#include "fretless/render/Font.h"

#include <glad/gl.h>

#include <ft2build.h>
#include FT_FREETYPE_H

#include <algorithm>
#include <filesystem>
#include <vector>

namespace fretless::render {
namespace {

constexpr char32_t kFirstChar = 32;    // space
constexpr char32_t kLastChar  = 255;   // Latin-1, so accented titles render
constexpr int      kPadding   = 2;     // keeps neighbours from bleeding

/// Fonts we are happy to ship, then whatever the OS provides so a developer
/// checkout renders text without hunting for assets.
const char* kSystemFontCandidates[] = {
#if defined(_WIN32)
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/consola.ttf",
#elif defined(__APPLE__)
    "/System/Library/Fonts/SFNS.ttf",
    "/Library/Fonts/Arial.ttf",
#else
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
#endif
};

}  // namespace

Font::~Font() {
    unload();
}

Font::Font(Font&& other) noexcept
    : glyphs_(std::move(other.glyphs_)),
      texture_(other.texture_),
      lineHeight_(other.lineHeight_),
      ascender_(other.ascender_),
      pixelHeight_(other.pixelHeight_) {
    other.texture_ = 0;
}

Font& Font::operator=(Font&& other) noexcept {
    if (this != &other) {
        unload();
        glyphs_        = std::move(other.glyphs_);
        texture_       = other.texture_;
        lineHeight_    = other.lineHeight_;
        ascender_      = other.ascender_;
        pixelHeight_   = other.pixelHeight_;
        other.texture_ = 0;
    }
    return *this;
}

void Font::unload() noexcept {
    if (texture_ != 0) {
        glDeleteTextures(1, &texture_);
        texture_ = 0;
    }
    glyphs_.clear();
}

std::string Font::findFontFile(const std::string& assetsDir) {
    namespace fs = std::filesystem;

    // Anything dropped into assets/fonts wins, so shipping a licensed font is
    // just a matter of copying it in.
    std::error_code ec;
    const fs::path fontsDir = fs::path(assetsDir) / "fonts";
    if (fs::is_directory(fontsDir, ec)) {
        std::vector<std::string> found;
        for (const auto& entry : fs::directory_iterator(fontsDir, ec)) {
            const auto ext = entry.path().extension().string();
            if (ext == ".ttf" || ext == ".otf" || ext == ".TTF" || ext == ".OTF") {
                found.push_back(entry.path().string());
            }
        }
        if (!found.empty()) {
            std::sort(found.begin(), found.end());
            return found.front();
        }
    }

    for (const char* candidate : kSystemFontCandidates) {
        if (fs::exists(candidate, ec)) {
            return candidate;
        }
    }
    return {};
}

bool Font::load(const std::string& path, int pixelHeight, std::string* error) {
    unload();

    FT_Library library = nullptr;
    if (FT_Init_FreeType(&library) != 0) {
        if (error != nullptr) { *error = "FreeType init failed."; }
        return false;
    }

    FT_Face face = nullptr;
    if (FT_New_Face(library, path.c_str(), 0, &face) != 0) {
        if (error != nullptr) { *error = "Cannot open font: " + path; }
        FT_Done_FreeType(library);
        return false;
    }
    FT_Set_Pixel_Sizes(face, 0, static_cast<FT_UInt>(pixelHeight));

    pixelHeight_ = pixelHeight;
    lineHeight_  = static_cast<float>(face->size->metrics.height) / 64.0f;
    ascender_    = static_cast<float>(face->size->metrics.ascender) / 64.0f;

    // ── Measure first so the atlas is sized exactly once ──────────────────
    struct Pending {
        char32_t codepoint;
        int      width, height;
        int      bearingX, bearingY;
        float    advance;
        std::vector<unsigned char> pixels;
    };
    std::vector<Pending> pending;
    pending.reserve(kLastChar - kFirstChar + 1);

    int maxRowHeight = 0;
    for (char32_t cp = kFirstChar; cp <= kLastChar; ++cp) {
        if (FT_Load_Char(face, cp, FT_LOAD_RENDER) != 0) {
            continue;
        }
        const FT_GlyphSlot slot = face->glyph;
        Pending item;
        item.codepoint = cp;
        item.width     = static_cast<int>(slot->bitmap.width);
        item.height    = static_cast<int>(slot->bitmap.rows);
        item.bearingX  = slot->bitmap_left;
        item.bearingY  = slot->bitmap_top;
        item.advance   = static_cast<float>(slot->advance.x) / 64.0f;

        item.pixels.resize(static_cast<std::size_t>(item.width) *
                           static_cast<std::size_t>(item.height));
        for (int row = 0; row < item.height; ++row) {
            std::copy_n(slot->bitmap.buffer + row * slot->bitmap.pitch,
                        item.width,
                        item.pixels.begin() + static_cast<std::size_t>(row) * item.width);
        }
        maxRowHeight = std::max(maxRowHeight, item.height);
        pending.push_back(std::move(item));
    }

    // Simple shelf packer into a power-of-two square. 512 holds Latin-1 at
    // 48 px comfortably; grow if a larger size is ever requested.
    int atlasSize = 256;
    while (atlasSize < 4096) {
        int x = kPadding;
        int y = kPadding;
        int rowHeight = 0;
        bool fits = true;
        for (const auto& item : pending) {
            if (x + item.width + kPadding > atlasSize) {
                x = kPadding;
                y += rowHeight + kPadding;
                rowHeight = 0;
            }
            if (y + item.height + kPadding > atlasSize) {
                fits = false;
                break;
            }
            x += item.width + kPadding;
            rowHeight = std::max(rowHeight, item.height);
        }
        if (fits) {
            break;
        }
        atlasSize *= 2;
    }

    std::vector<unsigned char> atlas(static_cast<std::size_t>(atlasSize) *
                                     static_cast<std::size_t>(atlasSize), 0);

    int penX = kPadding;
    int penY = kPadding;
    int rowHeight = 0;
    const float inverseSize = 1.0f / static_cast<float>(atlasSize);

    for (const auto& item : pending) {
        if (penX + item.width + kPadding > atlasSize) {
            penX = kPadding;
            penY += rowHeight + kPadding;
            rowHeight = 0;
        }
        for (int row = 0; row < item.height; ++row) {
            std::copy_n(item.pixels.begin() + static_cast<std::size_t>(row) * item.width,
                        item.width,
                        atlas.begin() +
                            static_cast<std::size_t>(penY + row) * atlasSize + penX);
        }

        Glyph glyph;
        glyph.u0       = static_cast<float>(penX) * inverseSize;
        glyph.v0       = static_cast<float>(penY) * inverseSize;
        glyph.u1       = static_cast<float>(penX + item.width) * inverseSize;
        glyph.v1       = static_cast<float>(penY + item.height) * inverseSize;
        glyph.width    = static_cast<float>(item.width);
        glyph.height   = static_cast<float>(item.height);
        glyph.bearingX = static_cast<float>(item.bearingX);
        glyph.bearingY = static_cast<float>(item.bearingY);
        glyph.advance  = item.advance;
        glyphs_.emplace(item.codepoint, glyph);

        penX += item.width + kPadding;
        rowHeight = std::max(rowHeight, item.height);
    }

    FT_Done_Face(face);
    FT_Done_FreeType(library);

    glGenTextures(1, &texture_);
    glBindTexture(GL_TEXTURE_2D, texture_);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_R8, atlasSize, atlasSize, 0,
                 GL_RED, GL_UNSIGNED_BYTE, atlas.data());
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glBindTexture(GL_TEXTURE_2D, 0);

    return true;
}

const Font::Glyph* Font::glyph(char32_t codepoint) const noexcept {
    const auto it = glyphs_.find(codepoint);
    return (it != glyphs_.end()) ? &it->second : nullptr;
}

float Font::measure(std::string_view text) const noexcept {
    float width = 0.0f;
    std::size_t index = 0;
    while (index < text.size()) {
        const char32_t codepoint = nextCodepoint(text, index);
        if (const Glyph* g = glyph(codepoint); g != nullptr) {
            width += g->advance;
        }
    }
    return width;
}

}  // namespace fretless::render
