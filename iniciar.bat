@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 22 ou superior e tente novamente.
  pause
  exit /b 1
)
echo Abra http://127.0.0.1:3210 no navegador.
node server.mjs
pause
