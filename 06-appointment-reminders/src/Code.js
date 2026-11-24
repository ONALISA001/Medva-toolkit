/**
 * Appointment Reminder and No-Show Reducer: the Google Sheets and email side.
 * Rules, message wording and the weekly report live in Logic.js.
 */

var SHEET_APPTS = 'Appointments';
var SHEET_REPORT = 'Weekly Report';
var SHEET_SETTINGS = 'Settings';
var DAILY_HANDLER = 'runRemindersScheduled';
var WEEKLY_HANDLER = 'sendWeeklyReportScheduled';

var SETTING_LABELS = {
  clinicName: 'Clinic name',
  clinicPhone: 'Clinic phone (shown in reminders)',
  sendHour: 'Send reminders at hour (0-23)',
  rebookOn: 'Send rebook email after a no-show',
  reportEmail: 'Weekly report email',
  testTo: 'Test mode: send all emails to',
  lastRun: 'Last run'
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Reminder Tools')
    .addItem("Preview tomorrow's reminders", 'previewReminders')
    .addItem('Run reminders now', 'runReminders')
    .addSeparator()
    .addItem('Refresh weekly report', 'refreshWeeklyReport')
    .addItem('Send weekly report now', 'sendWeeklyReport')
    .addSeparator()
    .addItem('Set up sheets', 'setupSheets')
    .addItem('Fill sample appointments (demo)', 'fillSampleAppointments')
    .addSeparator()
    .addItem('Turn on daily reminders', 'installTriggers')
    .addItem('Turn off daily reminders', 'removeTriggers')
    .addToUi();
}

/** Simple trigger: refresh flags when staff edit appointments. */
function onEdit(e) {
  if (!e || !e.range || e.range.getSheet().getName() !== SHEET_APPTS) return;
  try { refreshFlags_(); } catch (err) { console.log(err); }
}

/* ---------- helpers ---------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return ss_().getSpreadsheetTimeZone(); }
function todayKey_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function ui_() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }
function tell_(m) { var ui = ui_(); if (ui) ui.alert(m); else console.log(m); }
function stamp_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'); }

function sheet_(name) {
  var s = ss_().getSheetByName(name);
  if (!s) throw new Error('The "' + name + '" tab is missing. Run Reminder Tools > Set up sheets.');
  return s;
}

function toKey_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var t = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
}
function toTime_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz_(), 'h:mm a');
  return String(v || '').trim();
}

function getSettings_() {
  var sheet = sheet_(SHEET_SETTINGS);
  var values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getValues();
  var byLabel = {};
  values.forEach(function (r) { byLabel[String(r[0]).trim()] = r[1]; });
  var s = {};
  Object.keys(SETTING_LABELS).forEach(function (k) { s[k] = byLabel[SETTING_LABELS[k]]; });
  s.sendHour = Number(s.sendHour);
  s.rebookOn = /^y/i.test(String(s.rebookOn || ''));
  s.testTo = String(s.testTo || '').trim();
  s.reportEmail = String(s.reportEmail || '').trim();
  return s;
}

function setSetting_(label, value) {
  var sheet = sheet_(SHEET_SETTINGS);
  var labels = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < labels.length; i++) {
    if (String(labels[i][0]).trim() === label) { sheet.getRange(i + 1, 2).setValue(value); return; }
  }
}

function senderEmail_() {
  try { return Session.getEffectiveUser().getEmail() || ''; } catch (e) { return ''; }
}
function isPersonalAccount_(email) {
  return /@(gmail|googlemail)\.com$/i.test(email);
}

/** Reads every appointment row as {rowNumber, rec} with dates as keys and times as text. */
function readAppts_() {
  var sheet = sheet_(SHEET_APPTS);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, APPT_COLUMNS.length).getValues();
  var out = [];
  values.forEach(function (r, i) {
    var rec = {};
    APPT_COLUMNS.forEach(function (name, k) { rec[name] = r[k]; });
    var hasData = APPT_COLUMNS.some(function (name, k) {
      return ['Appt ID', 'Flag'].indexOf(name) === -1 && r[k] !== '' && r[k] !== null;
    });
    if (!hasData) return;
    rec['Date'] = toKey_(rec['Date']);
    rec['Time'] = toTime_(rec['Time']);
    out.push({ rowNumber: i + 2, rec: rec });
  });
  return out;
}

function setCell_(rowNumber, column, value) {
  sheet_(SHEET_APPTS).getRange(rowNumber, APPT_COLUMNS.indexOf(column) + 1).setValue(value);
}

