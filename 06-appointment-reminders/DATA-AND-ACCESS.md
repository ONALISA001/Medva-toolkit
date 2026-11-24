# Data and access: Appointment Reminder and No-Show Reducer

**Short version:** the sheet holds a first name, contact details and appointment times (PHI when real), so it lives only in the clinic's Google Workspace. Reminders carry the minimum: first name, date, time and the clinic's phone number. The weekly report carries counts only.

## What data it holds
| Data | Example | PHI? |
|---|---|---|
| First name, email, mobile phone | Jane · jane.test@example.com · (555) 010-1000 | Yes, when real |
| Appointment date and time | 2026-12-01 · 10:30 AM | Yes, when linked to a person |
| Reminder preference, confirmation, outcome | Email · Confirmed · Attended | Yes, when linked to a person |
| Settings | Clinic name and phone, send hour, report email | No |

**Not collected:** last name, date of birth, reason for visit, provider, department. A full name typed into "First name" by mistake is cut to the first word in every email.

## What leaves the sheet
| Email | To | Contains |
|---|---|---|
| 2-day and 1-day reminder | The patient | First name, date, time, clinic name and phone |
| Rebook (optional, off by default) | The patient | First name, the missed date, clinic name and phone |
| Weekly report | The report email in Settings | Counts and percentages only |

Every patient email ends with "Please do not reply to this email with health information." Replies go to the inbox of the account that sends them, so that inbox must be the clinic's.

Nothing is sent to SMS providers, AI services or outside servers. SMS is a future paid upgrade and would need a BAA with the provider.

## Which account sends
Emails go out from **the account that turned on the reminders**. The script checks this:
- On a personal Gmail account, real sending is **held** with a message. Only **Test mode** works, which sends every email to the tester with `[TEST]` in the subject.
- Set up and Preview both show the sending address.

For real patients, install it under a clinic Workspace account, ideally a shared front-desk account rather than one person's.

## Who can see it
- **The sheet:** staff the clinic shares it with.
- **The weekly report:** the one address in Settings.
- Anyone with edit access can change Settings, including Test mode. Limit edit access.

## Permissions the script asks for
| Permission | Why |
|---|---|
| See and edit **this spreadsheet only** | Read appointments, record what was sent, write the report |
| Send email as you | Reminders, rebooks and the weekly report. It can't read any inbox. |
| See your email address | Show which account sends, and hold real sending from personal accounts |
| Show menus and dialogs, run when you're not present | The menu, the preview and the daily and weekly runs |

## How to remove access
1. **Stop all emails:** Reminder Tools > Turn off daily reminders.
2. **Remove a person:** Share > remove them.
3. **When the VA leaves:** turn reminders off first, since they run under the account that turned them on. Then turn them back on from a clinic account and remove the VA.

## Retention
Past appointments are only needed for the no-show report, which looks back 8 weeks. A simple routine: each month, delete rows older than 3 months.
