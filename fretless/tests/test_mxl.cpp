#include <filesystem>
#include <string>

#include "TestHarness.h"
#include "fretless/score/MusicXmlParser.h"

using namespace fretless::score;

namespace {

/// Tests run with the project root as the working directory (set in
/// tests/CMakeLists.txt), so fixtures resolve the same way from ctest and
/// from a manual invocation.
std::string fixture(const char* name) {
    return (std::filesystem::path("tests") / "data" / name).string();
}

}  // namespace

// Regression: PowerShell's Compress-Archive — and several other writers —
// store entry names with backslashes, which the ZIP spec forbids. Looking up
// "META-INF/container.xml" then misses, and a naive fallback that takes the
// first .xml outside META-INF picks the container itself, because
// "META-INF\container.xml" does not start with "META-INF/".
TEST(mxl_with_backslash_entry_names_still_parses) {
    const std::string path = fixture("backslash_paths.mxl");
    if (!std::filesystem::exists(path)) {
        ::testing::reportFailure(__FILE__, __LINE__,
                                 "fixture missing: " + path +
                                 " (run tests from the project root)");
        return;
    }

    std::string error;
    const auto score = parseMusicXml(path, &error);

    CHECK(score.has_value());
    if (!score.has_value()) {
        ::testing::reportFailure(__FILE__, __LINE__, error);
        return;
    }
    CHECK(score->title == "Twinkle, Twinkle, Little Star");
    CHECK_EQ(score->noteCount(), std::size_t{42});
    CHECK_NEAR(score->beatsPerMinute, 88.0, 0.01);
    // The first note is the open A, not the container's XML declaration.
    CHECK_EQ(score->events[0].midi, 69);
}

TEST(a_zip_without_any_score_is_rejected_cleanly) {
    // A .mxl-shaped buffer that is not a zip at all.
    const std::string notAZip = "PK\x03\x04 followed by nothing useful";
    std::string error;
    const auto score = parseMusicXmlBuffer(notAZip.c_str(), notAZip.size(), &error);
    CHECK(!score.has_value());
    CHECK(!error.empty());
}
