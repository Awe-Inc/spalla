# ═══════════════════════════════════════════════════════════════════════════
#  Dependencies.cmake
#
#  Every third-party library is resolved here and re-exported under a single
#  normalized alias (fretless::xxx). Upstream target names drift between
#  releases (SDL2::SDL2 vs SDL2, PortAudio vs portaudio_static, …) — pinning
#  the rest of the build to our own aliases means a dependency bump touches
#  exactly one file.
#
#  Resolution order: a system/vcpkg package is preferred (FIND_PACKAGE_ARGS);
#  otherwise the source is fetched and built in-tree.
# ═══════════════════════════════════════════════════════════════════════════

include(FetchContent)
set(FETCHCONTENT_QUIET OFF)

# Third-party warnings are not ours to fix.
set(CMAKE_POLICY_DEFAULT_CMP0077 NEW)   # option() honours normal variables

# ───────────────────────────────────────────────────────────────────────────
#  SDL2 — window, GL context, input, gamepads, high-resolution timer
# ───────────────────────────────────────────────────────────────────────────
set(SDL_SHARED       ON  CACHE BOOL "" FORCE)
set(SDL_STATIC       OFF CACHE BOOL "" FORCE)
set(SDL_TEST         OFF CACHE BOOL "" FORCE)
set(SDL2_DISABLE_INSTALL ON CACHE BOOL "" FORCE)
# We drive audio through PortAudio; SDL's audio backend is dead weight.
set(SDL_AUDIO        OFF CACHE BOOL "" FORCE)

FetchContent_Declare(SDL2
    GIT_REPOSITORY https://github.com/libsdl-org/SDL.git
    GIT_TAG        release-2.30.9
    GIT_SHALLOW    TRUE
    FIND_PACKAGE_ARGS NAMES SDL2
)

