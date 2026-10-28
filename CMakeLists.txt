# ===========================================================================
#  Fretless - custom real-time engine for violin practice
#  C++20 | SDL2 (windowing/input) | PortAudio (RT audio) | OpenGL 3.3 (render)
#
#  Kept ASCII-only on purpose: this file gets edited by shell one-liners, and
#  PowerShell 5.1 reads as ANSI and writes as UTF-8, which silently double
#  encodes any non-ASCII byte.
# ===========================================================================

cmake_minimum_required(VERSION 3.24)   # FetchContent FIND_PACKAGE_ARGS

project(Fretless
    VERSION     0.1.0
    DESCRIPTION "Custom C++ engine for real-time violin practice"
    LANGUAGES   C CXX
)

if(PROJECT_SOURCE_DIR STREQUAL PROJECT_BINARY_DIR)
    message(FATAL_ERROR
        "In-source builds are forbidden. Run:  cmake -B build -S .")
endif()

list(APPEND CMAKE_MODULE_PATH "${PROJECT_SOURCE_DIR}/cmake")

# ---------------------------------------------------------------------------
#  Options
# ---------------------------------------------------------------------------
option(FRETLESS_ENABLE_STEAM  "Link against the Steamworks SDK in lib/steamworks" OFF)
option(FRETLESS_USE_AUBIO     "Use libaubio instead of the built-in YIN detector"  OFF)
option(FRETLESS_BUILD_TESTS   "Build unit tests"                                   OFF)
option(FRETLESS_ENABLE_ASAN   "Build with AddressSanitizer (debug only)"           OFF)
option(FRETLESS_WARNINGS_AS_ERRORS "Treat compiler warnings as errors"             OFF)

# ---------------------------------------------------------------------------
#  Global toolchain settings
# ---------------------------------------------------------------------------
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_C_STANDARD 11)

# Single output folder per build type: the executable, its DLLs and the
# staged assets must sit side by side or the shipped build breaks.
foreach(cfg "" _DEBUG _RELEASE _RELWITHDEBINFO _MINSIZEREL)
    set(CMAKE_RUNTIME_OUTPUT_DIRECTORY${cfg} "${PROJECT_BINARY_DIR}/bin")
    set(CMAKE_LIBRARY_OUTPUT_DIRECTORY${cfg} "${PROJECT_BINARY_DIR}/bin")
    set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY${cfg} "${PROJECT_BINARY_DIR}/lib")
endforeach()

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE "RelWithDebInfo" CACHE STRING "" FORCE)
endif()

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)   # clangd / clang-tidy

# ---------------------------------------------------------------------------
#  Warning / sanitizer interface targets
# ---------------------------------------------------------------------------
add_library(fretless_warnings INTERFACE)
add_library(fretless::warnings ALIAS fretless_warnings)

target_compile_options(fretless_warnings INTERFACE
    $<$<CXX_COMPILER_ID:MSVC>:
        /W4 /permissive- /utf-8 /Zc:__cplusplus /Zc:preprocessor /EHsc /MP
        /wd4251                     # dll-interface noise from 3rd-party headers
        $<$<BOOL:${FRETLESS_WARNINGS_AS_ERRORS}>:/WX>
    >
    $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:
        -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wnon-virtual-dtor
        -Wold-style-cast -Wdouble-promotion
        $<$<BOOL:${FRETLESS_WARNINGS_AS_ERRORS}>:-Werror>
    >
)

# The DSP path is hot: allow the vectorizer to reassociate float math there.
# Scoped to the audio sources only (see set_source_files_properties below) so
# the game and scoring logic keep strict IEEE semantics.
add_library(fretless_fastmath INTERFACE)
target_compile_options(fretless_fastmath INTERFACE
    $<$<AND:$<CXX_COMPILER_ID:MSVC>,$<NOT:$<CONFIG:Debug>>>:/fp:fast>
    $<$<AND:$<NOT:$<CXX_COMPILER_ID:MSVC>>,$<NOT:$<CONFIG:Debug>>>:-ffast-math>
)

if(FRETLESS_ENABLE_ASAN)
    add_library(fretless_asan INTERFACE)
    target_compile_options(fretless_asan INTERFACE
        $<$<CXX_COMPILER_ID:MSVC>:/fsanitize=address>
        $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-fsanitize=address,undefined -fno-omit-frame-pointer>)
    target_link_options(fretless_asan INTERFACE
        $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-fsanitize=address,undefined>)
endif()

# ---------------------------------------------------------------------------
#  Third-party dependencies
#  Defines the normalized targets:
#     fretless::sdl2  fretless::portaudio  fretless::glad
#     fretless::freetype  fretless::pugixml  fretless::miniz  [fretless::steam]
# ---------------------------------------------------------------------------
include(Dependencies)

find_package(OpenGL REQUIRED)
find_package(Threads REQUIRED)

# ---------------------------------------------------------------------------
#  fretless_engine - everything except main()
#  Kept as a separate static lib so unit tests can link the engine directly.
# ---------------------------------------------------------------------------
set(FRETLESS_AUDIO_SOURCES
    src/audio/AudioEngine.cpp
    src/audio/PitchDetector.cpp
    src/audio/ToneEngine.cpp
)

set(FRETLESS_SOURCES
    ${FRETLESS_AUDIO_SOURCES}
    src/score/Score.cpp
    src/score/MusicXmlParser.cpp
    src/game/GameEngine.cpp
    src/game/SyntheticPlayer.cpp
    src/curriculum/ScoreBuilder.cpp
    src/curriculum/Repertoire.cpp
    src/curriculum/Generators.cpp
    src/curriculum/Curriculum.cpp
    src/curriculum/Progress.cpp
    src/curriculum/PracticePlan.cpp
    src/render/Renderer2D.cpp
    src/render/Font.cpp
    src/view/HighwayView.cpp
    src/view/TunerView.cpp
    src/view/StaffView.cpp
    src/view/HudView.cpp
    src/view/MenuView.cpp
    src/view/HomeView.cpp
    src/view/ModuleView.cpp
    src/view/TempoControl.cpp
    src/platform/FileDialog.cpp
    src/platform/SteamService.cpp
    src/app/Application.cpp
)

