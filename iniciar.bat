@echo off
reg add "HKCU\Console" /v QuickEdit /t REG_DWORD /d 0 /f >nul 2>&1
title Violin Hero

:: Localiza o Python 3.12 instalado via winget
set PYTHON=%LOCALAPPDATA%\Programs\Python\Python312\python.exe

if not exist "%PYTHON%" (
    echo.
    echo  ERRO: Python 3.12 nao encontrado em:
    echo  %PYTHON%
    echo.
    echo  Execute instalar_dependencias.bat primeiro.
    echo.
    pause
    exit /b 1
)

:: Muda para a pasta do script (funciona mesmo se chamado de outro lugar)
cd /d "%~dp0"

echo  Iniciando Violin Hero...
"%PYTHON%" main.py

:: Se falhou, mantém o cmd aberto para ver o erro
if errorlevel 1 (
    echo.
    echo  === ERRO AO INICIAR ===
    echo  Veja a mensagem acima e pressione qualquer tecla para fechar.
    pause >nul
)
