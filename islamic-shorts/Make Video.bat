@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" call setup.bat
echo.
echo  Islamic Shorts
echo  ==============
echo  Leave the topic empty and the AI picks fresh topics for you.
echo.
set "TOPIC="
set /p "TOPIC=Topic or theme: "
set "COUNT=1"
set /p "COUNT=How many videos? [1]: "
set "DRAFT="
set /p "DRAFT=Free draft preview first (no image credits)? [y/N]: "
set "EXTRA="
if /i "%DRAFT%"=="y" set "EXTRA=--draft"
echo.
if "%TOPIC%"=="" (
  ".venv\Scripts\python.exe" make_video.py --count %COUNT% %EXTRA%
) else (
  ".venv\Scripts\python.exe" make_video.py "%TOPIC%" --count %COUNT% %EXTRA%
)
echo.
if exist output start "" "output"
pause
