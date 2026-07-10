# Creates a Desktop shortcut for the pub tracker with a custom icon.
# Safe to run more than once - it just re-creates the same shortcut.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

$launcher = Join-Path $rootDir "Start Pub Tracker.bat"
if (-not (Test-Path $launcher)) {
    Write-Host "Could not find 'Start Pub Tracker.bat' in the main folder:"
    Write-Host $rootDir
    Read-Host "Press Enter to close"
    exit
}

$iconFile = Join-Path $scriptDir "icon.ico"
if (-not (Test-Path $iconFile)) {
    Write-Host "Could not find icon.ico in this folder:"
    Write-Host $scriptDir
    Read-Host "Press Enter to close"
    exit
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Stable Pub Tab Tracker.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $launcher
$Shortcut.IconLocation = "$iconFile,0"
$Shortcut.WorkingDirectory = $rootDir
$Shortcut.Description = "Stable Pub Tab Tracker"
$Shortcut.Save()

Write-Host ""
Write-Host "Done! A shortcut with the pub icon was created on your Desktop:"
Write-Host "  Stable Pub Tab Tracker"
Write-Host ""
Write-Host "You can drag it to the taskbar or Start menu if you'd like."
Read-Host "Press Enter to close"
