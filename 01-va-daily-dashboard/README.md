# VA Daily Dashboard and EOD Report

A Google Sheet that lets a remote medical VA log the day's work and email the clinic manager a clean end-of-day report in one click. A weekly tab charts tasks and hours.

**Task counts only. No patient data.** The report won't send if a note looks like patient information. See [DATA-AND-ACCESS.md](DATA-AND-ACCESS.md).

Tool 1 of the Medical VA Automation Toolkit.

## What the clinic manager gets
An email at the end of each day:

- Tasks done and total time logged
- A table by task type: calls, scheduling, insurance verification, prior auth, referrals, reminders, inbox and email
- The VA's work notes

## Install it (about 10 minutes)

### Option A: copy and paste (no tools needed)
1. Create a new Google Sheet in the account that will own it (for a client: the clinic's Workspace).
2. Open **Extensions > Apps Script**.
3. Replace the contents of `Code.gs` with `src/Code.js`.
4. Add a script file named `Logic` and paste in `src/Logic.js`.
5. Open **Project Settings**, tick "Show appsscript.json", then replace its contents with `src/appsscript.json`. Set `timeZone` to the clinic's time zone.
6. Save, go back to the Sheet and reload. A **VA Tools** menu appears.
7. Run **VA Tools > Set up sheets** and approve the permissions.
8. Fill in the **Settings** tab: clinic name, VA name, manager email.

### Option B: clasp (for development)
```powershell
npm install -g @google/clasp
clasp login
```
Create the Sheet and open Extensions > Apps Script, then copy the Script ID from Project Settings. Copy `.clasp.json.example` to `.clasp.json` and paste the ID in. Then push the code:
```powershell
clasp push
```

## Daily use
1. Log tasks on the **Task Log** tab: date, task type, count, minutes, notes.
2. **VA Tools > Preview today's report** to check it.
3. **VA Tools > Send today's EOD report**, or turn on daily auto-send.
4. **VA Tools > Refresh weekly chart** for the weekly view.

## Demo
Run **VA Tools > Fill a sample week (demo)**. It adds 5 weekdays of made-up tasks, all marked "(sample)". Then refresh the weekly chart and preview the report.

## Tests
The rules (validation, the patient-data check, totals and the email layout) are in `src/Logic.js` and tested with Node:
```powershell
node test/logic.test.js
```

## Files
| File | What it is |
|---|---|
| `SPEC.md` | What the tool does and why |
| `src/Code.js` | Sheet setup, menu, sending and the trigger |
| `src/Logic.js` | Validation, patient-data check, totals, email layout |
| `src/appsscript.json` | Time zone and the four minimal permissions |
| `test/logic.test.js` | Tests with fake data |
| `DATA-AND-ACCESS.md` | Who sees what, where data lives, how to remove access |
