/**
 * Pure logic for the Prior Authorization Tracker. No Google services here,
 * so it can be tested with Node (see test/logic.test.js).
 * Dates are passed in as 'yyyy-MM-dd' keys so time zones never shift a day.
 */

var REQ_COLUMNS = ['Case ID', 'Patient account #', 'Service', 'CPT / HCPCS', 'Payer', 'Urgency', 'Submitted',
  'Status', 'Last follow-up', 'Decision date', 'Auth #', 'Approved units', 'Expires', 'Appeal deadline', 'Flag', 'Notes'];
var LOG_COLUMNS = ['Date', 'Case ID', 'Contacted', 'Spoke with', 'Reference #', 'Outcome', 'Next step'];
var DATE_COLUMNS = ['Submitted', 'Last follow-up', 'Decision date', 'Expires', 'Appeal deadline'];

var SERVICES = ['Imaging', 'Specialty drug', 'DME', 'Surgery / procedure', 'PT / OT', 'Home health', 'Sleep study', 'Other'];
var URGENCIES = ['Standard', 'Expedited'];
var STATUSES = ['Not submitted', 'Submitted', 'Pending info', 'Peer-to-peer', 'Appeal filed', 'Approved', 'Denied', 'Withdrawn'];
var OPEN_STATUSES = ['Submitted', 'Pending info', 'Peer-to-peer', 'Appeal filed'];
var CONTACTS = ['Payer', 'Provider', 'Patient', 'Other'];

var DEFAULTS = { pendingDays: 5, expeditedDays: 3, expiryWarnDays: 14, appealUrgentDays: 7, appealWarnDays: 14 };
var CASE_PREFIX = 'PA-';

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
  if (d === null) return '';
  return new Date((d + n) * 864e5).toISOString().slice(0, 10);
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

/* ---------- flags ---------- */

/**
 * req: object keyed by REQ_COLUMNS titles, with date columns as 'yyyy-MM-dd' keys (or '').
 * Returns {severity: 'overdue'|'soon'|'', reason: string}. Flag cell text is flagText(result).
 */
function computeFlag(req, todayKey, settings) {
  var s = withDefaults_(settings);
  var status = String(req['Status'] || '').trim();
  var submitted = req['Submitted'] || '';
  var found = [];
  var add = function (severity, reason) { found.push({ severity: severity, reason: reason }); };

  if (submitted && req['Decision date'] && daysBetween(submitted, req['Decision date']) < 0) {
    add('soon', 'Check dates: decision before submitted');
  }

  if (OPEN_STATUSES.indexOf(status) !== -1) {
    if (!submitted) {
      add('overdue', 'Submitted date missing');
    } else {
      var sinceSubmit = daysBetween(submitted, todayKey);
      var sinceActivity = daysBetween(laterKey_(submitted, req['Last follow-up']), todayKey);
      if (req['Urgency'] === 'Expedited' && sinceSubmit > s.expeditedDays && status !== 'Appeal filed') {
        add('overdue', 'Expedited, no decision after ' + plural_(sinceSubmit, 'day'));
      } else if (sinceActivity > s.pendingDays) {
        add('overdue', 'No update in ' + plural_(sinceActivity, 'day'));
      } else if (sinceActivity === s.pendingDays) {
        add('soon', 'Follow up today');
      }
    }
  } else if (status === 'Approved') {
    var expires = req['Expires'];
    if (!String(req['Auth #'] || '').trim() || !expires) {
      add('soon', 'Approved: add auth # and expiry');
    }
    if (expires) {
      var left = daysBetween(todayKey, expires);
      if (left < 0) add('overdue', 'Auth expired on ' + shortDate(expires));
      else if (left <= s.expiryWarnDays) add('soon', left === 0 ? 'Auth expires today' : 'Auth expires in ' + plural_(left, 'day'));
    }
  } else if (status === 'Denied') {
    var deadline = req['Appeal deadline'];
    if (!deadline) {
      add('soon', 'Denied: add the appeal deadline');
    } else {
      var toGo = daysBetween(todayKey, deadline);
      if (toGo >= 0 && toGo <= s.appealUrgentDays) add('overdue', toGo === 0 ? 'Appeal due today' : 'Appeal due in ' + plural_(toGo, 'day'));
      else if (toGo > 0 && toGo <= s.appealWarnDays) add('soon', 'Appeal due in ' + plural_(toGo, 'day'));
      else if (toGo < 0) found.push({ severity: '', reason: 'Appeal deadline passed' });
    }
  }

  if (!found.length) return { severity: '', reason: '' };
  var rank = { overdue: 2, soon: 1, '': 0 };
  var worst = found.reduce(function (a, b) { return rank[b.severity] > rank[a.severity] ? b : a; });
  var reasons = found.filter(function (f) { return f.severity === worst.severity; })
    .map(function (f) { return f.reason; });
  return { severity: worst.severity, reason: reasons.join('; ') };
}

