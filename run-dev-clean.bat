@echo off
title Artemis - Dev (no onboarding)
cd /d "%~dp0"

rem An ordinary dev run with the first-run furniture switched off: no tour, no
rem construction notice, and no permission or Java setup screens.
rem
rem run-dev.bat is still the one to use most of the time. Those screens are
rem part of the app, and a change that breaks one of them should be visible
rem while it is being made. This is for the other kind of session: the fiftieth
rem restart of the afternoon, where dismissing the same tour again is pure tax.
rem
rem Distinct from the dev skip button on the setup screen, which answers a
rem different question: that one is in every dev run, for when a screen is
rem genuinely in the way. This switches them off before they are ever drawn.
if not exist "node_modules" call npm install
call npm run dev:clean
pause
