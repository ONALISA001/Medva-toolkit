/**
 * Patient Intake Pipeline: the Google Sheets, Forms, Docs and Drive side.
 * Form questions, checks and the summary layout live in Logic.js.
 * This tool sends no email.
 */

var SHEET_RESPONSES = 'Intake Responses';
var SHEET_CHECKLIST = 'Intake Checklist';
var SHEET_SETTINGS = 'Settings';
var SUBMIT_HANDLER = 'onIntakeSubmit';
var PROP_FORM = 'intakeFormId';
var PROP_FOLDER = 'summaryFolderId';
var PROP_WORKSPACE = 'isWorkspace';
var RESPONSE_ID_COLUMN = 'Intake ID';

var SETTING_LABELS = {
  clinicName: 'Clinic name',
  keepDays: 'Keep summaries after EHR entry (days)',
  nppLink: 'Notice of Privacy Practices link',
  financialLink: 'Financial policy link',
  folder: 'Summary folder (restricted)'
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Intake Tools')
    .addItem('Set up', 'setup')
    .addItem('Show form link', 'showFormLink')
    .addItem('Refresh checklist', 'refreshChecklist')
    .addSeparator()
    .addItem('Clean up completed intakes', 'cleanUpCompleted')
    .addItem('Fill sample intakes (demo)', 'fillSampleIntakes')
    .addToUi();
}

/** Simple trigger: updates a checklist row's Status when a box is ticked. */
function onEdit(e) {
  if (!e || !e.range || e.range.getSheet().getName() !== SHEET_CHECKLIST || e.range.getRow() < 2) return;
  try { updateStatusRow_(e.range.getSheet(), e.range.getRow()); } catch (err) { console.log(err); }
}

/* ---------- helpers ---------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return ss_().getSpreadsheetTimeZone(); }
function props_() { return PropertiesService.getDocumentProperties(); }
function todayKey_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function ui_() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }
function tell_(m) { var ui = ui_(); if (ui) ui.alert(m); else console.log(m); }

function sheet_(name) {
  var s = ss_().getSheetByName(name);
  if (!s) throw new Error('The "' + name + '" tab is missing. Run Intake Tools > Set up.');
  return s;
}
function headers_(sheet) {
  var n = sheet.getLastColumn();
  return n ? sheet.getRange(1, 1, 1, n).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
}
function toKey_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var t = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  return m ? m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2) : '';
}

function getSettings_() {
  var sheet = sheet_(SHEET_SETTINGS);
  var values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getValues();
  var byLabel = {};
  values.forEach(function (r) { byLabel[String(r[0]).trim()] = r[1]; });
  var s = {};
  Object.keys(SETTING_LABELS).forEach(function (k) { s[k] = byLabel[SETTING_LABELS[k]]; });
  return s;
}

function form_() {
  var id = props_().getProperty(PROP_FORM);
  if (!id) return null;
  try { return FormApp.openById(id); } catch (e) { return null; }
}
function folder_() {
  var id = props_().getProperty(PROP_FOLDER);
  if (!id) throw new Error('No summary folder yet. Run Intake Tools > Set up.');
  return DriveApp.getFolderById(id);
}

/* ---------- setup ---------- */

