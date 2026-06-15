@echo off
cd /d "%~dp0"
set GM_MODEL=llama3.1:8b
echo ============================================================
echo   ROMA - A Text RPG of Ancient Rome  (FAST MODE)
echo ------------------------------------------------------------
echo   Starting the game (model: llama3.1:8b - faster, lighter)...
echo   When you see "VITE ready" below, open your browser to:
echo.
echo       http://localhost:5173
echo.
echo   Keep this window open while you play.
echo   Close it (or press Ctrl+C) to stop the game.
echo ============================================================
echo.
call npm run dev
pause
