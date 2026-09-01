@echo off
rem ===========================================================================
rem  build.bat - configure + build Fretless with the MSVC toolchain
rem
rem  Usage:
rem    build.bat                  RelWithDebInfo build (default)
rem    build.bat Debug            Debug build
rem    build.bat Debug clean      wipe the build dir first
rem
rem  Uses the CMake and Ninja bundled with VS Build Tools, so nothing extra
rem  has to be installed. Keep this file ASCII-only: cmd.exe parses it in the
rem  OEM codepage and chokes on UTF-8 box drawing.
rem ===========================================================================
setlocal
cd /d "%~dp0"

set "CONFIG=%~1"
if "%CONFIG%"=="" set "CONFIG=RelWithDebInfo"

rem ---- Locate Visual Studio ------------------------------------------------
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
    echo ERROR: vswhere.exe not found. Install Visual Studio 2022 Build Tools.
    exit /b 1
)

set "VSPATH="
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSPATH=%%i"
if "%VSPATH%"=="" (
    echo ERROR: no VC++ toolset found. Install the "Desktop development with C++" workload.
    exit /b 1
)

set "CMAKE=%VSPATH%\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
set "NINJA=%VSPATH%\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe"
if not exist "%CMAKE%" set "CMAKE=cmake"
if not exist "%NINJA%" set "NINJA=ninja"

rem ---- Enter the x64 developer environment ---------------------------------
call "%VSPATH%\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 (
    echo ERROR: vcvars64.bat failed.
    exit /b 1
)

if /i "%~2"=="clean" (
    echo Removing build/ ...
    if exist build rmdir /s /q build
)

rem ---- Configure + build ---------------------------------------------------
echo.
echo === Configuring [%CONFIG%] ===
"%CMAKE%" -B build -S . -G Ninja -DCMAKE_BUILD_TYPE=%CONFIG% -DCMAKE_MAKE_PROGRAM="%NINJA%"
if errorlevel 1 exit /b 1

echo.
echo === Building ===
"%CMAKE%" --build build
if errorlevel 1 exit /b 1

echo.
echo === Done: build\bin\Fretless.exe ===
endlocal