function setup() {
  var ss = ss_();
  ensureSettings_();
  var settings = getSettings_();
  var created = false;

  if (!form_()) {
    var ui = ui_();
    if (ui && !settings.nppLink && !settings.financialLink) {
      var go = ui.alert('Policy links are empty',
        'The consent page can link to your Notice of Privacy Practices and financial policy. ' +
        'To add them, choose No, fill them in on the Settings tab, then run Set up again.\n\nCreate the form without links?',
        ui.ButtonSet.YES_NO);
      if (go !== ui.Button.YES) { ss.setActiveSheet(sheet_(SHEET_SETTINGS)); return; }
    }
    var before = ss.getSheets().map(function (s) { return s.getSheetId(); });
    var form = buildForm_(settings);
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    SpreadsheetApp.flush();
    props_().setProperty(PROP_FORM, form.getId());
    var linked = ss.getSheets().filter(function (s) { return before.indexOf(s.getSheetId()) === -1; })[0];
    if (linked && !ss.getSheetByName(SHEET_RESPONSES)) linked.setName(SHEET_RESPONSES);
    created = true;
  }

  var responses = sheet_(SHEET_RESPONSES);
  if (headers_(responses).indexOf(RESPONSE_ID_COLUMN) === -1) {
    responses.getRange(1, responses.getLastColumn() + 1).setValue(RESPONSE_ID_COLUMN).setFontWeight('bold');
  }
  responses.setFrozenRows(1);

  if (!props_().getProperty(PROP_FOLDER)) {
    var folder = DriveApp.createFolder('Patient intake summaries (restricted) - ' + ss.getName());
    try { folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) { console.log(e); }
    props_().setProperty(PROP_FOLDER, folder.getId());
    setSetting_(SETTING_LABELS.folder, folder.getUrl());
  }

  ensureChecklist_();

  var hasTrigger = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === SUBMIT_HANDLER; });
  if (!hasTrigger) ScriptApp.newTrigger(SUBMIT_HANDLER).forSpreadsheet(ss).onFormSubmit().create();

  ss.setActiveSheet(sheet_(SHEET_CHECKLIST));
  var warning = props_().getProperty(PROP_WORKSPACE) === 'no'
    ? '\n\nWARNING: this is not a Google Workspace account, so the clinic has no BAA with Google for it. ' +
      'Use this copy for demos with made-up patients only. Never share the form link with real patients.'
    : '';
  tell_((created ? 'Intake form created and linked. ' : 'Already set up; checked tabs, folder and trigger. ') +
    'Summary docs will be saved in a private folder (link on Settings).' + warning);
}

function ensureSettings_() {
  var ss = ss_();
  var set = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  if (set.getLastRow() === 0) {
    set.getRange(1, 1, 6, 2).setValues([
      ['Setting', 'Value'],
      [SETTING_LABELS.clinicName, 'Riverside Family Medicine'],
      [SETTING_LABELS.keepDays, 30],
      [SETTING_LABELS.nppLink, ''],
      [SETTING_LABELS.financialLink, ''],
      [SETTING_LABELS.folder, '(created by Set up)']
    ]);
    set.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#e8ecee');
    set.setColumnWidth(1, 300); set.setColumnWidth(2, 420);
  }
}

function setSetting_(label, value) {
  var sheet = sheet_(SHEET_SETTINGS);
  var labels = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < labels.length; i++) {
    if (String(labels[i][0]).trim() === label) { sheet.getRange(i + 1, 2).setValue(value); return; }
  }
}

