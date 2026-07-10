# Reads the latest pub-tracker data, builds last month's report as CSV,
# and emails it to the accountant via Gmail SMTP using an App Password.
# Meant to run unattended (Windows Task Scheduler) - see SetupMonthlyTask.ps1.
# You can also double-click "Send Report Now (Test).bat" (one folder up)
# to run this by hand.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$setupDir = Split-Path -Parent $scriptDir
$rootDir = Split-Path -Parent $setupDir
$appDir = Join-Path $rootDir "App"
$logFile = Join-Path $scriptDir "SendMonthlyReport.log"

function Write-Log($msg) {
    $line = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $msg
    Add-Content -Path $logFile -Value $line
    Write-Host $line
}

Write-Log "---- Starting monthly report run ----"

# ---- Load config ----
$configPath = Join-Path $setupDir "email-config.txt"
if (-not (Test-Path $configPath)) {
    Write-Log "ERROR: email-config.txt not found. Copy email-config.EXAMPLE.txt to email-config.txt and fill it in."
    exit
}

$config = @{}
Get-Content $configPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line.Split("=", 2)
        if ($parts.Length -eq 2) {
            $config[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
}

foreach ($key in @("SenderEmail", "AppPassword", "AccountantEmail")) {
    if (-not $config.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($config[$key]) -or $config[$key] -like "your*") {
        Write-Log "ERROR: '$key' is missing or still a placeholder in email-config.txt."
        exit
    }
}

# ---- Find the data to report on ----
# Prefer the live "current-data.json" file in the App folder, which the app
# keeps up to date automatically every time something is saved (as long as
# it was opened via "Start Pub Tracker.bat"). Fall back to the newest
# manually-downloaded backup in the App folder if that file doesn't exist yet.
$liveDataPath = Join-Path $appDir "current-data.json"

if (Test-Path $liveDataPath) {
    Write-Log "Using live data file: App\current-data.json"
    $data = Get-Content -Raw -Path $liveDataPath | ConvertFrom-Json
}
else {
    $backupFile = Get-ChildItem -Path $appDir -Filter "stable-pub-backup-*.json" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if (-not $backupFile) {
        Write-Log "ERROR: No data found. Neither App\current-data.json nor a stable-pub-backup-*.json file exists in $appDir. Open the app via 'Start Pub Tracker.bat' at least once, or download a manual backup into the App folder."
        exit
    }
    Write-Log "Using backup file: $($backupFile.Name)"
    $data = Get-Content -Raw -Path $backupFile.FullName | ConvertFrom-Json
}

$currency = "₪"
if ($data.settings -and $data.settings.currency) { $currency = $data.settings.currency }

# ---- Figure out target month (the month that just ended) ----
$targetDate = (Get-Date).AddMonths(-1)
$targetMonth = $targetDate.ToString("yyyy-MM")
$targetLabel = $targetDate.ToString("MMMM yyyy")
Write-Log "Reporting for month: $targetMonth"

# ---- Filter entries for that month ----
$monthEntries = @($data.entries | Where-Object { $_.date -and $_.date.StartsWith($targetMonth) })
Write-Log "Entries found for month: $($monthEntries.Count)"

$members = @{}
foreach ($m in $data.members) { $members[$m.id] = $m }

# ---- Build per-member summary ----
$byMember = @{}
foreach ($e in $monthEntries) {
    if (-not $byMember.ContainsKey($e.memberId)) {
        $byMember[$e.memberId] = [PSCustomObject]@{ Items = 0; Total = 0.0 }
    }
    $byMember[$e.memberId].Items += $e.qty
    $byMember[$e.memberId].Total += ($e.unitPrice * $e.qty)
}

$summaryRows = @()
foreach ($mid in $byMember.Keys) {
    $member = $members[$mid]
    $number = if ($member) { $member.number } else { "" }
    $name = if ($member) { $member.name } else { "(removed member)" }
    $summaryRows += [PSCustomObject]@{
        Number = $number
        Name   = $name
        Items  = $byMember[$mid].Items
        Total  = [math]::Round($byMember[$mid].Total, 2)
    }
}
$summaryRows = $summaryRows | Sort-Object {
    $n = 0.0
    if ([double]::TryParse($_.Number, [ref]$n)) { $n } else { [double]::MaxValue }
}, Name

$grandTotal = 0.0
if ($summaryRows.Count -gt 0) {
    $grandTotal = [math]::Round((($summaryRows | Measure-Object -Property Total -Sum).Sum), 2)
}

# ---- CSV helpers ----
function Csv-Field($v) {
    $s = "$v"
    if ($s -match '[",\r\n]') {
        $s = '"' + ($s -replace '"', '""') + '"'
    }
    return $s
}
function Csv-Row($values) {
    return (($values | ForEach-Object { Csv-Field $_ }) -join ",")
}

# ---- Build Summary CSV ----
$summaryLines = New-Object System.Collections.Generic.List[string]
$summaryLines.Add((Csv-Row @("Stable Pub Geva - Monthly Tab Summary - $targetMonth")))
$summaryLines.Add("")
$summaryLines.Add((Csv-Row @("Member #", "Member", "Total Items", "Total Due ($currency)")))
foreach ($r in $summaryRows) {
    $summaryLines.Add((Csv-Row @($r.Number, $r.Name, $r.Items, ("{0:N2}" -f $r.Total))))
}
$summaryLines.Add("")
$summaryLines.Add((Csv-Row @("", "Grand Total", "", ("{0:N2}" -f $grandTotal))))

$summaryPath = Join-Path $env:TEMP "stable-pub-summary-$targetMonth.csv"
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllLines($summaryPath, $summaryLines, $utf8Bom)

# ---- Build Detailed CSV ----
$detailLines = New-Object System.Collections.Generic.List[string]
$detailLines.Add((Csv-Row @("Stable Pub Geva - Monthly Tab Detail - $targetMonth")))
$detailLines.Add("")
$detailLines.Add((Csv-Row @("Date", "Member #", "Member", "Item", "Category", "Qty", "Unit Price", "Line Total")))
$sortedEntries = $monthEntries | Sort-Object date, ts
foreach ($e in $sortedEntries) {
    $member = $members[$e.memberId]
    $number = if ($member) { $member.number } else { "" }
    $name = if ($member) { $member.name } else { "(removed member)" }
    $lineTotal = [math]::Round(($e.unitPrice * $e.qty), 2)
    $detailLines.Add((Csv-Row @($e.date, $number, $name, $e.itemName, $e.category, $e.qty, ("{0:N2}" -f $e.unitPrice), ("{0:N2}" -f $lineTotal))))
}

$detailPath = Join-Path $env:TEMP "stable-pub-detailed-$targetMonth.csv"
[System.IO.File]::WriteAllLines($detailPath, $detailLines, $utf8Bom)

Write-Log "CSV files built. Grand total: $grandTotal"

# ---- Send email ----
$mail = $null
try {
    $mail = New-Object System.Net.Mail.MailMessage
    $mail.From = $config["SenderEmail"]
    $mail.To.Add($config["AccountantEmail"])
    $mail.Subject = "Stable Pub Tab Report - $targetLabel"
    $mail.Body = "Attached: the tab summary and detailed report for $targetLabel.`n`nGrand total due: $currency$grandTotal`n`nThis email was sent automatically - no action needed unless something looks wrong."
    $mail.Attachments.Add((New-Object System.Net.Mail.Attachment($summaryPath)))
    $mail.Attachments.Add((New-Object System.Net.Mail.Attachment($detailPath)))

    $smtp = New-Object System.Net.Mail.SmtpClient("smtp.gmail.com", 587)
    $smtp.EnableSsl = $true
    $smtp.Credentials = New-Object System.Net.NetworkCredential($config["SenderEmail"], $config["AppPassword"])
    $smtp.Send($mail)

    Write-Log "Email sent successfully to $($config['AccountantEmail'])."
}
catch {
    Write-Log "ERROR sending email: $($_.Exception.Message)"
}
finally {
    if ($mail) { $mail.Dispose() }
    Remove-Item -Path $summaryPath -ErrorAction SilentlyContinue
    Remove-Item -Path $detailPath -ErrorAction SilentlyContinue
}

Write-Log "---- Run finished ----"
