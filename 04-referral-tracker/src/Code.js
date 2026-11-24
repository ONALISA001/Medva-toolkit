/**
 * Referral Tracker: the Google Sheets side.
 * Same structure as the Prior Authorization Tracker (Tool 3).
 * Flag rules, the digest layout and sample data live in Logic.js.
 */

var SHEET_REQ = 'Referrals';
var SHEET_LOG = 'Follow-up Log';
var SHEET_SETTINGS = 'Settings';
var DIGEST_HANDLER = 'sendDigestScheduled';
var OVERDUE_COLOR = '#f7dfdc';
var SOON_COLOR = '#f8ecd2';

var SETTING_LABELS = {
  clinicName: 'Clinic name',
  digestEmail: 'Digest email',
  digestHour: 'Send digest at hour (0-23)',
  sendWhenEmpty: 'Send when nothing is flagged',
  bookingDays: 'Flag routine referrals not booked after (days)',
  urgentDays: 'Flag urgent referrals not booked after (days)',
  reportDays: 'Flag missing consult report after visit (days)',
  payerExpiryWarnDays: 'Warn before payer referral expires (days)',
  lastDigest: 'Last digest'
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Referral Tools')
    .addItem('Refresh flags', 'refreshFlags')
    .addItem('Send digest now', 'sendDigest')
    .addSeparator()
    .addItem('Set up sheets', 'setupSheets')
    .addItem('Fill sample data (demo)', 'fillSampleData')
    .addSeparator()
    .addItem('Turn on daily digest', 'installDailyTrigger')
    .addItem('Turn off daily digest', 'removeDailyTrigger')
    .addToUi();
}

/** Simple trigger: keeps flags current as people type. */
function onEdit(e) {
  if (!e || !e.range) return;
  var name = e.range.getSheet().getName();
  if (name === SHEET_REQ || name === SHEET_LOG) {
    try { refreshFlags_(); } catch (err) { console.log(err); }
  }
}

/* ---------- helpers ---------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return ss_().getSpreadsheetTimeZone(); }
function todayKey_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function ui_() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }
function tell_(m) { var ui = ui_(); if (ui) ui.alert(m); else console.log(m); }

function sheet_(name) {
  var s = ss_().getSheetByName(name);
  if (!s) throw new Error('The "' + name + '" tab is missing. Run Referral Tools > Set up sheets.');
  return s;
}

function toKey_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var t = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
}

function getSettings_() {
  var sheet = sheet_(SHEET_SETTINGS);
  var values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getValues();
  var byLabel = {};
  values.forEach(function (r) { byLabel[String(r[0]).trim()] = r[1]; });
  var s = {};
  Object.keys(SETTING_LABELS).forEach(function (k) { s[k] = byLabel[SETTING_LABELS[k]]; });
  s.digestEmail = String(s.digestEmail || '').trim();
  s.digestHour = Number(s.digestHour);
  s.sendWhenEmpty = /^y/i.test(String(s.sendWhenEmpty || ''));
  return s;
}

function setLastDigest_(text) {
  var sheet = sheet_(SHEET_SETTINGS);
  var labels = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < labels.length; i++) {
    if (String(labels[i][0]).trim() === SETTING_LABELS.lastDigest) {
      sheet.getRange(i + 1, 2).setValue(text + ' (' + Utilities.formatDate(new Date(), tz_(), 'MMM d, HH:mm') + ')');
      return;
    }
  }
}

/* ---------- flags ---------- */

/** Fills Case IDs, Last follow-up and Flag. Returns flagged items for the digest (no account numbers). */
function refreshFlags_() {
  var req = sheet_(SHEET_REQ);
  var settings = getSettings_();
  var today = todayKey_();
  var last = req.getLastRow();
  if (last < 2) return [];

  var headers = req.getRange(1, 1, 1, REQ_COLUMNS.length).getValues()[0].map(String);
  var col = function (name) { return headers.indexOf(name); };
  var values = req.getRange(2, 1, last - 1, REQ_COLUMNS.length).getValues();

  var log = sheet_(SHEET_LOG);
  var logRows = log.getLastRow() < 2 ? [] : log.getRange(2, 1, log.getLastRow() - 1, 2).getValues()
    .map(function (r) { return { dateKey: toKey_(r[0]), caseId: r[1] }; });
  var latest = lastFollowUps(logRows);

  var ids = values.map(function (r) { return r[col('Case ID')]; });
  var items = [], idCells = [], followCells = [], flagCells = [];

  values.forEach(function (r) {
    var hasData = r.some(function (v, k) { return k !== col('Flag') && k !== col('Case ID') && v !== '' && v !== null; });
    var id = String(r[col('Case ID')] || '').trim();
    if (hasData && !id) { id = nextCaseId(ids); ids.push(id); }
    var follow = latest[id.toUpperCase()] || '';

    var rec = {};
    REQ_COLUMNS.forEach(function (name) {
      var v = r[col(name)];
      rec[name] = DATE_COLUMNS.indexOf(name) !== -1 ? toKey_(v) : v;
    });
    rec['Last follow-up'] = follow;

    var result = hasData ? computeFlag(rec, today, settings) : { severity: '', reason: '' };
    idCells.push([id]);
    followCells.push([follow ? new Date(follow + 'T12:00:00') : '']);
    flagCells.push([flagText(result)]);
    if (result.severity) {
      items.push({ caseId: id, specialty: rec['Specialty'], specialist: rec['Specialist / practice'],
        severity: result.severity, reason: result.reason });
    }
  });

  req.getRange(2, col('Case ID') + 1, idCells.length, 1).setValues(idCells);
  req.getRange(2, col('Last follow-up') + 1, followCells.length, 1).setValues(followCells);
  req.getRange(2, col('Flag') + 1, flagCells.length, 1).setValues(flagCells);
  return items;
}

