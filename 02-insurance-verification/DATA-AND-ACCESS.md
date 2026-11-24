# Data and access: Insurance Verification Toolkit

**Short version:** when used for real, this tool holds patient benefit information (PHI). It must live in the clinic's own Google Workspace, under the clinic's BAA with Google, and it collects an EHR account number instead of names or dates of birth.

## What data it holds
| Data | Example | PHI? |
|---|---|---|
| EHR account number, appointment date | TEST-1001 · 2026-12-01 | Yes, when real |
| Payer, plan type, benefits | Aetna PPO · $30 copay · $1,500 deductible | Yes, when linked to an account |
| Reference number, payer rep name, staff initials | ELG-55821 · Dana · JM | No |
| Notes | "Visit limit 20 PT, 6 used" | Yes, when real. No diagnoses or clinical details. |

**Not collected:** patient name, date of birth, member ID, address, phone, diagnosis. Staff read those from the EHR during a call and don't type them into the form.

## Where the data lives
- **A Google Form and a Google Sheet, both owned by the account that runs Set up.** Run Set up from a clinic Workspace account, never from a VA's personal Gmail. Otherwise patient data lands in the VA's Drive.
- Google Forms also keeps its own copy of each response.
- Nothing leaves Google: no email, no AI service, no outside server.

## Who can see it
- **The form:** on a Workspace account, Set up limits it to people signed in to the clinic's domain. On a personal Gmail account it can't, and Set up shows a warning. Use those copies for demos with made-up data only.
- **The sheet:** whoever the clinic shares it with. Recommended: the VA and front-desk staff as editors, nobody outside the clinic.
- **Results** are never shared publicly. "See summary charts" is turned off.

## Permissions the script asks for
| Permission | Why |
|---|---|
| See and edit **this spreadsheet only** | Fill in the status columns and the Call Script tab |
| Create and edit forms | Build the verification form and link it to this sheet |
| Show menus and dialogs | The Verification Tools menu |
| Run when you're not present | Fill in the status when a form is submitted |

The script cannot send email and cannot open any other file in Drive.

## How to remove access
1. **Remove a person:** Share > remove them from the sheet. In the form, open Settings > Responses and confirm it's still limited to the clinic.
2. **Stop new responses:** in the form, Responses > turn off "Accepting responses".
3. **Stop the on-submit trigger:** Extensions > Apps Script > Triggers, then delete `onVerificationSubmit`.
4. **When the VA leaves:** if the VA ran Set up, transfer ownership of the form and sheet to a clinic account first, then delete the trigger and remove the VA.

## Retention
Verifications are only useful for the visit they cover. Recommended: each month, delete rows older than the clinic's retention period from the sheet **and** delete the matching responses in the form (Responses > ⋮ > Delete all responses, once the sheet is cleaned up).
