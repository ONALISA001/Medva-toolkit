# Data and access: Prior Authorization Tracker

**Short version:** when used for real, the sheet holds PHI, so it lives only in the clinic's Google Workspace under the clinic's BAA with Google. It uses EHR account numbers, never names or dates of birth. The daily digest email carries **no patient identifiers**, only Case IDs.

## What data it holds
| Data | Example | PHI? |
|---|---|---|
| Patient account #, linked to a service and code | TEST-3001 · Imaging · 70553 | Yes, when real |
| Payer, dates, status, auth #, units | UHC · Submitted Nov 15 · AUTH-77120 | Yes, when linked to an account |
| Follow-up log | Nov 16 · Payer · rep "Dana" · ref UHC-55120 | Yes, when linked to an account |
| Settings | Clinic name, digest email, thresholds | No |

**Not collected:** patient names, dates of birth, member IDs, diagnoses or clinical notes. Column notes in the sheet remind staff of this, including writing "Patient" instead of a name in the log.

## What leaves the sheet
Only the **digest email**. For each flagged request it includes the Case ID, payer, service, CPT code and what to do, for example: "PA-0007 · Aetna · PT / OT · 97140 · Auth expired on Nov 22".

It never includes account numbers, notes or log entries. To act on a case, staff open the sheet and look up the Case ID.

Nothing goes to any AI service, add-on or outside server.

## Who can see it
- **The sheet:** whoever the clinic shares it with. Recommended: the VA and the staff who handle auths, nobody outside the clinic.
- **The digest:** the one address in Settings. Anyone with edit access can change it, so limit edit access to people who should control it.

## Permissions the script asks for
| Permission | Why |
|---|---|
| See and edit **this spreadsheet only** | Fill in Case IDs, last follow-up and flags |
| Send email as you | The daily digest. It can't read anyone's inbox. |
| Show menus and dialogs | The Prior Auth Tools menu |
| Run when you're not present | The weekday digest |

## How to remove access
1. **Stop the digest:** Prior Auth Tools > Turn off daily digest.
2. **Remove a person:** Share > remove them.
3. **When the VA leaves:** turn off the digest first, because it runs under the account that turned it on. If the VA created the sheet, transfer ownership to a clinic account. Then remove the VA.

## Retention
Keep closed requests (approved and used, denied with appeals finished, withdrawn) only as long as the clinic's records policy requires. A simple routine: once a quarter, move closed rows older than that period to an archive tab, or delete them.
