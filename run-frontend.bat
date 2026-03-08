@echo off
set "ROOT=%~dp0"
cd /d "%ROOT%frontend"
call npm run dev
pause
