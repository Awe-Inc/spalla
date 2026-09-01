#pragma once

#include "fretless/render/Font.h"

namespace fretless::render {

/// The five steps of the type scale, passed as one object.
///
/// Views used to take three separate Font references and grew a fourth and a
/// fifth as the scale filled out; every call site then had to be edited to add
/// an argument, and it was easy to pass them in the wrong order since they all
/// have the same type.
struct FontSet {
    const Font* label = nullptr;   ///< 12 px, ALL CAPS labels and units
    const Font* body  = nullptr;   ///< 15 px, lists and captions
    const Font* title = nullptr;   ///< 21 px, headings
    const Font* lead  = nullptr;   ///< 34 px, score, tempo, grade
    const Font* hero  = nullptr;   ///< 68 px, the detected note

    [[nodiscard]] bool valid() const noexcept {
        return label != nullptr && body != nullptr && title != nullptr &&
               lead != nullptr && hero != nullptr;
    }
};

}  // namespace fretless::render
