# One-time setup: registers a Windows Scheduled Task that runs
# SendMonthlyReport.ps1 automatically each month, on the day/time set in
# email-config.txt (SendDay / SendTime, one folder up). Safe to run again
# later (e.g. to change the day/time) - it replaces the existing task with
# the same name.
#
# Builds the task directly through the Task Scheduler COM API (the same
# engine behind schtasks.exe and the Task Scheduler app), with the program
# and its arguments set as two separate fields. This project tried both
# schtasks.exe and the newer PowerShell ScheduledTasks module first; both
# had version-specific quirks on this system, so this talks to the
# underlying engine directly instead of going through either wrapper.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$setupDir = Split-Path -Parent $scriptDir
$scriptPath = Join-Path $scriptDir "SendMonthlyReport.ps1"
$configPath = Join-Path $setupDir "email-config.txt"

if (-not (Test-Path $scriptPath)) {
    Write-Host "Could not find SendMonthlyReport.ps1 in this folder."
    Read-Host "Press Enter to close"
    exit
}

if (-not (Test-Path $configPath)) {
    Write-Host "email-config.txt not found yet."
    Write-Host "Copy 'email-config.EXAMPLE.txt', rename it to 'email-config.txt',"
    Write-Host "and fill in your Gmail address, App Password, and the accountant's email first."
    Read-Host "Press Enter to close"
    exit
}

# Day/time come from email-config.txt (SendDay / SendTime) so they can be
# changed just by editing that file, without touching this script.
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

$taskName = "Stable Pub Monthly Report"

$dayOfMonth = 5
if ($config.ContainsKey("SendDay") -and $config["SendDay"] -match '^\d{1,2}$') {
    $dayOfMonth = [int]$config["SendDay"]
}

$timeText = "09:00"
if ($config.ContainsKey("SendTime") -and -not [string]::IsNullOrWhiteSpace($config["SendTime"])) {
    $timeText = $config["SendTime"]
}

try {
    $parsedTime = [datetime]::ParseExact($timeText, "HH:mm", $null)
}
catch {
    Write-Host "Could not understand SendTime '$timeText' in email-config.txt - expected 24-hour HH:mm, e.g. 09:00 or 21:30."
    Read-Host "Press Enter to close"
    exit
}

try {
    $psExe = (Get-Command powershell.exe).Source

    $scheduleService = New-Object -ComObject "Schedule.Service"
    $scheduleService.Connect()
    $rootFolder = $scheduleService.GetFolder("\")

    $taskDefinition = $scheduleService.NewTask(0)
    $taskDefinition.RegistrationInfo.Description = "Sends the Stable Pub monthly tab report to the accountant."

    $taskDefinition.Settings.Enabled = $true
    $taskDefinition.Settings.DisallowStartIfOnBatteries = $false
    $taskDefinition.Settings.StopIfGoingOnBatteries = $false
    $taskDefinition.Settings.StartWhenAvailable = $true

    # 4 = TASK_TRIGGER_MONTHLY
    $trigger = $taskDefinition.Triggers.Create(4)
    $trigger.DaysOfMonth = [uint32][math]::Pow(2, $dayOfMonth - 1)  # bit for the chosen day of month
    $trigger.MonthsOfYear = 0xFFF                                  # every month (all 12 bits set)
    $todayAtTime = Get-Date -Hour $parsedTime.Hour -Minute $parsedTime.Minute -Second 0
    $trigger.StartBoundary = $todayAtTime.ToString("yyyy-MM-ddTHH:mm:ss")
    $trigger.Enabled = $true

    # 0 = TASK_ACTION_EXEC. Program and arguments are set as two separate
    # fields here - not combined into one string - so there's no ambiguity
    # about where the program name ends and the arguments begin.
    $action = $taskDefinition.Actions.Create(0)
    $action.Path = $psExe
    $action.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""

    # 6 = TASK_CREATE_OR_UPDATE, 3 = TASK_LOGON_INTERACTIVE_TOKEN (runs as
    # the currently logged-on user, same as double-clicking it yourself)
    $rootFolder.RegisterTaskDefinition($taskName, $taskDefinition, 6, $null, $null, 3) | Out-Null

    Write-Host ""
    Write-Host "Done! A monthly task called '$taskName' is now scheduled."
    Write-Host "It will run on day $dayOfMonth of every month at $timeText (or as soon as"
    Write-Host "the computer is next on, if it was off at that time)."
    Write-Host ""
    Write-Host "You can test it right now without waiting - double-click"
    Write-Host "'Send Report Now (Test).bat' (one folder up)."
}
catch {
    Write-Host ""
    Write-Host "FAILED to schedule the task. Error details:"
    Write-Host $_.Exception.Message
    Write-Host ""
    Write-Host "Nothing was scheduled - please share this error message so it can be fixed."
}

Read-Host "Press Enter to close"
