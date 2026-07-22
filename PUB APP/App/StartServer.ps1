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

# ---- Kitchen/bar receipt printer support ----
# Sends raw ESC/POS bytes either to an installed Windows printer (via the
# print spooler) or directly to a serial/COM port (common for Bluetooth-
# paired thermal printers that don't install as a named Windows printer).
# (System.IO.Ports.SerialPort lives in the core "System" assembly, which
# Windows PowerShell already loads by default - no Add-Type needed for it.)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFOA di);
    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Kitchen Ticket";
        di.pDataType = "RAW";
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
        try {
            if (!StartDocPrinter(hPrinter, 1, di)) return false;
            try {
                StartPagePrinter(hPrinter);
                int written;
                bool ok = WritePrinter(hPrinter, bytes, bytes.Length, out written);
                EndPagePrinter(hPrinter);
                return ok;
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
"@

function Build-KitchenTicket($p) {
    $ms = New-Object System.IO.MemoryStream
    function Write-Raw([byte[]]$bytes) { $ms.Write($bytes, 0, $bytes.Length) }
    function Write-Txt([string]$s) { Write-Raw ([System.Text.Encoding]::UTF8.GetBytes($s)) }

    Write-Raw ([byte[]](0x1B,0x40))          # ESC @  - initialize
    Write-Raw ([byte[]](0x1B,0x61,1))        # ESC a 1 - center align
    Write-Raw ([byte[]](0x1B,0x45,1))        # ESC E 1 - bold on
    $headerLabel = if ($p.category -eq "Food") { "** KITCHEN - FOOD **" } else { "** BAR - DRINKS **" }
    Write-Txt "$headerLabel`n"
    Write-Raw ([byte[]](0x1B,0x45,0))        # bold off
    Write-Raw ([byte[]](0x1B,0x61,0))        # left align
    Write-Txt (("-" * 32) + "`n")
    Write-Txt "Time: $($p.time)`n"
    if ($p.memberLabel) { Write-Txt "Member: $($p.memberLabel)`n" }
    Write-Txt "`n"
    Write-Raw ([byte[]](0x1B,0x45,1))        # bold on
    Write-Txt "$($p.qty) x $($p.itemName)`n"
    Write-Raw ([byte[]](0x1B,0x45,0))        # bold off
    if ($p.extras) {
        foreach ($ex in $p.extras) { Write-Txt "   + $ex`n" }
    }
    Write-Txt "`n`n`n`n"                     # feed a bit for tear-off

    return $ms.ToArray()
}

function Send-TicketToTarget([string]$target, [byte[]]$bytes) {
    # "COM5" or "COM5:19200" (baud override - default 9600, which is the
    # near-universal default for these budget thermal printers; if text
    # prints as noise/garbage, the baud rate is almost always the reason -
    # try 19200 or 38400 by adding ":19200" etc. after the port name in
    # Kitchen Printer settings).
    if ($target -match '^(COM\d+)(?::(\d+))?$') {
        $portName = $Matches[1]
        $baud = if ($Matches[2]) { [int]$Matches[2] } else { 9600 }
        $port = New-Object System.IO.Ports.SerialPort($portName, $baud, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)
        $port.Open()
        try {
            $port.Write($bytes, 0, $bytes.Length)
            Start-Sleep -Milliseconds 300
        } finally {
            $port.Close()
        }
        return $true
    }
    else {
        # Treat as the name of a printer already installed in Windows
        # (Devices and Printers) - works for USB or Bluetooth printers
        # that came with/registered a Windows driver.
        return [RawPrinterHelper]::SendBytesToPrinter($target, $bytes)
    }
}

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

        if ($request.HttpMethod -eq "POST" -and $request.Url.LocalPath -eq "/api/print-ticket") {
            # The app calls this right after logging a food/drink entry (if
            # that category's print toggle is on in Kitchen Printer settings),
            # or when someone clicks a reprint button on a past entry.
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()

            $respBytes = $null
            try {
                $payload = $body | ConvertFrom-Json
                $target = [string]$payload.printerTarget
                if ([string]::IsNullOrWhiteSpace($target)) {
                    throw "No printer is configured yet - set it under Backup & Data > Kitchen Printer."
                }

                $ticketBytes = Build-KitchenTicket $payload
                $sent = Send-TicketToTarget $target $ticketBytes
                if (-not $sent) {
                    throw "Couldn't reach printer '$target'. Check the name (Devices and Printers) or COM port (Device Manager) and that the printer is on."
                }

                $respBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                $response.StatusCode = 200
            }
            catch {
                Write-Host "ERROR printing ticket: $($_.Exception.Message)"
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
