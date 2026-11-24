# Tool 7: Clinic HIPAA Security Checklist

## Problem
Small practices don't know where their data leaks. They've heard of HIPAA but have no simple way to see which basics they're missing or what to fix first.

## What it is
A single web page a clinic manager can fill in during a 15-minute call or on their own:

- **31 yes / no / not sure questions** in 9 areas: passwords and sign-in, devices, shared logins and access, Wi-Fi and network, email, backups, vendors and BAAs, training and policies, phishing.
- **A score for each area** and an overall score, weighted so the most important controls count most.
- **The top 5 fixes** in plain language, most important first.
- **Copy report**, which puts a plain-text summary on the clipboard to paste into an email or doc.

It is the free first conversation that leads to paid work (the "security checklist audit" service in the build plan).

## Data rule
**No patient data.** The page asks only about the clinic's setup. Answers stay in the browser: they are saved in that browser's local storage so a refresh doesn't lose them, and they are never sent anywhere. "Clear answers" removes them.

## Not legal advice
The page says plainly that it is a starting checklist, not a legal opinion and not the formal security risk analysis the HIPAA Security Rule requires. One question asks whether that risk analysis has been done.

## Scoring
- Each question has a weight: 3 = critical, 2 = important, 1 = good practice.
- Yes earns the full weight. No and Not sure earn 0. "Not sure" fixes start with "Find out:".
- Area score = earned / possible, as a percentage. Overall = all earned / all possible.
- Bands: 80% and up **Strong**, 50 to 79% **Needs work**, below 50% **At risk**. Unanswered questions count as gaps and are shown as "N unanswered".
- **Top 5 fixes:** No and Not sure answers, sorted by weight (highest first), then by question order. Unanswered questions are not fixes; the page asks the user to answer them.

## Files
- `checklist.js`: questions, weights, fixes and scoring. Works in the browser and in Node, so it can be tested.
- `index.html`: the page. Self-contained apart from `checklist.js` and Google Fonts (it falls back to system fonts offline).
- `test/checklist.test.js`: scoring tests.
