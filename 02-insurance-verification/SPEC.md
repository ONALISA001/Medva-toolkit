# Tool 2: Insurance Verification Toolkit

## Problem
Eligibility checks are slow and inconsistent. Each person records different things, answers get lost in sticky notes, and the front desk finds out about an inactive plan or a missing prior auth at check-in.

## What it is
A Google Sheet with a bound Apps Script that sets up:

1. **A Google Form** for each verification, with the same questions in the same order every time.
2. **A Verifications tab** where every form response lands, with four columns the script fills in: Status, Missing info, Flags and Deductible remaining.
3. **A printable Call Script tab** with the payer questions in order and blanks for the answers.

## Data rule
This tool holds PHI when used for real, so it lives **only in the clinic's Google Workspace**, under the clinic's BAA with Google. It collects the minimum: an EHR account number to link back to the chart, never the patient's name, date of birth or member ID. Demos use made-up accounts (`TEST-1001`) only.

## Form questions
| Question | Type | Required on the form |
|---|---|---|
| Patient account # (from EHR) | text | Yes |
| Appointment date | date | Yes |
| Payer | text | Yes |
| Plan type | list: Commercial PPO, Commercial HMO, High-deductible (HSA), Medicare, Medicare Advantage, Medicaid / Medicaid MCO, Secondary / supplemental, Other | Yes |
| How you verified | Payer portal, Clearinghouse, Phone call | Yes |
| Coverage active on date of service | Yes, No, Unknown | Yes |
| Provider in network | Yes, No, Unknown | No |
| Copay ($), Coinsurance (%) | number | No |
| Deductible ($), Deductible met so far ($) | number | No |
| Out-of-pocket max ($), Out-of-pocket met so far ($) | number | No |
| Prior authorization required | Yes, No, Unknown | No |
| Referral required | Yes, No, Not applicable, Unknown | No |
| Reference number | text | No |
| Payer rep name | text | No |
| Your initials | text | Yes |
| Notes | paragraph | No |

Most questions are optional on purpose, so a half-finished check can still be saved and gets flagged instead of lost.

## Status rules
"Unknown" counts as missing.

**Missing info** when any of these are blank:
- Always: reference number.
- Phone calls: payer rep name.
- Coverage active = Yes: in network, copay or coinsurance, deductible, deductible met, prior auth required.
- HMO, Medicare Advantage and Medicaid plans: referral required ("Not applicable" counts as missing for these plans).
- Out-of-pocket: if one of max or met is filled, both are needed.

**Flags**
- Problem: coverage inactive; out of network; deductible met is more than the deductible; out-of-pocket met is more than the max; coinsurance over 100%.
- Action needed: prior auth required; referral required.

**Status** (first match wins): Problem, Missing info, Action needed, Ready.

## Menu: Verification Tools
- **Set up**: creates the form, links it to this sheet, adds the status columns and colours, the Call Script tab and the on-submit trigger. Safe to run again.
- **Refresh status for all rows**
- **Show form link**
- **Fill sample verifications (demo)**: 8 made-up rows covering each status.

## Permissions (minimal)
- `spreadsheets.currentonly`: this sheet only.
- `forms`: create and link the verification form.
- `script.container.ui`: menu and messages.
- `script.scriptapp`: the on-submit trigger that fills in the status.

No email, no Drive-wide access, no outside services.
