@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo Zastavte vsechny jine Git operace a zavrete IDE/terminály, které pouzivaji tento repo.
echo Pak stisknete libovolnou klavesu...
pause >nul

echo.
echo [1/4] Pridavam zmeny (target/dist jsou v .gitignore)...
git add -A
if %ERRORLEVEL% neq 0 (
    echo CHYBA: git add
    pause
    exit /b 1
)

echo [2/4] Commit - Overlay MVP 0.1...
git commit -m "feat: Overlay MVP 0.1 - desktop app, LIVE sync Tipsport/Betano/Fortuna, event_start_at, batch skripty"
if %ERRORLEVEL% neq 0 (
    echo CHYBA: git commit (možná žádné změny ke commitu)
    pause
    exit /b 1
)

echo [3/4] Tag overlay-mvp-0.1...
git tag -a overlay-mvp-0.1 -m "Overlay MVP 0.1 - desktop app, LIVE sync, cas vykopu vsech SK"
if %ERRORLEVEL% neq 0 (
    echo Tag už existuje nebo chyba. Pokračuji push...
)

echo [4/4] Push na GitHub...
git push origin HEAD
if %ERRORLEVEL% neq 0 (
    echo CHYBA: git push
    pause
    exit /b 1
)

git push origin overlay-mvp-0.1 2>nul
echo.
echo Hotovo. Commit i tag overlay-mvp-0.1 odeslany na GitHub.
pause