function buildForm_(settings) {
  var clinic = settings.clinicName || 'our clinic';
  var form = FormApp.create('New patient intake: ' + clinic);
  form.setDescription('Welcome to ' + clinic + '. This form takes about 5 minutes. ' +
    'Please do not include medical history here; your care team will ask about that at your visit.');
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setPublishingSummary(false);
  form.setShowLinkToRespondAgain(false);
  form.setProgressBar(true);
  form.setConfirmationMessage('Thank you. ' + clinic + ' has received your information. ' +
    'Please bring your insurance card and a photo ID to your first visit.');

  // Patients are outside the clinic's domain, so the form must stay open to them.
  // Trying the domain restriction is only a test of whether this is a Workspace account.
  try { form.setRequireLogin(true); form.setRequireLogin(false); props_().setProperty(PROP_WORKSPACE, 'yes'); }
  catch (e) { props_().setProperty(PROP_WORKSPACE, 'no'); }

  var phoneRule = FormApp.createTextValidation().setHelpText('Enter a 10-digit US phone number')
    .requireTextMatchesPattern('^\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}$').build();
  var zipRule = FormApp.createTextValidation().setHelpText('Enter a 5-digit ZIP code')
    .requireTextMatchesPattern('^\\d{5}(-\\d{4})?$').build();
  var emailRule = FormApp.createTextValidation().setHelpText('Enter a valid email address').requireTextIsEmail().build();

  var current = '';
  FIELDS.forEach(function (f) {
    if (f.section !== current) {
      current = f.section;
      var header = current === SECTIONS[0] ? form.addSectionHeaderItem() : form.addPageBreakItem();
      header.setTitle(current);
      if (current === 'Consents') {
        var links = [];
        if (settings.nppLink) links.push('Notice of Privacy Practices: ' + settings.nppLink);
        if (settings.financialLink) links.push('Financial policy: ' + settings.financialLink);
        header.setHelpText(links.length ? links.join('\n') : 'Ask the front desk for copies of our policies.');
      }
    }
    var item;
    if (f.type === 'date') item = form.addDateItem();
    else if (f.type === 'list') item = form.addListItem().setChoiceValues(f.options);
    else if (f.type === 'choice') item = form.addMultipleChoiceItem().setChoiceValues(f.options);
    else if (f.type === 'agree') item = form.addCheckboxItem().setChoiceValues([AGREE]);
    else {
      item = form.addTextItem();
      if (f.type === 'phone') item.setValidation(phoneRule);
      if (f.type === 'zip') item.setValidation(zipRule);
      if (f.type === 'email') item.setValidation(emailRule);
    }
    item.setTitle(f.title).setRequired(!!f.required);
    if (f.help) item.setHelpText(f.help);
  });
  return form;
}

function ensureChecklist_() {
  var ss = ss_();
  var sheet = ss.getSheetByName(SHEET_CHECKLIST) || ss.insertSheet(SHEET_CHECKLIST, 0);
  sheet.getRange(1, 1, 1, CHECKLIST_COLUMNS.length).setValues([CHECKLIST_COLUMNS])
    .setFontWeight('bold').setBackground('#e8ecee');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  var rows = sheet.getMaxRows() - 1;
  CHECK_ITEMS.forEach(function (name) {
    sheet.getRange(2, CHECKLIST_COLUMNS.indexOf(name) + 1, rows, 1).insertCheckboxes();
  });
  var statusCol = CHECKLIST_COLUMNS.indexOf('Status') + 1;
  var letter = String.fromCharCode(64 + statusCol);
  var all = sheet.getRange(2, 1, rows, CHECKLIST_COLUMNS.length);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + letter + '2="Complete"')
      .setBackground('#dcefe2').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=LEFT($' + letter + '2,8)="Waiting:"')
      .setBackground('#f8ecd2').setRanges([all]).build()
  ]);
  sheet.getRange(1, CHECKLIST_COLUMNS.indexOf('Notes') + 1).setNote('Workflow notes only. No clinical details.');
  sheet.setColumnWidth(CHECKLIST_COLUMNS.indexOf('Status') + 1, 260);
  sheet.setColumnWidth(CHECKLIST_COLUMNS.indexOf('Flags') + 1, 300);
}

/* ---------- processing a submission ---------- */

function onIntakeSubmit(e) {
  var sheet = e && e.range ? e.range.getSheet() : sheet_(SHEET_RESPONSES);
  if (sheet.getName() !== SHEET_RESPONSES) return;
  processIntake_(sheet, e && e.range ? e.range.getRow() : sheet.getLastRow());
}

