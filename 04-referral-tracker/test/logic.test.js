// Run with: node test/logic.test.js
// Loads src/Logic.js the way Apps Script does (shared global scope) and checks it with made-up data.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'Logic.js'), 'utf8'), ctx);
const plain = v => JSON.parse(JSON.stringify(v));

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

const TODAY = '2026-11-24';
const d = n => ctx.addDays(TODAY, n);
const flag = (ref, settings) => plain(ctx.computeFlag(ref, TODAY, settings || {}));
const ref = extra => Object.assign({ 'Status': 'Open', 'Urgency': 'Routine', 'Sent': d(-2),
  'Appointment booked': 'No', 'Report received': 'No' }, extra);
const none = { severity: '', reason: '' };

// --- before booking ---
test('a new routine referral has no flag', () => assert.deepStrictEqual(flag(ref()), none));
test('routine referral on day 7 is Check booking today', () =>
  assert.deepStrictEqual(flag(ref({ 'Sent': d(-7) })), { severity: 'soon', reason: 'Check booking today' }));
test('routine referral past 7 days is overdue', () =>
  assert.deepStrictEqual(flag(ref({ 'Sent': d(-10) })), { severity: 'overdue', reason: 'Not booked, no update in 10 days' }));
test('a follow-up resets the routine clock', () =>
  assert.deepStrictEqual(flag(ref({ 'Sent': d(-20), 'Last follow-up': d(-2) })), none));
test('urgent referral flags after 3 days, even with follow-ups', () => {
  assert.deepStrictEqual(flag(ref({ 'Urgency': 'Urgent', 'Sent': d(-4), 'Last follow-up': d(0) })),
    { severity: 'overdue', reason: 'Urgent, not booked after 4 days' });
  assert.deepStrictEqual(flag(ref({ 'Urgency': 'Urgent', 'Sent': d(-3) })), none);
});
test('thresholds come from settings', () => {
  assert.deepStrictEqual(flag(ref({ 'Sent': d(-10) }), { bookingDays: 14 }), none);
  assert.strictEqual(flag(ref({ 'Urgency': 'Urgent', 'Sent': d(-2) }), { urgentDays: 1 }).severity, 'overdue');
});
test('missing sent date is overdue', () =>
  assert.strictEqual(flag(ref({ 'Sent': '' })).reason, 'Sent date missing'));
test('booked without a date asks for it', () =>
  assert.deepStrictEqual(flag(ref({ 'Appointment booked': 'Yes' })), { severity: 'soon', reason: 'Add the appointment date' }));
test('an appointment date is ignored unless booked is Yes', () =>
  assert.strictEqual(flag(ref({ 'Sent': d(-10), 'Appointment date': d(5) })).severity, 'overdue'));

// --- after the visit ---
const visited = (daysAgo, extra) => ref(Object.assign({ 'Sent': d(-30), 'Appointment booked': 'Yes', 'Appointment date': d(-daysAgo) }, extra));
test('future and same-day visits have no report flag', () => {
  assert.deepStrictEqual(flag(visited(-5)), none);
  assert.deepStrictEqual(flag(visited(0)), none);
});
test('within 7 days of the visit: request the report', () => {
  assert.deepStrictEqual(flag(visited(1)), { severity: 'soon', reason: 'Visit done: request the consult report' });
  assert.strictEqual(flag(visited(7)).severity, 'soon');
});
test('more than 7 days after the visit with no report is overdue', () =>
  assert.deepStrictEqual(flag(visited(8)), { severity: 'overdue', reason: 'No consult report 8 days after visit' }));
test('report received but still open asks to close', () =>
  assert.deepStrictEqual(flag(visited(10, { 'Report received': 'Yes' })), { severity: 'soon', reason: 'Report in: send to provider and close' }));

// --- payer referral ---
test('payer referral that covers the visit is fine', () =>
  assert.deepStrictEqual(flag(ref({ 'Appointment booked': 'Yes', 'Appointment date': d(5), 'Payer referral expires': d(6) })), none));
test('payer referral expiring before the visit warns', () =>
  assert.deepStrictEqual(flag(ref({ 'Appointment booked': 'Yes', 'Appointment date': d(20), 'Payer referral expires': d(10) })),
    { severity: 'soon', reason: 'Payer referral expires in 10 days' }));
test('payer referral expiring with no visit booked warns; today and past handled', () => {
  assert.strictEqual(flag(ref({ 'Payer referral expires': d(0) })).reason, 'Payer referral expires today');
  assert.deepStrictEqual(flag(ref({ 'Payer referral expires': '2026-11-20' })),
    { severity: 'overdue', reason: 'Payer referral expired on Nov 20' });
});
test('payer referral expiry far away has no flag', () =>
  assert.deepStrictEqual(flag(ref({ 'Payer referral expires': d(60) })), none));