add_library(fretless_engine STATIC ${FRETLESS_SOURCES})
add_library(fretless::engine ALIAS fretless_engine)

target_include_directories(fretless_engine
    PUBLIC  $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>
    PRIVATE ${PROJECT_SOURCE_DIR}/src
)

target_link_libraries(fretless_engine
    PUBLIC
        fretless::warnings
        fretless::sdl2
        fretless::freetype
        fretless::pugixml
        fretless::glad            # GL entry points are needed by the renderer
        OpenGL::GL
        Threads::Threads
    PRIVATE
        fretless::portaudio       # PortAudio never leaks past the audio layer
        fretless::miniz           # .mxl inflate, used only by the parser
)

if(WIN32)
    target_link_libraries(fretless_engine PRIVATE comdlg32)
endif()

# Only the DSP translation units get relaxed float semantics.
set_source_files_properties(${FRETLESS_AUDIO_SOURCES}
    PROPERTIES COMPILE_OPTIONS
    "$<TARGET_PROPERTY:fretless_fastmath,INTERFACE_COMPILE_OPTIONS>")

target_compile_definitions(fretless_engine PUBLIC
    FRETLESS_VERSION="${PROJECT_VERSION}"
    $<$<CONFIG:Debug>:FRETLESS_DEBUG=1>
    $<$<BOOL:${FRETLESS_USE_AUBIO}>:FRETLESS_USE_AUBIO=1>
    $<$<BOOL:${WIN32}>:NOMINMAX WIN32_LEAN_AND_MEAN>
)

if(FRETLESS_ENABLE_STEAM)
    target_link_libraries(fretless_engine PUBLIC fretless::steam)
    target_compile_definitions(fretless_engine PUBLIC FRETLESS_STEAM=1)
endif()

if(FRETLESS_ENABLE_ASAN)
    target_link_libraries(fretless_engine PUBLIC fretless_asan)
endif()

# ---------------------------------------------------------------------------
#  Fretless - the game executable
# ---------------------------------------------------------------------------
add_executable(Fretless src/main.cpp)
target_link_libraries(Fretless PRIVATE fretless::engine)

# SDL2main hijacks WinMain; only the exe needs it.
if(TARGET SDL2::SDL2main)
    target_link_libraries(Fretless PRIVATE SDL2::SDL2main)
endif()

# Console window in dev builds, none in Release.
set_target_properties(Fretless PROPERTIES
    WIN32_EXECUTABLE $<CONFIG:Release>
    VS_DEBUGGER_WORKING_DIRECTORY "$<TARGET_FILE_DIR:Fretless>"
)

# -- Runtime staging --------------------------------------------------------
# 1. Copy every shared library the exe transitively needs (SDL2.dll, ...).
if(WIN32)
    add_custom_command(TARGET Fretless POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
                $<TARGET_RUNTIME_DLLS:Fretless> $<TARGET_FILE_DIR:Fretless>
        COMMAND_EXPAND_LISTS
        VERBATIM)
endif()

# 2. Mirror assets/ (fonts, shaders, songs) next to the exe.
add_custom_command(TARGET Fretless POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
            "${PROJECT_SOURCE_DIR}/assets" "$<TARGET_FILE_DIR:Fretless>/assets"
    COMMENT "Staging assets/"
    VERBATIM)

# 3. Steam requires steam_appid.txt beside the exe during development.
if(FRETLESS_ENABLE_STEAM AND EXISTS "${PROJECT_SOURCE_DIR}/steam_appid.txt")
    add_custom_command(TARGET Fretless POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${PROJECT_SOURCE_DIR}/steam_appid.txt" "$<TARGET_FILE_DIR:Fretless>"
        VERBATIM)
endif()

if(MSVC)
    set_property(DIRECTORY ${PROJECT_SOURCE_DIR} PROPERTY VS_STARTUP_PROJECT Fretless)
endif()

# ---------------------------------------------------------------------------
#  Tests
# ---------------------------------------------------------------------------
if(FRETLESS_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()

# ---------------------------------------------------------------------------
#  Install / packaging (Steam depot layout)
# ---------------------------------------------------------------------------
install(TARGETS Fretless RUNTIME DESTINATION .)
install(DIRECTORY "${PROJECT_SOURCE_DIR}/assets/" DESTINATION assets)
if(WIN32)
    install(FILES $<TARGET_RUNTIME_DLLS:Fretless> DESTINATION .)
endif()

# ---------------------------------------------------------------------------
if(FRETLESS_USE_AUBIO)
    set(_pitch_backend "aubio")
else()
    set(_pitch_backend "built-in YIN")
endif()

message(STATUS "")
message(STATUS "  Fretless ${PROJECT_VERSION}")
message(STATUS "  |- build type ..... ${CMAKE_BUILD_TYPE}${CMAKE_CONFIGURATION_TYPES}")
message(STATUS "  |- compiler ....... ${CMAKE_CXX_COMPILER_ID} ${CMAKE_CXX_COMPILER_VERSION}")
message(STATUS "  |- pitch backend .. ${_pitch_backend}")
message(STATUS "  |- steamworks ..... ${FRETLESS_ENABLE_STEAM}")
message(STATUS "  \\- output ......... ${PROJECT_BINARY_DIR}/bin")
message(STATUS "")