function flagText(result) {
  if (!result.reason) return '';
  if (result.severity === 'overdue') return 'Overdue: ' + result.reason;
  if (result.severity === 'soon') return 'Soon: ' + result.reason;
  return result.reason;
}

function withDefaults_(settings) {
  var s = {};
  Object.keys(DEFAULTS).forEach(function (k) {
    var v = settings && Number(settings[k]);
    s[k] = v > 0 ? v : DEFAULTS[k];
  });
  return s;
}

/* ---------- follow-up log and IDs ---------- */

/** logRows: [{caseId, dateKey}]. Returns {caseId: newest dateKey}. */
function lastFollowUps(logRows) {
  var out = {};
  logRows.forEach(function (r) {
    var id = String(r.caseId || '').trim().toUpperCase();
    if (!id || !r.dateKey) return;
    out[id] = laterKey_(out[id], r.dateKey);
  });
  return out;
}

/** Next free Case ID after the highest one in use: PA-0001, PA-0002 ... */
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
 * items: [{caseId, payer, service, code, severity, reason}].
 * Patient account numbers are deliberately not part of an item.
 * Returns {subject, html, overdue, soon}.
 */
function buildDigest(items, clinicName, dayLabel) {
  var overdue = items.filter(function (i) { return i.severity === 'overdue'; });
  var soon = items.filter(function (i) { return i.severity === 'soon'; });
  var clinic = clinicName || 'Clinic';
  var subject = 'Prior auth digest: ' + overdue.length + ' overdue, ' + soon.length + ' due soon (' + clinic + ')';

  var ink = '#18242b', muted = '#5a6a73', line = '#cfd6da';
  var cell = 'padding:7px 10px;border-bottom:1px solid ' + line + ';text-align:left;vertical-align:top;';
  var table = function (title, color, list) {
    if (!list.length) return '';
    return '<h3 style="margin:22px 0 6px;font-size:15px;color:' + color + ';">' + escapeHtml_(title) + ' (' + list.length + ')</h3>' +
      '<table style="border-collapse:collapse;width:100%;font-size:13px;">' +
      '<tr>' + ['Case', 'Payer', 'Service', 'Code', 'What to do'].map(function (h) {
        return '<th style="' + cell + 'color:' + muted + ';font-size:11px;">' + h + '</th>';
      }).join('') + '</tr>' +
      list.map(function (i) {
        return '<tr>' + [i.caseId, i.payer, i.service, i.code, i.reason].map(function (v, k) {
          return '<td style="' + cell + (k === 0 ? 'font-family:Consolas,monospace;white-space:nowrap;' : '') + '">' + escapeHtml_(v || '') + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</table>';
  };
  var body = overdue.length || soon.length
    ? table('Overdue', '#b03a2e', overdue) + table('Due soon', '#9a6200', soon)
    : '<p>Nothing is overdue or due soon. All open requests are on track.</p>';

  var html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:' + ink + ';max-width:640px;">' +
    '<p style="margin:0 0 4px;color:#1f5f6b;font-weight:bold;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Prior auth digest</p>' +
    '<h2 style="margin:0 0 4px;font-size:20px;">' + escapeHtml_(clinic) + '</h2>' +
    '<p style="margin:0;color:' + muted + ';">' + escapeHtml_(dayLabel) + '</p>' +
    body +
    '<p style="margin:24px 0 0;color:' + muted + ';font-size:12px;">Case IDs only. Open the Prior Auth Tracker to see the account number for a case.</p>' +
    '</div>';
  return { subject: subject, html: html, overdue: overdue.length, soon: soon.length };
}

/* ---------- sample data ---------- */

/** Made-up requests relative to today, one for each kind of flag. Accounts are TEST-####. */
function sampleRequests(todayKey) {
  var d = function (n) { return addDays(todayKey, n); };
  var r = function (account, service, code, payer, urgency, submitted, status, extra) {
    var row = { 'Patient account #': account, 'Service': service, 'CPT / HCPCS': code, 'Payer': payer,
      'Urgency': urgency, 'Submitted': submitted, 'Status': status, 'Decision date': '', 'Auth #': '',
      'Approved units': '', 'Expires': '', 'Appeal deadline': '', 'Notes': '(sample)' };
    Object.keys(extra || {}).forEach(function (k) { row[k] = extra[k]; });
    return row;
  };
  return [
    r('TEST-3001', 'Imaging', '70553', 'UnitedHealthcare', 'Standard', d(-9), 'Submitted'),
    r('TEST-3002', 'Specialty drug', 'J0897', 'Humana', 'Standard', d(-12), 'Pending info', { 'Notes': 'Payer wants last two lab values (sample)' }),
    r('TEST-3003', 'Surgery / procedure', '29881', 'Medicaid MCO', 'Expedited', d(-4), 'Submitted'),
    r('TEST-3004', 'PT / OT', '97110', 'BCBS', 'Standard', d(-5), 'Submitted'),
    r('TEST-3005', 'Imaging', '72148', 'Aetna', 'Standard', d(-2), 'Submitted'),
    r('TEST-3006', 'DME', 'E0601', 'Cigna', 'Standard', d(-40), 'Approved',
      { 'Decision date': d(-33), 'Auth #': 'AUTH-77120', 'Approved units': 1, 'Expires': d(9) }),
    r('TEST-3007', 'PT / OT', '97140', 'Aetna', 'Standard', d(-95), 'Approved',
      { 'Decision date': d(-90), 'Auth #': 'AUTH-66012', 'Approved units': 12, 'Expires': d(-2) }),
    r('TEST-3008', 'Sleep study', '95810', 'UnitedHealthcare', 'Standard', d(-6), 'Approved', { 'Decision date': d(-1) }),
    r('TEST-3009', 'Imaging', '74177', 'Cigna', 'Standard', d(-30), 'Denied', { 'Decision date': d(-20), 'Appeal deadline': d(5) }),
    r('TEST-3010', 'Home health', 'G0151', 'Humana', 'Standard', d(-14), 'Denied', { 'Decision date': d(-3) }),
    r('TEST-3011', 'Specialty drug', 'J1745', 'BCBS', 'Standard', d(-20), 'Approved',
      { 'Decision date': d(-15), 'Auth #': 'AUTH-80455', 'Approved units': 6, 'Expires': d(170) }),
    r('TEST-3012', 'Surgery / procedure', '27447', 'Medicare Advantage', 'Standard', '', 'Not submitted', { 'Notes': 'Waiting on surgeon notes (sample)' })
  ];
}

/** Made-up follow-up log entries. caseIndex points into sampleRequests (0-based). */
function sampleLog(todayKey) {
  return [
    { caseIndex: 0, 'Date': addDays(todayKey, -8), 'Contacted': 'Payer', 'Spoke with': 'Portal', 'Reference #': 'UHC-55120', 'Outcome': 'Received, in clinical review', 'Next step': 'Check again in 5 days' },
    { caseIndex: 1, 'Date': addDays(todayKey, -7), 'Contacted': 'Payer', 'Spoke with': 'Marcus', 'Reference #': 'H-90211', 'Outcome': 'Needs two recent lab values', 'Next step': 'Ask provider for labs' },
    { caseIndex: 1, 'Date': addDays(todayKey, -6), 'Contacted': 'Provider', 'Spoke with': 'Dr. office MA', 'Reference #': '', 'Outcome': 'Labs requested', 'Next step': 'Fax labs when received' },
    { caseIndex: 4, 'Date': addDays(todayKey, -1), 'Contacted': 'Payer', 'Spoke with': 'Portal', 'Reference #': 'AET-33019', 'Outcome': 'Pending review', 'Next step': 'Check in 3 days' }
  ];
}
