@echo off
chcp 65001 >nul 2>&1
title Instalátor BetTracker Overlay
set "ROOT=%~dp0"
set "MSI=%ROOT%overlay\src-tauri\target\release\bundle\msi\BetTracker Overlay_0.1.0_x64_en-US.msi"
set "NSIS=%ROOT%overlay\src-tauri\target\release\bundle\nsis\BetTracker Overlay_0.1.0_x64-setup.exe"

echo ==========================================
echo   BetTracker Overlay - Instalator
echo ==========================================
echo.

if exist "%MSI%" (
    echo Spoustim MSI instalator...
    msiexec /i "%MSI%"
    echo.
    echo Instalator byl spusten. Dokoncite instalaci v okne, ktere se otevrelo.
    goto :end
)

if exist "%NSIS%" (
    echo Spoustim NSIS instalator...
    start "" "%NSIS%"
    echo.
    echo Instalator byl spusten. Dokoncite instalaci v okne, ktere se otevrelo.
    goto :end
)

echo Instalacni soubor nenalezen.
echo.
echo Nejdrive musite sestavit overlay:
echo   cd "%ROOT%overlay"
echo   .\build.ps1
echo.
echo Nebo: npx tauri build
echo.
echo Po buildi bude instalator zde:
echo   %MSI%
echo nebo
echo   %NSIS%
echo.

:end
echo.
pause
