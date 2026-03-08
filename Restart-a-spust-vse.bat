@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title BetTracker - Restart a spustit vse (test)
echo ==========================================
echo   BetTracker - Restart a spustit vse
echo ==========================================
echo.

REM ─── KROK 0: Zastavit predchozi procesy ────────────
echo [0/6] Zastavuji predchozi procesy...

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3001.*LISTENING"') do (
    echo   Kill PID %%a (port 3001^)
    taskkill /PID %%a /F /T >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":15555.*LISTENING"') do (
    echo   Kill PID %%a (port 15555^)
    taskkill /PID %%a /F /T >nul 2>&1
)

taskkill /FI "WINDOWTITLE eq BetTracker Backend*" /F /T >nul 2>&1
taskkill /FI "WINDOWTITLE eq BetTracker Frontend*" /F /T >nul 2>&1
taskkill /FI "WINDOWTITLE eq BetTracker Overlay*" /F /T >nul 2>&1

timeout /t 2 /nobreak >nul

if exist "%~dp0frontend\.next\dev\lock" (
    echo   Mazu Next.js lock...
    del /f /q "%~dp0frontend\.next\dev\lock" >nul 2>&1
)
echo   Porty uvolneny.
echo.

REM ─── KROK 1: PostgreSQL (Docker) ──────────────────
echo [1/6] PostgreSQL (Docker)...
cd /d %~dp0docker
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   CHYBA: Docker Desktop nebezi. Spust ho a zkus znovu.
    pause
    exit /b 1
)
docker compose up -d
if %ERRORLEVEL% neq 0 (
    echo   CHYBA: Docker compose selhal!
    pause
    exit /b 1
)
echo   PostgreSQL bezi.
echo.

REM ─── KROK 2: Cekani na DB ─────────────────────────
echo [2/6] Cekam na databazi...
cd /d %~dp0backend
call .\venv\Scripts\activate.bat 2>nul
set "DB_READY=0"
for /l %%i in (1,1,15) do (
    if "!DB_READY!"=="0" (
        .\venv\Scripts\python.exe -c "from app.database import engine; engine.connect().close(); print('OK')" >nul 2>&1
        if !ERRORLEVEL! equ 0 (
            set "DB_READY=1"
            echo   Databaze pripravena.
        ) else (
            echo   Cekam... (%%i/15^)
            timeout /t 2 /nobreak >nul
        )
    )
)
if "!DB_READY!"=="0" (
    echo   Fallback: cekam 10s...
    timeout /t 10 /nobreak >nul
)
echo.

REM ─── KROK 3: Migrace a seed ───────────────────────
echo [3/6] Migrace a seed...
cd /d %~dp0backend
.\venv\Scripts\python.exe -m alembic upgrade head 2>nul
if %ERRORLEVEL% neq 0 (
    .\venv\Scripts\python.exe -c "from app.database import Base, engine; Base.metadata.create_all(bind=engine)"
)
.\venv\Scripts\python.exe -m app.seed 2>nul
echo   Databaze OK.
echo.

REM ─── KROK 4: Backend ──────────────────────────────
echo [4/6] Spoustim Backend...
start "BetTracker Backend" cmd /k "cd /d %~dp0backend && \"%~dp0backend\venv\Scripts\python.exe\" -m uvicorn app.main:app --reload --port 15555"
echo   Backend: http://localhost:15555
echo.

REM ─── KROK 5: Frontend ─────────────────────────────
echo [5/6] Spoustim Frontend...
start "BetTracker Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo   Frontend: http://localhost:3001
echo.

REM ─── KROK 6: Overlay (Tauri dev) ───────────────────
echo [6/6] Spoustim Overlay (Tauri dev)...
start "BetTracker Overlay" cmd /k "cd /d %~dp0overlay && npm run tauri:dev"
echo   Overlay: otevře se okno po načtení
echo.

echo ==========================================
echo   VSECHNO SPUSTENO PRO TEST
echo.
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:15555
echo   API docs:  http://localhost:15555/docs
echo   Overlay:   okno Tauri (dev)
echo ==========================================
echo.
echo Jednim prikazem (CMD):  cd /d "%~dp0" ^&^& Restart-a-spust-vse.bat
echo Jednim prikazem (PowerShell):  cd "%~dp0"; .\Restart-a-spust-vse.bat
echo.
pause
