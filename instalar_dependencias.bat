@echo off
:: Desabilita QuickEdit mode para nao pausar ao clicar
reg add "HKCU\Console" /v QuickEdit /t REG_DWORD /d 0 /f >nul 2>&1

echo ================================================
echo   Violin Hero - Instalando Python + dependencias
echo ================================================
echo.

set LOG=%~dp0install_log.txt
echo %date% %time% - Iniciando > "%LOG%"

:: ---- Instala Python via winget (direto, sem list) ----
echo [1/2] Instalando Python 3.12 via winget...
echo (isso pode levar 1-3 minutos na primeira vez)
echo.
winget install --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements --source winget
echo winget saiu com codigo: %ERRORLEVEL% >> "%LOG%"

:: Atualiza PATH para incluir Python recem instalado
set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"

:: Detecta Python
set PYTHON=
py --version >nul 2>&1 && set PYTHON=py
if "%PYTHON%"=="" (
    for %%P in (
        "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
        "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
        "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
        "C:\Python312\python.exe"
        "C:\Python313\python.exe"
    ) do ( if exist %%P ( set PYTHON=%%P & goto :found ) )
)
:found

if "%PYTHON%"=="" (
    echo.
    echo ERRO: Python nao encontrado mesmo apos instalacao.
    echo Feche e abra um novo Prompt de Comando, entao rode:
    echo   py -m pip install music21 aubio sounddevice PyQt6
    pause & exit /b 1
)

echo Python: %PYTHON%
%PYTHON% --version
echo Python: %PYTHON% >> "%LOG%"
%PYTHON% --version >> "%LOG%" 2>&1
echo.

:: ---- Instala dependencias ----
echo [2/2] Instalando dependencias Python...
echo.

echo   music21...
%PYTHON% -m pip install "music21>=9.0" --quiet && echo   OK: music21 || echo   ERRO: music21
echo music21 >> "%LOG%" & %PYTHON% -m pip install "music21>=9.0" >> "%LOG%" 2>&1

echo   aubio...
%PYTHON% -m pip install "aubio>=0.4.9" --quiet && echo   OK: aubio || echo   ERRO: aubio
echo aubio >> "%LOG%" & %PYTHON% -m pip install "aubio>=0.4.9" >> "%LOG%" 2>&1

echo   sounddevice...
%PYTHON% -m pip install "sounddevice>=0.4.6" --quiet && echo   OK: sounddevice || echo   ERRO: sounddevice
echo sounddevice >> "%LOG%" & %PYTHON% -m pip install "sounddevice>=0.4.6" >> "%LOG%" 2>&1

echo   PyQt6...
%PYTHON% -m pip install "PyQt6>=6.6" --quiet && echo   OK: PyQt6 || echo   ERRO: PyQt6
echo PyQt6 >> "%LOG%" & %PYTHON% -m pip install "PyQt6>=6.6" >> "%LOG%" 2>&1

echo   swig...
%PYTHON% -m pip install swig --quiet && echo   OK: swig || echo   ERRO: swig

echo   verovio (compilacao, pode demorar 2-5 min)...
%PYTHON% -m pip install verovio && echo   OK: verovio || echo   ERRO verovio (opcional - pode instalar depois)

echo.
echo ================================================
echo   Resumo dos pacotes instalados:
%PYTHON% -m pip list 2>&1 | findstr /i "music21 aubio sounddevice PyQt6 verovio"
echo ================================================
echo.
echo Log salvo em: %LOG%
echo.
echo Tudo pronto! Para testar o audio:
echo   Abra um terminal na pasta violin_hero e execute:
echo   py main.py --test-audio
echo.
pause
