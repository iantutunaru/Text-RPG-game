@echo off
cd /d "%~dp0"
echo ============================================================
echo   ROMA - A Text RPG of Ancient Rome
echo ------------------------------------------------------------
echo   Starting the game (model: qwen2.5:14b)...
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
