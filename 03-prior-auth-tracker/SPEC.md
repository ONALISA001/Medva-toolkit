# Tool 3: Prior Authorization Tracker

## Problem
Prior auths get lost, expire unnoticed, or miss payer and appeal deadlines. The status lives in someone's head or inbox, and the clinic finds out when a claim is denied.

## What it is
A Google Sheet with a bound Apps Script:

1. **Auth Requests**: one row per request, with a Flag column the script fills in and colour-coded rows.
2. **Follow-up Log**: one row per call or portal check. The newest date per case feeds back into Auth Requests.
3. **A daily email digest** of every overdue and due-soon request.

## Data rule
Holds PHI when used for real, so it lives only in the clinic's Google Workspace, under the clinic's BAA with Google. It uses an EHR account number, never the patient's name or date of birth. **The digest email contains no patient identifiers**: it lists Case IDs, payers and services only, so it is safe to land in a normal inbox. Demos use made-up accounts (`TEST-####`).

## Auth Requests columns
| Column | Filled by | Notes |
|---|---|---|
| Case ID | Script, if blank | `PA-0001`, `PA-0002` ... |
| Patient account # | Staff | From the EHR. No names. |
| Service | Staff | Dropdown: Imaging, Specialty drug, DME, Surgery / procedure, PT / OT, Home health, Sleep study, Other |
| CPT / HCPCS | Staff | |
| Payer | Staff | |
| Urgency | Staff | Standard, Expedited |
| Submitted | Staff | Date |
| Status | Staff | Not submitted, Submitted, Pending info, Peer-to-peer, Appeal filed, Approved, Denied, Withdrawn |
| Last follow-up | Script | Newest date for this case in the Follow-up Log |
| Decision date | Staff | |
| Auth # | Staff | |
| Approved units | Staff | |
| Expires | Staff | Date |
| Appeal deadline | Staff | Date, for denials |
| Flag | Script | See rules |
| Notes | Staff | Workflow only, no clinical detail |

## Follow-up Log columns
Date · Case ID · Contacted (Payer, Provider, Patient, Other) · Spoke with · Reference # · Outcome · Next step

## Flag rules
Day counts use the sheet's time zone. Settings hold the thresholds (defaults shown).

**Open requests** (Submitted, Pending info, Peer-to-peer, Appeal filed):
- No submitted date: **Overdue**, "Submitted date missing".
- Expedited and more than 3 days since submitted: **Overdue**, "Expedited, no decision after N days".
- Days since the last activity (later of Submitted and Last follow-up) more than **5**: **Overdue**, "No update in N days".
- Exactly 5: **Soon**, "Follow up today".

**Approved:**
- Auth # or Expires blank: **Soon**, "Approved: add auth # and expiry".
- Expired: **Overdue**, "Auth expired on DATE".
- Expires within **14** days: **Soon**, "Auth expires in N days".

**Denied:**
- No appeal deadline: **Soon**, "Denied: add the appeal deadline".
- Deadline within 7 days: **Overdue**, "Appeal due in N days". Within 14: **Soon**.
- Deadline passed: no flag (shown as "Appeal deadline passed" for the record).

**Any status:** decision date before submitted date: **Soon**, "Check dates: decision before submitted".

Not submitted, Withdrawn: no flag.

## Digest email
- To the one Digest email in Settings. No CC.
- Subject: `Prior auth digest: N overdue, M due soon (Clinic)`.
- Body: Overdue, then Soon. Each line: Case ID, payer, service, CPT, the flag reason. No account numbers.
- Sent on weekdays at the Settings hour, only when something is flagged (unless "Send when nothing is flagged" is Yes).

## Menu: Prior Auth Tools
Refresh flags · Send digest now · Set up sheets · Fill sample data (demo) · Turn on daily digest · Turn off daily digest

## Permissions (minimal)
`spreadsheets.currentonly`, `script.send_mail`, `script.container.ui`, `script.scriptapp`.
