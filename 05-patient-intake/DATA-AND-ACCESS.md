# Data and access: Patient Intake Pipeline

**Short version:** this is the most sensitive tool in the kit. Patients type their own PHI into it. It must run in the clinic's Google Workspace under the clinic's BAA with Google, it collects only what registration needs, it sends no email, and it deletes its copies once the information is in the EHR.

## What data it holds
| Data | Where | PHI? |
|---|---|---|
| Name, date of birth, sex on insurance | Form, Intake Responses, summary doc | Yes |
| Phone, email, address, contact and reminder preferences | Form, Intake Responses, summary doc | Yes |
| Insurance company, member ID, group #, policyholder | Form, Intake Responses, summary doc | Yes |
| Emergency contact | Form, Intake Responses, summary doc | Yes |
| Consents and typed signature | Form, Intake Responses, summary doc | Yes |
| Intake ID, "Last, F.", checklist ticks, flags | Intake Checklist | Yes, minimal |

**Never collected:** Social Security number, reason for visit, medical history, medications, allergies, insurance card photos. Clinical intake belongs in the EHR. Card and ID images are handled at the front desk, and the checklist only records that they were received.

## Where the data lives
- **The form, the sheet and the summary docs are owned by the account that runs Set up.** For real patients this must be a **clinic Google Workspace account** covered by the clinic's BAA. On a personal Gmail account, Set up and Show form link both warn: demo with made-up patients only, and never send that form link to a real patient.
- Summary docs go in one folder, **"Patient intake summaries (restricted)"**, which Set up makes private. Docs are named by Intake ID and date, not patient name.
- **Nothing leaves Google.** No email to staff or patients, no AI service, no outside server.

## Who can see it
- **The form** is open to anyone with the link, because patients are outside the clinic's domain. The link only lets someone submit, not see answers: summary charts, response editing and "submit another response" are all off. Anyone with the link can still submit junk, so share it only with booked patients, for example in the booking confirmation.
- **The sheet:** staff the clinic shares it with.
- **The summary folder:** private to the owner. To let front-desk staff open summaries, share the folder with **each person by name**. Never use "Anyone with the link".

## Permissions the script asks for
| Permission | Why |
|---|---|
| See and edit **this spreadsheet only** | Checklist, response IDs, clean-up |
| Create and edit forms | Build the intake form and link it to this sheet |
| Create documents | Write the summary docs |
| See and edit **only files this script created** | Make the private folder, move summaries into it, trash them at clean-up. It can't see anything else in Drive. |
| Show menus and dialogs, run when you're not present | The menu, and processing each new submission |

No email permission.

## Patient-typed text is treated as data
Patients can type anything, including text that looks like a spreadsheet formula. The checklist stores names with a guard so a value like `=IMPORTDATA(...)` is kept as plain text and never runs.

## How to remove access
1. **Stop new submissions:** open the form > Responses > turn off "Accepting responses".
2. **Stop processing:** Extensions > Apps Script > Triggers, then delete `onIntakeSubmit`.
3. **Remove a person:** remove them from the sheet **and** from the summary folder.
4. **When the VA leaves:** if the VA's account ran Set up, transfer ownership of the form, sheet and folder to a clinic account first, then remove the VA.

## Retention and clean-up
1. Staff tick **Entered in EHR** once the information is in the chart.
2. **Intake Tools > Clean up completed intakes** (asks first) handles intakes marked "Entered in EHR" more than 30 days ago (set on Settings):
   - moves the summary doc to the trash, where Google deletes it for good after 30 days
   - clears the patient's answers from Intake Responses, keeping only the timestamp and Intake ID
3. **Google Forms keeps its own copy** of every response. Once all current intakes are in the EHR, open the form > Responses > ⋮ > Delete all responses.
