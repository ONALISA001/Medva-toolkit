# Tool 5: Patient Intake Pipeline

## Problem
New-patient paperwork arrives on paper or by email, and staff retype it by hand. Pieces go missing (the insurance card, the signed consent), and nobody knows which intakes are actually finished.

## What it is
A Google Sheet with a bound Apps Script that sets up:

1. **A patient-facing Google Form** for new-patient intake: about you, contact, insurance, emergency contact, consents.
2. **A summary Google Doc** for each submission, formatted for EHR entry, saved in a **restricted folder** that only the clinic owner can see.
3. **An Intake Checklist tab** where staff tick off: insurance card received, photo ID received, forms signed, entered in the EHR. Each row shows a Status and any Flags.
4. **A clean-up action** that deletes summary docs and clears the stored answers once an intake is in the EHR and older than a set number of days.

## Data rule
**This is the most sensitive tool in the kit.** Patients type their own PHI into the form. So:

- **Real use only in the clinic's Google Workspace**, under its BAA with Google. On a personal Gmail account, Set up shows a warning: demo with made-up patients only.
- **Collect only what registration needs.** No Social Security number, no reason for visit, no medical history, no medications. Clinical intake happens in the EHR.
- **No email is sent** by this tool, to staff or patients.
- Summary docs go in one private folder, are named by Intake ID (not patient name), and are deleted after EHR entry.
- Demos use made-up patients only, such as "Jane Test, DOB 01/01/1980".

## Form sections and questions
| Section | Questions |
|---|---|
| About you | Legal first name*, Legal last name*, Preferred name, Date of birth*, Sex as listed on insurance* |
| Contact | Mobile phone*, Email, Street address*, City*, State*, ZIP code*, Best way to reach you*, Appointment reminders* |
| Insurance | Do you have health insurance?*, Insurance company, Member ID, Group number, Are you the policyholder?, Policyholder full name, Policyholder date of birth, Your relationship to the policyholder |
| Emergency contact | Name, Relationship, Phone |
| Consents | I received or was offered the Notice of Privacy Practices*, I consent to treatment*, I have read the financial policy*, Signature: type your full legal name* |

\* required. Phone, email and ZIP are format-checked on the form.

## Flags on each intake
- Insurance = Yes but insurance company or member ID blank: "Insurance details missing".
- Not the policyholder and policyholder name or date of birth blank: "Policyholder details missing".
- Date of birth in the future or more than 120 years ago: "Check date of birth".
- Under 18: "Minor: guardian consent and ID needed".
- Adult whose signature doesn't contain their last name: "Check signature".
- No emergency contact name or phone: "No emergency contact".

## Checklist status
- **Complete**: entered in EHR, and every required item received.
- Otherwise **Waiting: ...** listing what's left. Self-pay patients don't need an insurance card.

## Menu: Intake Tools
Set up · Show form link · Refresh checklist · Clean up completed intakes · Fill sample intakes (demo)

## Permissions (minimal)
- `spreadsheets.currentonly`: this sheet only.
- `forms`: create and link the intake form.
- `documents`: create the summary docs.
- `drive.file`: create the restricted folder and move or delete **only the files this script created**. No access to the rest of Drive.
- `script.container.ui`, `script.scriptapp`: menu and the on-submit trigger.

No email permission.