function processIntake_(responses, rowNumber) {
  var headers = headers_(responses);
  var row = responses.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  var idCol = headers.indexOf(RESPONSE_ID_COLUMN);
  if (idCol !== -1 && row[idCol]) return; // already processed

  var rec = rowToRecord(headers, row);
  rec.dob = toKey_(rec.dob);
  rec.subscriberDob = toKey_(rec.subscriberDob);
  var tsCol = headers.indexOf('Timestamp');
  var submittedKey = toKey_(tsCol === -1 ? new Date() : row[tsCol]) || todayKey_();

  var checklist = sheet_(SHEET_CHECKLIST);
  var existing = checklist.getLastRow() < 2 ? [] : checklist.getRange(2, 1, checklist.getLastRow() - 1, 1).getValues()
    .map(function (r) { return r[0]; });
  var intakeId = nextIntakeId(existing);

  var summary = buildSummary(rec, intakeId, submittedKey, todayKey_());
  var docUrl = writeSummaryDoc_(summary);

  var selfPay = isSelfPay(rec);
  var checks = {};
  var out = CHECKLIST_COLUMNS.map(function (name) {
    if (name === 'Intake ID') return intakeId;
    if (name === 'Submitted') return new Date(submittedKey + 'T12:00:00');
    if (name === 'Patient') return patientLabel(rec);
    if (name === 'Summary doc') return '=HYPERLINK("' + docUrl + '","Open summary")';
    if (name === 'Self-pay') return selfPay ? 'Yes' : 'No';
    if (CHECK_ITEMS.indexOf(name) !== -1) return false;
    if (name === 'Status') return checklistStatus(checks, selfPay);
    if (name === 'Flags') return summary.flags.join('; ');
    return '';
  });
  var target = checklist.getLastRow() + 1;
  checklist.getRange(target, 1, 1, out.length).setValues([out]);
  checklist.getRange(target, CHECKLIST_COLUMNS.indexOf('Submitted') + 1).setNumberFormat('yyyy-mm-dd');

  if (idCol !== -1) responses.getRange(rowNumber, idCol + 1).setValue(intakeId);
}

function writeSummaryDoc_(summary) {
  var doc = DocumentApp.create(summary.docName);
  var body = doc.getBody();
  body.appendParagraph(summary.title).setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph(summary.subtitle).setItalic(true);
  if (summary.flags.length) {
    body.appendParagraph('Check before EHR entry').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    summary.flags.forEach(function (f) { body.appendListItem(f); });
  }
  summary.sections.forEach(function (section) {
    body.appendParagraph(section.heading).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    var table = body.appendTable(section.rows.map(function (r) { return [r[0], r[1] || '']; }));
    for (var i = 0; i < table.getNumRows(); i++) {
      table.getRow(i).getCell(0).setWidth(170).editAsText().setBold(true);
    }
  });
  var first = body.getChild(0);
  if (first.getType() === DocumentApp.ElementType.PARAGRAPH && first.asParagraph().getText() === '') first.removeFromParent();
  doc.saveAndClose();

  var file = DriveApp.getFileById(doc.getId());
  file.moveTo(folder_());
  return doc.getUrl();
}

/* ---------- checklist ---------- */

function updateStatusRow_(sheet, rowNumber) {
  var row = sheet.getRange(rowNumber, 1, 1, CHECKLIST_COLUMNS.length).getValues()[0];
  if (!row[0]) return;
  var checks = {};
  CHECK_ITEMS.forEach(function (name) { checks[name] = row[CHECKLIST_COLUMNS.indexOf(name)] === true; });
  var selfPay = row[CHECKLIST_COLUMNS.indexOf('Self-pay')] === 'Yes';
  sheet.getRange(rowNumber, CHECKLIST_COLUMNS.indexOf('Status') + 1).setValue(checklistStatus(checks, selfPay));
}

function refreshChecklist() {
  var sheet = sheet_(SHEET_CHECKLIST);
  for (var r = 2; r <= sheet.getLastRow(); r++) updateStatusRow_(sheet, r);
  tell_('Checklist refreshed.');
}

/* ---------- clean-up ---------- */

