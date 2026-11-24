# Tool 4: Referral Tracker

## Problem
Referrals go out and the loop never closes. Nobody checks that the patient got booked, and the specialist's consult report never makes it back to the referring provider.

## What it is
The same layout as the Prior Authorization Tracker (Tool 3), adapted for outbound referrals:

1. **Referrals**: one row per referral, with a Flag column and colour-coded rows.
2. **Follow-up Log**: one row per call or message. The newest date per case feeds back into Referrals.
3. **A weekday digest email** of overdue and due-soon referrals.

## Data rule
Holds PHI when used for real, so it lives only in the clinic's Google Workspace under the clinic's BAA with Google. It uses an EHR account number, never a name or date of birth. **The digest email has no patient identifiers.** It lists Case IDs, specialties and specialist practices only. Demos use made-up `TEST-####` accounts.

## Referrals columns
| Column | Filled by | Notes |
|---|---|---|
| Case ID | Script, if blank | `RF-0001`, `RF-0002` ... |
| Patient account # | Staff | EHR number only |
| Specialty | Staff | Cardiology, Dermatology, Endocrinology, Gastroenterology, Imaging, Neurology, Orthopedics, Behavioral health, Physical therapy, Other |
| Specialist / practice | Staff | |
| Urgency | Staff | Routine, Urgent |
| Sent | Staff | Date |
| Payer referral # | Staff | For plans that need one |
| Payer referral expires | Staff | Date |
| Appointment booked | Staff | Yes, No |
| Appointment date | Staff | Date |
| Report received | Staff | Yes, No |
| Report date | Staff | Date |
| Status | Staff | Open, Closed, Patient declined, Cancelled |
| Last follow-up | Script | Newest date for this case in the log |
| Flag | Script | See rules |
| Notes | Staff | Workflow only |

## Flag rules (Status = Open only)
Defaults are on the Settings tab.

**Before booking**
- No sent date: **Overdue**, "Sent date missing".
- Urgent, not booked, more than **3** days since sent: **Overdue**, "Urgent, not booked after N days".
- Routine, not booked, more than **7** days since the last activity (later of Sent and Last follow-up): **Overdue**, "Not booked, no update in N days". Exactly 7: **Soon**, "Check booking today".
- Booked but no appointment date: **Soon**, "Add the appointment date".

**After the visit** (appointment date has passed, report not received)
- Within **7** days of the visit: **Soon**, "Visit done: request the consult report".
- After that: **Overdue**, "No consult report N days after visit".

**Closing**
- Report received but still Open: **Soon**, "Report in: send to provider and close".

**Payer referral** (expiry set, report not received)
- Expired before the visit (or with no visit booked): **Overdue**, "Payer referral expired on DATE".
- Expires within **14** days, before the visit or with no visit booked: **Soon**, "Payer referral expires in N days".

**Any:** appointment date before sent date: **Soon**, "Check dates: appointment before sent".

Closed, Patient declined and Cancelled: no flag.

## Digest email
- To the one Digest email in Settings.
- Subject: `Referral digest: N overdue, M due soon (Clinic)`.
- Each line: Case ID, specialty, specialist, what to do. No account numbers.
- Weekdays at the Settings hour, only when something is flagged unless set otherwise.

## Menu: Referral Tools
Refresh flags · Send digest now · Set up sheets · Fill sample data (demo) · Turn on daily digest · Turn off daily digest

## Permissions (minimal)
`spreadsheets.currentonly`, `script.send_mail`, `script.container.ui`, `script.scriptapp`.