/* ---------- flags and IDs ---------- */

function refreshFlags_() {
  var sheet = sheet_(SHEET_APPTS);
  var rows = readAppts_();
  if (!rows.length) return;
  var settings = getSettings_();
  var today = todayKey_();
  var ids = rows.map(function (r) { return r.rec['Appt ID']; });
  rows.forEach(function (r) {
    if (!r.rec['Appt ID']) {
      var id = nextApptId(ids); ids.push(id);
      sheet.getRange(r.rowNumber, APPT_COLUMNS.indexOf('Appt ID') + 1).setValue(id);
    }
    sheet.getRange(r.rowNumber, APPT_COLUMNS.indexOf('Flag') + 1).setValue(rowFlag(r.rec, today, settings.rebookOn));
  });
}

/* ---------- reminders ---------- */

/**
 * Sends what is due today. dryRun=true only collects what would be sent.
 * Returns {sent, skipped, quotaHit, preview: [{apptId, kind, to, subject, text}]}.
 */
function processReminders_(dryRun) {
  var settings = getSettings_();
  var today = todayKey_();
  var isTest = !!settings.testTo;
  if (isTest && !isValidEmail(settings.testTo)) throw new Error('"Test mode: send all emails to" is not a valid email address.');

  var result = { sent: 0, skipped: 0, quotaHit: false, preview: [] };
  readAppts_().forEach(function (r) {
    var a = r.rec;
    var jobs = [];
    var kind = reminderDue(a, today);
    if (kind) {
      var blocker = emailBlocker(a);
      if (blocker) {
        result.skipped++;
        if (!dryRun) setCell_(r.rowNumber, kind === '2-day' ? '2-day reminder' : '1-day reminder', blocker + ' (' + today + ')');
      } else {
        jobs.push({ column: kind === '2-day' ? '2-day reminder' : '1-day reminder', kind: kind, msg: buildReminder(a, settings, kind, isTest) });
      }
    }
    if (rebookDue(a, today, settings.rebookOn)) {
      jobs.push({ column: 'Rebook sent', kind: 'rebook', msg: buildRebook(a, settings, isTest) });
    }
    jobs.forEach(function (job) {
      if (dryRun) {
        result.preview.push({ apptId: a['Appt ID'], kind: job.kind, to: job.msg.to, subject: job.msg.subject, text: job.msg.text });
        return;
      }
      if (result.quotaHit || MailApp.getRemainingDailyQuota() < 1) { result.quotaHit = true; return; }
      MailApp.sendEmail({ to: job.msg.to, subject: job.msg.subject, body: job.msg.text, htmlBody: job.msg.html, name: job.msg.name });
      setCell_(r.rowNumber, job.column, 'Sent ' + stamp_() + (isTest ? ' [TEST]' : ''));
      result.sent++;
    });
  });
  if (!dryRun) refreshFlags_();
  return result;
}

function previewReminders() {
  var r = processReminders_(true);
  var settings = getSettings_();
  var sender = senderEmail_();
  var header = 'From: ' + (settings.clinicName || '') + ' <' + (sender || 'this account') + '>' +
    (settings.testTo ? '\nTEST MODE: every email goes to ' + settings.testTo : '') + '\n\n';
  if (!r.preview.length) { tell_(header + 'Nothing is due today. ' + (r.skipped ? r.skipped + ' reminder(s) can\'t go by email; see their rows.' : '')); return; }
  var html = '<pre style="font:13px/1.5 Consolas,monospace;white-space:pre-wrap;">' +
    escapeHtml_(header + r.preview.map(function (p) {
      return p.apptId + ' · ' + p.kind + '\nTo: ' + p.to + '\nSubject: ' + p.subject + '\n\n' + p.text;
    }).join('\n\n--------------------\n\n')) + '</pre>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(640).setHeight(560),
    'Due today: ' + r.preview.length + ' email(s). Nothing sent.');
}

function runReminders() {
  var settings = getSettings_();
  var sender = senderEmail_();
  if (!settings.testTo && isPersonalAccount_(sender)) {
    var msg = 'Held: reminders would be sent from a personal account (' + sender + '). ' +
      'For real patients, install this in the clinic\'s Google Workspace. For a demo, set "Test mode: send all emails to" in Settings.';
    setSetting_(SETTING_LABELS.lastRun, msg + ' (' + stamp_() + ')');
    tell_(msg);
    return;
  }
  var r = processReminders_(false);
  var summary = 'Sent ' + r.sent + ', could not email ' + r.skipped + (r.quotaHit ? '. Daily email quota reached; the rest go on the next run.' : '.');
  setSetting_(SETTING_LABELS.lastRun, summary + ' (' + stamp_() + ')');
  tell_(summary);
}

