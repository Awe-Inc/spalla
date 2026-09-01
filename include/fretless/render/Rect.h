#pragma once

namespace fretless::render {

struct Rect {
    float x = 0.0f, y = 0.0f, w = 0.0f, h = 0.0f;

    [[nodiscard]] constexpr float right()   const noexcept { return x + w; }
    [[nodiscard]] constexpr float bottom()  const noexcept { return y + h; }
    [[nodiscard]] constexpr float centerX() const noexcept { return x + w * 0.5f; }
    [[nodiscard]] constexpr float centerY() const noexcept { return y + h * 0.5f; }

    [[nodiscard]] constexpr Rect inset(float amount) const noexcept {
        return {x + amount, y + amount, w - amount * 2.0f, h - amount * 2.0f};
    }
    [[nodiscard]] constexpr bool contains(float px, float py) const noexcept {
        return px >= x && px < right() && py >= y && py < bottom();
    }
};

}  // namespace fretless::render