# ───────────────────────────────────────────────────────────────────────────
#  PortAudio — low-latency capture
#
#  Backend choice is the single biggest latency lever on Windows:
#    WASAPI (exclusive mode) ..  3–10 ms   ← primary
#    WDM-KS ..................   2–6  ms   ← fallback for pro interfaces
#    MME/DirectSound .........  30–80 ms   ← kept only for device coverage
#  ASIO needs Steinberg's SDK, which we cannot redistribute: opt-in via
#  -DPA_USE_ASIO=ON with ASIOSDK_ROOT set locally.
# ───────────────────────────────────────────────────────────────────────────
set(PA_BUILD_SHARED   OFF CACHE BOOL "" FORCE)
set(PA_BUILD_STATIC   ON  CACHE BOOL "" FORCE)
set(PA_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(PA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(PA_ENABLE_DEBUG_OUTPUT OFF CACHE BOOL "" FORCE)
if(WIN32)
    set(PA_USE_WASAPI ON  CACHE BOOL "" FORCE)
    set(PA_USE_WDMKS  ON  CACHE BOOL "" FORCE)
    set(PA_USE_WMME   ON  CACHE BOOL "" FORCE)   # compatibility fallback only
    set(PA_USE_DS     OFF CACHE BOOL "" FORCE)
endif()

FetchContent_Declare(portaudio
    GIT_REPOSITORY https://github.com/PortAudio/portaudio.git
    GIT_TAG        v19.7.0
    GIT_SHALLOW    TRUE
    FIND_PACKAGE_ARGS NAMES portaudio
)

# ───────────────────────────────────────────────────────────────────────────
#  pugixml — MusicXML parsing (replaces music21)
#  Chosen over tinyxml2 for its XPath support: locating <part>, <divisions>
#  and <sound tempo=""> in a compressed .mxl is a two-line query.
# ───────────────────────────────────────────────────────────────────────────
set(PUGIXML_NO_EXCEPTIONS OFF CACHE BOOL "" FORCE)
FetchContent_Declare(pugixml
    GIT_REPOSITORY https://github.com/zeux/pugixml.git
    GIT_TAG        v1.14
    GIT_SHALLOW    TRUE
    FIND_PACKAGE_ARGS NAMES pugixml
)

# ───────────────────────────────────────────────────────────────────────────
#  FreeType — glyph rasterization for the Bravura SMuFL music font and HUD
# ───────────────────────────────────────────────────────────────────────────
set(FT_DISABLE_HARFBUZZ ON CACHE BOOL "" FORCE)
set(FT_DISABLE_BROTLI   ON CACHE BOOL "" FORCE)
set(FT_DISABLE_BZIP2    ON CACHE BOOL "" FORCE)
set(FT_DISABLE_PNG      ON CACHE BOOL "" FORCE)
set(FT_DISABLE_ZLIB     ON CACHE BOOL "" FORCE)
FetchContent_Declare(freetype
    GIT_REPOSITORY https://github.com/freetype/freetype.git
    GIT_TAG        VER-2-13-2
    GIT_SHALLOW    TRUE
    FIND_PACKAGE_ARGS NAMES Freetype
)

# ───────────────────────────────────────────────────────────────────────────
#  miniz — inflate for .mxl (a zip container; MuseScore's default export)
# ───────────────────────────────────────────────────────────────────────────
set(BUILD_EXAMPLES  OFF CACHE BOOL "" FORCE)
set(BUILD_FUZZERS   OFF CACHE BOOL "" FORCE)
set(BUILD_TESTS     OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(MINIZ_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(MINIZ_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
FetchContent_Declare(miniz
    GIT_REPOSITORY https://github.com/richgel999/miniz.git
    GIT_TAG        3.0.2
    GIT_SHALLOW    TRUE
)

FetchContent_MakeAvailable(SDL2 portaudio pugixml freetype miniz)

# miniz 3.x generates miniz_export.h into its binary dir and does not always
# add it to the target's interface includes.
if(TARGET miniz)
    target_include_directories(miniz PUBLIC
        $<BUILD_INTERFACE:${miniz_SOURCE_DIR}>
        $<BUILD_INTERFACE:${miniz_BINARY_DIR}>)
endif()

# ───────────────────────────────────────────────────────────────────────────
#  glad — OpenGL 3.3 core function loader
#
#  Generated at configure time (needs Python on PATH, already required by the
#  asset tooling). If you would rather vendor the generated files, drop them
#  in lib/glad/ and set -DFRETLESS_VENDORED_GLAD=ON.
# ───────────────────────────────────────────────────────────────────────────
if(EXISTS "${PROJECT_SOURCE_DIR}/lib/glad/src/gl.c")
    add_library(glad_gl_core_33 STATIC "${PROJECT_SOURCE_DIR}/lib/glad/src/gl.c")
    target_include_directories(glad_gl_core_33 PUBLIC "${PROJECT_SOURCE_DIR}/lib/glad/include")
else()
    FetchContent_Declare(glad
        GIT_REPOSITORY https://github.com/Dav1dde/glad.git
        GIT_TAG        v2.0.6
        GIT_SHALLOW    TRUE
        SOURCE_SUBDIR  cmake
    )
    FetchContent_MakeAvailable(glad)
    glad_add_library(glad_gl_core_33 REPRODUCIBLE API gl:core=3.3)
endif()

# ───────────────────────────────────────────────────────────────────────────
#  Normalized aliases
# ───────────────────────────────────────────────────────────────────────────
function(_fretless_alias out_name)
    foreach(candidate IN LISTS ARGN)
        if(TARGET ${candidate})
            add_library(${out_name} INTERFACE IMPORTED GLOBAL)
            target_link_libraries(${out_name} INTERFACE ${candidate})
            return()
        endif()
    endforeach()
    message(FATAL_ERROR "Could not resolve a target for ${out_name}. Tried: ${ARGN}")
endfunction()

_fretless_alias(fretless::sdl2      SDL2::SDL2 SDL2::SDL2-static SDL2)
_fretless_alias(fretless::portaudio PortAudio::PortAudio PortAudio portaudio_static portaudio)
_fretless_alias(fretless::pugixml   pugixml::pugixml pugixml)
_fretless_alias(fretless::freetype  Freetype::Freetype freetype)
_fretless_alias(fretless::glad      glad_gl_core_33 glad)
_fretless_alias(fretless::miniz     miniz::miniz miniz)

# ───────────────────────────────────────────────────────────────────────────
#  aubio (optional) — reference implementation to A/B against our YIN
# ───────────────────────────────────────────────────────────────────────────
if(FRETLESS_USE_AUBIO)
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(AUBIO REQUIRED IMPORTED_TARGET aubio)
    _fretless_alias(fretless::aubio PkgConfig::AUBIO)
endif()

# ───────────────────────────────────────────────────────────────────────────
#  Steamworks SDK — proprietary, not fetchable. Unzip it into
#  lib/steamworks/ so that lib/steamworks/public/steam/steam_api.h exists.
# ───────────────────────────────────────────────────────────────────────────
if(FRETLESS_ENABLE_STEAM)
    set(STEAM_ROOT "${PROJECT_SOURCE_DIR}/lib/steamworks")
    if(NOT EXISTS "${STEAM_ROOT}/public/steam/steam_api.h")
        message(FATAL_ERROR
            "FRETLESS_ENABLE_STEAM=ON but the SDK is missing.\n"
            "Download it from https://partner.steamgames.com/downloads/list "
            "and extract sdk/ into ${STEAM_ROOT}/")
    endif()

    if(CMAKE_SIZEOF_VOID_P EQUAL 8)
        set(_steam_redist "${STEAM_ROOT}/redistributable_bin/win64")
        set(_steam_lib    "${_steam_redist}/steam_api64.lib")
        set(_steam_dll    "${_steam_redist}/steam_api64.dll")
    else()
        set(_steam_redist "${STEAM_ROOT}/redistributable_bin")
        set(_steam_lib    "${_steam_redist}/steam_api.lib")
        set(_steam_dll    "${_steam_redist}/steam_api.dll")
    endif()

    add_library(steamworks SHARED IMPORTED GLOBAL)
    set_target_properties(steamworks PROPERTIES
        IMPORTED_LOCATION             "${_steam_dll}"
        IMPORTED_IMPLIB               "${_steam_lib}"
        INTERFACE_INCLUDE_DIRECTORIES "${STEAM_ROOT}/public")
    _fretless_alias(fretless::steam steamworks)
endif()
