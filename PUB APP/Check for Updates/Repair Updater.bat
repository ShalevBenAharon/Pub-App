@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo  Pub Tracker - Repair the update checker
echo  ---------------------------------------
echo.
echo  Use this once if "Check for Updates" says it can't reach the
echo  update server. It replaces only the update checker itself with
echo  the current version, over a connection that works on networks
echo  where the old one gets stuck.
echo.
echo  It does not touch your tabs, members, menu, prices, backups,
echo  or your email settings.
echo.
pause

set "SRC=https://raw.githubusercontent.com/ShalevBenAharon/Pub-App/main/PUB%%20APP/Check%%20for%%20Updates/Engine/CheckForUpdates.ps1"
set "DEST=%~dp0Engine\CheckForUpdates.ps1"
set "TMPFILE=%TEMP%\pubapp-repair-%RANDOM%.ps1"

where curl.exe >nul 2>&1
if errorlevel 1 (
  echo.
  echo  This PC is missing curl.exe, which this repair needs.
  echo  That means it is running an older Windows than this tool supports.
  echo  Please ask for an updated copy of the app instead.
  echo.
  pause
  exit /b 1
)

echo  Downloading the current update checker...
curl.exe -4 -sS --fail --location --max-time 60 -o "%TMPFILE%" "%SRC%"
if errorlevel 1 (
  echo.
  echo  Could not download it. Check the internet connection and try again.
  echo.
  if exist "%TMPFILE%" del "%TMPFILE%"
  pause
  exit /b 1
)

rem Make sure we got the real script and not a wifi login page or an error page.
findstr /c:"Checking for updates" "%TMPFILE%" >nul
if errorlevel 1 (
  echo.
  echo  What downloaded does not look like the update checker - possibly a
  echo  wifi sign-in page got in the way. Nothing was changed.
  echo.
  del "%TMPFILE%"
  pause
  exit /b 1
)

if exist "%DEST%" copy /y "%DEST%" "%DEST%.bak" >nul
move /y "%TMPFILE%" "%DEST%" >nul
if errorlevel 1 (
  echo.
  echo  Could not write the file. Close the app and try again.
  echo.
  pause
  exit /b 1
)

echo.
echo  Done. The update checker has been repaired.
echo  ^(The previous one was kept as CheckForUpdates.ps1.bak^)
echo.
echo  Now double-click "Check for Updates.bat" to get the latest version.
echo.
pause
