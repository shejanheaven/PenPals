@echo off
rem Drag and drop a song file onto this file to run songfix on it.
cd /d "%~dp0"
if "%~1"=="" (
  echo Drag a song file onto fix-my-song.bat, or run:  python -m songfix "your song.wav"
  pause
  exit /b
)
python -m songfix "%~1"
pause
