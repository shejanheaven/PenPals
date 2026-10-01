@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed yet.
  echo Your browser will open the Node.js download page. Install the "LTS" version, then double-click this file again.
  start https://nodejs.org/en/download
  pause
  exit /b
)
if not exist node_modules (
  echo First-time setup, this takes about a minute...
  call npm install
)
echo Starting Market Compass... keep this window open while you use the app.
start "" http://localhost:5173
call npm run dev
