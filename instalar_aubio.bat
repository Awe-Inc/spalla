@echo off
reg add "HKCU\Console" /v QuickEdit /t REG_DWORD /d 0 /f >nul 2>&1

echo ================================================
echo   Violin Hero - Instalando aubio
echo ================================================
echo.

set PYTHON="%LOCALAPPDATA%\Programs\Python\Python312\python.exe"

echo [1/2] Instalando Visual C++ Build Tools via winget...
echo (necessario para compilar aubio - download ~3 GB, pode demorar)
echo.
winget install --id Microsoft.VisualStudio.2022.BuildTools --silent --accept-package-agreements --accept-source-agreements --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

echo.
echo [2/2] Instalando aubio...
%PYTHON% -m pip install aubio

echo.
echo ================================================
%PYTHON% -m pip list 2>&1 | findstr /i "aubio"
echo ================================================
echo.
pause
