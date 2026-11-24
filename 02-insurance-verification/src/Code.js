/**
 * Insurance Verification Toolkit: the Google Sheets and Forms side.
 * Rules, form questions and the call script live in Logic.js.
 */

var SHEET_RESULTS = 'Verifications';
var SHEET_SCRIPT = 'Call Script';
var PROP_FORM_ID = 'verificationFormId';
var SUBMIT_HANDLER = 'onVerificationSubmit';
var STATUS_COLORS = {
  'Problem': '#f7dfdc',
  'Missing info': '#f8ecd2',
  'Action needed': '#e0e6f4',
  'Ready': '#dcefe2'
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Verification Tools')
    .addItem('Set up', 'setup')
    .addItem('Refresh status for all rows', 'refreshAllStatuses')
    .addItem('Show form link', 'showFormLink')
    .addSeparator()
    .addItem('Fill sample verifications (demo)', 'fillSampleVerifications')
    .addToUi();
}

/* ---------- helpers ---------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function props_() { return PropertiesService.getDocumentProperties(); }

function ui_() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}
function tell_(message) {
  var ui = ui_();
  if (ui) ui.alert(message); else console.log(message);
}

function form_() {
  var id = props_().getProperty(PROP_FORM_ID);
  if (!id) return null;
  try { return FormApp.openById(id); } catch (e) { return null; }
}

function results_() {
  var sheet = ss_().getSheetByName(SHEET_RESULTS);
  if (!sheet) throw new Error('The Verifications tab is missing. Run Verification Tools > Set up.');
  return sheet;
}

function headers_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (!lastCol) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
}

/** Makes sure the four status columns exist after the form's columns. Returns the headers. */
function ensureStatusColumns_(sheet) {
  var headers = headers_(sheet);
  STATUS_COLUMNS.forEach(function (name) {
    if (headers.indexOf(name) === -1) {
      var col = headers.length + 1;
      sheet.getRange(1, col).setValue(name).setFontWeight('bold').setBackground('#e8ecee');
      headers.push(name);
    }
  });
  return headers;
}

/* ---------- status ---------- */

function writeStatus_(sheet, headers, rowNumber) {
  var row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  var isEmpty = FIELDS.every(function (f) {
    var i = headers.indexOf(f.title);
    return i === -1 || row[i] === '' || row[i] === null;
  });
  if (isEmpty) return;
  var cells = statusCells(checkVerification(rowToRecord(headers, row)));
  var first = headers.indexOf(STATUS_COLUMNS[0]) + 1;
  sheet.getRange(rowNumber, first, 1, cells.length).setValues([cells]);
}

/** Runs on every form submission (installable trigger). */
function onVerificationSubmit(e) {
  var sheet = e && e.range ? e.range.getSheet() : results_();
  if (sheet.getName() !== SHEET_RESULTS) return;
  var headers = ensureStatusColumns_(sheet);
  writeStatus_(sheet, headers, e && e.range ? e.range.getRow() : sheet.getLastRow());
}

function refreshAllStatuses() {
  var sheet = results_();
  var headers = ensureStatusColumns_(sheet);
  for (var r = 2; r <= sheet.getLastRow(); r++) writeStatus_(sheet, headers, r);
  applyStatusColors_(sheet, headers);
  tell_('Status refreshed for ' + Math.max(0, sheet.getLastRow() - 1) + ' row(s).');
}

function applyStatusColors_(sheet, headers) {
  var col = headers.indexOf(STATUS_COLUMNS[0]) + 1;
  var range = sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1);
  var keep = sheet.getConditionalFormatRules().filter(function (rule) {
    return !rule.getRanges().some(function (r) { return r.getColumn() === col; });
  });
  Object.keys(STATUS_COLORS).forEach(function (label) {
    keep.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(label).setBackground(STATUS_COLORS[label]).setRanges([range]).build());
  });
  sheet.setConditionalFormatRules(keep);
}

/* ---------- setup ---------- */

