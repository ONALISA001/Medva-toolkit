# Tool 1: VA Daily Dashboard and EOD Report

## Problem
A clinic manager can't see what their remote VA did today. Status updates arrive late, in different formats, or not at all.

## What it is
A Google Sheet with a bound Apps Script. The VA logs tasks during the day. One menu click emails the clinic manager a formatted end-of-day (EOD) summary. A weekly tab charts tasks and hours.

## Data rule
Task counts and time only. **No patient details**: no names, dates of birth, member IDs, MRNs or phone numbers. The script checks the Notes column and refuses to send if anything looks like patient data.

## Sheets

### Task Log
| Column | Type | Rules |
|---|---|---|
| Date | date | Required |
| Task type | dropdown | Calls, Scheduling, Insurance verification, Prior auth, Referrals, Reminders, Inbox and email, Other |
| Count | whole number | 0 or more |
| Minutes | whole number | 0 to 960 |
| Notes | text | Optional. Work notes only, e.g. "Chased 3 pending UHC auths". |

### Settings
| Setting | Example |
|---|---|
| Clinic name | Riverside Family Medicine |
| VA name | James Mbari |
| Manager email | manager@clinic.example |
| Send at hour (0-23) | 17 |
| Send on weekends | No |
| Last report | written by the script |

### Weekly
Written by the script. One row per day for the last 7 days, one column per task type (hours), plus a total. A stacked column chart of hours by task type.

## Menu: VA Tools
- **Preview today's report**: shows the email in a dialog. Sends nothing.
- **Send today's EOD report**: checks today's rows, then emails the manager.
- **Refresh weekly chart**
- **Set up sheets**: creates the three tabs, headers, dropdowns and validation. Safe to run again.
- **Fill a sample week (demo)**: adds 5 weekdays of made-up tasks for demos.
- **Turn on daily auto-send** / **Turn off daily auto-send**: a time trigger at the Settings hour, weekdays only unless weekends are on.

## EOD email
- To: the one Manager email in Settings. No CC, no other recipients.
- Subject: `EOD report: <Clinic name>, <Weekday, Mon D>`
- Body: totals (tasks, time), a table of task type / count / time, then the notes list.
- Nothing logged today: manual send shows a message; auto-send skips and records "Skipped: nothing logged".

## Checks before sending
- Every row for today has a valid task type and sensible numbers.
- Notes contain nothing that looks like an SSN, a date of birth, a phone number, a member ID or MRN, an email address, or a titled name ("Mr Smith", "patient Jones").
- Problem cells are shaded red and the send stops. Auto-send records "Held: fix row N".

## Permissions (minimal)
- `spreadsheets.currentonly`: this sheet only, not the rest of Drive.
- `script.send_mail`: send email as the account that installed it. Cannot read the inbox.
- `script.container.ui`: the menu and the preview dialog.
- `script.scriptapp`: the daily auto-send trigger.
