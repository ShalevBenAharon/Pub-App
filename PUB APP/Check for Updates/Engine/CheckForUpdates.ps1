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

# GitHub refuses anything below TLS 1.2, but Windows PowerShell 5.1 still
# negotiates TLS 1.0 first on some machines. When that happens the request
# doesn't fail cleanly - it hangs until the timeout, which looks exactly like
# "no internet" in the log. Ask for the modern protocols up front.
try {
    $protocols = [Net.SecurityProtocolType]::Tls12
    if ([enum]::GetNames([Net.SecurityProtocolType]) -contains "Tls13") {
        $protocols = $protocols -bor [Net.SecurityProtocolType]::Tls13
    }
    [Net.ServicePointManager]::SecurityProtocol = $protocols
}
catch { Write-Log "NOTE: could not raise TLS version: $($_.Exception.Message)" }

# If Windows is set up to go through a proxy, sign in to it as the logged-in
# user - otherwise the request can stall waiting for credentials nobody types.
try {
    if ([Net.WebRequest]::DefaultWebProxy) {
        [Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultCredentials
    }
}
catch { }

# Some networks advertise IPv6 without actually routing it. Browsers cope -
# they race both and abandon IPv6 in a quarter of a second - but PowerShell's
# Invoke-WebRequest tries IPv6 first and then just waits for the timeout, so
# the update check appears to have "no internet" on a connection that's fine.
# Windows ships curl.exe (Windows 10 1803 and later), and "curl -4" simply
# asks for IPv4, which sidesteps the whole problem. Invoke-WebRequest stays as
# the fallback for older machines.
$script:CurlPath = $null
try {
    $found = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($found) { $script:CurlPath = $found.Source }
}
catch { }
if ($script:CurlPath) { Write-Log "Using curl.exe (IPv4) for downloads." }
else { Write-Log "curl.exe not found - falling back to Invoke-WebRequest." }

# One slow moment on the pub's wifi shouldn't abandon the whole update, so
# each request gets three tries and a more forgiving timeout than before.
function Invoke-Download($uri, $outFile) {
    $attempt = 0
    while ($true) {
        $attempt++
        try {
            if ($script:CurlPath) {
                if ($outFile) {
                    $null = & $script:CurlPath -4 -sS --fail --location --max-time 30 -o $outFile $uri 2>&1
                    if ($LASTEXITCODE -ne 0) { throw "curl exit code $LASTEXITCODE" }
                    return $null
                }
                $body = & $script:CurlPath -4 -sS --fail --location --max-time 30 $uri 2>&1
                if ($LASTEXITCODE -ne 0) { throw "curl exit code $LASTEXITCODE ($body)" }
                return ($body -join "`n")
            }
            if ($outFile) {
                Invoke-WebRequest -Uri $uri -OutFile $outFile -UseBasicParsing -TimeoutSec 30
                return $null
            }
            return (Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 30).Content
        }
        catch {
            if ($attempt -ge 3) { throw }
            Write-Log "Attempt $attempt failed ($($_.Exception.Message)) - retrying..."
            Start-Sleep -Seconds 3
        }
    }
}

# "1.0.10" is newer than "1.0.9", which plain text comparison gets wrong.
function ConvertTo-VersionOrNull($text) {
    $parsed = $null
    if ([version]::TryParse(($text -replace '[^0-9\.]', ''), [ref]$parsed)) { return $parsed }
    return $null
}

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
    $remoteVersion = (Invoke-Download $versionUrl).Trim()
}
catch {
    Write-Host ""
    Write-Host "Couldn't check for updates. Nothing was changed."
    Write-Host ""
    Write-Host "The usual causes, in order of likelihood:"
    Write-Host "  - no internet connection right now;"
    Write-Host "  - this network advertises IPv6 but doesn't actually route it;"
    Write-Host "  - a firewall or antivirus blocking PowerShell from reaching the web;"
    Write-Host "  - the GitHub repository is not set to Public."
    Write-Host ""
    Write-Host "To test the connection yourself, open PowerShell and run:"
    Write-Host "  Invoke-WebRequest -Uri '$versionUrl' -UseBasicParsing"
    Write-Log "ERROR checking version: $($_.Exception.Message)"
    Read-Host "Press Enter to close"
    exit
}

Write-Log "Latest available version: $remoteVersion"

