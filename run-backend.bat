@echo off
set "ROOT=%~dp0"
REM Vzdy prejit do slozky backend (dulezite pri startu z BetTracker.bat)
if not exist "%ROOT%backend" (
    echo CHYBA: Slozka backend neexistuje: %ROOT%backend
    pause
    exit /b 1
)
cd /d "%ROOT%backend"

REM Uvolnit port 15555, pokud na nem neco bezi (predchozí beh backendu)
set "PORT=15555"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
    if not "%%a"=="" echo   Ukoncen proces na portu %PORT%, PID: %%a
)
timeout /t 2 /nobreak >nul

REM Migrace pred startem (automaticky vsechny vetve)
"%ROOT%backend\venv\Scripts\python.exe" -m alembic upgrade heads 2>nul

echo Spoustim backend na http://localhost:%PORT% ...
"%ROOT%backend\venv\Scripts\python.exe" -m uvicorn app.main:app --reload --port %PORT% --host 0.0.0.0
if %ERRORLEVEL% neq 0 (
    echo.
    echo Backend skoncil s chybou. Pokud vidis "port already in use", ukoncete druhy beh backendu nebo jinou aplikaci na portu 15555.
)
pause
