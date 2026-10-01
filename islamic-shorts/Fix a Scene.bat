@echo off
setlocal
cd /d "%~dp0"
echo.
echo  Regenerate scene images in your most recent video
echo  (look at storyboard.jpg in the video folder to pick the numbers)
echo.
set "SCENES="
set /p "SCENES=Scene numbers to redo, e.g. 3,7: "
if "%SCENES%"=="" exit /b 0
".venv\Scripts\python.exe" make_video.py --project latest --redo %SCENES%
pause
