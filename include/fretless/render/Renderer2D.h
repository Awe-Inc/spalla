// ═══════════════════════════════════════════════════════════════════════════
//  Renderer2D.h — batched 2D renderer, OpenGL 3.3 core.
//
//  Everything the game draws — lanes, notes, the tuner arc, glyphs — goes into
//  one dynamic vertex buffer and comes out in one glDrawElements call per
//  texture. Rounded corners and circles are analytic: the fragment shader
//  evaluates a signed distance function, so a note head is antialiased at any
//  size without a single texture fetch and without geometry tessellation.
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace fretless::render {

struct Color {
    float r = 1.0f, g = 1.0f, b = 1.0f, a = 1.0f;

    [[nodiscard]] constexpr Color withAlpha(float alpha) const noexcept {
        return {r, g, b, alpha};
    }
    /// Linear blend towards `other`. Used for note colouring by proximity.
    [[nodiscard]] constexpr Color lerp(const Color& other, float t) const noexcept {
        return {r + (other.r - r) * t, g + (other.g - g) * t,
                b + (other.b - b) * t, a + (other.a - a) * t};
    }
    [[nodiscard]] constexpr Color scaled(float factor) const noexcept {
        return {r * factor, g * factor, b * factor, a};
    }
};

/// 0xRRGGBB literal, for readable palettes.
[[nodiscard]] constexpr Color rgb(std::uint32_t hex, float alpha = 1.0f) noexcept {
    return {static_cast<float>((hex >> 16) & 0xFF) / 255.0f,
            static_cast<float>((hex >> 8) & 0xFF) / 255.0f,
            static_cast<float>(hex & 0xFF) / 255.0f,
            alpha};
}

class Font;

enum class TextAlign : std::uint8_t { Left, Center, Right };

class Renderer2D {
public:
    Renderer2D() = default;
    ~Renderer2D();

    Renderer2D(const Renderer2D&)            = delete;
    Renderer2D& operator=(const Renderer2D&) = delete;

    [[nodiscard]] bool initialize(std::string* error = nullptr);
    void shutdown() noexcept;

    /// Sets up an orthographic projection with the origin at the top left and
    /// one unit per pixel, and clears the batch.
    void beginFrame(int widthPx, int heightPx);
    void endFrame();

    [[nodiscard]] int width()  const noexcept { return width_; }
    [[nodiscard]] int height() const noexcept { return height_; }

    // ── Primitives ────────────────────────────────────────────────────────
    void drawRect(float x, float y, float w, float h, const Color& color);
    void drawRoundedRect(float x, float y, float w, float h, float radius,
                         const Color& color);
    void drawCircle(float cx, float cy, float radius, const Color& color);
    void drawLine(float x0, float y0, float x1, float y1, float thickness,
                  const Color& color);
    /// Outline drawn as four rects; cheaper than an SDF ring for thin borders.
    void drawRectOutline(float x, float y, float w, float h, float thickness,
                         const Color& color);
    /// Vertical two-stop gradient.
    void drawRectGradient(float x, float y, float w, float h,
                          const Color& top, const Color& bottom);
    /// Arbitrary convex quad, corners in order. No SDF shaping.
    void drawQuad(float x0, float y0, float x1, float y1,
                  float x2, float y2, float x3, float y3, const Color& color);
    /// Annular arc. Tessellated as radial sectors rather than chords, so
    /// adjacent segments share an edge exactly and the band has no seams.
    void drawArc(float cx, float cy, float radius, float thickness,
                 float startRadians, float sweepRadians, const Color& color,
                 int segments = 24);
    /// Unfilled ring — an outline, so whatever is behind it stays visible.
    void drawRing(float cx, float cy, float radius, float thickness,
                  const Color& color, int segments = 32);

    // ── Text ──────────────────────────────────────────────────────────────
    /// `y` is the baseline. Returns the advance width.
    float drawText(const Font& font, float x, float y, std::string_view text,
                   const Color& color);
    float drawTextAligned(const Font& font, float x, float y, float boxWidth,
                          TextAlign align, std::string_view text, const Color& color);

    // ── Scissor ───────────────────────────────────────────────────────────
    /// Clips subsequent draws. Flushes the batch, so use sparingly.
    void pushClip(float x, float y, float w, float h);
    void popClip();

    [[nodiscard]] std::size_t drawCallsLastFrame() const noexcept { return drawCalls_; }
    [[nodiscard]] std::size_t quadsLastFrame()     const noexcept { return quadsSubmitted_; }

private:
    struct Vertex {
        float x, y;            // clip-space position, in pixels
        float u, v;            // atlas coords (glyphs only)
        float r, g, b, a;
        float lx, ly;          // position relative to the shape's centre
        float hx, hy;          // shape half extents
        float radius;
        float mode;            // 0 = SDF rect, 1 = glyph
    };

    void pushQuad(const Vertex& v0, const Vertex& v1, const Vertex& v2, const Vertex& v3);
    void flush();
    void bindTexture(std::uint32_t texture);

    std::uint32_t program_ = 0;
    std::uint32_t vao_     = 0;
    std::uint32_t vbo_     = 0;
    std::uint32_t ebo_     = 0;
    std::int32_t  uProjection_ = -1;
    std::int32_t  uAtlas_      = -1;

    std::vector<Vertex>        vertices_;
    std::vector<std::uint32_t> indices_;
    std::uint32_t              boundTexture_ = 0;
    std::size_t                vboCapacity_  = 0;
    std::size_t                eboCapacity_  = 0;

    int width_  = 0;
    int height_ = 0;

    struct ClipRect { int x, y, w, h; };
    std::vector<ClipRect> clipStack_;

    std::size_t drawCalls_      = 0;
    std::size_t quadsSubmitted_ = 0;
};

}  // namespace fretless::render
