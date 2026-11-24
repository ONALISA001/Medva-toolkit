# Data and access: Clinic HIPAA Security Checklist

**Short version:** this tool never touches patient data. It asks 31 questions about how the clinic is set up, and the answers stay in the browser that answered them.

## What data it holds
| Data | Example | PHI? |
|---|---|---|
| Yes / No / Not sure answers | "2FA on email: No" | No |
| Practice name (optional) | Riverside Family Medicine | No |

No question asks about patients. A test in `test/checklist.test.js` checks that no question mentions patient identifiers.

## Where the data lives
- **In the browser's local storage only**, so a refresh doesn't lose the answers.
- **Nothing is sent anywhere.** The page has no form submission, no analytics and no server. The only outside request is for the Google Fonts typeface, which sends no answers.
- **Clear answers** (with a confirm step) deletes them from the browser.

## A note on the results
The answers describe a clinic's security gaps. That isn't PHI, but it is sensitive: a list of a clinic's weak spots. So:
- Share the copied report only with the clinic and the people helping fix the gaps.
- Don't post a clinic's results publicly or use them as a case study without written permission.

## Who can see it
- Whoever is using that browser. On a shared front-desk computer, click **Clear answers** when finished.

## Permissions
None. It is a static web page with no logins, cookies or tracking.

## Not legal advice
The page says it is a starting checklist, not legal advice and not the formal security risk analysis the HIPAA Security Rule requires. It points to the free HHS Security Risk Assessment (SRA) Tool for that.
