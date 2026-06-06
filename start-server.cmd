@echo off
set "ROOT=%~dp0"
set "NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE%" (
  echo Node runtime not found:
  echo %NODE%
  pause
  exit /b 1
)

start "drawing-phone-server" /min "%NODE%" "%ROOT%server.js"
timeout /t 1 >nul
start "" "http://localhost:4173"
echo Drawing Phone is opening at http://localhost:4173
echo Keep this window if you want, or close only after you are done playing.
pause
