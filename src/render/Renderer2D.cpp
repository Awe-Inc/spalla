#include "fretless/render/Renderer2D.h"

#include <glad/gl.h>

#include <cmath>
#include <cstdio>

#include "fretless/render/Font.h"

namespace fretless::render {
namespace {

constexpr std::size_t kInitialQuads = 4096;

const char* kVertexShader = R"(#version 330 core
layout(location = 0) in vec2  aPos;
layout(location = 1) in vec2  aUV;
layout(location = 2) in vec4  aColor;
layout(location = 3) in vec2  aLocal;
layout(location = 4) in vec2  aHalf;
layout(location = 5) in float aRadius;
layout(location = 6) in float aMode;

uniform mat4 uProjection;

out vec2  vUV;
out vec4  vColor;
out vec2  vLocal;
out vec2  vHalf;
out float vRadius;
out float vMode;

void main() {
    gl_Position = uProjection * vec4(aPos, 0.0, 1.0);
    vUV     = aUV;
    vColor  = aColor;
    vLocal  = aLocal;
    vHalf   = aHalf;
    vRadius = aRadius;
    vMode   = aMode;
}
)";

const char* kFragmentShader = R"(#version 330 core
in vec2  vUV;
in vec4  vColor;
in vec2  vLocal;
in vec2  vHalf;
in float vRadius;
in float vMode;

uniform sampler2D uAtlas;

out vec4 fragColor;

// Signed distance to a rounded box centred at the origin.
float roundedBoxSDF(vec2 p, vec2 halfSize, float radius) {
    vec2 q = abs(p) - (halfSize - radius);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
    if (vMode > 0.5) {
        // Glyph: the atlas is single channel coverage.
        float coverage = texture(uAtlas, vUV).r;
        fragColor = vec4(vColor.rgb, vColor.a * coverage);
    } else {
        float dist = roundedBoxSDF(vLocal, vHalf, vRadius);
        // fwidth gives us one pixel of the distance field, which is exactly
        // the antialiasing width regardless of how the quad was scaled.
        float aa = max(fwidth(dist), 0.0001);
        float alpha = 1.0 - smoothstep(-aa, aa, dist);
        if (alpha <= 0.0) discard;
        fragColor = vec4(vColor.rgb, vColor.a * alpha);
    }
}
)";

[[nodiscard]] std::uint32_t compileShader(GLenum type, const char* source,
                                          std::string* error) {
    const GLuint shader = glCreateShader(type);
    glShaderSource(shader, 1, &source, nullptr);
    glCompileShader(shader);

    GLint ok = GL_FALSE;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
    if (ok == GL_FALSE) {
        char log[1024] = {};
        glGetShaderInfoLog(shader, sizeof(log), nullptr, log);
        if (error != nullptr) {
            *error = std::string(type == GL_VERTEX_SHADER ? "vertex" : "fragment") +
                     " shader: " + log;
        }
        glDeleteShader(shader);
        return 0;
    }
    return shader;
}

}  // namespace

Renderer2D::~Renderer2D() {
    shutdown();
}