function refreshFlags() {
  var items = refreshFlags_();
  var overdue = items.filter(function (i) { return i.severity === 'overdue'; }).length;
  tell_('Flags refreshed: ' + overdue + ' overdue, ' + (items.length - overdue) + ' due soon.');
}

/* ---------- digest ---------- */

function sendDigest() {
  var settings = getSettings_();
  if (!isValidSingleEmail(settings.digestEmail)) {
    var msg = 'Held: "Digest email" in Settings must be one valid email address.';
    setLastDigest_(msg); tell_(msg); return;
  }
  var items = refreshFlags_();
  if (!items.length && !settings.sendWhenEmpty) {
    setLastDigest_('Skipped: nothing flagged');
    tell_('Nothing is overdue or due soon, so no digest was sent.');
    return;
  }
  var digest = buildDigest(items, settings.clinicName, Utilities.formatDate(new Date(), tz_(), 'EEEE, MMM d'));
  MailApp.sendEmail({ to: settings.digestEmail, subject: digest.subject, htmlBody: digest.html, name: 'Referral Tracker' });
  setLastDigest_('Sent to ' + settings.digestEmail + ': ' + digest.overdue + ' overdue, ' + digest.soon + ' soon');
  tell_('Digest sent to ' + settings.digestEmail + '.');
}

function sendDigestScheduled() {
  var weekday = Number(Utilities.formatDate(new Date(), tz_(), 'u'));
  if (weekday >= 6) return;
  sendDigest();
}

function installDailyTrigger() {
  var s = getSettings_();
  if (!(s.digestHour >= 0 && s.digestHour <= 23)) { tell_('Set the digest hour (0-23) in Settings first.'); return; }
  if (!isValidSingleEmail(s.digestEmail)) { tell_('Set one valid Digest email in Settings first.'); return; }
  removeTriggers_();
  ScriptApp.newTrigger(DIGEST_HANDLER).timeBased().everyDays(1).atHour(s.digestHour).create();
  tell_('Daily digest is on, weekdays around ' + s.digestHour + ':00 (' + tz_() + ').');
}

function removeDailyTrigger() {
  tell_(removeTriggers_() ? 'Daily digest is off.' : 'Daily digest was not on.');
}

