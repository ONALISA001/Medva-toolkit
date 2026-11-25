# Referral Tracker

A Google Sheet that tracks every outbound referral until the loop is closed: the patient gets booked, the visit happens, and the consult report comes back to the referring provider. It flags anything stalled and emails a weekday digest.

Tool 4 of the Medical VA Automation Toolkit. It uses the same layout and digest as the [Prior Authorization Tracker](../03-prior-auth-tracker/).

**This tool handles PHI when used for real.** Install it only in the clinic's Google Workspace. See [DATA-AND-ACCESS.md](DATA-AND-ACCESS.md).

## What the clinic gets
- **Referrals:** one row per referral. Rows turn red when overdue and amber when due soon.
  | Flag | When |
  |---|---|
  | Not booked, no update in N days | Routine referral with no booking or follow-up for more than 7 days |
  | Urgent, not booked after N days | Urgent referral not booked within 3 days |
  | Visit done: request the consult report | Up to 7 days after the visit |
  | No consult report N days after visit | More than 7 days after the visit |
  | Report in: send to provider and close | Report received, referral still open |
  | Payer referral expires in N days, or expired | HMO-style referral running out before the visit |
  | Add the appointment date, Sent date missing | Missing details |
- **Follow-up Log:** every call to the specialist office, patient or payer. The newest date resets the "no update" clock.
- **Weekday digest email** by Case ID, with no account numbers.
- Every threshold can be changed on **Settings**.

## Install (about 10 minutes)
1. Create a new Google Sheet in the clinic's Workspace.
2. Open **Extensions > Apps Script**.
3. Replace `Code.gs` with `src/Code.js`. Add a script file named `Logic` with `src/Logic.js`.
4. In **Project Settings**, tick "Show appsscript.json" and replace it with `src/appsscript.json`. Set `timeZone` to the clinic's.
5. Save and reload. A **Referral Tools** menu appears.
6. Run **Referral Tools > Set up sheets** and approve the permissions.
7. Add the Digest email on **Settings**, then run **Turn on daily digest**.

Or with clasp: copy `.clasp.json.example` to `.clasp.json`, add the Script ID, then run `clasp push`.

## Daily use
1. Add a row when a referral is sent. Case ID fills in.
2. Log each call on **Follow-up Log** with the Case ID.
3. Set Appointment booked and the date once the patient is scheduled.
4. Set Report received when the consult note arrives, route it to the provider, then set Status to Closed.

## Demo
Run **Referral Tools > Fill sample data (demo)**. It adds 12 made-up referrals (accounts `TEST-4001` to `TEST-4012`) and 4 log entries covering every flag. Then run **Send digest now** with your own email in Settings.

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