bool Renderer2D::initialize(std::string* error) {
    const GLuint vs = compileShader(GL_VERTEX_SHADER, kVertexShader, error);
    if (vs == 0) {
        return false;
    }
    const GLuint fs = compileShader(GL_FRAGMENT_SHADER, kFragmentShader, error);
    if (fs == 0) {
        glDeleteShader(vs);
        return false;
    }

    program_ = glCreateProgram();
    glAttachShader(program_, vs);
    glAttachShader(program_, fs);
    glLinkProgram(program_);
    glDeleteShader(vs);
    glDeleteShader(fs);

    GLint linked = GL_FALSE;
    glGetProgramiv(program_, GL_LINK_STATUS, &linked);
    if (linked == GL_FALSE) {
        char log[1024] = {};
        glGetProgramInfoLog(program_, sizeof(log), nullptr, log);
        if (error != nullptr) {
            *error = std::string("shader link: ") + log;
        }
        glDeleteProgram(program_);
        program_ = 0;
        return false;
    }

    uProjection_ = glGetUniformLocation(program_, "uProjection");
    uAtlas_      = glGetUniformLocation(program_, "uAtlas");

    glGenVertexArrays(1, &vao_);
    glGenBuffers(1, &vbo_);
    glGenBuffers(1, &ebo_);

    glBindVertexArray(vao_);
    glBindBuffer(GL_ARRAY_BUFFER, vbo_);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo_);

    const GLsizei stride = sizeof(Vertex);
    auto attribute = [stride](GLuint index, GLint size, std::size_t offset) {
        glEnableVertexAttribArray(index);
        glVertexAttribPointer(index, size, GL_FLOAT, GL_FALSE, stride,
                              reinterpret_cast<const void*>(offset));
    };
    attribute(0, 2, offsetof(Vertex, x));
    attribute(1, 2, offsetof(Vertex, u));
    attribute(2, 4, offsetof(Vertex, r));
    attribute(3, 2, offsetof(Vertex, lx));
    attribute(4, 2, offsetof(Vertex, hx));
    attribute(5, 1, offsetof(Vertex, radius));
    attribute(6, 1, offsetof(Vertex, mode));

    glBindVertexArray(0);

    vertices_.reserve(kInitialQuads * 4);
    indices_.reserve(kInitialQuads * 6);
    return true;
}

void Renderer2D::shutdown() noexcept {
    if (ebo_ != 0)     { glDeleteBuffers(1, &ebo_);            ebo_ = 0; }
    if (vbo_ != 0)     { glDeleteBuffers(1, &vbo_);            vbo_ = 0; }
    if (vao_ != 0)     { glDeleteVertexArrays(1, &vao_);       vao_ = 0; }
    if (program_ != 0) { glDeleteProgram(program_);            program_ = 0; }
}

void Renderer2D::beginFrame(int widthPx, int heightPx) {
    width_  = widthPx;
    height_ = heightPx;
    vertices_.clear();
    indices_.clear();
    boundTexture_   = 0;
    drawCalls_      = 0;
    quadsSubmitted_ = 0;
    clipStack_.clear();

    glViewport(0, 0, widthPx, heightPx);
    glDisable(GL_DEPTH_TEST);
    glDisable(GL_SCISSOR_TEST);
    glEnable(GL_BLEND);
    glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);

    glUseProgram(program_);

    // Column-major orthographic projection, origin top-left, y down.
    const float w = static_cast<float>(widthPx);
    const float h = static_cast<float>(heightPx);
    const float projection[16] = {
         2.0f / w,  0.0f,      0.0f, 0.0f,
         0.0f,     -2.0f / h,  0.0f, 0.0f,
         0.0f,      0.0f,     -1.0f, 0.0f,
        -1.0f,      1.0f,      0.0f, 1.0f,
    };
    glUniformMatrix4fv(uProjection_, 1, GL_FALSE, projection);
    glUniform1i(uAtlas_, 0);
}

void Renderer2D::endFrame() {
    flush();
    glDisable(GL_SCISSOR_TEST);
    glBindVertexArray(0);
    glUseProgram(0);
}

void Renderer2D::bindTexture(std::uint32_t texture) {
    if (texture != boundTexture_) {
        flush();
        boundTexture_ = texture;
    }
}

