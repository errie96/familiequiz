@echo off
REM Familiequiz starten op deze computer (ook zonder internet). Dubbelklik dit bestand.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is niet geinstalleerd. Installeer het eerst via nodejs.org. & pause & exit /b 1)
if not exist node_modules\express (echo Eerst een keer "npm install" draaien terwijl je internet hebt. & pause & exit /b 1)
node scripts\offline-check.js
start "" http://localhost:3000/bediening.html
node server.js
pause
