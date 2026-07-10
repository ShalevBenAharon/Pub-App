THE STABLE PUB - TAB TRACKER
============================

FOR DAILY USE, YOU ONLY NEED THIS:
------------------------------------
Double-click "Start Pub Tracker.bat" (in this main folder).

A small window opens saying "Pub Tracker is running" - leave it open
(you can minimize it) while you use the app, it's what makes the app
work. Your browser opens the app in a window of its own. That's it -
everything else in this folder is one-time setup or behind-the-scenes.

Even easier: run "Create Desktop Icon.bat" once (see below) and just
use that Desktop shortcut every day instead of opening this folder at all.

WHAT'S IN THIS FOLDER
------------------------
- Start Pub Tracker.bat     <- double-click this every day
- Create Desktop Icon.bat   <- one-time: adds a Desktop shortcut
- README.txt                <- this file
- App/                      <- the app's engine (you don't need to open this)
- Monthly Email Setup/      <- automatic accountant emails (one-time setup)

GETTING A DESKTOP ICON (recommended, one-time)
--------------------------------------------------
Double-click "Create Desktop Icon.bat" once. It adds a shortcut named
"Stable Pub Tab Tracker" to your Desktop (with the pub icon) that
starts the app the same way as "Start Pub Tracker.bat". After this,
you never need to come back into this folder for daily use.

MAKING IT OPEN IN ITS OWN WINDOW (optional, one-time)
-----------------------------------------------------------
The first time you open the app, right after it opens in Chrome:
1. Click the "..." menu (top right).
2. Click "Cast, save, and share" -> "Create shortcut...".
3. Check the box "Open as window".
4. Click "Create".

From then on, that shortcut opens the app in a clean window (no
address bar, no tabs) - just like a normal installed program.

YOUR DATA
------------
Everything you enter (members, menu, prices, tabs) is saved
automatically - both inside the browser and as a file called
"current-data.json" in the App folder, kept up to date every time
you make a change. You don't need to do anything for this to work,
as long as you're using "Start Pub Tracker.bat" (or its Desktop
shortcut) to open the app.

Use the "Backup & Data" tab inside the app occasionally to download
an extra safety copy (.json file) - see the in-app reminders. Move
that file to a cloud-synced folder (OneDrive/Google Drive) if you
want a copy stored somewhere other than this computer.

AUTOMATIC MONTHLY EMAIL TO THE ACCOUNTANT (optional)
---------------------------------------------------------
Everything for this lives in the "Monthly Email Setup" folder. Once
set up, it sends the report automatically every month, fully
hands-off - no app, no browser, no clicking "send" required.

That folder only has what you actually need to touch: the config file
and the two setup/test buttons. The scripts that do the actual work
are tucked inside its "Engine" subfolder - you shouldn't need to open
that unless troubleshooting (e.g. checking SendMonthlyReport.log).

ONE-TIME SETUP (inside the "Monthly Email Setup" folder):
1. Turn on 2-Step Verification on the Gmail account you'll send from,
   if it isn't already on: myaccount.google.com/security
2. Create an "App Password" at myaccount.google.com/apppasswords
   (choose "Mail" as the app). You'll get a 16-character code.
3. Copy "email-config.EXAMPLE.txt", rename the copy to
   "email-config.txt", and fill in:
     SenderEmail=<the gmail address you send from>
     AppPassword=<the 16-character code from step 2>
     AccountantEmail=<the accountant's email address>
     SendDay=<day of the month to send, e.g. 5>
     SendTime=<24-hour time, e.g. 09:00>
   (email-config.txt stays only on this computer - it's never sent
   to anyone, including Claude.)
4. Double-click "Setup Monthly Email.bat" once. This schedules the
   report to be sent automatically on the day/time from the config
   file above.

CHANGING THE DAY OR TIME LATER:
Edit SendDay / SendTime in "email-config.txt", then double-click
"Setup Monthly Email.bat" again - it replaces the existing schedule
with the new one (safe to run as many times as you like).

HOW IT WORKS EACH MONTH:
On the day/time set in email-config.txt, the computer reads
"current-data.json" from the App folder (kept fresh automatically,
see YOUR DATA above), builds last month's report from it, and emails
it (summary + detailed CSV attached) to the accountant.

TESTING IT / CHANGING THE ACCOUNTANT'S EMAIL:
- Double-click "Send Report Now (Test).bat" (in "Monthly Email
  Setup") any time to send a report immediately, without waiting for
  the scheduled day - useful for testing.
- To change the accountant's email (or sender/password/day/time), edit
  "email-config.txt" in that same folder - no need to touch
  anything else. If you change the day/time, re-run "Setup Monthly
  Email.bat" afterward so the schedule picks up the change.
- Check "SendMonthlyReport.log" inside the "Engine" subfolder if an
  email doesn't arrive - it logs exactly what happened on each run.
