@echo off
setlocal enabledelayedexpansion
set "ROOT=%~dp0"
cd /d "%ROOT%"
title BetTracker - Spustit cely system

echo ==========================================
echo   BetTracker - Spustit cely system
echo ==========================================
echo   Jedno CMD okno - vse bezi zde na pozadi.
echo.



REM Kontrola slozek

if not exist "%ROOT%backend" (

    echo   CHYBA: Slozka backend neexistuje. Spoustejte BAT z korene projektu.

    pause

    exit /b 1

)

if not exist "%ROOT%backend\venv\Scripts\python.exe" (

    echo   CHYBA: Backend venv neexistuje.

    echo   V backend slozce spustte: python -m venv venv

    echo   Pak: .\venv\Scripts\activate a pip install -r requirements.txt

    pause

    exit /b 1

)

if not exist "%ROOT%frontend\package.json" (

    echo   CHYBA: Frontend neexistuje nebo chybi package.json.

    pause

    exit /b 1

)

if not exist "%ROOT%overlay\package.json" (

    echo   CHYBA: Overlay neexistuje nebo chybi package.json.

    pause

    exit /b 1

)



REM Uvolneni portu (vse bezi v tomto jednom CMD, nemame jina okna k ukonceni)
echo [0/6] Uvolnuji porty...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":15555 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 /nobreak >nul

if exist "%ROOT%frontend\.next\dev\lock" (
    echo   Mazu Next.js lock...
    del /f /q "%ROOT%frontend\.next\dev\lock" >nul 2>&1
)
echo   Porty uvolneny.

echo.



REM KROK 1: Docker

if not exist "%ROOT%docker\docker-compose.yml" (

    echo   VAROVANI: docker\docker-compose.yml nenalezen. Preskakuji Docker.

    echo   Ujistete se, ze PostgreSQL bezi na localhost:5432.

    goto :skip_docker

)



echo [1/6] Spoustim PostgreSQL ^(Docker^)...

cd /d "%ROOT%docker"

docker info >nul 2>&1

if %ERRORLEVEL% neq 0 (

    echo   CHYBA: Docker nebezi. Spustte Docker Desktop a zkuste znovu.

    pause

    exit /b 1

)

docker compose up -d 2>nul

if %ERRORLEVEL% neq 0 (

    docker-compose up -d 2>nul

)

if %ERRORLEVEL% neq 0 (

    echo   CHYBA: docker compose selhal.

    pause

    exit /b 1

)

echo   PostgreSQL bezi.

:skip_docker

echo.



REM KROK 2: Cekani na DB

echo [2/6] Cekam na databazi...

cd /d "%ROOT%backend"

set "DB_READY=0"
set "CNT=0"

:db_loop
set /a CNT+=1
".\venv\Scripts\python.exe" -c "from app.database import engine; engine.connect().close(); print('OK')" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "DB_READY=1"
    echo   Databaze pripravena.
    goto :db_done
)
if %CNT% lss 20 (
    echo   Cekam... %CNT%/20
    timeout /t 2 /nobreak >nul
    goto :db_loop
)

:db_done
if "%DB_READY%"=="0" (
    echo   Varovani: Databaze neodpovida. Cekam jeste 15 s...
    timeout /t 15 /nobreak >nul
)

echo.



REM KROK 3: Migrace a seed

echo [3/6] Migrace a seed...

cd /d "%ROOT%backend"

REM Aplikovat vsechny migrace automaticky (heads = vsechny vetve, funguje i pri jednom headu)
".\venv\Scripts\python.exe" -m alembic upgrade heads 2>nul

if %ERRORLEVEL% neq 0 (

    ".\venv\Scripts\python.exe" -c "from app.database import Base, engine; Base.metadata.create_all(bind=engine)"

)

".\venv\Scripts\python.exe" -m app.seed 2>nul

echo   Databaze OK.

echo.



REM KROK 4-6: Spusteni sluzeb (v samostatnych oknech/bez zavisleho stdin)
echo [4/6] Spoustim Backend...
start "BetTracker Backend" "%~dp0run-backend.bat"
timeout /t 5 /nobreak >nul

echo [5/6] Spoustim Frontend...
start "BetTracker Frontend" "%~dp0run-frontend.bat"
timeout /t 2 /nobreak >nul

echo [6/6] Spoustim Overlay...
start "BetTracker Overlay" "%~dp0run-overlay.bat"



echo.

echo ==========================================

echo   SYSTEM SPUSTEN

echo ==========================================

echo   Backend:   http://localhost:15555

echo   Frontend:  http://localhost:3001

echo   Overlay:   okno se otevře za chvili ^(port 5173^)

echo   Zavrenim tohoto okna ukoncite vsechny sluzby.
echo ==========================================

echo.

pause

