/**
 * Pure logic for the Referral Tracker. No Google services here,
 * so it can be tested with Node (see test/logic.test.js).
 * Same structure as the Prior Authorization Tracker (Tool 3).
 * Dates are 'yyyy-MM-dd' keys so time zones never shift a day.
 */

var REQ_COLUMNS = ['Case ID', 'Patient account #', 'Specialty', 'Specialist / practice', 'Urgency', 'Sent',
  'Payer referral #', 'Payer referral expires', 'Appointment booked', 'Appointment date', 'Report received',
  'Report date', 'Status', 'Last follow-up', 'Flag', 'Notes'];
var LOG_COLUMNS = ['Date', 'Case ID', 'Contacted', 'Spoke with', 'Reference #', 'Outcome', 'Next step'];
var DATE_COLUMNS = ['Sent', 'Payer referral expires', 'Appointment date', 'Report date', 'Last follow-up'];

var SPECIALTIES = ['Cardiology', 'Dermatology', 'Endocrinology', 'Gastroenterology', 'Imaging', 'Neurology',
  'Orthopedics', 'Behavioral health', 'Physical therapy', 'Other'];
var URGENCIES = ['Routine', 'Urgent'];
var YES_NO = ['Yes', 'No'];
var STATUSES = ['Open', 'Closed', 'Patient declined', 'Cancelled'];
var CONTACTS = ['Specialist office', 'Patient', 'Payer', 'Provider', 'Other'];