void Renderer2D::flush() {
    if (indices_.empty()) {
        return;
    }

    glBindVertexArray(vao_);

    const std::size_t vertexBytes = vertices_.size() * sizeof(Vertex);
    const std::size_t indexBytes  = indices_.size() * sizeof(std::uint32_t);

    glBindBuffer(GL_ARRAY_BUFFER, vbo_);
    if (vertexBytes > vboCapacity_) {
        // Grow with slack so a busy frame does not reallocate every flush.
        vboCapacity_ = vertexBytes * 2;
        glBufferData(GL_ARRAY_BUFFER, static_cast<GLsizeiptr>(vboCapacity_), nullptr,
                     GL_STREAM_DRAW);
    }
    glBufferSubData(GL_ARRAY_BUFFER, 0, static_cast<GLsizeiptr>(vertexBytes),
                    vertices_.data());

    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo_);
    if (indexBytes > eboCapacity_) {
        eboCapacity_ = indexBytes * 2;
        glBufferData(GL_ELEMENT_ARRAY_BUFFER, static_cast<GLsizeiptr>(eboCapacity_),
                     nullptr, GL_STREAM_DRAW);
    }
    glBufferSubData(GL_ELEMENT_ARRAY_BUFFER, 0, static_cast<GLsizeiptr>(indexBytes),
                    indices_.data());

    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, boundTexture_);

    glDrawElements(GL_TRIANGLES, static_cast<GLsizei>(indices_.size()),
                   GL_UNSIGNED_INT, nullptr);
    ++drawCalls_;

    vertices_.clear();
    indices_.clear();
}

