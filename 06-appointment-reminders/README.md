# Appointment Reminder and No-Show Reducer

A Google Sheet that emails patients a reminder 2 days and 1 day before each appointment, optionally invites no-shows to rebook, and tracks the clinic's weekly no-show rate, including whether confirmed patients show up more.

Tool 6 of the Medical VA Automation Toolkit.

**This tool emails patients.** Real use only from the clinic's Google Workspace. See [DATA-AND-ACCESS.md](DATA-AND-ACCESS.md).

## What the clinic gets
- **Reminders that say only what's needed:**
  > Hi Jane,
  > This is a reminder of your appointment at Riverside Family Medicine tomorrow, Tuesday, December 1 at 10:30 AM.
  > To confirm, cancel or reschedule, please call (555) 010-2200.
  > Please do not reply to this email with health information.
- **Flags** on rows that need a person: "Text only: call to remind", "Add a valid email", "Mark the outcome", "No-show: call to rebook".
- **A Weekly Report tab** with a chart: appointments, attended, no-shows, cancellations and no-show rate for 8 weeks, split by confirmed and unconfirmed.
- **A Monday report email** with counts only.
- **Test mode**, which sends every email to you instead of patients. Use it for demos and testing.

Email only for now. Text reminders need a paid SMS provider with a BAA, so they're a later upgrade. Text-only patients get flagged for a call.

## Install (about 10 minutes)
1. Create a new Google Sheet in the clinic's Workspace. A shared front-desk account is best, since reminders are sent from it.
2. Open **Extensions > Apps Script**.
3. Replace `Code.gs` with `src/Code.js`. Add a script file named `Logic` with `src/Logic.js`.
4. In **Project Settings**, tick "Show appsscript.json" and replace it with `src/appsscript.json`. Set `timeZone` to the clinic's.
5. Save and reload. A **Reminder Tools** menu appears.
6. Run **Reminder Tools > Set up sheets** and approve the permissions. It shows which address will send the emails.
7. On **Settings**, add the clinic phone and the weekly report email. Put **your own email in Test mode** while you check everything.
8. Run **Preview tomorrow's reminders**, then **Run reminders now** and check your inbox.
9. Clear Test mode, then run **Turn on daily reminders**.

Or with clasp: copy `.clasp.json.example` to `.clasp.json`, add the Script ID, then run `clasp push`.

## Daily use
- Add each appointment: date, time, **first name only**, email, phone, reminder preference.
- Set **Confirmation** when patients call back.
- After the date, set **Outcome**: Attended, No-show, Cancelled or Rescheduled.
- **If an appointment moves:** set the old row to Rescheduled and add a new row for the new date. Reminders already sent for the old date aren't resent if you edit the date in place.

## Demo
1. Put your email in **Test mode**.
2. Run **Fill sample appointments (demo)**. It adds 8 weeks of made-up history, where the no-show rate falls as confirmations rise, plus upcoming appointments covering every case.
3. Run **Preview tomorrow's reminders**, then **Run reminders now** and **Send weekly report now**. Every email lands in your inbox marked `[TEST]`.

## Tests
```powershell
node test/logic.test.js
```

## Files
| File | What it is |
|---|---|
| `SPEC.md` | Columns, sending rules, messages, report and permissions |
| `src/Logic.js` | What's due, message wording, flags, weekly stats, sample data |
| `src/Code.js` | Sheet setup, sending, preview, report tab and chart, triggers |
| `src/appsscript.json` | Time zone and the five permissions |
| `test/logic.test.js` | Tests with made-up appointments |
| `DATA-AND-ACCESS.md` | What leaves the sheet, which account sends, how to remove access |
