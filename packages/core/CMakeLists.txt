cmake_minimum_required(VERSION 3.24)

project(FretlessCore LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "This build is WebAssembly only. Run it through emcmake (see scripts/build.mjs).")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_C_STANDARD 11)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE "Release" CACHE STRING "" FORCE)
endif()

option(FRETLESS_CORE_TESTS "Also build the native test suite as a Node program" ON)

get_filename_component(FRETLESS_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)

include(FetchContent)
set(FETCHCONTENT_QUIET OFF)
set(CMAKE_POLICY_DEFAULT_CMP0077 NEW)
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

set(PUGIXML_NO_EXCEPTIONS OFF CACHE BOOL "" FORCE)
FetchContent_Declare(pugixml
    GIT_REPOSITORY https://github.com/zeux/pugixml.git
    GIT_TAG        v1.14
    GIT_SHALLOW    TRUE
)
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
FetchContent_MakeAvailable(pugixml miniz)
target_include_directories(miniz PUBLIC
    $<BUILD_INTERFACE:${miniz_SOURCE_DIR}>
    $<BUILD_INTERFACE:${miniz_BINARY_DIR}>)

set(FRETLESS_CORE_SOURCES
    ${FRETLESS_ROOT}/src/audio/PitchDetector.cpp
    ${FRETLESS_ROOT}/src/audio/NoteMath.cpp
    ${FRETLESS_ROOT}/src/score/Score.cpp
    ${FRETLESS_ROOT}/src/score/Beaming.cpp
    ${FRETLESS_ROOT}/src/score/MusicXmlParser.cpp
    ${FRETLESS_ROOT}/src/game/GameEngine.cpp
    ${FRETLESS_ROOT}/src/game/SyntheticPlayer.cpp
    ${FRETLESS_ROOT}/src/curriculum/ScoreBuilder.cpp
    ${FRETLESS_ROOT}/src/curriculum/Repertoire.cpp
    ${FRETLESS_ROOT}/src/curriculum/Generators.cpp
    ${FRETLESS_ROOT}/src/curriculum/Curriculum.cpp
    ${FRETLESS_ROOT}/src/curriculum/Progress.cpp
    ${FRETLESS_ROOT}/src/curriculum/PracticePlan.cpp
)

add_library(fretless_core_lib STATIC ${FRETLESS_CORE_SOURCES})
target_include_directories(fretless_core_lib PUBLIC ${FRETLESS_ROOT}/include)
target_link_libraries(fretless_core_lib PUBLIC pugixml::pugixml miniz)
target_compile_options(fretless_core_lib PRIVATE -Wall -Wextra -Wshadow -Wconversion)
set_source_files_properties(${FRETLESS_ROOT}/src/audio/PitchDetector.cpp
    PROPERTIES COMPILE_OPTIONS "-ffast-math")

set(FRETLESS_EM_COMMON
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=33554432
    -sSTACK_SIZE=1048576
    -sDISABLE_EXCEPTION_CATCHING=0
)

add_executable(fretless_core bindings/Bindings.cpp)
target_link_libraries(fretless_core PRIVATE fretless_core_lib embind)
target_compile_options(fretless_core PRIVATE -Wall -Wextra -Wshadow -Wconversion)
target_link_options(fretless_core PRIVATE
    ${FRETLESS_EM_COMMON}
    -sMODULARIZE=1
    -sEXPORT_ES6=1
    -sEXPORT_NAME=createFretlessCore
    -sENVIRONMENT=web,worker,node
    -sEXPORTED_RUNTIME_METHODS=HEAPF32,HEAPU8
    --emit-tsd=fretless_core.d.ts
)
set_target_properties(fretless_core PROPERTIES
    OUTPUT_NAME fretless_core
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/dist")

if(FRETLESS_CORE_TESTS)
    file(GLOB FRETLESS_TEST_SOURCES CONFIGURE_DEPENDS ${FRETLESS_ROOT}/tests/*.cpp)
    add_executable(fretless_core_tests ${FRETLESS_TEST_SOURCES})
    target_link_libraries(fretless_core_tests PRIVATE fretless_core_lib)
    target_include_directories(fretless_core_tests PRIVATE ${FRETLESS_ROOT}/tests)
    target_link_options(fretless_core_tests PRIVATE
        ${FRETLESS_EM_COMMON}
        -sENVIRONMENT=node
        -sEXIT_RUNTIME=1
        "SHELL:--embed-file ${FRETLESS_ROOT}/tests/data@tests/data"
    )
    set_target_properties(fretless_core_tests PROPERTIES
        OUTPUT_NAME fretless_core_tests
        SUFFIX ".cjs"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/dist")
endif()
