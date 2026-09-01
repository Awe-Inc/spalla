@echo off
rem Builds with tests enabled and runs them. ASCII only - see build.bat.
setlocal
cd /d "%~dp0"

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VSPATH="
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSPATH=%%i"
if "%VSPATH%"=="" ( echo ERROR: no VC++ toolset found. & exit /b 1 )

set "CMAKE=%VSPATH%\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
set "CTEST=%VSPATH%\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\ctest.exe"
set "NINJA=%VSPATH%\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe"

call "%VSPATH%\VC\Auxiliary\Build\vcvars64.bat" >nul

"%CMAKE%" -B build -S . -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo -DCMAKE_MAKE_PROGRAM="%NINJA%" -DFRETLESS_BUILD_TESTS=ON
if errorlevel 1 exit /b 1

"%CMAKE%" --build build
if errorlevel 1 exit /b 1

echo.
build\bin\fretless_tests.exe
endlocal
