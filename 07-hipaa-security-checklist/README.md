# Clinic HIPAA Security Checklist

A free one-page self-check for small practices: 31 yes / no / not sure questions about passwords, devices, logins, Wi-Fi, email, backups, vendor BAAs, training and phishing. It scores each area and lists the five fixes that matter most, in plain language.

Tool 7 of the Medical VA Automation Toolkit. It's built as the free first conversation that leads to paid work: walk a clinic manager through it on a 15-minute call, send them the report, and offer to fix the gaps.

**No patient data.** Answers stay in the browser. See [DATA-AND-ACCESS.md](DATA-AND-ACCESS.md).

## What the clinic gets
- **An overall score** and a band: Strong (80% and up), Needs work (50 to 79%), At risk (below 50%).
- **A score for each of 9 areas**, with coloured bars.
- **The top 5 fixes**, most important first. Critical controls such as two-step sign-in, disk encryption, signed BAAs and a yearly risk analysis count three times as much as nice-to-haves. "Not sure" answers become "Find out: ..." fixes.
- **Copy report:** a plain-text summary with every area, all the gaps and the disclaimer, ready to paste into an email.
- **Works on phones.** A score bar stays at the top while you answer.

## Use it
Open `index.html` in any browser. No install, no account. It works offline too, using system fonts.

To share it as a link, host the folder anywhere that serves static files, such as GitHub Pages, Netlify or a Claude artifact. Only `index.html` and `checklist.js` are needed.

## On a discovery call
1. Share your screen and click **Try an example clinic** to show how it works.
2. **Clear answers**, then go through the questions with the manager. It takes about 15 minutes.
3. **Copy report** and email it to them the same day, with your offer to fix the top 5.

## How scoring works
- Each question has a weight: 3 = critical, 2 = important, 1 = good practice.
- Yes earns the weight. No and Not sure earn 0. Unanswered questions lower the score but don't appear as fixes.
- Top fixes are sorted by weight, then by question order.

## Tests
```powershell
node test/checklist.test.js
```

## Files
| File | What it is |
|---|---|
| `SPEC.md` | Questions, scoring and bands |
| `checklist.js` | Questions, weights, fix text, scoring, report text (browser and Node) |
| `index.html` | The page |
| `test/checklist.test.js` | Scoring tests |
| `DATA-AND-ACCESS.md` | What it stores and where |
