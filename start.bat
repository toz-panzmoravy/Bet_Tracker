@echo off
chcp 65001 >nul 2>&1
title BetTracker - System Launcher
echo ==========================================
echo   BetTracker - Spousteni systemu
echo ==========================================
echo.

REM ─── KROK 0: Uklidime predchozi procesy ────────────
echo [0/5] Zastavuji predchozi procesy...

REM Kill procesy na portu 3000 (frontend)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000.*LISTENING"') do (
    echo   Kill PID %%a (port 3000^)
    taskkill /PID %%a /F /T >nul 2>&1
)

REM Kill procesy na portu 8000 (backend)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8000.*LISTENING"') do (
    echo   Kill PID %%a (port 8000^)
    taskkill /PID %%a /F /T >nul 2>&1
)

REM Kill okna s nasimi titulky
taskkill /FI "WINDOWTITLE eq BetTracker Backend*" /F /T >nul 2>&1
taskkill /FI "WINDOWTITLE eq BetTracker Frontend*" /F /T >nul 2>&1

REM Kratka pauza
timeout /t 2 /nobreak >nul

REM Smaz Next.js lock soubor
if exist "%~dp0frontend\.next\dev\lock" (
    echo   Mazu Next.js lock soubor...
    del /f /q "%~dp0frontend\.next\dev\lock" >nul 2>&1
)
if exist "%~dp0frontend\.next\dev\lock" (
    rmdir /s /q "%~dp0frontend\.next" >nul 2>&1
)

echo   Porty 3000 a 8000 uvolneny.
echo.

REM ─── KROK 1: Docker / PostgreSQL ──────────────────
echo [1/5] Spoustim PostgreSQL (Docker)...
cd /d %~dp0docker

REM Zkontroluj jestli Docker bezi
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   CHYBA: Docker Desktop nebezi!
    echo   Spust Docker Desktop a zkus to znovu.
    pause
    exit /b 1
)

REM NEMAZEME kontejner! Jen zajistime ze bezi.
REM "up -d" spusti kontejner pokud nebezi, nechá běžet pokud ano.
docker compose up -d
if %ERRORLEVEL% neq 0 (
    echo   CHYBA: Docker compose selhal!
    pause
    exit /b 1
)
echo   PostgreSQL bezi.
echo.

REM ─── KROK 2: Cekame na PostgreSQL ─────────────────
echo [2/5] Cekam na PostgreSQL...

REM Aktivni cekani na DB - max 30 sekund
cd /d %~dp0backend
call .\venv\Scripts\activate.bat

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

REM Fallback - proste pockej
if "%DB_READY%"=="0" (
    echo   Cekam 10s jako fallback...
    timeout /t 10 /nobreak >nul
)
echo.

REM ─── KROK 3: Databaze ─────────────────────────────
echo [3/5] Kontroluji databazi...
cd /d %~dp0backend

REM Vygeneruj migraci pokud jeste neexistuje
set "MIGRATION_EXISTS=0"
for %%f in (alembic\versions\*.py) do set "MIGRATION_EXISTS=1"
if "%MIGRATION_EXISTS%"=="0" (
    echo   Generuji prvni migraci...
    .\venv\Scripts\python.exe -m alembic revision --autogenerate -m "initial"
)

echo   Aplikuji migrace...
.\venv\Scripts\python.exe -m alembic upgrade head
if %ERRORLEVEL% neq 0 (
    echo   Migrace selhala, vytvarim tabulky...
    .\venv\Scripts\python.exe -c "from app.database import Base, engine; Base.metadata.create_all(bind=engine)"
)

echo   Seed data...
.\venv\Scripts\python.exe -m app.seed
echo   Databaze OK.
echo.

REM ─── KROK 4: Backend ──────────────────────────────
echo [4/5] Spoustim Backend (FastAPI)...
start "BetTracker Backend" cmd /k "cd /d %~dp0backend && .\venv\Scripts\activate.bat && python -m uvicorn app.main:app --reload --port 8000"
echo   Backend: http://localhost:8000
echo.

REM ─── KROK 5: Frontend ─────────────────────────────
echo [5/5] Spoustim Frontend (Next.js)...
start "BetTracker Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo   Frontend: http://localhost:3000
echo.

echo ==========================================
echo   VSECHNY SLUZBY SPUSTENY!
echo.
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8000
echo   API docs: http://localhost:8000/docs
echo ==========================================
echo.
echo Data v databazi jsou ZACHOVANA mezi restarty.
pause
