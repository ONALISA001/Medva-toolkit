/**
 * VA Daily Dashboard and EOD Report: the Google Sheets side.
 * The rules and email layout live in Logic.js.
 */

var SHEET_LOG = 'Task Log';
var SHEET_SETTINGS = 'Settings';
var SHEET_WEEKLY = 'Weekly';
var LOG_HEADERS = ['Date', 'Task type', 'Count', 'Minutes', 'Notes'];
var COLUMN_INDEX = { 'Task type': 2, 'Count': 3, 'Minutes': 4, 'Notes': 5 };
var PROBLEM_COLOR = '#f7dfdc';
var SCHEDULED_HANDLER = 'sendEodReportScheduled';

var SETTING_KEYS = {
  clinicName: 'Clinic name',
  vaName: 'VA name',
  managerEmail: 'Manager email',
  sendHour: 'Send at hour (0-23)',
  weekends: 'Send on weekends',
  lastReport: 'Last report'
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('VA Tools')
    .addItem("Preview today's report", 'previewEodReport')
    .addItem("Send today's EOD report", 'sendEodReport')
    .addItem('Refresh weekly chart', 'refreshWeekly')
    .addSeparator()
    .addItem('Set up sheets', 'setupSheets')
    .addItem('Fill a sample week (demo)', 'fillSampleWeek')
    .addSeparator()
    .addItem('Turn on daily auto-send', 'installDailyTrigger')
    .addItem('Turn off daily auto-send', 'removeDailyTrigger')
    .addToUi();
}

/* ---------- helpers ---------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return ss_().getSpreadsheetTimeZone(); }
function dayKey_(date) { return Utilities.formatDate(date, tz_(), 'yyyy-MM-dd'); }
function dayLabel_(date) { return Utilities.formatDate(date, tz_(), 'EEEE, MMM d'); }

/** The UI exists only when a person runs the script, not from a trigger. */
function ui_() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}

function tell_(message) {
  var ui = ui_();
  if (ui) ui.alert(message); else console.log(message);
}

function getSettings_() {
  var sheet = ss_().getSheetByName(SHEET_SETTINGS);
  if (!sheet) throw new Error('Settings tab is missing. Run VA Tools > Set up sheets.');
  var values = sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues();
  var byLabel = {};
  values.forEach(function (r) { byLabel[String(r[0]).trim()] = r[1]; });
  var s = {};
  Object.keys(SETTING_KEYS).forEach(function (k) { s[k] = byLabel[SETTING_KEYS[k]]; });
  s.managerEmail = String(s.managerEmail || '').trim();
  s.sendHour = Number(s.sendHour);
  s.weekends = /^y/i.test(String(s.weekends || ''));
  return s;
}

function setLastReport_(text) {
  var sheet = ss_().getSheetByName(SHEET_SETTINGS);
  var labels = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < labels.length; i++) {
    if (String(labels[i][0]).trim() === SETTING_KEYS.lastReport) {
      sheet.getRange(i + 1, 2).setValue(text + ' (' + Utilities.formatDate(new Date(), tz_(), 'MMM d, HH:mm') + ')');
      return;
    }
  }
}

/** Reads every non-blank row of the Task Log. */
function readRows_() {
  var sheet = ss_().getSheetByName(SHEET_LOG);
  if (!sheet) throw new Error('Task Log tab is missing. Run VA Tools > Set up sheets.');
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues();
  var rows = [];
  values.forEach(function (v, i) {
    var blank = v.every(function (x) { return x === '' || x === null; });
    if (blank) return;
    // A date typed as text "2026-11-24" is kept as-is; new Date() would read it as UTC and could shift the day.
    var text = String(v[0] || '').trim();
    var date = v[0] instanceof Date ? v[0] : null;
    rows.push({
      rowNumber: i + 2,
      dayKey: date && !isNaN(date) ? dayKey_(date) : (/^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''),
      type: String(v[1] || '').trim(),
      count: v[2],
      minutes: v[3],
      notes: v[4]
    });
  });
  return rows;
}

function clearProblemShading_() {
  var sheet = ss_().getSheetByName(SHEET_LOG);
  var last = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, 1, last - 1, LOG_HEADERS.length).setBackground(null);
}

