# Data and access: Referral Tracker

**Short version:** when used for real, the sheet holds PHI, so it lives only in the clinic's Google Workspace under the clinic's BAA with Google. It uses EHR account numbers, never names or dates of birth. The daily digest email carries **no patient identifiers**, only Case IDs.

## What data it holds
| Data | Example | PHI? |
|---|---|---|
| Patient account #, linked to a specialty and specialist | TEST-4001 · Cardiology · Lakeside Heart | Yes, when real |
| Dates, booking and report status, payer referral # | Sent Nov 14 · booked Dec 2 · HMO-22871 | Yes, when linked to an account |
| Follow-up log | Nov 15 · Specialist office · "Front desk" · packet confirmed | Yes, when linked to an account |
| Settings | Clinic name, digest email, thresholds | No |

**Not collected:** names, dates of birth, member IDs, diagnoses, or the referral packet itself. The records go through the EHR or secure messaging, as the clinic's referral SOP describes. Column notes remind staff to write "Patient" instead of a name in the log.

## What leaves the sheet
Only the **digest email**. For each flagged referral: Case ID, specialty, specialist practice and what to do. Example: "RF-0006 · Endocrinology · Northside Endocrine · No consult report 12 days after visit".

No account numbers, notes or log entries. Note that the **specialty** appears, such as "Behavioral health". It doesn't identify anyone without the sheet, but a clinic that would rather leave it out can send the digest to a shared clinic mailbox, not a personal one.

Nothing goes to AI services, add-ons or outside servers.

## Who can see it
- **The sheet:** whoever the clinic shares it with. Recommended: the VA and the referral coordinator or front-desk staff.
- **The digest:** the one address in Settings. Anyone with edit access can change it, so limit edit access.

## Permissions the script asks for
| Permission | Why |
|---|---|
| See and edit **this spreadsheet only** | Fill in Case IDs, last follow-up and flags |
| Send email as you | The daily digest. It can't read anyone's inbox. |
| Show menus and dialogs | The Referral Tools menu |
| Run when you're not present | The weekday digest |

## How to remove access
1. **Stop the digest:** Referral Tools > Turn off daily digest.
2. **Remove a person:** Share > remove them.
3. **When the VA leaves:** turn off the digest first (it runs under the account that turned it on), transfer ownership if the VA created the sheet, then remove the VA.

## Retention
Closed, declined and cancelled referrals can be moved to an archive tab or deleted once they're older than the clinic's records policy requires, for example in a quarterly review.
