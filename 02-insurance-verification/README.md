# Insurance Verification Toolkit

A Google Form, a results sheet and a printable call script that make every insurance verification the same: the same questions, in the same order, with each result automatically marked **Ready**, **Missing info**, **Action needed** or **Problem**.

Tool 2 of the Medical VA Automation Toolkit.

**This tool handles PHI when used for real.** Install it only in the clinic's Google Workspace. See [DATA-AND-ACCESS.md](DATA-AND-ACCESS.md).

## What the front desk gets
- A **Verifications** tab, one row per check, colour-coded by status:
  | Status | Means |
  |---|---|
  | Problem | Coverage inactive, out of network, or numbers that don't add up |
  | Missing info | A required answer is blank or "Unknown" |
  | Action needed | Prior auth or a referral is required |
  | Ready | Verified and complete |
- A **Missing info** column listing exactly what to go back for.
- **Deductible remaining**, worked out for them.
- A **Call Script** tab to print for payer calls.

## Install (about 10 minutes)
**Use a clinic Workspace account for real patients.** A personal Gmail account works for demos only.

1. Create a new Google Sheet.
2. Open **Extensions > Apps Script**.
3. Replace `Code.gs` with `src/Code.js`. Add a script file named `Logic` with `src/Logic.js`.
4. In **Project Settings**, tick "Show appsscript.json" and replace it with `src/appsscript.json`. Set `timeZone` to the clinic's.
5. Save and reload the sheet. A **Verification Tools** menu appears.
6. Run **Verification Tools > Set up** and approve the permissions. This creates the form, links it, adds the status columns and the Call Script tab, and turns on the status check for new responses.
7. Run **Verification Tools > Show form link** and bookmark the form for staff.

Or with clasp: copy `.clasp.json.example` to `.clasp.json`, add the Script ID, then run `clasp push`.

## Demo
Run **Verification Tools > Fill sample verifications (demo)**. It adds 8 made-up rows (accounts `TEST-1001` to `TEST-1008`) that show every status. Then submit one form yourself and watch the status fill in.

## About the Google warning
The first time you run it, Google says **"Google hasn't verified this app"**. That's normal for any private Apps Script that hasn't been through Google's app review. It doesn't mean anything is wrong.
- To continue: click **Advanced**, then **Go to (project name) (unsafe)**. Read the permission list, then click **Allow**.
- The permissions should match [DATA-AND-ACCESS.md](DATA-AND-ACCESS.md). If it asks for anything more, such as *all* your Google Drive files, don't allow it.
- In a clinic's Google Workspace, the warning usually doesn't appear for staff in the same domain, and the Workspace admin can mark the tool as trusted.

Full explanation, admin steps and what to tell a clinic: [GOOGLE-WARNING.md](../GOOGLE-WARNING.md).

## Tests
```powershell
node test/logic.test.js
```

## Files
| File | What it is |
|---|---|
| `SPEC.md` | Questions, status rules and permissions |
| `src/Logic.js` | Form questions, status rules, call script, sample data |
| `src/Code.js` | Form creation, sheet setup, on-submit status, menu |
| `src/appsscript.json` | Time zone and the four permissions |
| `test/logic.test.js` | Tests with made-up data |
| `DATA-AND-ACCESS.md` | What data it holds, where it lives, how to remove access |