test('payer expiry is ignored once the report is in', () =>
  assert.ok(!flag(visited(10, { 'Report received': 'Yes', 'Payer referral expires': d(-1) })).reason.includes('Payer')));

// --- status and dates ---
test('closed, declined and cancelled referrals never flag', () => {
  ['Closed', 'Patient declined', 'Cancelled'].forEach(s =>
    assert.deepStrictEqual(flag(ref({ 'Status': s, 'Sent': d(-90) })), none));
});
test('appointment before sent is caught', () =>
  assert.ok(flag(ref({ 'Sent': d(-2), 'Appointment booked': 'Yes', 'Appointment date': d(-5) })).reason
    .includes('Check dates: appointment before sent')));
test('several overdue reasons are joined', () => {
  const r = flag(ref({ 'Sent': d(-15), 'Payer referral expires': d(-1) }));
  assert.strictEqual(r.reason, 'Not booked, no update in 15 days; Payer referral expired on Nov 23');
});

// --- shared parts ---
test('flagText prefixes match the colour rules', () => {
  assert.strictEqual(ctx.flagText({ severity: 'overdue', reason: 'X' }), 'Overdue: X');
  assert.strictEqual(ctx.flagText({ severity: 'soon', reason: 'Y' }), 'Soon: Y');
  assert.strictEqual(ctx.flagText(none), '');
});
test('case IDs use the RF- prefix', () => {
  assert.strictEqual(ctx.nextCaseId([]), 'RF-0001');
  assert.strictEqual(ctx.nextCaseId(['RF-0009', 'PA-0050']), 'RF-0010');
});
test('lastFollowUps keeps the newest date per case', () =>
  assert.deepStrictEqual(plain(ctx.lastFollowUps([{ caseId: 'RF-0001', dateKey: '2026-11-02' }, { caseId: 'rf-0001', dateKey: '2026-11-09' }])),
    { 'RF-0001': '2026-11-09' }));
test('digest counts, escapes and carries no account numbers', () => {
  const items = [
    { caseId: 'RF-0001', specialty: 'Cardiology', specialist: 'Heart & <Vascular>', severity: 'overdue', reason: 'Not booked' },
    { caseId: 'RF-0002', specialty: 'Imaging', specialist: 'Metro', severity: 'soon', reason: 'Request report', 'Patient account #': 'TEST-9999' }
  ];
  const dg = ctx.buildDigest(items, 'Riverside', 'Tuesday, Nov 24');
  assert.strictEqual(dg.subject, 'Referral digest: 1 overdue, 1 due soon (Riverside)');
  assert.ok(dg.html.includes('Heart &amp; &lt;Vascular&gt;'));
  assert.ok(!dg.html.includes('TEST-9999'));
});

// --- sample data ---
test('sample data shows every kind of flag, using TEST accounts only', () => {
  const samples = plain(ctx.sampleReferrals(TODAY));
  const latest = plain(ctx.lastFollowUps(plain(ctx.sampleLog(TODAY)).map(l => ({ caseId: 'C' + l.caseIndex, dateKey: l['Date'] }))));
  const flags = samples.map((s, i) => {
    s['Last follow-up'] = latest['C' + i] || '';
    return ctx.flagText(ctx.computeFlag(s, TODAY, {}));
  });
  assert.deepStrictEqual(flags, [
    'Overdue: Not booked, no update in 9 days',
    'Overdue: Urgent, not booked after 5 days',
    'Soon: Check booking today',
    'Soon: Add the appointment date',
    'Soon: Visit done: request the consult report',
    'Overdue: No consult report 12 days after visit',
    'Soon: Report in: send to provider and close',
    'Overdue: Not booked, no update in 15 days; Payer referral expired on Nov 23',
    'Soon: Payer referral expires in 10 days',
    '',
    '',
    ''
  ]);
  assert.ok(samples.every(s => /^TEST-\d{4}$/.test(s['Patient account #'])));
});
test('sample columns all exist', () => {
  const cols = Array.from(ctx.REQ_COLUMNS), logCols = Array.from(ctx.LOG_COLUMNS);
  plain(ctx.sampleReferrals(TODAY)).forEach(s => Object.keys(s).forEach(k => assert.ok(cols.includes(k), k)));
  plain(ctx.sampleLog(TODAY)).forEach(l => Object.keys(l).filter(k => k !== 'caseIndex').forEach(k => assert.ok(logCols.includes(k), k)));
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