function shadeProblems_(problems) {
  var sheet = ss_().getSheetByName(SHEET_LOG);
  problems.forEach(function (p) {
    sheet.getRange(p.rowNumber, COLUMN_INDEX[p.column]).setBackground(PROBLEM_COLOR);
  });
}

/**
 * Checks today's rows and builds the report.
 * Returns {ok, reason, html, subject, settings, summary}.
 */
function prepareReport_() {
  var settings = getSettings_();
  var now = new Date();
  var today = dayKey_(now);
  var todays = readRows_().filter(function (r) { return r.dayKey === today; });

  clearProblemShading_();
  var problems = validateRows(todays);
  if (problems.length) {
    shadeProblems_(problems);
    var first = problems[0];
    return { ok: false, reason: 'Held: fix row ' + first.rowNumber + ' (' + first.column + '). ' + first.message +
      (problems.length > 1 ? ' ' + (problems.length - 1) + ' more cell(s) are shaded red.' : '') };
  }
  var summary = summarizeDay(todays, today);
  if (!summary.totalCount && !summary.totalMinutes) {
    return { ok: false, reason: 'Skipped: nothing logged today.' };
  }
  var label = dayLabel_(now);
  return {
    ok: true,
    settings: settings,
    summary: summary,
    subject: eodSubject(settings, label),
    html: buildEodHtml(summary, settings, label)
  };
}

/* ---------- menu actions ---------- */

function previewEodReport() {
  var r = prepareReport_();
  if (!r.ok) { tell_(r.reason); return; }
  var html = HtmlService.createHtmlOutput(
    '<p style="font:12px Arial;color:#5a6a73;margin:0 0 12px">Preview only. Nothing has been sent. ' +
    'To: ' + escapeHtml_(r.settings.managerEmail || '(no manager email set)') + '</p>' + r.html
  ).setWidth(640).setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, r.subject);
}

function sendEodReport() {
  var r = prepareReport_();
  if (!r.ok) { setLastReport_(r.reason); tell_(r.reason); return; }
  if (!isValidSingleEmail(r.settings.managerEmail)) {
    var msg = 'Held: Manager email in Settings must be one valid email address.';
    setLastReport_(msg); tell_(msg); return;
  }
  MailApp.sendEmail({
    to: r.settings.managerEmail,
    subject: r.subject,
    htmlBody: r.html,
    name: (r.settings.vaName ? r.settings.vaName + ' (VA)' : 'VA Daily Report')
  });
  setLastReport_('Sent to ' + r.settings.managerEmail);
  tell_('EOD report sent to ' + r.settings.managerEmail + '.');
}

/** Called by the daily trigger. Skips weekends unless Settings says otherwise. */
function sendEodReportScheduled() {
  var settings = getSettings_();
  var weekday = Number(Utilities.formatDate(new Date(), tz_(), 'u')); // 1 = Monday ... 7 = Sunday
  if (weekday >= 6 && !settings.weekends) return;
  sendEodReport();
}

function refreshWeekly() {
  var ss = ss_();
  var sheet = ss.getSheetByName(SHEET_WEEKLY) || ss.insertSheet(SHEET_WEEKLY);
  sheet.clear();
  sheet.getCharts().forEach(function (c) { sheet.removeChart(c); });

  var keys = [], labels = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(dayKey_(d));
    labels.push(Utilities.formatDate(d, tz_(), 'EEE M/d'));
  }
  var week = summarizeWeek(readRows_(), keys);

  var header = ['Day'].concat(TASK_TYPES).concat(['Total hours']);
  var body = week.map(function (w, i) {
    return [labels[i]]
      .concat(TASK_TYPES.map(function (t) { return Math.round(w.minutesByType[t] / 6) / 10; }))
      .concat([Math.round(w.totalMinutes / 6) / 10]);
  });
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  sheet.getRange(2, 1, body.length, header.length).setValues(body);
  sheet.getRange(2, 2, body.length, header.length - 1).setNumberFormat('0.0');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, header.length);

  var chart = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange(1, 1, body.length + 1, TASK_TYPES.length + 1))
    .setOption('isStacked', true)
    .setOption('title', 'Hours by task type, last 7 days')
    .setOption('legend', { position: 'right' })
    .setOption('vAxis', { title: 'Hours' })
    .setPosition(body.length + 3, 1, 0, 0)
    .build();
  sheet.insertChart(chart);
  tell_('Weekly tab updated.');
}

