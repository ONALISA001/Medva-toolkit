# Medical VA Automation Toolkit

Small, HIPAA-aware admin tools for clinics, built on Google Sheets, Forms and Apps Script. Each one installs inside the clinic's own Google Workspace and ships with a one-page "Data and access" note.

By James Mbari, HIPAA-certified medical virtual assistant.

## Tools
| # | Tool | Status |
|---|---|---|
| 1 | [VA Daily Dashboard and EOD Report](01-va-daily-dashboard/) | Built, needs testing in Google Sheets |
| 2 | [Insurance Verification Toolkit](02-insurance-verification/) | Built, needs testing in Google Sheets |
| 3 | [Prior Authorization Tracker](03-prior-auth-tracker/) | Built, needs testing in Google Sheets |
| 4 | Referral Tracker | Planned |
| 5 | Patient Intake Pipeline | Planned |
| 6 | Appointment Reminder and No-Show Reducer | Planned |
| 7 | Clinic HIPAA Security Checklist | Planned |

## Ground rules for every tool
1. No real patient data in demos or templates. Made-up data only.
2. Client data stays in the client's own systems, under the clinic's BAA with Google.
3. No patient data goes to an AI tool unless the clinic has a BAA with that vendor.
4. Collect only the fields the task needs.
5. Every tool includes a "Data and access" note.
