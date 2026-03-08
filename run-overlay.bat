@echo off
set "ROOT=%~dp0"
cd /d "%ROOT%overlay"

REM Uvolnit port 5173, pokud na nem neco bezi (predchozi beh overlay / Vite)
set "PORT=5173"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
    if not "%%a"=="" echo   Ukoncen proces na portu %PORT%, PID: %%a
)
timeout /t 2 /nobreak >nul

call npm run tauri:dev
pause