var DEFAULTS = { bookingDays: 7, urgentDays: 3, reportDays: 7, payerExpiryWarnDays: 14 };
var CASE_PREFIX = 'RF-';

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
function laterKey_(a, b) {
  if (!a) return b || '';
  if (!b) return a;
  return a > b ? a : b;
}
function shortDate(key) {
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  return m ? months[+m[2] - 1] + ' ' + (+m[3]) : '';
}
function plural_(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

function withDefaults_(settings) {
  var s = {};
  Object.keys(DEFAULTS).forEach(function (k) {
    var v = settings && Number(settings[k]);
    s[k] = v > 0 ? v : DEFAULTS[k];
  });
  return s;
}

/* ---------- flags ---------- */

/**
 * ref: object keyed by REQ_COLUMNS titles, date columns as 'yyyy-MM-dd' keys (or '').
 * Returns {severity: 'overdue'|'soon'|'', reason}.
 */
function computeFlag(ref, todayKey, settings) {
  var s = withDefaults_(settings);
  if (String(ref['Status'] || '').trim() !== 'Open') return { severity: '', reason: '' };

  var found = [];
  var add = function (severity, reason) { found.push({ severity: severity, reason: reason }); };
  var sent = ref['Sent'] || '';
  var booked = ref['Appointment booked'] === 'Yes';
  var appt = booked ? (ref['Appointment date'] || '') : '';
  var report = ref['Report received'] === 'Yes';

  if (sent && appt && daysBetween(sent, appt) < 0) add('soon', 'Check dates: appointment before sent');

  if (!sent) {
    add('overdue', 'Sent date missing');
  } else if (!booked) {
    var sinceSent = daysBetween(sent, todayKey);
    var sinceActivity = daysBetween(laterKey_(sent, ref['Last follow-up']), todayKey);
    if (ref['Urgency'] === 'Urgent') {
      if (sinceSent > s.urgentDays) add('overdue', 'Urgent, not booked after ' + plural_(sinceSent, 'day'));
    } else if (sinceActivity > s.bookingDays) {
      add('overdue', 'Not booked, no update in ' + plural_(sinceActivity, 'day'));
    } else if (sinceActivity === s.bookingDays) {
      add('soon', 'Check booking today');
    }
  } else if (!appt) {
    add('soon', 'Add the appointment date');
  }

  if (report) {
    add('soon', 'Report in: send to provider and close');
  } else if (appt) {
    var sinceVisit = daysBetween(appt, todayKey);
    if (sinceVisit > s.reportDays) add('overdue', 'No consult report ' + plural_(sinceVisit, 'day') + ' after visit');
    else if (sinceVisit >= 1) add('soon', 'Visit done: request the consult report');
  }

  var expires = ref['Payer referral expires'] || '';
  if (expires && !report) {
    var coversVisit = appt && daysBetween(appt, expires) >= 0;
    if (!coversVisit) {
      var left = daysBetween(todayKey, expires);
      if (left < 0) add('overdue', 'Payer referral expired on ' + shortDate(expires));
      else if (left <= s.payerExpiryWarnDays) {
        add('soon', left === 0 ? 'Payer referral expires today' : 'Payer referral expires in ' + plural_(left, 'day'));
      }
    }
  }

  if (!found.length) return { severity: '', reason: '' };
  var rank = { overdue: 2, soon: 1 };
  var worst = found.reduce(function (a, b) { return rank[b.severity] > rank[a.severity] ? b : a; });
  return {
    severity: worst.severity,
    reason: found.filter(function (f) { return f.severity === worst.severity; })
      .map(function (f) { return f.reason; }).join('; ')
  };
}

function flagText(result) {
  if (!result.reason) return '';
  return (result.severity === 'overdue' ? 'Overdue: ' : 'Soon: ') + result.reason;
}

/* ---------- follow-up log and IDs ---------- */

function lastFollowUps(logRows) {
  var out = {};
  logRows.forEach(function (r) {
    var id = String(r.caseId || '').trim().toUpperCase();
    if (!id || !r.dateKey) return;
    out[id] = laterKey_(out[id], r.dateKey);
  });
  return out;
}

function nextCaseId(existingIds) {
  var max = 0;
  existingIds.forEach(function (id) {
    var m = new RegExp('^' + CASE_PREFIX + '(\\d+)$', 'i').exec(String(id || '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  });
  var n = String(max + 1);
  while (n.length < 4) n = '0' + n;
  return CASE_PREFIX + n;
}

/* ---------- digest ---------- */

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function isValidSingleEmail(s) {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(String(s || '').trim());
}

/**
 * items: [{caseId, specialty, specialist, severity, reason}]. No account numbers.
 * Returns {subject, html, overdue, soon}.
 */
function buildDigest(items, clinicName, dayLabel) {
  var overdue = items.filter(function (i) { return i.severity === 'overdue'; });
  var soon = items.filter(function (i) { return i.severity === 'soon'; });
  var clinic = clinicName || 'Clinic';
  var subject = 'Referral digest: ' + overdue.length + ' overdue, ' + soon.length + ' due soon (' + clinic + ')';

  var ink = '#18242b', muted = '#5a6a73', line = '#cfd6da';
  var cell = 'padding:7px 10px;border-bottom:1px solid ' + line + ';text-align:left;vertical-align:top;';
  var table = function (title, color, list) {
    if (!list.length) return '';
    return '<h3 style="margin:22px 0 6px;font-size:15px;color:' + color + ';">' + escapeHtml_(title) + ' (' + list.length + ')</h3>' +
      '<table style="border-collapse:collapse;width:100%;font-size:13px;">' +
      '<tr>' + ['Case', 'Specialty', 'Specialist', 'What to do'].map(function (h) {
        return '<th style="' + cell + 'color:' + muted + ';font-size:11px;">' + h + '</th>';
      }).join('') + '</tr>' +
      list.map(function (i) {
        return '<tr>' + [i.caseId, i.specialty, i.specialist, i.reason].map(function (v, k) {
          return '<td style="' + cell + (k === 0 ? 'font-family:Consolas,monospace;white-space:nowrap;' : '') + '">' + escapeHtml_(v || '') + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</table>';
  };
  var body = overdue.length || soon.length
    ? table('Overdue', '#b03a2e', overdue) + table('Due soon', '#9a6200', soon)
    : '<p>Nothing is overdue or due soon. Every open referral is on track.</p>';

  return {
    subject: subject,
    overdue: overdue.length,
    soon: soon.length,
    html: '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:' + ink + ';max-width:640px;">' +
      '<p style="margin:0 0 4px;color:#1f5f6b;font-weight:bold;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Referral digest</p>' +
      '<h2 style="margin:0 0 4px;font-size:20px;">' + escapeHtml_(clinic) + '</h2>' +
      '<p style="margin:0;color:' + muted + ';">' + escapeHtml_(dayLabel) + '</p>' +
      body +
      '<p style="margin:24px 0 0;color:' + muted + ';font-size:12px;">Case IDs only. Open the Referral Tracker to see the account number for a case.</p>' +
      '</div>'
  };
}

/* ---------- sample data ---------- */

/** Made-up referrals relative to today, one for each kind of flag. Accounts are TEST-####. */
function sampleReferrals(todayKey) {
  var d = function (n) { return addDays(todayKey, n); };
  var r = function (account, specialty, specialist, urgency, sent, extra) {
    var row = { 'Patient account #': account, 'Specialty': specialty, 'Specialist / practice': specialist,
      'Urgency': urgency, 'Sent': sent, 'Payer referral #': '', 'Payer referral expires': '',
      'Appointment booked': 'No', 'Appointment date': '', 'Report received': 'No', 'Report date': '',
      'Status': 'Open', 'Notes': '(sample)' };
    Object.keys(extra || {}).forEach(function (k) { row[k] = extra[k]; });
    return row;
  };
  return [
    r('TEST-4001', 'Cardiology', 'Lakeside Heart Associates', 'Routine', d(-10)),
    r('TEST-4002', 'Neurology', 'Valley Neurology Group', 'Urgent', d(-5)),
    r('TEST-4003', 'Orthopedics', 'Summit Orthopedics', 'Routine', d(-7)),
    r('TEST-4004', 'Dermatology', 'Clearview Dermatology', 'Routine', d(-12), { 'Appointment booked': 'Yes' }),
    r('TEST-4005', 'Gastroenterology', 'Harbor GI', 'Routine', d(-30), { 'Appointment booked': 'Yes', 'Appointment date': d(-3) }),
    r('TEST-4006', 'Endocrinology', 'Northside Endocrine', 'Routine', d(-45), { 'Appointment booked': 'Yes', 'Appointment date': d(-12) }),
    r('TEST-4007', 'Imaging', 'Metro Imaging Center', 'Routine', d(-20),
      { 'Appointment booked': 'Yes', 'Appointment date': d(-6), 'Report received': 'Yes', 'Report date': d(-2) }),
    r('TEST-4008', 'Behavioral health', 'Bridges Counseling', 'Routine', d(-15),
      { 'Payer referral #': 'HMO-22871', 'Payer referral expires': d(-1), 'Notes': 'HMO referral (sample)' }),
    r('TEST-4009', 'Physical therapy', 'MoveWell PT', 'Routine', d(-4),
      { 'Payer referral #': 'MA-61004', 'Payer referral expires': d(10), 'Appointment booked': 'Yes', 'Appointment date': d(20) }),
    r('TEST-4010', 'Cardiology', 'Lakeside Heart Associates', 'Routine', d(-3), { 'Appointment booked': 'Yes', 'Appointment date': d(12) }),
    r('TEST-4011', 'Orthopedics', 'Summit Orthopedics', 'Routine', d(-60),
      { 'Appointment booked': 'Yes', 'Appointment date': d(-40), 'Report received': 'Yes', 'Report date': d(-35), 'Status': 'Closed' }),
    r('TEST-4012', 'Neurology', 'Valley Neurology Group', 'Routine', d(-20), { 'Status': 'Patient declined', 'Notes': 'Declined; chose to wait (sample)' })
  ];
}

/** Made-up follow-up log. caseIndex points into sampleReferrals (0-based). */
function sampleLog(todayKey) {
  return [
    { caseIndex: 0, 'Date': addDays(todayKey, -9), 'Contacted': 'Specialist office', 'Spoke with': 'Front desk', 'Reference #': '', 'Outcome': 'Received; will call to book', 'Next step': 'Check in a week' },
    { caseIndex: 2, 'Date': addDays(todayKey, -9), 'Contacted': 'Specialist office', 'Spoke with': 'Front desk', 'Reference #': '', 'Outcome': 'Packet confirmed', 'Next step': 'Check booking' },
    { caseIndex: 5, 'Date': addDays(todayKey, -5), 'Contacted': 'Specialist office', 'Spoke with': 'Records', 'Reference #': '', 'Outcome': 'Consult note requested', 'Next step': 'Follow up if not received' },
    { caseIndex: 9, 'Date': addDays(todayKey, -1), 'Contacted': 'Patient', 'Spoke with': 'Patient', 'Reference #': '', 'Outcome': 'Confirmed appointment', 'Next step': 'None' }
  ];
}
