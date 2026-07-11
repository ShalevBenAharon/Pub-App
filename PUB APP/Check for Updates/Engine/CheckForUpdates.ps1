# Checks GitHub for a newer version of the app and installs it if found.
# Never touches your actual data or credentials - see the "never touched"
# list below. Safe to run any time; does nothing if you're already current.

$engineDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$updateDir = Split-Path -Parent $engineDir
$installRoot = Split-Path -Parent $updateDir

$logFile = Join-Path $engineDir "UpdateLog.txt"
$configPath = Join-Path $updateDir "update-config.txt"
$versionPath = Join-Path $engineDir "version.txt"

function Write-Log($msg) {
    $line = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $msg
    Add-Content -Path $logFile -Value $line
    Write-Host $line
}

Write-Log "---- Checking for updates ----"

if (-not (Test-Path $configPath)) {
    Write-Host ""
    Write-Host "update-config.txt not found."
    Write-Host "Copy 'update-config.EXAMPLE.txt', rename it to 'update-config.txt',"
    Write-Host "and fill in the GitHub username/repository this app is published to."
    Read-Host "Press Enter to close"
    exit
}

$config = @{}
Get-Content $configPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line.Split("=", 2)
        if ($parts.Length -eq 2) { $config[$parts[0].Trim()] = $parts[1].Trim() }
    }
}

if (-not $config["GitHubUser"] -or -not $config["GitHubRepo"] -or $config["GitHubUser"] -like "your-*") {
    Write-Host "update-config.txt still has placeholder values - fill in your real GitHub username/repo first."
    Read-Host "Press Enter to close"
    exit
}

$branch = if ($config["Branch"]) { $config["Branch"] } else { "main" }
# Optional: set this in update-config.txt if the repo has everything nested
# inside a subfolder (e.g. because the whole project folder was dragged into
# GitHub Desktop) rather than pushed as the repo's own root contents.
$repoSubfolder = if ($config["RepoSubfolder"]) { $config["RepoSubfolder"].Trim("/") } else { "" }

# Encode each path segment separately (not the whole path) so spaces and
# other special characters in folder names - "Check for Updates", for
# instance - turn into a URL GitHub will actually resolve, while keeping
# the "/" separators intact.
function ConvertTo-UrlPath($relPath) {
    ($relPath -split '/' | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
}

$baseUrl = "https://raw.githubusercontent.com/$($config['GitHubUser'])/$($config['GitHubRepo'])/$branch/"
if ($repoSubfolder) { $baseUrl += (ConvertTo-UrlPath $repoSubfolder) + "/" }

$localVersion = if (Test-Path $versionPath) { (Get-Content $versionPath -Raw).Trim() } else { "0.0.0" }
Write-Log "Installed version: $localVersion"

# ---- Check the remote version, failing gracefully if there's no internet ----
try {
    $versionUrl = $baseUrl + (ConvertTo-UrlPath "Check for Updates/Engine/version.txt")
    $remoteVersion = (Invoke-WebRequest -Uri $versionUrl -UseBasicParsing -TimeoutSec 10).Content.Trim()
}
catch {
    Write-Host ""
    Write-Host "Couldn't check for updates (no internet connection, or the update"
    Write-Host "server couldn't be reached - make sure the GitHub repository is set"
    Write-Host "to Public). Nothing was changed. Try again later."
    Write-Log "ERROR checking version: $($_.Exception.Message)"
    Read-Host "Press Enter to close"
    exit
}

Write-Log "Latest available version: $remoteVersion"

if ($remoteVersion -eq $localVersion) {
    Write-Host ""
    Write-Host "You're already up to date (version $localVersion)."
    Write-Log "Already up to date."
    Read-Host "Press Enter to close"
    exit
}

Write-Host ""
Write-Host "Update found: $localVersion -> $remoteVersion. Downloading..."

# Files that make up the app itself - these get replaced by the update.
# Nothing here is ever your live data or credentials. Paths are relative
# to the main PUB APP folder.
$filesToSync = @(
    "App/StablePub-TabTracker.html",
    "App/styles.css",
    "App/app.js",
    "App/translations.js",
    "App/StartServer.ps1",
    "App/MakeShortcut.ps1",
    "App/icon.ico",
    "App/icon_512.png",
    "Start Pub Tracker.bat",
    "Create Desktop Icon.bat",
    "README.txt",
    "Monthly Email Setup/Engine/SendMonthlyReport.ps1",
    "Monthly Email Setup/Engine/SetupMonthlyTask.ps1",
    "Monthly Email Setup/Setup Monthly Email.bat",
    "Monthly Email Setup/Send Report Now (Test).bat",
    "Monthly Email Setup/email-config.EXAMPLE.txt",
    "Check for Updates/Check for Updates.bat",
    "Check for Updates/update-config.EXAMPLE.txt",
    "Check for Updates/Engine/CheckForUpdates.ps1"
)
# NEVER touched by an update, on purpose:
#   App/current-data.json                        (your live tabs/members/menu)
#   Monthly Email Setup/email-config.txt          (Gmail address/App Password/accountant email)
#   Monthly Email Setup/Engine/SendMonthlyReport.log
#   Check for Updates/update-config.txt           (your GitHub username/repo)
#   Check for Updates/Engine/UpdateLog.txt
#   any stable-pub-backup-*.json files

$tempDir = Join-Path $env:TEMP ("pubapp-update-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDir | Out-Null

$downloaded = @{}
$failed = $false

foreach ($relPath in $filesToSync) {
    $url = $baseUrl + (ConvertTo-UrlPath $relPath)
    $tempFile = Join-Path $tempDir ([guid]::NewGuid().ToString("N"))
    try {
        Invoke-WebRequest -Uri $url -OutFile $tempFile -UseBasicParsing -TimeoutSec 20
        $downloaded[$relPath] = $tempFile
    }
    catch {
        Write-Log "ERROR downloading $relPath : $($_.Exception.Message)"
        $failed = $true
    }
}

if ($failed) {
    Write-Host ""
    Write-Host "Some files couldn't be downloaded - nothing was installed, so the app"
    Write-Host "hasn't been changed. Check the internet connection and try again."
    Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    Read-Host "Press Enter to close"
    exit
}

# All files downloaded successfully - now install them.
foreach ($relPath in $filesToSync) {
    $destPath = Join-Path $installRoot ($relPath -replace "/", [System.IO.Path]::DirectorySeparatorChar)
    $destFolder = Split-Path -Parent $destPath
    if (-not (Test-Path $destFolder)) { New-Item -ItemType Directory -Path $destFolder -Force | Out-Null }
    Copy-Item -Path $downloaded[$relPath] -Destination $destPath -Force
    Write-Log "Updated: $relPath"
}

Set-Content -Path $versionPath -Value $remoteVersion
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done! Updated to version $remoteVersion."
Write-Host "Close and reopen 'Start Pub Tracker.bat' to use the new version."
Write-Log "Update to $remoteVersion complete."

Read-Host "Press Enter to close"