function setupSheets() {
  var ss = ss_();

  var log = ss.getSheetByName(SHEET_LOG) || ss.insertSheet(SHEET_LOG, 0);
  log.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold').setBackground('#e8ecee');
  log.setFrozenRows(1);
  log.getRange('A2:A').setNumberFormat('yyyy-mm-dd')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  log.getRange('B2:B').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(TASK_TYPES, true).setAllowInvalid(false).build());
  log.getRange('C2:C').setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(0, 10000).setAllowInvalid(false)
      .setHelpText('A whole number, 0 or more').build());
  log.getRange('D2:D').setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(0, MAX_MINUTES_PER_ROW).setAllowInvalid(false)
      .setHelpText('Minutes, 0 to ' + MAX_MINUTES_PER_ROW).build());
  log.getRange('E1').setNote('Work notes only. No patient names, dates of birth, member IDs or phone numbers. ' +
    'The report will not send if a note looks like patient data.');
  log.setColumnWidth(1, 110); log.setColumnWidth(2, 170); log.setColumnWidth(3, 70);
  log.setColumnWidth(4, 80); log.setColumnWidth(5, 420);

  var set = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  if (set.getLastRow() === 0) {
    set.getRange(1, 1, 7, 2).setValues([
      ['Setting', 'Value'],
      [SETTING_KEYS.clinicName, 'Riverside Family Medicine'],
      [SETTING_KEYS.vaName, ''],
      [SETTING_KEYS.managerEmail, ''],
      [SETTING_KEYS.sendHour, 17],
      [SETTING_KEYS.weekends, 'No'],
      [SETTING_KEYS.lastReport, '']
    ]);
    set.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#e8ecee');
    set.getRange('B6').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).build());
    set.getRange('B5').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(0, 23).build());
    set.setColumnWidth(1, 180); set.setColumnWidth(2, 320);
  }

  if (!ss.getSheetByName(SHEET_WEEKLY)) ss.insertSheet(SHEET_WEEKLY);
  ss.setActiveSheet(log);
  tell_('Sheets are ready. Fill in Settings, then log tasks on the Task Log tab.');
}

function fillSampleWeek() {
  var sheet = ss_().getSheetByName(SHEET_LOG);
  if (!sheet) { tell_('Run VA Tools > Set up sheets first.'); return; }
  var out = [];
  var d = new Date();
  var added = 0;
  while (added < 5) {
    var weekday = Number(Utilities.formatDate(d, tz_(), 'u'));
    if (weekday <= 5) {
      var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      sampleDay(dayKey_(d), day.getTime() / 864e5).forEach(function (r) {
        out.push([day, r.type, r.count, r.minutes, r.notes]);
      });
      added++;
    }
    d.setDate(d.getDate() - 1);
  }
  out.reverse();
  sheet.getRange(sheet.getLastRow() + 1, 1, out.length, LOG_HEADERS.length).setValues(out);
  tell_('Added ' + out.length + ' sample rows across 5 weekdays. They are marked "(sample)".');
}

function installDailyTrigger() {
  var settings = getSettings_();
  if (!(settings.sendHour >= 0 && settings.sendHour <= 23)) {
    tell_('Set "Send at hour (0-23)" in Settings first.'); return;
  }
  if (!isValidSingleEmail(settings.managerEmail)) {
    tell_('Set one valid Manager email in Settings first.'); return;
  }
  removeTriggers_();
  ScriptApp.newTrigger(SCHEDULED_HANDLER).timeBased().everyDays(1).atHour(settings.sendHour).create();
  tell_('Daily auto-send is on, around ' + settings.sendHour + ':00 (' + tz_() + ')' +
    (settings.weekends ? ', every day.' : ', weekdays only.'));
}

function removeDailyTrigger() {
  var n = removeTriggers_();
  tell_(n ? 'Daily auto-send is off.' : 'Daily auto-send was not on.');
}

function removeTriggers_() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === SCHEDULED_HANDLER) { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}
