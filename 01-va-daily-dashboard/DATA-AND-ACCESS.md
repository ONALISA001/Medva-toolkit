# Data and access: VA Daily Dashboard and EOD Report

**Short version:** this tool holds task counts and time only. It is designed to contain no patient information, it lives in the clinic's own Google account, and it emails exactly one person.

## What data it holds
| Data | Example | Patient data? |
|---|---|---|
| Date, task type, count, minutes | 2026-11-24 · Prior auth · 3 · 54 | No |
| Work notes | "Chased 3 pending UHC auths" | Must not be. See the safety check below. |
| Settings | Clinic name, VA name, manager email | No |

## Safety check on notes
Before every report, the script scans today's notes for things that look like patient identifiers: SSNs, dates of birth, phone numbers, member IDs or MRNs, email addresses, and titled names like "Mr Smith" or "patient Jones". If it finds one, it shades the cell red and **does not send**.

This check is a safety net, not a guarantee. It can't catch every name. The rule is still: no patient details in this sheet.

## Where the data lives
- In one Google Sheet, in the **clinic's** Google Workspace.
- The script runs inside that Sheet. It doesn't copy data anywhere else.
- No AI service, outside server or add-on receives any of it.

## Who can see it
- Anyone the clinic shares the Sheet with. Recommended: the VA (editor) and the clinic manager (editor or viewer).
- The EOD email goes to **one** address: the Manager email in Settings. No CC or BCC.
- Anyone with edit access can change that address, so share edit access only with people who should control it.

## Permissions the script asks for
| Permission | Why |
|---|---|
| See and edit **this spreadsheet only** | Read the Task Log and write the Weekly tab. It can't open any other file in Drive. |
| Send email as you | Send the EOD report. It can't read anyone's inbox. |
| Show menus and dialogs | The VA Tools menu and the report preview. |
| Run when you're not present | The optional daily auto-send. |

## How to remove access
1. **Stop the emails:** VA Tools > Turn off daily auto-send. (Or Extensions > Apps Script > Triggers, then delete the trigger.)
2. **Remove a person:** Share > remove them from the Sheet.
3. **Revoke the script's permissions** for an account: myaccount.google.com > Security > Third-party apps with account access > remove this script.
4. **When the VA leaves:** turn off auto-send first, because the trigger runs under the account that turned it on. Then remove the VA from the Sheet.

## Retention
The Sheet keeps rows until someone deletes them. Clinics that want a limit can delete rows older than a set period (for example, 12 months) during a monthly review.
