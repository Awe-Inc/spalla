#pragma once

#include <string>

namespace fretless::platform {

/// Native "open file" dialog. Returns an empty string if the user cancelled
/// or the platform has no implementation (drag and drop still works there).
[[nodiscard]] std::string openScoreDialog(const std::string& initialDirectory = {});

}  // namespace fretless::platform
