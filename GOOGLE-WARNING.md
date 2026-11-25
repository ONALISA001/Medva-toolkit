# About the "Google hasn't verified this app" warning

The first time you run any of the Google Sheets tools (Tools 1 to 6), Google shows a screen that says **"Google hasn't verified this app"**. This page explains what that means, why it's safe to continue for these tools, and how a clinic can stop staff from seeing it.

## What it means
Google shows this warning for any Apps Script that asks for permissions and hasn't been through Google's app review. That includes a script you write yourself in five minutes. It does **not** mean Google found a problem with the script.

These tools haven't been submitted for review because each clinic installs its own private copy. They aren't a public app.

## Why it's safe to continue for these tools
- **You can read all of the code.** It's in the sheet under Extensions > Apps Script, and on GitHub.
- **The permissions are as narrow as possible.** For example, "this spreadsheet only" rather than all your spreadsheets, and "only files this script created" rather than your whole Google Drive. Each tool's `DATA-AND-ACCESS.md` lists every permission and why it's needed.
- **The script runs inside the account that installs it.** It sends nothing to the toolkit's author or to any outside server.

Check the permission list before you click **Allow**. If it ever asks for more than that tool's `DATA-AND-ACCESS.md` lists, such as access to *all* your Google Drive files, stop and don't allow it.

The warning is worth respecting in general: only continue for scripts from someone you trust, and only after reading what they can access.

## How to continue (for testing or setup)
1. Choose the account you're installing it in.
2. On "Google hasn't verified this app", click **Advanced**.
3. Click **Go to (project name) (unsafe)**. "Unsafe" here means "not reviewed by Google".
4. Read the permission list, then click **Allow**.

## For clinics: stop staff seeing it
**Install it in the clinic's Google Workspace.** When a script is owned by someone in the clinic's Workspace domain and only used by staff in that domain, Google usually treats it as an internal app and often doesn't show the warning. The tools should be installed there anyway, so the clinic's BAA with Google covers the data. Test copies on a personal Gmail account will always show the warning.

**Have the Workspace admin approve it.** A Google Workspace admin can mark internal apps, or a specific app, as trusted in the Google Admin console, under **Security > Access and data control > API controls**:
- **Trust internal, domain-owned apps** trusts scripts made inside the clinic's own domain.
- Or, under **Manage Third-Party App Access**, find the tool after one person has authorised it, and set its access to **Trusted**.

Google sometimes renames these menus. If they've moved, search Google's help for "Control which third-party & internal apps access Google Workspace data".

## What to tell a clinic
> "When you first run it, Google will say it hasn't verified the app. That's because it's a private script installed in your own Google account, not a public app from a store. You can read every line of it, this sheet lists exactly what it can access and why, and your Google admin can approve it so your staff never see the warning."

## Future: Google verification
If these tools are ever sold widely as templates, the author can apply for Google's OAuth verification. That requires a Google Cloud project, a public privacy policy, a demo video, and a review that can take several weeks. The tools already avoid Google's most restricted permissions, which keeps that path simpler.
