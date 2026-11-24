/**
 * Pure logic for the VA Daily Dashboard. No Google services are used here,
 * so this file can be tested with Node (see test/logic.test.js).
 */

var TASK_TYPES = [
  'Calls',
  'Scheduling',
  'Insurance verification',
  'Prior auth',
  'Referrals',
  'Reminders',
  'Inbox and email',
  'Other'
];

var MAX_MINUTES_PER_ROW = 960;

/**
 * Returns a list of the kinds of patient identifiers the text seems to contain.
 * An empty list means nothing was found. It is a safety net, not a guarantee.
 */
function phiCheck(text) {
  var s = String(text || '');
  var hits = [];
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(s)) hits.push('an SSN');
  if (/\b(DOB|D\.O\.B|date of birth|born)\b/i.test(s) ||
      /\b(0?[1-9]|1[0-2])[\/\-.](0?[1-9]|[12]\d|3[01])[\/\-.](19\d{2}|200\d|201\d)\b/.test(s)) {
    hits.push('a date of birth');
  }
  if (/(\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/.test(s)) hits.push('a phone number');
  if (/\b(MRN|member\s*id|subscriber\s*id|policy\s*(no|number|#))\b/i.test(s) ||
      /\b[A-Z]{0,3}\d{8,}\b/.test(s)) {
    hits.push('a member ID or MRN');
  }
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(s)) hits.push('an email address');
  // A title followed by a name, with or without a dot or space, in any case: "Mrs Johnson", "Mrs.johnson", "MR SMITH".
  // "Miss" needs a word break after it so "Missed" doesn't count.
  var titledName = /\b(Mr|Mrs|Ms|Miss|Mx|MR|MRS|MISS)\b\.?\s*[A-Za-z][A-Za-z'\-]+/.test(s);
  // "Dr" and "patient"/"pt" need a capitalised name, so "Dr office" and "PT notes" (physical therapy) don't count.
  var otherName = /\bDr\b\.?\s*[A-Z][a-z]+/.test(s) || /\b([Pp]atient|PATIENT|[Pp]t|PT)\b\.?\s*[A-Z][a-z]+/.test(s);
  if (titledName || otherName) hits.push("a person's name");
  return hits;
}

function toWholeNumber_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  var n = Number(v);
  return isFinite(n) ? n : NaN;
}

/**
 * rows: [{rowNumber, dayKey, type, count, minutes, notes}]
 * Returns problems: [{rowNumber, column, message}] where column is one of
 * 'Task type', 'Count', 'Minutes', 'Notes'.
 */
function validateRows(rows) {
  var problems = [];
  rows.forEach(function (r) {
    if (TASK_TYPES.indexOf(r.type) === -1) {
      problems.push({ rowNumber: r.rowNumber, column: 'Task type',
        message: r.type ? 'Unknown task type "' + r.type + '"' : 'Task type is empty' });
    }
    var c = toWholeNumber_(r.count);
    if (!(c >= 0) || Math.floor(c) !== c) {
      problems.push({ rowNumber: r.rowNumber, column: 'Count', message: 'Count must be a whole number, 0 or more' });
    }
    var m = toWholeNumber_(r.minutes);
    if (!(m >= 0) || Math.floor(m) !== m || m > MAX_MINUTES_PER_ROW) {
      problems.push({ rowNumber: r.rowNumber, column: 'Minutes',
        message: 'Minutes must be a whole number from 0 to ' + MAX_MINUTES_PER_ROW });
    }
    var hits = phiCheck(r.notes);
    if (hits.length) {
      problems.push({ rowNumber: r.rowNumber, column: 'Notes',
        message: 'Notes look like they contain ' + hits.join(', ') + '. Remove patient details.' });
    }
  });
  return problems;
}

/** Totals for one day. Unknown types are counted under Other. */
function summarizeDay(rows, dayKey) {
  var byType = {};
  TASK_TYPES.forEach(function (t) { byType[t] = { type: t, count: 0, minutes: 0 }; });
  var totalCount = 0, totalMinutes = 0, notes = [];
  rows.forEach(function (r) {
    if (r.dayKey !== dayKey) return;
    var t = byType[r.type] ? r.type : 'Other';
    var c = toWholeNumber_(r.count) || 0, m = toWholeNumber_(r.minutes) || 0;
    byType[t].count += c;
    byType[t].minutes += m;
    totalCount += c;
    totalMinutes += m;
    var note = String(r.notes || '').trim();
    if (note) notes.push({ type: t, note: note });
  });
  return {
    dayKey: dayKey,
    byType: TASK_TYPES.map(function (t) { return byType[t]; })
      .filter(function (x) { return x.count || x.minutes; }),
    totalCount: totalCount,
    totalMinutes: totalMinutes,
    notes: notes
  };
}

/** Minutes per task type for each day key, in the order given. */
function summarizeWeek(rows, dayKeys) {
  return dayKeys.map(function (k) {
    var day = summarizeDay(rows, k);
    var minutes = {};
    TASK_TYPES.forEach(function (t) { minutes[t] = 0; });
    day.byType.forEach(function (x) { minutes[x.type] = x.minutes; });
    return { dayKey: k, minutesByType: minutes, totalMinutes: day.totalMinutes };
  });
}

function formatMinutes(m) {
  m = Math.round(m || 0);
  var h = Math.floor(m / 60), mm = m % 60;
  if (!h) return mm + ' min';
  return mm ? h + ' h ' + mm + ' min' : h + ' h';
}

function isValidSingleEmail(s) {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(String(s || '').trim());
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function eodSubject(settings, dayLabel) {
  return 'EOD report: ' + (settings.clinicName || 'Clinic') + ', ' + dayLabel;
}

/** The email body. Inline styles only, because email clients ignore <style>. */
function buildEodHtml(summary, settings, dayLabel) {
  var ink = '#18242b', muted = '#5a6a73', line = '#cfd6da', accent = '#1f5f6b';
  var cell = 'padding:8px 12px;border-bottom:1px solid ' + line + ';text-align:left;';
  var rows = summary.byType.map(function (x) {
    return '<tr><td style="' + cell + '">' + escapeHtml_(x.type) + '</td>' +
      '<td style="' + cell + 'text-align:right;">' + x.count + '</td>' +
      '<td style="' + cell + 'text-align:right;">' + escapeHtml_(formatMinutes(x.minutes)) + '</td></tr>';
  }).join('');
  var notes = summary.notes.length
    ? '<h3 style="font-size:14px;margin:24px 0 8px;color:' + ink + ';">Notes</h3><ul style="margin:0;padding-left:18px;color:' + ink + ';">' +
      summary.notes.map(function (n) {
        return '<li style="margin-bottom:4px;"><b>' + escapeHtml_(n.type) + ':</b> ' + escapeHtml_(n.note) + '</li>';
      }).join('') + '</ul>'
    : '';
  return '' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:' + ink + ';max-width:560px;">' +
    '<p style="margin:0 0 4px;color:' + accent + ';font-weight:bold;font-size:12px;text-transform:uppercase;letter-spacing:1px;">End-of-day report</p>' +
    '<h2 style="margin:0 0 4px;font-size:20px;">' + escapeHtml_(settings.clinicName || 'Clinic') + '</h2>' +
    '<p style="margin:0 0 16px;color:' + muted + ';">' + escapeHtml_(dayLabel) +
      (settings.vaName ? ' &middot; ' + escapeHtml_(settings.vaName) : '') + '</p>' +
    '<p style="margin:0 0 16px;font-size:16px;"><b>' + summary.totalCount + '</b> tasks &middot; <b>' +
      escapeHtml_(formatMinutes(summary.totalMinutes)) + '</b> logged</p>' +
    '<table style="border-collapse:collapse;width:100%;">' +
      '<tr><th style="' + cell + 'color:' + muted + ';font-size:12px;">Task type</th>' +
      '<th style="' + cell + 'color:' + muted + ';font-size:12px;text-align:right;">Count</th>' +
      '<th style="' + cell + 'color:' + muted + ';font-size:12px;text-align:right;">Time</th></tr>' +
      rows + '</table>' +
    notes +
    '<p style="margin:24px 0 0;color:' + muted + ';font-size:12px;">Task counts only. This report never includes patient information.</p>' +
    '</div>';
}

/** Small seeded random generator so the demo week looks the same each time. */
function makeRandom_(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Made-up tasks for one demo day. No patients appear in any note. */
function sampleDay(dayKey, seed) {
  var rnd = makeRandom_(seed);
  var pick = function (list) { return list[Math.floor(rnd() * list.length)]; };
  var plan = [
    ['Calls', 6, 14, 4, ['Returned voicemails from the front desk queue', 'Called payers for claim status']],
    ['Scheduling', 8, 20, 3, ['Booked follow-ups from yesterday\'s visits', 'Filled 2 cancelled slots from the waitlist']],
    ['Insurance verification', 10, 22, 6, ['Verified tomorrow\'s schedule', 'Flagged 2 inactive plans to the front desk']],
    ['Prior auth', 2, 6, 18, ['Chased 3 pending UHC auths', 'Submitted MRI auth through the portal']],
    ['Referrals', 1, 4, 12, ['Sent cardiology packet; confirmed receipt', 'Requested 2 consult notes back']],
    ['Reminders', 15, 35, 1, ['Called unconfirmed patients for tomorrow', 'Sent rebook texts to no-shows']],
    ['Inbox and email', 10, 30, 2, ['Cleared shared inbox to zero', 'Routed fax queue to providers']]
  ];
  return plan.map(function (p) {
    var count = p[1] + Math.floor(rnd() * (p[2] - p[1] + 1));
    return { dayKey: dayKey, type: p[0], count: count, minutes: count * p[3], notes: pick(p[4]) + ' (sample)' };
  });
}