function removeTriggers_() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === DIGEST_HANDLER) { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

/* ---------- setup ---------- */

function listRule_(list) {
  return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
}
function dateRule_() {
  return SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build();
}

function setupSheets() {
  var ss = ss_();

  var req = ss.getSheetByName(SHEET_REQ) || ss.insertSheet(SHEET_REQ, 0);
  req.getRange(1, 1, 1, REQ_COLUMNS.length).setValues([REQ_COLUMNS]).setFontWeight('bold').setBackground('#e8ecee');
  req.setFrozenRows(1);
  req.setFrozenColumns(1);
  var c = function (name) { return REQ_COLUMNS.indexOf(name) + 1; };
  var rows = req.getMaxRows() - 1;
  req.getRange(2, c('Specialty'), rows, 1).setDataValidation(listRule_(SPECIALTIES));
  req.getRange(2, c('Urgency'), rows, 1).setDataValidation(listRule_(URGENCIES));
  req.getRange(2, c('Appointment booked'), rows, 1).setDataValidation(listRule_(YES_NO));
  req.getRange(2, c('Report received'), rows, 1).setDataValidation(listRule_(YES_NO));
  req.getRange(2, c('Status'), rows, 1).setDataValidation(listRule_(STATUSES));
  DATE_COLUMNS.forEach(function (name) {
    req.getRange(2, c(name), rows, 1).setNumberFormat('yyyy-mm-dd');
    if (name !== 'Last follow-up') req.getRange(2, c(name), rows, 1).setDataValidation(dateRule_());
  });
  ['Case ID', 'Last follow-up', 'Flag'].forEach(function (name) {
    req.getRange(1, c(name)).setNote('Filled in by the script. Edits here are overwritten.');
    req.getRange(2, c(name), rows, 1).setFontColor('#5a6a73');
  });
  req.getRange(1, c('Patient account #')).setNote('EHR account number only. No names or dates of birth.');
  req.getRange(1, c('Notes')).setNote('Workflow notes only. No diagnoses or clinical details.');
  req.setColumnWidth(c('Specialist / practice'), 220);
  req.setColumnWidth(c('Flag'), 320);
  req.setColumnWidth(c('Notes'), 260);

  var flagCol = String.fromCharCode(64 + c('Flag'));
  var all = req.getRange(2, 1, rows, REQ_COLUMNS.length);
  req.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=LEFT($' + flagCol + '2,8)="Overdue:"')
      .setBackground(OVERDUE_COLOR).setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=LEFT($' + flagCol + '2,5)="Soon:"')
      .setBackground(SOON_COLOR).setRanges([all]).build()
  ]);

  var log = ss.getSheetByName(SHEET_LOG) || ss.insertSheet(SHEET_LOG, 1);
  log.getRange(1, 1, 1, LOG_COLUMNS.length).setValues([LOG_COLUMNS]).setFontWeight('bold').setBackground('#e8ecee');
  log.setFrozenRows(1);
  var logRows = log.getMaxRows() - 1;
  log.getRange(2, 1, logRows, 1).setNumberFormat('yyyy-mm-dd').setDataValidation(dateRule_());
  log.getRange(2, 3, logRows, 1).setDataValidation(listRule_(CONTACTS));
  log.getRange(1, 4).setNote('Office staff first name or role. If you spoke with the patient, write "Patient", not their name.');
  log.getRange(1, 6).setNote('What happened. No diagnoses or clinical details.');
  log.setColumnWidth(6, 280); log.setColumnWidth(7, 220);

  var set = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  if (set.getLastRow() === 0) {
    set.getRange(1, 1, 10, 2).setValues([
      ['Setting', 'Value'],
      [SETTING_LABELS.clinicName, 'Riverside Family Medicine'],
      [SETTING_LABELS.digestEmail, ''],
      [SETTING_LABELS.digestHour, 8],
      [SETTING_LABELS.sendWhenEmpty, 'No'],
      [SETTING_LABELS.bookingDays, DEFAULTS.bookingDays],
      [SETTING_LABELS.urgentDays, DEFAULTS.urgentDays],
      [SETTING_LABELS.reportDays, DEFAULTS.reportDays],
      [SETTING_LABELS.payerExpiryWarnDays, DEFAULTS.payerExpiryWarnDays],
      [SETTING_LABELS.lastDigest, '']
    ]);
    set.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#e8ecee');
    set.getRange('B5').setDataValidation(listRule_(['Yes', 'No']));
    set.setColumnWidth(1, 320); set.setColumnWidth(2, 300);
  }

  ss.setActiveSheet(req);
  tell_('Sheets are ready. Add the Digest email in Settings, then start logging referrals.');
}

function fillSampleData() {
  var req = sheet_(SHEET_REQ);
  var log = sheet_(SHEET_LOG);
  var today = todayKey_();
  var asDate = function (key) { return key ? new Date(key + 'T12:00:00') : ''; };

  var existing = req.getLastRow() < 2 ? [] : req.getRange(2, 1, req.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; });
  var samples = sampleReferrals(today);
  var ids = samples.map(function () { var id = nextCaseId(existing); existing.push(id); return id; });

  var rows = samples.map(function (s, i) {
    return REQ_COLUMNS.map(function (name) {
      if (name === 'Case ID') return ids[i];
      if (name === 'Last follow-up' || name === 'Flag') return '';
      return DATE_COLUMNS.indexOf(name) !== -1 ? asDate(s[name]) : s[name];
    });
  });
  req.getRange(req.getLastRow() + 1, 1, rows.length, REQ_COLUMNS.length).setValues(rows);

  var logRows = sampleLog(today).map(function (l) {
    return LOG_COLUMNS.map(function (name) {
      if (name === 'Case ID') return ids[l.caseIndex];
      return name === 'Date' ? asDate(l[name]) : l[name];
    });
  });
  log.getRange(log.getLastRow() + 1, 1, logRows.length, LOG_COLUMNS.length).setValues(logRows);

  refreshFlags_();
  tell_('Added ' + rows.length + ' made-up referrals (accounts TEST-4001 to TEST-4012) and ' +
    logRows.length + ' follow-up log entries.');
}
