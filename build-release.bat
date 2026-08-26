@echo off
title Artemis - Build Release
cd /d "%~dp0"
if not exist "node_modules" call npm install
echo Building Artemis release...
call npm run package:win
if errorlevel 1 (echo Build FAILED - see errors above. & pause & exit /b 1)
echo.
echo Build complete - output is in the release folder.
echo.
echo To ship it: create a GitHub release tagged with the SAME version as
echo package.json and attach release\Artemis.exe. Running copies pick it up
echo on their next launch.
start "" explorer "%~dp0release"
pause