function cleanUpCompleted() {
  var settings = getSettings_();
  var keepDays = Number(settings.keepDays) >= 0 ? Number(settings.keepDays) : 30;
  var checklist = sheet_(SHEET_CHECKLIST);
  var last = checklist.getLastRow();
  if (last < 2) { tell_('No intakes yet.'); return; }

  var range = checklist.getRange(2, 1, last - 1, CHECKLIST_COLUMNS.length);
  var values = range.getValues(), formulas = range.getFormulas();
  var c = function (name) { return CHECKLIST_COLUMNS.indexOf(name); };
  var today = todayKey_();
  var due = [];
  values.forEach(function (r, i) {
    var docCell = formulas[i][c('Summary doc')];
    if (!docCell) return; // already cleaned
    if (readyForCleanup(r[c('Entered in EHR')], toKey_(r[c('Submitted')]), today, keepDays)) due.push(i);
  });
  if (!due.length) { tell_('Nothing to clean up. Intakes are cleaned ' + keepDays + ' days after they are marked "Entered in EHR".'); return; }

  var ui = ui_();
  if (ui) {
    var answer = ui.alert('Clean up ' + due.length + ' intake(s)?',
      'This moves their summary docs to the trash and clears their answers from the Intake Responses tab. ' +
      'Only do this once the information is in the EHR.', ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return;
  }

  var responses = sheet_(SHEET_RESPONSES);
  var rHeaders = headers_(responses);
  var idCol = rHeaders.indexOf(RESPONSE_ID_COLUMN), tsCol = rHeaders.indexOf('Timestamp');
  var rValues = responses.getLastRow() < 2 ? [] : responses.getRange(2, 1, responses.getLastRow() - 1, rHeaders.length).getValues();

  due.forEach(function (i) {
    var id = values[i][c('Intake ID')];
    var m = /\/d\/([\w-]+)/.exec(formulas[i][c('Summary doc')]);
    if (m) { try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) { console.log(e); } }
    checklist.getRange(i + 2, c('Summary doc') + 1).setValue('Deleted ' + today);

    for (var r = 0; r < rValues.length; r++) {
      if (idCol !== -1 && rValues[r][idCol] === id) {
        var cleared = rValues[r].map(function (v, k) { return k === idCol || k === tsCol ? v : ''; });
        responses.getRange(r + 2, 1, 1, cleared.length).setValues([cleared]);
      }
    }
  });
  tell_('Cleaned up ' + due.length + ' intake(s). Google Forms keeps its own copy of responses: ' +
    'open the form > Responses > delete them there too, once all of them are in the EHR.');
}

/* ---------- other menu actions ---------- */

function showFormLink() {
  var form = form_();
  if (!form) { tell_('No form yet. Run Intake Tools > Set up first.'); return; }
  var note = props_().getProperty(PROP_WORKSPACE) === 'no' ? '\n\nDemo account: do not send this link to real patients.' : '';
  tell_('Patient intake form:\n' + form.getPublishedUrl() + '\n\nEdit the form:\n' + form.getEditUrl() + note);
}

function fillSampleIntakes() {
  var responses = sheet_(SHEET_RESPONSES);
  var headers = headers_(responses);
  var samples = sampleIntakes();
  var start = responses.getLastRow() + 1;
  var rows = samples.map(function (rec) {
    return headers.map(function (h) {
      if (h === 'Timestamp') return new Date();
      if (h === RESPONSE_ID_COLUMN) return '';
      for (var k = 0; k < FIELDS.length; k++) {
        var f = FIELDS[k];
        if (f.title === h) return f.type === 'date' && rec[f.key] ? new Date(rec[f.key] + 'T12:00:00') : rec[f.key];
      }
      return '';
    });
  });
  responses.getRange(start, 1, rows.length, headers.length).setValues(rows);
  for (var r = start; r < start + rows.length; r++) processIntake_(responses, r);
  tell_('Added ' + rows.length + ' made-up patients (all surnamed "Test") with summary docs in the restricted folder.');
}