function buildForm_() {
  var form = FormApp.create('Insurance verification: ' + ss_().getName());
  form.setDescription('One response per verification. Use the EHR account number only: ' +
    'no patient names, dates of birth or member IDs. Results go to the clinic\'s verification sheet.');
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setPublishingSummary(false);
  form.setShowLinkToRespondAgain(true);
  form.setConfirmationMessage('Saved. Submit another verification below.');
  try {
    form.setRequireLogin(true);
    props_().setProperty('formRestricted', 'yes');
  } catch (e) {
    // Only Google Workspace accounts can restrict a form to their domain.
    props_().setProperty('formRestricted', 'no');
    console.log('Could not restrict the form to the clinic domain: ' + e.message);
  }

  FIELDS.forEach(function (f) {
    var item;
    if (f.type === 'date') item = form.addDateItem();
    else if (f.type === 'list') item = form.addListItem().setChoiceValues(f.options);
    else if (f.type === 'choice') item = form.addMultipleChoiceItem().setChoiceValues(f.options);
    else if (f.type === 'paragraph') item = form.addParagraphTextItem();
    else {
      item = form.addTextItem();
      if (f.type === 'money') {
        item.setValidation(FormApp.createTextValidation()
          .setHelpText('Enter a number, e.g. 30 or 1500').requireNumberGreaterThanOrEqualTo(0).build());
      } else if (f.type === 'percent') {
        item.setValidation(FormApp.createTextValidation()
          .setHelpText('Enter a number from 0 to 100').requireNumberBetween(0, 100).build());
      }
    }
    item.setTitle(f.title).setRequired(!!f.required);
    if (f.help) item.setHelpText(f.help);
  });
  return form;
}

function setup() {
  var ss = ss_();
  var form = form_();
  var created = false;

  if (!form) {
    var before = ss.getSheets().map(function (s) { return s.getSheetId(); });
    form = buildForm_();
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    SpreadsheetApp.flush();
    props_().setProperty(PROP_FORM_ID, form.getId());
    var linked = ss.getSheets().filter(function (s) { return before.indexOf(s.getSheetId()) === -1; })[0];
    if (linked && !ss.getSheetByName(SHEET_RESULTS)) linked.setName(SHEET_RESULTS);
    created = true;
  }

  var sheet = results_();
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
  var headers = ensureStatusColumns_(sheet);
  applyStatusColors_(sheet, headers);

  buildCallScriptTab_();

  var hasTrigger = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === SUBMIT_HANDLER;
  });
  if (!hasTrigger) ScriptApp.newTrigger(SUBMIT_HANDLER).forSpreadsheet(ss).onFormSubmit().create();

  ss.setActiveSheet(sheet);
  var warning = props_().getProperty('formRestricted') === 'no'
    ? '\n\nWARNING: this account could not limit the form to a clinic domain, so anyone with the link can submit. ' +
      'Use it for demos with made-up data only. For real patients, run Set up from the clinic\'s Google Workspace account.'
    : '';
  tell_((created ? 'Form created and linked. ' : 'Already set up; checked columns and trigger. ') +
    'Use Verification Tools > Show form link to open it.' + warning);
}

function buildCallScriptTab_() {
  var ss = ss_();
  var sheet = ss.getSheetByName(SHEET_SCRIPT) || ss.insertSheet(SHEET_SCRIPT);
  sheet.clear();
  var rows = buildCallScript();
  sheet.getRange(1, 1).setValue('Payer verification call script').setFontSize(14).setFontWeight('bold');
  sheet.getRange(2, 1).setValue('Print this tab (File > Print). Enter the answers in the verification form afterwards.')
    .setFontColor('#5a6a73');
  sheet.getRange(4, 1, 1, 3).setValues([['Section', 'Ask or check', 'Answer']])
    .setFontWeight('bold').setBackground('#e8ecee');
  sheet.getRange(5, 1, rows.length, 3).setValues(rows).setVerticalAlignment('top').setWrap(true);
  sheet.getRange(5, 1, rows.length, 1).setFontWeight('bold');
  sheet.setColumnWidth(1, 170); sheet.setColumnWidth(2, 460); sheet.setColumnWidth(3, 220);
  sheet.setFrozenRows(4);
}

/* ---------- other menu actions ---------- */

function showFormLink() {
  var form = form_();
  if (!form) { tell_('No form yet. Run Verification Tools > Set up first.'); return; }
  tell_('Verification form:\n' + form.getPublishedUrl() + '\n\nEdit the form:\n' + form.getEditUrl());
}

function fillSampleVerifications() {
  var sheet = results_();
  var headers = ensureStatusColumns_(sheet);
  var today = new Date();
  var out = sampleVerifications().map(function (rec, i) {
    var appt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2 + (i % 3));
    rec.apptDate = appt;
    return headers.map(function (h) {
      if (h === 'Timestamp') return new Date();
      for (var k = 0; k < FIELDS.length; k++) if (FIELDS[k].title === h) return rec[FIELDS[k].key];
      return '';
    });
  });
  var start = sheet.getLastRow() + 1;
  sheet.getRange(start, 1, out.length, headers.length).setValues(out);
  for (var r = start; r < start + out.length; r++) writeStatus_(sheet, headers, r);
  applyStatusColors_(sheet, headers);
  tell_('Added ' + out.length + ' made-up verifications (accounts TEST-1001 to TEST-1008), one for each status.');
}
