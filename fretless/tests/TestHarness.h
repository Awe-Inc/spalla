// Minimal test harness. Registers cases through a static constructor, runs
// them from main(), reports failures with file and line.
#pragma once

#include <cmath>
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

namespace testing {

struct TestCase {
    std::string           name;
    std::function<void()> body;
};

inline std::vector<TestCase>& registry() {
    static std::vector<TestCase> cases;
    return cases;
}

inline int& failureCount() {
    static int failures = 0;
    return failures;
}

inline void reportFailure(const char* file, int line, const std::string& message) {
    ++failureCount();
    std::printf("    FAIL  %s:%d\n          %s\n", file, line, message.c_str());
}

struct Registrar {
    Registrar(const char* name, std::function<void()> body) {
        registry().push_back({name, std::move(body)});
    }
};

inline int runAll() {
    int failedCases = 0;
    for (const auto& testCase : registry()) {
        const int before = failureCount();
        std::printf("  %s\n", testCase.name.c_str());
        testCase.body();
        if (failureCount() > before) {
            ++failedCases;
        }
    }
    std::printf("\n%zu cases, %d failures\n", registry().size(), failureCount());
    return (failedCases == 0) ? 0 : 1;
}

}  // namespace testing

#define TEST(name)                                                             \
    static void name();                                                        \
    static ::testing::Registrar registrar_##name(#name, name);                 \
    static void name()

#define CHECK(condition)                                                       \
    do {                                                                       \
        if (!(condition)) {                                                    \
            ::testing::reportFailure(__FILE__, __LINE__, "CHECK(" #condition ")"); \
        }                                                                      \
    } while (false)

#define CHECK_EQ(actual, expected)                                             \
    do {                                                                       \
        const auto actualValue_ = (actual);                                    \
        const auto expectedValue_ = (expected);                                \
        if (!(actualValue_ == expectedValue_)) {                               \
            ::testing::reportFailure(__FILE__, __LINE__,                       \
                std::string(#actual " == " #expected " -> got ") +             \
                std::to_string(actualValue_) + ", expected " +                 \
                std::to_string(expectedValue_));                               \
        }                                                                      \
    } while (false)

#define CHECK_NEAR(actual, expected, tolerance)                                \
    do {                                                                       \
        const double actualValue_ = static_cast<double>(actual);               \
        const double expectedValue_ = static_cast<double>(expected);           \
        if (std::fabs(actualValue_ - expectedValue_) > (tolerance)) {          \
            ::testing::reportFailure(__FILE__, __LINE__,                       \
                std::string(#actual " ~ " #expected " -> got ") +              \
                std::to_string(actualValue_) + ", expected " +                 \
                std::to_string(expectedValue_) + " +/- " +                     \
                std::to_string(static_cast<double>(tolerance)));               \
        }                                                                      \
    } while (false)
