@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Engine\SendMonthlyReport.ps1"
echo.
echo Check SendMonthlyReport.log in the Engine folder for details.
pause
