# Tool 6: Appointment Reminder and No-Show Reducer

## Problem
No-shows cost clinics revenue and leave empty slots that other patients needed. Reminders are sent by hand, inconsistently, and nobody measures the no-show rate.

## What it is
A Google Sheet with a bound Apps Script:

1. **Appointments tab**: one row per appointment (date, time, first name, contact, reminder preference), plus confirmation and outcome.
2. **Automatic email reminders** 2 days and 1 day before each appointment, sent once a day at a set hour.
3. **Optional rebook email** the day after a no-show.
4. **Weekly Report tab and email**: attended, no-shows, cancellations and the no-show rate for the last 8 weeks, with a chart. Counts only.

Email first. SMS needs a paid provider and a BAA with it, so it's a later paid upgrade. Text-only patients are flagged for a phone call instead.

## Data rule
Holds PHI when used for real (a first name and contact details tied to an appointment), so it lives only in the clinic's Google Workspace. **Reminders follow minimum necessary:** first name, date, time and the clinic phone number. Never the reason for the visit, the provider, or the department. Demos use made-up patients with **Test mode** sending every email to the tester instead.

## Appointments columns
| Column | Filled by | Notes |
|---|---|---|
| Appt ID | Script | `AP-0001` ... |
| Date, Time | Staff | |
| First name | Staff | First name only |
| Email, Mobile phone | Staff | |
| Reminders | Staff | Email, Text, Email and text, No reminders |
| Confirmation | Staff | No reply, Confirmed, Cancelled, Rescheduled |
| Outcome | Staff | Attended, No-show, Cancelled, Rescheduled (after the date) |
| 2-day reminder, 1-day reminder, Rebook sent | Script | Date sent, or why not |
| Flag | Script | See rules |
| Notes | Staff | Workflow only |

## Sending rules (daily run)
- Skip if Confirmation or Outcome is Cancelled or Rescheduled, or Reminders is "No reminders".
- **2 days before** and the 2-day reminder not sent: send it.
- **1 day before** and the 1-day reminder not sent: send it. An appointment booked tomorrow gets only the 1-day reminder.
- Email needs Reminders to include Email and a valid address. Otherwise the reminder cell records why.
- **Rebook:** if "Send rebook email after a no-show" is Yes, Outcome is No-show, the appointment was in the last 7 days and no rebook has been sent, send one.
- Stops cleanly when Google's daily email quota runs out. Remaining rows send on the next run.

## Flags
- Text only: "Text only: call to remind".
- Email reminders wanted but no valid email: "Add a valid email".
- Date passed, no Outcome: "Mark the outcome".
- Outcome No-show, no rebook sent and rebook emails off: "No-show: call to rebook".

## Messages
- Reminder subject: `Reminder: your appointment on Tue, Dec 1`.
- Reminder body: "Hi Jane, this is a reminder of your appointment at Riverside Family Medicine on Tuesday, December 1 at 10:30 AM. To confirm, cancel or reschedule, please call (555) 010-2200. Please do not reply to this email with health information."
- Rebook body: "Hi Jane, we missed you at your appointment on ... We'd like to help you rebook. Please call ..."
- Sender name: the clinic name. Sent from the account that installed the tool.

## Weekly report
- Weeks run Monday to Sunday. For each of the last 8 weeks: appointments, attended, no-shows, cancelled, rescheduled, not marked, **no-show rate** = no-shows / (attended + no-shows).
- Also: no-show rate for confirmed vs unconfirmed appointments, to show whether confirmations help.
- Monday email to the Report email in Settings: counts only, no names.

## Test mode
"Test mode: send all emails to" in Settings. When set, every email goes to that address with `[TEST]` in the subject, and the real patient address is never used.

## Menu: Reminder Tools
Preview tomorrow's reminders · Run reminders now · Send weekly report now · Refresh weekly report · Set up sheets · Fill sample appointments (demo) · Turn on daily reminders · Turn off daily reminders

## Permissions (minimal)
`spreadsheets.currentonly`, `script.send_mail`, `script.container.ui`, `script.scriptapp`, and `userinfo.email` to show and check which account reminders are sent from.