function runRemindersScheduled() { runReminders(); }

/* ---------- weekly report ---------- */

function refreshWeeklyReport_() {
  var weeks = weeklyReport(readAppts_().map(function (r) { return r.rec; }), todayKey_(), 8);
  var sheet = ss_().getSheetByName(SHEET_REPORT) || ss_().insertSheet(SHEET_REPORT);
  sheet.clear();
  sheet.getCharts().forEach(function (c) { sheet.removeChart(c); });
  var header = ['Week of', 'Appointments', 'Attended', 'No-shows', 'Cancelled', 'Rescheduled', 'Not marked',
    'No-show rate %', 'Confirmed no-show %', 'Unconfirmed no-show %'];
  var rows = weeks.map(function (w) {
    var blankIfNull = function (v) { return v === null ? '' : v; };
    return [shortDate(w.week), w.appointments, w.attended, w.noShow, w.cancelled, w.rescheduled, w.notMarked,
      blankIfNull(w.noShowRate), blankIfNull(w.confirmedRate), blankIfNull(w.unconfirmedRate)];
  });
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#e8ecee');
  sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, header.length);
  sheet.getRange(rows.length + 2, 1).setValue('The last row is the current week, so it is still filling in.').setFontColor('#5a6a73');

  var chart = sheet.newChart().setChartType(Charts.ChartType.LINE)
    .addRange(sheet.getRange(1, 1, rows.length + 1, 1))
    .addRange(sheet.getRange(1, 8, rows.length + 1, 1))
    .setOption('title', 'No-show rate by week (%)')
    .setOption('legend', { position: 'none' })
    .setOption('vAxis', { minValue: 0 })
    .setOption('pointSize', 5)
    .setPosition(rows.length + 4, 1, 0, 0)
    .build();
  sheet.insertChart(chart);
  return weeks;
}

function refreshWeeklyReport() {
  refreshWeeklyReport_();
  tell_('Weekly Report tab updated.');
}

function sendWeeklyReport() {
  var settings = getSettings_();
  var to = settings.testTo || settings.reportEmail;
  if (!isValidEmail(to)) { tell_('Set a valid "Weekly report email" in Settings first.'); return; }
  var email = buildWeeklyEmail(refreshWeeklyReport_(), settings.clinicName);
  MailApp.sendEmail({ to: to, subject: (settings.testTo ? '[TEST] ' : '') + email.subject, htmlBody: email.html,
    name: (settings.clinicName || 'Clinic') + ' reports' });
  tell_('Weekly report sent to ' + to + '.');
}

function sendWeeklyReportScheduled() {
  if (isValidEmail(getSettings_().reportEmail) || getSettings_().testTo) sendWeeklyReport();
}

/* ---------- triggers ---------- */

function installTriggers() {
  var s = getSettings_();
  if (!(s.sendHour >= 0 && s.sendHour <= 23)) { tell_('Set "Send reminders at hour (0-23)" in Settings first.'); return; }
  if (!s.clinicPhone) { tell_('Add the clinic phone in Settings first; every reminder shows it.'); return; }
  removeTriggers_();
  ScriptApp.newTrigger(DAILY_HANDLER).timeBased().everyDays(1).atHour(s.sendHour).create();
  ScriptApp.newTrigger(WEEKLY_HANDLER).timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  tell_('Daily reminders are on, around ' + s.sendHour + ':00 (' + tz_() + '). The weekly report goes out Monday mornings.' +
    (s.testTo ? '\n\nTest mode is ON: every email goes to ' + s.testTo + '.' : ''));
}

function removeTriggers() { tell_(removeTriggers_() ? 'Daily reminders and the weekly report are off.' : 'They were not on.'); }

