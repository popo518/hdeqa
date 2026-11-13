@echo off
cd /d "%~dp0"
echo Starting MY GARDEN at http://localhost:8080
py -m http.server 8080
pause
