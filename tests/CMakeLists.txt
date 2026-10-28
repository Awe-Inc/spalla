# Header-only harness: a test dependency that itself needs fetching is a
# dependency the CI machine can fail to reach.
add_executable(fretless_tests
    main.cpp
    test_ring_buffer.cpp
    test_pitch_detector.cpp
    test_score.cpp
    test_mxl.cpp
    test_repeats.cpp
    test_beaming.cpp
    test_measures.cpp
    test_game_engine.cpp
    test_curriculum.cpp
)

target_link_libraries(fretless_tests PRIVATE fretless::engine)
target_include_directories(fretless_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

# Many assertions compare constexpr values, which MSVC flags as a constant
# conditional. That a check folds at compile time is a feature here.
target_compile_options(fretless_tests PRIVATE $<$<CXX_COMPILER_ID:MSVC>:/wd4127>)

add_test(NAME fretless_tests COMMAND fretless_tests)
set_tests_properties(fretless_tests PROPERTIES
    WORKING_DIRECTORY "${PROJECT_SOURCE_DIR}")