void Renderer2D::pushQuad(const Vertex& v0, const Vertex& v1,
                          const Vertex& v2, const Vertex& v3) {
    const auto base = static_cast<std::uint32_t>(vertices_.size());
    vertices_.push_back(v0);
    vertices_.push_back(v1);
    vertices_.push_back(v2);
    vertices_.push_back(v3);
    indices_.insert(indices_.end(),
                    {base, base + 1, base + 2, base, base + 2, base + 3});
    ++quadsSubmitted_;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Primitives
// ═══════════════════════════════════════════════════════════════════════════

void Renderer2D::drawRoundedRect(float x, float y, float w, float h, float radius,
                                 const Color& color) {
    if (w <= 0.0f || h <= 0.0f || color.a <= 0.0f) {
        return;
    }
    bindTexture(boundTexture_);

    const float hx = w * 0.5f;
    const float hy = h * 0.5f;
    radius = std::fmin(radius, std::fmin(hx, hy));

    // One pixel of bleed so the SDF has room to fade out at the edges.
    constexpr float kPad = 1.0f;
    const float px = x - kPad;
    const float py = y - kPad;
    const float pw = w + kPad * 2.0f;
    const float ph = h + kPad * 2.0f;
    const float lx = hx + kPad;
    const float ly = hy + kPad;

    const Vertex v0{px,      py,      0, 0, color.r, color.g, color.b, color.a, -lx, -ly, hx, hy, radius, 0.0f};
    const Vertex v1{px + pw, py,      0, 0, color.r, color.g, color.b, color.a,  lx, -ly, hx, hy, radius, 0.0f};
    const Vertex v2{px + pw, py + ph, 0, 0, color.r, color.g, color.b, color.a,  lx,  ly, hx, hy, radius, 0.0f};
    const Vertex v3{px,      py + ph, 0, 0, color.r, color.g, color.b, color.a, -lx,  ly, hx, hy, radius, 0.0f};
    pushQuad(v0, v1, v2, v3);
}

void Renderer2D::drawRect(float x, float y, float w, float h, const Color& color) {
    drawRoundedRect(x, y, w, h, 0.0f, color);
}

void Renderer2D::drawCircle(float cx, float cy, float radius, const Color& color) {
    drawRoundedRect(cx - radius, cy - radius, radius * 2.0f, radius * 2.0f, radius, color);
}

void Renderer2D::drawRectGradient(float x, float y, float w, float h,
                                  const Color& top, const Color& bottom) {
    if (w <= 0.0f || h <= 0.0f) {
        return;
    }
    bindTexture(boundTexture_);
    const float hx = w * 0.5f;
    const float hy = h * 0.5f;

    const Vertex v0{x,     y,     0, 0, top.r,    top.g,    top.b,    top.a,    -hx, -hy, hx, hy, 0.0f, 0.0f};
    const Vertex v1{x + w, y,     0, 0, top.r,    top.g,    top.b,    top.a,     hx, -hy, hx, hy, 0.0f, 0.0f};
    const Vertex v2{x + w, y + h, 0, 0, bottom.r, bottom.g, bottom.b, bottom.a,  hx,  hy, hx, hy, 0.0f, 0.0f};
    const Vertex v3{x,     y + h, 0, 0, bottom.r, bottom.g, bottom.b, bottom.a, -hx,  hy, hx, hy, 0.0f, 0.0f};
    pushQuad(v0, v1, v2, v3);
}

void Renderer2D::drawLine(float x0, float y0, float x1, float y1, float thickness,
                          const Color& color) {
    const float dx     = x1 - x0;
    const float dy     = y1 - y0;
    const float length = std::sqrt(dx * dx + dy * dy);
    if (length < 1e-4f) {
        return;
    }

    // A rotated quad. The SDF sees it in its own frame, so it stays crisp.
    const float nx = -dy / length * thickness * 0.5f;
    const float ny =  dx / length * thickness * 0.5f;
    const float hx = length * 0.5f;
    const float hy = thickness * 0.5f;

    bindTexture(boundTexture_);
    const Vertex v0{x0 + nx, y0 + ny, 0, 0, color.r, color.g, color.b, color.a, -hx, -hy, hx, hy, 0.0f, 0.0f};
    const Vertex v1{x1 + nx, y1 + ny, 0, 0, color.r, color.g, color.b, color.a,  hx, -hy, hx, hy, 0.0f, 0.0f};
    const Vertex v2{x1 - nx, y1 - ny, 0, 0, color.r, color.g, color.b, color.a,  hx,  hy, hx, hy, 0.0f, 0.0f};
    const Vertex v3{x0 - nx, y0 - ny, 0, 0, color.r, color.g, color.b, color.a, -hx,  hy, hx, hy, 0.0f, 0.0f};
    pushQuad(v0, v1, v2, v3);
}

void Renderer2D::drawRectOutline(float x, float y, float w, float h, float thickness,
                                 const Color& color) {
    drawRect(x, y, w, thickness, color);
    drawRect(x, y + h - thickness, w, thickness, color);
    drawRect(x, y + thickness, thickness, h - thickness * 2.0f, color);
    drawRect(x + w - thickness, y + thickness, thickness, h - thickness * 2.0f, color);
}

void Renderer2D::drawQuad(float x0, float y0, float x1, float y1,
                          float x2, float y2, float x3, float y3, const Color& color) {
    bindTexture(boundTexture_);
    // Half extents far larger than any local coordinate, so the SDF always
    // reports "deep inside" and the quad fills solid.
    constexpr float kSolid = 1.0e6f;
    const Vertex v0{x0, y0, 0, 0, color.r, color.g, color.b, color.a, 0, 0, kSolid, kSolid, 0, 0};
    const Vertex v1{x1, y1, 0, 0, color.r, color.g, color.b, color.a, 0, 0, kSolid, kSolid, 0, 0};
    const Vertex v2{x2, y2, 0, 0, color.r, color.g, color.b, color.a, 0, 0, kSolid, kSolid, 0, 0};
    const Vertex v3{x3, y3, 0, 0, color.r, color.g, color.b, color.a, 0, 0, kSolid, kSolid, 0, 0};
    pushQuad(v0, v1, v2, v3);
}

void Renderer2D::drawArc(float cx, float cy, float radius, float thickness,
                         float startRadians, float sweepRadians, const Color& color,
                         int segments) {
    if (segments < 1 || thickness <= 0.0f) {
        return;
    }
    // Chord-shaped segments (what drawLine would give us) leave a wedge of
    // background at every joint, which reads as hatching on a thick band.
    // Radial sectors share their edges exactly.
    const float inner = radius - thickness * 0.5f;
    const float outer = radius + thickness * 0.5f;
    const float step  = sweepRadians / static_cast<float>(segments);

    for (int i = 0; i < segments; ++i) {
        const float a0 = startRadians + step * static_cast<float>(i);
        const float a1 = a0 + step;
        const float c0 = std::cos(a0), s0 = std::sin(a0);
        const float c1 = std::cos(a1), s1 = std::sin(a1);
        drawQuad(cx + c0 * outer, cy - s0 * outer,
                 cx + c1 * outer, cy - s1 * outer,
                 cx + c1 * inner, cy - s1 * inner,
                 cx + c0 * inner, cy - s0 * inner,
                 color);
    }
}

void Renderer2D::drawRing(float cx, float cy, float radius, float thickness,
                          const Color& color, int segments) {
    drawArc(cx, cy, radius, thickness, 0.0f, 6.28318530718f, color, segments);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Text
// ═══════════════════════════════════════════════════════════════════════════

float Renderer2D::drawText(const Font& font, float x, float y,
                           std::string_view text, const Color& color) {
    if (!font.valid() || text.empty() || color.a <= 0.0f) {
        return 0.0f;
    }
    bindTexture(font.texture());

    float cursor = x;
    std::size_t index = 0;
    while (index < text.size()) {
        const char32_t codepoint = nextCodepoint(text, index);
        const Font::Glyph* glyph = font.glyph(codepoint);
        if (glyph == nullptr) {
            continue;
        }
        if (glyph->width > 0.0f && glyph->height > 0.0f) {
            const float gx = cursor + glyph->bearingX;
            const float gy = y - glyph->bearingY;
            const float gw = glyph->width;
            const float gh = glyph->height;

            const Vertex v0{gx,      gy,      glyph->u0, glyph->v0, color.r, color.g, color.b, color.a, 0, 0, 0, 0, 0, 1.0f};
            const Vertex v1{gx + gw, gy,      glyph->u1, glyph->v0, color.r, color.g, color.b, color.a, 0, 0, 0, 0, 0, 1.0f};
            const Vertex v2{gx + gw, gy + gh, glyph->u1, glyph->v1, color.r, color.g, color.b, color.a, 0, 0, 0, 0, 0, 1.0f};
            const Vertex v3{gx,      gy + gh, glyph->u0, glyph->v1, color.r, color.g, color.b, color.a, 0, 0, 0, 0, 0, 1.0f};
            pushQuad(v0, v1, v2, v3);
        }
        cursor += glyph->advance;
    }
    return cursor - x;
}

float Renderer2D::drawTextAligned(const Font& font, float x, float y, float boxWidth,
                                  TextAlign align, std::string_view text,
                                  const Color& color) {
    const float textWidth = font.measure(text);
    float drawX = x;
    if (align == TextAlign::Center) {
        drawX = x + (boxWidth - textWidth) * 0.5f;
    } else if (align == TextAlign::Right) {
        drawX = x + boxWidth - textWidth;
    }
    return drawText(font, drawX, y, text, color);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Clipping
// ═══════════════════════════════════════════════════════════════════════════

void Renderer2D::pushClip(float x, float y, float w, float h) {
    flush();
    // GL scissor has its origin at the bottom left.
    const int sx = static_cast<int>(x);
    const int sy = height_ - static_cast<int>(y + h);
    const int sw = static_cast<int>(w);
    const int sh = static_cast<int>(h);
    clipStack_.push_back({sx, sy, sw, sh});
    glEnable(GL_SCISSOR_TEST);
    glScissor(sx, sy, sw > 0 ? sw : 0, sh > 0 ? sh : 0);
}

void Renderer2D::popClip() {
    flush();
    if (!clipStack_.empty()) {
        clipStack_.pop_back();
    }
    if (clipStack_.empty()) {
        glDisable(GL_SCISSOR_TEST);
    } else {
        const auto& c = clipStack_.back();
        glScissor(c.x, c.y, c.w, c.h);
    }
}

}  // namespace fretless::render