# Compare the parsed version numbers rather than the raw text, so a stray
# byte-order mark or line ending in version.txt can't read as "different"
# and trigger a pointless reinstall of the version already installed.
$localParsed = ConvertTo-VersionOrNull $localVersion
$remoteParsed = ConvertTo-VersionOrNull $remoteVersion
$upToDate = if ($localParsed -and $remoteParsed) { $remoteParsed -eq $localParsed }
            else { $remoteVersion -eq $localVersion }

if ($upToDate) {
    Write-Host ""
    Write-Host "You're already up to date (version $localVersion)."
    Write-Log "Already up to date."
    Read-Host "Press Enter to close"
    exit
}

# Only ever move forwards. Without this, ANY difference counted as "an update
# is available" - so a maintainer whose local copy was ahead of GitHub would
# have their unpublished work overwritten by the older published copy.
if ($localParsed -and $remoteParsed -and $remoteParsed -lt $localParsed) {
    Write-Host ""
    Write-Host "This copy (version $localVersion) is NEWER than the published one"
    Write-Host "(version $remoteVersion), so there is nothing to install - updating"
    Write-Host "would replace your newer files with older ones."
    Write-Host ""
    Write-Host "If you're the maintainer: commit and push your changes to GitHub"
    Write-Host "first, then this check will go quiet again."
    Write-Log "Local version $localVersion is newer than published $remoteVersion - refusing to downgrade."
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
    "Check for Updates/Repair Updater.bat",
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

# Fall back through a couple of scratch locations - if we can't get one at
# all, stop here rather than "succeeding" with nothing downloaded.
$tempRoot = if ($env:TEMP) { $env:TEMP } elseif ($env:TMP) { $env:TMP } else { $installRoot }
$tempDir = Join-Path $tempRoot ("pubapp-update-" + [guid]::NewGuid().ToString("N"))
try { New-Item -ItemType Directory -Path $tempDir -ErrorAction Stop | Out-Null }
catch {
    Write-Host ""
    Write-Host "Couldn't create a temporary folder to download into, so nothing"
    Write-Host "was changed. (Tried: $tempDir)"
    Write-Log "ERROR creating temp folder: $($_.Exception.Message)"
    Read-Host "Press Enter to close"
    exit
}

$downloaded = @{}
$failed = $false

foreach ($relPath in $filesToSync) {
    $url = $baseUrl + (ConvertTo-UrlPath $relPath)
    $tempFile = Join-Path $tempDir ([guid]::NewGuid().ToString("N"))
    try {
        Invoke-Download $url $tempFile | Out-Null
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

# All files downloaded successfully - now install them. Every copy is checked,
# because silently reporting "updated" while nothing was written is worse than
# reporting a failure: the version number would say the app is current when it
# isn't, and the next check would go quiet about it forever.
$installed = 0
foreach ($relPath in $filesToSync) {
    $source = $downloaded[$relPath]
    if (-not $source -or -not (Test-Path $source)) {
        Write-Host ""
        Write-Host "Something went wrong installing '$relPath' - it never downloaded."
        Write-Host "Stopping here. Run Check for Updates again."
        Write-Log "ERROR: missing downloaded file for $relPath - aborted after $installed file(s)."
        Read-Host "Press Enter to close"
        exit
    }
    $destPath = Join-Path $installRoot ($relPath -replace "/", [System.IO.Path]::DirectorySeparatorChar)
    $destFolder = Split-Path -Parent $destPath
    if (-not (Test-Path $destFolder)) { New-Item -ItemType Directory -Path $destFolder -Force | Out-Null }
    try {
        Copy-Item -Path $source -Destination $destPath -Force -ErrorAction Stop
    }
    catch {
        Write-Host ""
        Write-Host "Couldn't write '$relPath' - the update is incomplete."
        Write-Host "Close the app if it's open, then run Check for Updates again."
        Write-Log "ERROR installing $relPath : $($_.Exception.Message) - aborted after $installed file(s)."
        Read-Host "Press Enter to close"
        exit
    }
    $installed++
    Write-Log "Updated: $relPath"
}

# Only now, with every file actually on disk, record the new version.
Set-Content -Path $versionPath -Value $remoteVersion
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done! Updated to version $remoteVersion."
Write-Host "Close and reopen 'Start Pub Tracker.bat' to use the new version."
Write-Log "Update to $remoteVersion complete."

Read-Host "Press Enter to close"
