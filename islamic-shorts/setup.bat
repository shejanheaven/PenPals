@echo off
setlocal
cd /d "%~dp0"
echo.
echo  Islamic Shorts - one-time setup
echo  ================================
echo.
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo  Python is not installed. Get it from https://www.python.org/downloads/
  echo  ^(tick "Add python.exe to PATH" during install^), then run setup.bat again.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  echo  Creating a private Python environment...
  %PY% -m venv .venv || (echo  Could not create the environment. & pause & exit /b 1)
)
echo  Installing libraries ^(first time takes a minute^)...
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
".venv\Scripts\python.exe" -m pip install -r requirements.txt || (echo  Install failed. & pause & exit /b 1)
".venv\Scripts\python.exe" -m pip install "anthropic>=1.11" >nul 2>nul || echo  ^(Optional Claude library skipped - Gemini and the others still work.^)
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo  Created .env - open it in Notepad to add your free keys.
)
echo.
".venv\Scripts\python.exe" make_video.py --check
echo.
echo  Setup finished. Double-click "Make Video.bat" to create videos.
pause
