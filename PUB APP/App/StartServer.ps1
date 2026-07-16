# Serves this folder on http://localhost so Chrome's "Create shortcut"
# and app-window features work (they're blocked for local file:// pages).
# Keep this window open while using the app - closing it stops the server.

$port = 8917
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootFull = (Get-Item $root).FullName

$htmlFile = Get-ChildItem -Path $root -Filter *.html | Select-Object -First 1
if (-not $htmlFile) {
    Write-Host "Could not find an .html file in this folder:"
    Write-Host $root
    Read-Host "Press Enter to close"
    exit
}

# Folder where uploaded item photos live. Created on first run - never
# touched by the auto-update mechanism, since it's the customer's own data.
$imagesDir = Join-Path $rootFull "images"
if (-not (Test-Path $imagesDir)) {
    New-Item -ItemType Directory -Path $imagesDir | Out-Null
}

$prefix = "http://localhost:$port/"
# Point at the bare root (no filename in the URL) so a non-English
# filename never has to round-trip through URL encoding.
$url = $prefix

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
}
catch {
    # Most likely already running from a previous launch - just open the page.
    Write-Host "Pub Tracker already seems to be running - opening it in your browser."
    Start-Process $url
    exit
}

Start-Process $url

$mimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".png"  = "image/png"
    ".ico"  = "image/x-icon"
    ".js"   = "application/javascript"
    ".css"  = "text/css"
    ".json" = "application/json"
    ".svg"  = "image/svg+xml"
    ".txt"  = "text/plain"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".webp" = "image/webp"
}

# Only these extensions are ever written to disk by the upload endpoint below.
$allowedImageExt = @(".jpg", ".jpeg", ".png", ".gif", ".webp")

Write-Host ""
Write-Host "Pub Tracker is running at $url"
Write-Host "Keep this window open (minimizing is fine) while using the app."
Write-Host "Close this window to stop the app."
Write-Host ""

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
    }
    catch {
        break
    }

    $request = $context.Request
    $response = $context.Response

    try {
        if ($request.HttpMethod -eq "POST" -and $request.Url.LocalPath -eq "/api/save") {
            # The app calls this every time it saves, so there's always a
            # current, up-to-date copy of the data sitting on disk - no
            # manual "Download Backup" needed for the monthly report to work.
            # Force UTF-8 explicitly rather than trusting $request.ContentEncoding -
            # when the browser's fetch() call doesn't put a charset on the
            # Content-Type header (ours doesn't), .NET can fall back to the
            # system's ANSI codepage instead of UTF-8, corrupting Hebrew text.
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()

            $dataPath = Join-Path $rootFull "current-data.json"
            [System.IO.File]::WriteAllText($dataPath, $body, [System.Text.Encoding]::UTF8)

            $okBytes = [System.Text.Encoding]::UTF8.GetBytes("OK")
            $response.StatusCode = 200
            $response.ContentType = "text/plain"
            $response.ContentLength64 = $okBytes.Length
            $response.OutputStream.Write($okBytes, 0, $okBytes.Length)
            continue
        }

        if ($request.HttpMethod -eq "POST" -and $request.Url.LocalPath -eq "/api/upload-image") {
            # The app sends { itemId, filename, dataBase64 } as JSON whenever
            # someone uploads a photo for a menu item. Saved to App/images/
            # as "<itemId>.<ext>" - never part of current-data.json, and
            # never synced by the auto-update mechanism.
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()

            $respBytes = $null
            try {
                $payload = $body | ConvertFrom-Json
                $itemId = [string]$payload.itemId
                $origName = [string]$payload.filename

                if ($itemId -notmatch '^[a-z0-9]+$') { throw "Invalid item id." }

                $ext = [System.IO.Path]::GetExtension($origName).ToLower()
                if ($allowedImageExt -notcontains $ext) { $ext = ".png" }

                $bytes = [Convert]::FromBase64String([string]$payload.dataBase64)

                # Remove any previous photo for this item under a different extension.
                Get-ChildItem -Path $imagesDir -Filter ("$itemId.*") -ErrorAction SilentlyContinue |
                    Remove-Item -Force -ErrorAction SilentlyContinue

                $destName = "$itemId$ext"
                $destPath = Join-Path $imagesDir $destName
                [System.IO.File]::WriteAllBytes($destPath, $bytes)

                $okJson = '{"ok":true,"filename":"' + $destName + '"}'
                $respBytes = [System.Text.Encoding]::UTF8.GetBytes($okJson)
                $response.StatusCode = 200
            }
            catch {
                Write-Host "ERROR saving uploaded image: $($_.Exception.Message)"
                $errJson = '{"ok":false,"error":"' + ($_.Exception.Message -replace '"','''') + '"}'
                $respBytes = [System.Text.Encoding]::UTF8.GetBytes($errJson)
                $response.StatusCode = 400
            }

            $response.ContentType = "application/json; charset=utf-8"
            $response.ContentLength64 = $respBytes.Length
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            continue
        }

        $localPath = [Uri]::UnescapeDataString($request.Url.LocalPath).TrimStart('/')

        if ([string]::IsNullOrWhiteSpace($localPath)) {
            # Root request ("/") - serve the app's html file directly,
            # using the FileInfo object we already found (no filename
            # round-trips through URL encoding at all).
            $fullFilePath = $htmlFile.FullName
        }
        else {
            $filePath = Join-Path $rootFull $localPath
            $fullFilePath = [System.IO.Path]::GetFullPath($filePath)
            if (-not $fullFilePath.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
                $fullFilePath = $null
            }
            elseif (-not (Test-Path -LiteralPath $fullFilePath -PathType Leaf)) {
                # Could not resolve this exact path (e.g. an odd filename
                # encoding mismatch) - fall back to the app itself rather
                # than showing an error, since that's almost certainly
                # what was wanted.
                $fullFilePath = $htmlFile.FullName
            }
        }

        if (-not $fullFilePath) {
            $response.StatusCode = 403
        }
        else {
            $ext = [System.IO.Path]::GetExtension($fullFilePath).ToLower()
            $contentType = $mimeMap[$ext]
            if (-not $contentType) { $contentType = "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($fullFilePath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
    }
    catch {
        $errMsg = $_.Exception.Message
        Write-Host "ERROR handling request: $errMsg"
        try {
            $response.StatusCode = 500
            $response.ContentType = "text/plain; charset=utf-8"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Server error: $errMsg")
            $response.ContentLength64 = $errBytes.Length
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        } catch {}
    }
    finally {
        try { $response.OutputStream.Close() } catch {}
    }
}
