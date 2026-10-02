@echo off
rem Drag one or more song files onto this file to run songfix on them.
rem The first run sets up a private Python environment in .venv (a few minutes, one time only).
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  echo Drag a song file onto fix-my-song.bat, or run:  .venv\Scripts\python -m songfix "your song.wav"
  pause
  exit /b
)

if not exist ".venv\Scripts\python.exe" call :setup || goto :fail

where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo ffmpeg was not found. Install it with:  winget install Gyan.FFmpeg
  goto :fail
)

:next
if "%~1"=="" goto :done
".venv\Scripts\python.exe" -m songfix "%~1"
shift
goto :next

:done
pause
exit /b

:setup
rem Find a working Python 3.10-3.13. "python" alone can be the Microsoft Store shortcut, so test it.
set "PY="
for %%V in (3.13 3.12 3.11 3.10) do (
  if not defined PY py -%%V -c "import sys" >nul 2>&1 && set "PY=py -%%V"
)
if not defined PY python -c "import sys; assert (3,10) <= sys.version_info[:2] <= (3,13)" >nul 2>&1 && set "PY=python"
if not defined PY (
  echo Python 3.10 - 3.13 is required. Install it with:  winget install Python.Python.3.13
  exit /b 1
)
echo First run: setting up songfix with %PY% ^(one time only^)...
%PY% -m venv .venv || exit /b 1
".venv\Scripts\python.exe" -m pip install -q --upgrade pip
".venv\Scripts\python.exe" -m pip install -q -r requirements.txt || (rmdir /s /q .venv & exit /b 1)
exit /b 0

:fail
echo.
echo songfix could not run - see the message above.
pause
exit /b 1