function removeTriggers_() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if ([DAILY_HANDLER, WEEKLY_HANDLER].indexOf(t.getHandlerFunction()) !== -1) { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

/* ---------- setup and demo ---------- */

function listRule_(list) {
  return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
}

function setupSheets() {
  var ss = ss_();
  var sheet = ss.getSheetByName(SHEET_APPTS) || ss.insertSheet(SHEET_APPTS, 0);
  sheet.getRange(1, 1, 1, APPT_COLUMNS.length).setValues([APPT_COLUMNS]).setFontWeight('bold').setBackground('#e8ecee');
  sheet.setFrozenRows(1);
  var c = function (name) { return APPT_COLUMNS.indexOf(name) + 1; };
  var rows = sheet.getMaxRows() - 1;
  sheet.getRange(2, c('Date'), rows, 1).setNumberFormat('yyyy-mm-dd')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  sheet.getRange(2, c('Time'), rows, 1).setNumberFormat('h:mm am/pm');
  sheet.getRange(2, c('Reminders'), rows, 1).setDataValidation(listRule_(REMINDER_PREFS));
  sheet.getRange(2, c('Confirmation'), rows, 1).setDataValidation(listRule_(CONFIRMATIONS));
  sheet.getRange(2, c('Outcome'), rows, 1).setDataValidation(listRule_(OUTCOMES));
  ['Appt ID', '2-day reminder', '1-day reminder', 'Rebook sent', 'Flag'].forEach(function (name) {
    sheet.getRange(1, c(name)).setNote('Filled in by the script.');
    sheet.getRange(2, c(name), rows, 1).setFontColor('#5a6a73');
  });
  sheet.getRange(1, c('First name')).setNote('First name only. Reminders greet the patient by first name and include nothing else about them.');
  sheet.getRange(1, c('Notes')).setNote('Workflow notes only. No visit reasons or clinical details.');
  var flagLetter = String.fromCharCode(64 + c('Flag'));
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=LEN($' + flagLetter + '2)>0')
      .setBackground('#f8ecd2').setRanges([sheet.getRange(2, 1, rows, APPT_COLUMNS.length)]).build()
  ]);
  sheet.setColumnWidth(c('Flag'), 240);
  [c('2-day reminder'), c('1-day reminder'), c('Rebook sent')].forEach(function (col) { sheet.setColumnWidth(col, 170); });

  var set = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  if (set.getLastRow() === 0) {
    set.getRange(1, 1, 8, 2).setValues([
      ['Setting', 'Value'],
      [SETTING_LABELS.clinicName, 'Riverside Family Medicine'],
      [SETTING_LABELS.clinicPhone, ''],
      [SETTING_LABELS.sendHour, 10],
      [SETTING_LABELS.rebookOn, 'No'],
      [SETTING_LABELS.reportEmail, ''],
      [SETTING_LABELS.testTo, ''],
      [SETTING_LABELS.lastRun, '']
    ]);
    set.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#e8ecee');
    set.getRange('B5').setDataValidation(listRule_(['Yes', 'No']));
    set.getRange('A7').setNote('While this has an address, every email (reminders, rebooks, reports) goes there with [TEST] in the subject. Clear it to go live.');
    set.setColumnWidth(1, 300); set.setColumnWidth(2, 320);
  }
  if (!ss.getSheetByName(SHEET_REPORT)) ss.insertSheet(SHEET_REPORT);
  ss.setActiveSheet(sheet);

  var sender = senderEmail_();
  tell_('Sheets are ready. Fill in Settings (clinic phone is required).\n\nEmails will be sent from: ' + (sender || 'this account') +
    (isPersonalAccount_(sender) ? '\n\nThis is a personal account. Use it for demos in Test mode only; for real patients install in the clinic\'s Google Workspace.' : ''));
}

function fillSampleAppointments() {
  var settings = getSettings_();
  var ui = ui_();
  if (!settings.testTo && ui) {
    var go = ui.alert('Test mode is off',
      'The sample patients use @example.com addresses, which never deliver, but it is safer to set ' +
      '"Test mode: send all emails to" to your own address first.\n\nAdd the samples anyway?', ui.ButtonSet.YES_NO);
    if (go !== ui.Button.YES) return;
  }
  var sheet = sheet_(SHEET_APPTS);
  var today = todayKey_();
  var samples = sampleAppointments(today);
  var existing = readAppts_().map(function (r) { return r.rec['Appt ID']; });
  var rows = samples.map(function (s) {
    var id = nextApptId(existing); existing.push(id);
    return APPT_COLUMNS.map(function (name) {
      if (name === 'Appt ID') return id;
      if (name === 'Date') return new Date(s['Date'] + 'T12:00:00');
      if (name === 'Flag') return '';
      return s[name];
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, APPT_COLUMNS.length).setValues(rows);
  refreshFlags_();
  refreshWeeklyReport_();
  tell_('Added ' + rows.length + ' made-up appointments: 8 weeks of history and upcoming ones that show every case. ' +
    'Try "Preview tomorrow\'s reminders" next.');
}
