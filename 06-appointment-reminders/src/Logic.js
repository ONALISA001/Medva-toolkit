/**
 * Pure logic for the Appointment Reminder and No-Show Reducer. No Google services here,
 * so it can be tested with Node (see test/logic.test.js).
 * Dates are 'yyyy-MM-dd' keys; times are display strings like '10:30 AM'.
 */

var APPT_COLUMNS = ['Appt ID', 'Date', 'Time', 'First name', 'Email', 'Mobile phone', 'Reminders', 'Confirmation',
  'Outcome', '2-day reminder', '1-day reminder', 'Rebook sent', 'Flag', 'Notes'];
var REMINDER_PREFS = ['Email', 'Text', 'Email and text', 'No reminders'];
var CONFIRMATIONS = ['No reply', 'Confirmed', 'Cancelled', 'Rescheduled'];
var OUTCOMES = ['Attended', 'No-show', 'Cancelled', 'Rescheduled'];
var ID_PREFIX = 'AP-';
var REBOOK_WINDOW_DAYS = 7;

var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ---------- dates ---------- */

function keyToDays_(key) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null;
}
function daysBetween(fromKey, toKey) {
  var a = keyToDays_(fromKey), b = keyToDays_(toKey);
  return a === null || b === null ? null : Math.round(b - a);
}
function addDays(key, n) {
  var d = keyToDays_(key);
  return d === null ? '' : new Date((d + n) * 864e5).toISOString().slice(0, 10);
}
/** "Tuesday, December 1" */
function longDate(key) {
  var d = keyToDays_(key);
  if (d === null) return '';
  var dt = new Date(d * 864e5);
  return DAYS[dt.getUTCDay()] + ', ' + MONTHS[dt.getUTCMonth()] + ' ' + dt.getUTCDate();
}
/** "Tue, Dec 1" */
function shortDate(key) {
  var d = keyToDays_(key);
  if (d === null) return '';
  var dt = new Date(d * 864e5);
  return DAYS[dt.getUTCDay()].slice(0, 3) + ', ' + MONTHS[dt.getUTCMonth()].slice(0, 3) + ' ' + dt.getUTCDate();
}
/** The Monday on or before a date key. */
function weekStart(key) {
  var d = keyToDays_(key);
  if (d === null) return '';
  var dow = new Date(d * 864e5).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

/* ---------- small helpers ---------- */

function blank_(v) { return v === '' || v === null || v === undefined || String(v).trim() === ''; }

function isValidEmail(s) {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(String(s || '').trim());
}
function wantsEmail(pref) { return pref === 'Email' || pref === 'Email and text'; }
function isOff_(a) {
  return ['Cancelled', 'Rescheduled'].indexOf(a['Confirmation']) !== -1 ||
    ['Cancelled', 'Rescheduled'].indexOf(a['Outcome']) !== -1;
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/** Only the first word of the first name, trimmed; protects against full names typed in by mistake. */
function greetingName(v) {
  var first = String(v || '').trim().split(/\s+/)[0] || '';
  return first.replace(/[^A-Za-zÀ-ɏ'\-]/g, '');
}

function nextApptId(existingIds) {
  var max = 0;
  existingIds.forEach(function (id) {
    var m = new RegExp('^' + ID_PREFIX + '(\\d+)$', 'i').exec(String(id || '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  });
  var n = String(max + 1);
  while (n.length < 4) n = '0' + n;
  return ID_PREFIX + n;
}

/* ---------- what to send ---------- */

/**
 * appt: object keyed by APPT_COLUMNS, 'Date' as a key.
 * Returns '2-day', '1-day' or '' for today's run.
 */
function reminderDue(appt, todayKey) {
  if (isOff_(appt) || appt['Reminders'] === 'No reminders' || !appt['Date']) return '';
  var until = daysBetween(todayKey, appt['Date']);
  if (until === 2 && blank_(appt['2-day reminder'])) return '2-day';
  if (until === 1 && blank_(appt['1-day reminder'])) return '1-day';
  return '';
}

/**
 * Why a due reminder can't go by email, or '' if it can.
 * The text is written into the reminder cell so staff can see it.
 */
function emailBlocker(appt) {
  if (!wantsEmail(appt['Reminders'])) return 'Not sent: text only, call instead';
  if (!isValidEmail(appt['Email'])) return 'Not sent: no valid email';
  return '';
}

function rebookDue(appt, todayKey, rebookOn) {
  if (!rebookOn || appt['Outcome'] !== 'No-show' || !blank_(appt['Rebook sent'])) return false;
  if (!wantsEmail(appt['Reminders']) || !isValidEmail(appt['Email'])) return false;
  var since = daysBetween(appt['Date'], todayKey);
  return since !== null && since >= 1 && since <= REBOOK_WINDOW_DAYS;
}

function rowFlag(appt, todayKey, rebookOn) {
  var flags = [];
  var pref = appt['Reminders'];
  var past = appt['Date'] && daysBetween(appt['Date'], todayKey) > 0;
  if (!isOff_(appt) && !past) {
    if (pref === 'Text') flags.push('Text only: call to remind');
    else if (wantsEmail(pref) && !isValidEmail(appt['Email'])) flags.push('Add a valid email');
  }
  if (past && blank_(appt['Outcome']) && ['Cancelled', 'Rescheduled'].indexOf(appt['Confirmation']) === -1) {
    flags.push('Mark the outcome');
  }
  if (appt['Outcome'] === 'No-show' && blank_(appt['Rebook sent']) && !rebookDue(appt, todayKey, rebookOn)) {
    flags.push('No-show: call to rebook');
  }
  return flags.join('; ');
}

/* ---------- messages (minimum necessary) ---------- */

function wrapHtml_(paragraphs) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#18242b;max-width:560px;">' +
    paragraphs.map(function (p) { return '<p style="margin:0 0 14px;">' + p + '</p>'; }).join('') + '</div>';
}

/**
 * settings: {clinicName, clinicPhone, testTo}. kind: '2-day' | '1-day'.
 * Returns {to, subject, text, html, name}. Contains only first name, date, time and clinic phone.
 */
function buildReminder(appt, settings, kind, isTest) {
  var name = greetingName(appt['First name']);
  var clinic = settings.clinicName || 'our clinic';
  var when = longDate(appt['Date']) + (appt['Time'] ? ' at ' + appt['Time'] : '');
  var lead = kind === '1-day' ? 'tomorrow, ' : '';
  var lines = [
    'Hi' + (name ? ' ' + name : '') + ',',
    'This is a reminder of your appointment at ' + clinic + ' ' + lead + when + '.',
    'To confirm, cancel or reschedule, please call ' + (settings.clinicPhone || 'the clinic') + '.',
    'Please do not reply to this email with health information.'
  ];
  return {
    to: isTest ? settings.testTo : String(appt['Email']).trim(),
    subject: (isTest ? '[TEST] ' : '') + 'Reminder: your appointment on ' + shortDate(appt['Date']),
    text: lines.join('\n\n'),
    html: wrapHtml_(lines.map(escapeHtml_)),
    name: clinic
  };
}

function buildRebook(appt, settings, isTest) {
  var name = greetingName(appt['First name']);
  var clinic = settings.clinicName || 'our clinic';
  var lines = [
    'Hi' + (name ? ' ' + name : '') + ',',
    'We missed you at your appointment at ' + clinic + ' on ' + longDate(appt['Date']) + '. We would like to help you rebook.',
    'Please call ' + (settings.clinicPhone || 'the clinic') + ' and we will find a time that works for you.',
    'Please do not reply to this email with health information.'
  ];
  return {
    to: isTest ? settings.testTo : String(appt['Email']).trim(),
    subject: (isTest ? '[TEST] ' : '') + 'We missed you at ' + clinic,
    text: lines.join('\n\n'),
    html: wrapHtml_(lines.map(escapeHtml_)),
    name: clinic
  };
}

/* ---------- weekly report ---------- */

function rate_(num, den) { return den ? Math.round((num / den) * 1000) / 10 : null; }

/** Stats for the appointments dated within [weekStartKey, weekStartKey + 6]. */
function weekStats(appts, weekStartKey) {
  var s = { week: weekStartKey, appointments: 0, attended: 0, noShow: 0, cancelled: 0, rescheduled: 0, notMarked: 0,
    confirmedSeen: 0, confirmedNoShow: 0, unconfirmedSeen: 0, unconfirmedNoShow: 0 };
  appts.forEach(function (a) {
    var off = daysBetween(weekStartKey, a['Date']);
    if (off === null || off < 0 || off > 6) return;
    s.appointments++;
    var o = a['Outcome'];
    if (o === 'Attended') s.attended++;
    else if (o === 'No-show') s.noShow++;
    else if (o === 'Cancelled' || a['Confirmation'] === 'Cancelled') { s.cancelled++; return; }
    else if (o === 'Rescheduled' || a['Confirmation'] === 'Rescheduled') { s.rescheduled++; return; }
    else { s.notMarked++; return; }
    if (a['Confirmation'] === 'Confirmed') { s.confirmedSeen++; if (o === 'No-show') s.confirmedNoShow++; }
    else { s.unconfirmedSeen++; if (o === 'No-show') s.unconfirmedNoShow++; }
  });
  s.noShowRate = rate_(s.noShow, s.attended + s.noShow);
  s.confirmedRate = rate_(s.confirmedNoShow, s.confirmedSeen);
  s.unconfirmedRate = rate_(s.unconfirmedNoShow, s.unconfirmedSeen);
  return s;
}

/** The last n complete-or-current weeks, oldest first. */
function weeklyReport(appts, todayKey, n) {
  var start = weekStart(todayKey), out = [];
  for (var i = (n || 8) - 1; i >= 0; i--) out.push(weekStats(appts, addDays(start, -7 * i)));
  return out;
}

function pct_(v) { return v === null ? 'n/a' : v + '%'; }

/** Weekly email: counts only, never names. Reports on last week (Mon-Sun). */
function buildWeeklyEmail(weeks, clinicName) {
  var last = weeks[weeks.length - 2] || weeks[weeks.length - 1];
  var prev = weeks[weeks.length - 3];
  var clinic = clinicName || 'Clinic';
  var trend = prev && prev.noShowRate !== null && last.noShowRate !== null
    ? ' (' + (last.noShowRate <= prev.noShowRate ? 'down' : 'up') + ' from ' + prev.noShowRate + '% the week before)'
    : '';
  var cell = 'padding:6px 10px;border-bottom:1px solid #cfd6da;text-align:right;';
  var rows = weeks.map(function (w) {
    return '<tr><td style="' + cell + 'text-align:left;">Week of ' + escapeHtml_(shortDate(w.week)) + '</td>' +
      '<td style="' + cell + '">' + w.attended + '</td><td style="' + cell + '">' + w.noShow + '</td>' +
      '<td style="' + cell + '">' + w.cancelled + '</td><td style="' + cell + '">' + pct_(w.noShowRate) + '</td></tr>';
  }).join('');
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#18242b;max-width:600px;">' +
    '<p style="margin:0 0 4px;color:#1f5f6b;font-weight:bold;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Weekly no-show report</p>' +
    '<h2 style="margin:0 0 12px;font-size:20px;">' + escapeHtml_(clinic) + '</h2>' +
    '<p style="font-size:16px;margin:0 0 6px;">Last week: <b>' + pct_(last.noShowRate) + '</b> no-show rate' + escapeHtml_(trend) + '</p>' +
    '<p style="margin:0 0 6px;color:#5a6a73;">' + last.attended + ' attended, ' + last.noShow + ' no-shows, ' + last.cancelled +
      ' cancelled, ' + last.rescheduled + ' rescheduled, ' + last.notMarked + ' not marked.</p>' +
    '<p style="margin:0 0 16px;color:#5a6a73;">Confirmed patients: ' + pct_(last.confirmedRate) + ' no-show. Unconfirmed: ' +
      pct_(last.unconfirmedRate) + '.</p>' +
    '<table style="border-collapse:collapse;width:100%;font-size:13px;"><tr>' +
      ['Week', 'Attended', 'No-shows', 'Cancelled', 'No-show rate'].map(function (h, i) {
        return '<th style="' + cell + (i ? '' : 'text-align:left;') + 'color:#5a6a73;font-size:11px;">' + h + '</th>';
      }).join('') + '</tr>' + rows + '</table>' +
    '<p style="margin:20px 0 0;color:#5a6a73;font-size:12px;">Counts only. No patient information is included.</p></div>';
  return {
    subject: 'No-show report: ' + pct_(last.noShowRate) + ' last week (' + clinic + ')',
    html: html
  };
}

/* ---------- sample data ---------- */

/** Made-up appointments around today. All first names are ordinary; all emails are @example.com. */
function sampleAppointments(todayKey) {
  var d = function (n) { return addDays(todayKey, n); };
  var people = ['Jane', 'Sam', 'Maya', 'Lee', 'Rosa', 'Omar', 'Ivy', 'Ken', 'Ana', 'Raj', 'Mia', 'Tom'];
  var times = ['8:30 AM', '9:15 AM', '10:00 AM', '10:45 AM', '11:30 AM', '1:00 PM', '2:15 PM', '3:30 PM'];
  var out = [];
  var seq = 0;
  var add = function (dayOffset, extra) {
    var first = people[seq % people.length];
    var row = { 'Date': d(dayOffset), 'Time': times[seq % times.length], 'First name': first,
      'Email': first.toLowerCase() + '.test@example.com', 'Mobile phone': '(555) 010-' + (1000 + seq),
      'Reminders': 'Email', 'Confirmation': 'No reply', 'Outcome': '', '2-day reminder': '', '1-day reminder': '',
      'Rebook sent': '', 'Notes': '(sample)' };
    Object.keys(extra || {}).forEach(function (k) { row[k] = extra[k]; });
    seq++;
    out.push(row);
  };
  // Past 8 weeks: a no-show pattern that improves as confirmations go up.
  for (var w = 8; w >= 1; w--) {
    for (var k = 0; k < 6; k++) {
      var confirmed = k < Math.min(5, 9 - w);
      var noShow = confirmed ? (k === 0 && w > 6) : (k % 2 === 0);
      add(-7 * w + k, {
        'Confirmation': confirmed ? 'Confirmed' : 'No reply',
        'Outcome': k === 5 && w % 3 === 0 ? 'Cancelled' : (noShow ? 'No-show' : 'Attended'),
        '2-day reminder': 'sent', '1-day reminder': 'sent', 'Rebook sent': noShow ? 'sent' : ''
      });
    }
  }
  // Recent and upcoming: one of each situation.
  add(-2, { 'Outcome': 'No-show', '2-day reminder': 'sent', '1-day reminder': 'sent' });
  add(-1, { 'Outcome': '', '2-day reminder': 'sent', '1-day reminder': 'sent' });
  add(1, { '2-day reminder': 'sent' });
  add(1, { 'Reminders': 'Text', 'Email': '' });
  add(2, {});
  add(2, { 'Reminders': 'Email and text' });
  add(2, { 'Email': 'not-an-email' });
  add(2, { 'Confirmation': 'Cancelled' });
  add(3, { 'Reminders': 'No reminders' });
  add(9, {});
  return out;
}
