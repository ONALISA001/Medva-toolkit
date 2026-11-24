# Patient Intake Pipeline

New patients fill in one Google Form. Each submission becomes a clean, EHR-ready summary doc in a private folder, plus a checklist row so staff can see what's still missing: insurance card, photo ID, signed forms, EHR entry. Once an intake is in the EHR, one click deletes the copies.

Tool 5 of the Medical VA Automation Toolkit.

**This tool collects PHI directly from patients.** Real use only in the clinic's Google Workspace. Read [DATA-AND-ACCESS.md](DATA-AND-ACCESS.md) before installing it for a clinic.

## What the clinic gets
- **A patient-friendly intake form** in five short pages: about you, contact, insurance, emergency contact, consents. Phone, email and ZIP are checked as patients type. No medical history or SSN.
- **A summary doc per patient** with every answer laid out for EHR entry, any problems listed at the top ("Insurance details missing", "Minor: guardian consent and ID needed", "Check signature"), named by Intake ID and saved in a private folder.
- **Intake Checklist:** one row per patient with checkboxes, a Status ("Waiting: photo ID, EHR entry" or "Complete") and Flags. Rows turn green when complete.
- **Clean up completed intakes:** deletes summary docs and clears stored answers for intakes already in the EHR.

## Install (about 15 minutes)
**Use a clinic Workspace account.** A personal Gmail account works for demos with made-up patients only.

1. Create a new Google Sheet.
2. Open **Extensions > Apps Script**.
3. Replace `Code.gs` with `src/Code.js`. Add a script file named `Logic` with `src/Logic.js`.
4. In **Project Settings**, tick "Show appsscript.json" and replace it with `src/appsscript.json`. Set `timeZone` to the clinic's.
5. Save and reload. An **Intake Tools** menu appears.
6. Run **Intake Tools > Set up** and approve the permissions. If the policy links are empty, it offers to stop so you can add the clinic's Notice of Privacy Practices and financial policy links on the **Settings** tab first. Then run Set up again.
7. Share the **summary folder** (link on Settings) with front-desk staff **by name**.
8. Run **Show form link** and send that link to booked new patients.

Or with clasp: copy `.clasp.json.example` to `.clasp.json`, add the Script ID, then run `clasp push`.

## Daily use
1. New submissions appear on **Intake Checklist** within a few seconds.
2. Open the summary, enter it in the EHR, and resolve any flags.
3. Tick the boxes as items arrive. Tick **Entered in EHR** last.
4. Weekly: **Clean up completed intakes**.

## Demo
Run **Intake Tools > Fill sample intakes (demo)**. It adds 5 made-up patients, all surnamed "Test" with 555 phone numbers and `DEMO` member IDs. They show a clean adult, a self-pay patient, a minor, missing insurance details, and a bad signature plus no emergency contact. Each gets a summary doc.

## Tests
```powershell
node test/logic.test.js
```

## Files
| File | What it is |
|---|---|
| `SPEC.md` | Questions, flags, checklist and permissions |
| `src/Logic.js` | Form questions, checks, summary layout, formula guard, sample patients |
| `src/Code.js` | Form creation, summary docs, checklist, clean-up |
| `src/appsscript.json` | Time zone and the six permissions |
| `test/logic.test.js` | Tests with made-up patients |
| `DATA-AND-ACCESS.md` | What data it holds, who can see it, clean-up |
