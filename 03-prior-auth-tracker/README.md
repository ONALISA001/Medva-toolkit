# Prior Authorization Tracker

A Google Sheet that tracks every prior auth from submission to approval, flags anything stalled, expiring or near an appeal deadline, and emails a weekday digest of what needs attention.

Tool 3 of the Medical VA Automation Toolkit.

**This tool handles PHI when used for real.** Install it only in the clinic's Google Workspace. See [DATA-AND-ACCESS.md](DATA-AND-ACCESS.md).

## What the clinic gets
- **Auth Requests:** one row per request. Rows turn red when overdue and amber when due soon.
  | Flag | When |
  |---|---|
  | No update in N days | Open request with no follow-up for more than 5 days |
  | Expedited, no decision | Expedited request open more than 3 days |
  | Auth expires in N days | Approved auth expiring within 14 days |
  | Auth expired | Approved auth past its expiry |
  | Appeal due in N days | Denial with an appeal deadline within 14 days |
  | Approved: add auth # and expiry, Denied: add the appeal deadline | Missing details |
- **Follow-up Log:** every call and portal check. The newest date for each case updates "Last follow-up" automatically, which resets the "No update" clock.
- **Weekday digest email:** overdue and due-soon cases by Case ID, with no account numbers.
- Every threshold can be changed on the **Settings** tab.

## Install (about 10 minutes)
1. Create a new Google Sheet in the clinic's Workspace.
2. Open **Extensions > Apps Script**.
3. Replace `Code.gs` with `src/Code.js`. Add a script file named `Logic` with `src/Logic.js`.
4. In **Project Settings**, tick "Show appsscript.json" and replace it with `src/appsscript.json`. Set `timeZone` to the clinic's.
5. Save and reload the sheet. A **Prior Auth Tools** menu appears.
6. Run **Prior Auth Tools > Set up sheets** and approve the permissions.
7. On **Settings**, add the Digest email. Then run **Turn on daily digest**.

Or with clasp: copy `.clasp.json.example` to `.clasp.json`, add the Script ID, then run `clasp push`.

## Daily use
1. Add a row when an auth is submitted. Leave Case ID blank; it fills in.
2. Log each follow-up on **Follow-up Log** with the Case ID.
3. Update Status, Decision date, Auth # and Expires when the payer decides.
4. Work the red rows first, then the amber ones.

Flags refresh whenever someone edits either tab, and again before each digest.

## Demo
Run **Prior Auth Tools > Fill sample data (demo)**. It adds 12 made-up requests (accounts `TEST-3001` to `TEST-3012`) and 4 log entries that show every kind of flag. Then run **Send digest now** with your own email in Settings.

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
| `SPEC.md` | Columns, flag rules, digest and permissions |
| `src/Logic.js` | Flag rules, case IDs, digest layout, sample data |
| `src/Code.js` | Sheet setup, refresh, digest sending, triggers |
| `src/appsscript.json` | Time zone and the four permissions |
| `test/logic.test.js` | Tests with made-up data |
| `DATA-AND-ACCESS.md` | What data it holds, what leaves the sheet, how to remove access |
