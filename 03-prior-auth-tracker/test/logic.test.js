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
const flag = (req, settings) => plain(ctx.computeFlag(req, TODAY, settings || {}));
const open = (extra) => Object.assign({ 'Status': 'Submitted', 'Urgency': 'Standard', 'Submitted': d(-2) }, extra);

// --- dates ---
test('date helpers handle month and year edges', () => {
  assert.strictEqual(ctx.addDays('2026-12-30', 3), '2027-01-02');
  assert.strictEqual(ctx.daysBetween('2026-02-27', '2026-03-02'), 3);
  assert.strictEqual(ctx.daysBetween('', TODAY), null);
  assert.strictEqual(ctx.shortDate('2026-11-05'), 'Nov 5');
});

// --- open requests ---
test('recent open request has no flag', () => {
  assert.deepStrictEqual(flag(open()), { severity: '', reason: '' });
});
test('open request on day 5 is Follow up today', () => {
  assert.deepStrictEqual(flag(open({ 'Submitted': d(-5) })), { severity: 'soon', reason: 'Follow up today' });
});
test('open request past 5 days is overdue', () => {
  assert.deepStrictEqual(flag(open({ 'Submitted': d(-8) })), { severity: 'overdue', reason: 'No update in 8 days' });
});
test('a recent follow-up resets the clock', () => {
  assert.strictEqual(flag(open({ 'Submitted': d(-20), 'Last follow-up': d(-1) })).severity, '');
});
test('pending threshold comes from settings', () => {
  assert.strictEqual(flag(open({ 'Submitted': d(-8) }), { pendingDays: 10 }).severity, '');
  assert.strictEqual(flag(open({ 'Submitted': d(-3) }), { pendingDays: 2 }).severity, 'overdue');
});
test('expedited requests flag after 3 days even with follow-ups', () => {
  assert.deepStrictEqual(flag(open({ 'Urgency': 'Expedited', 'Submitted': d(-4), 'Last follow-up': d(0) })),
    { severity: 'overdue', reason: 'Expedited, no decision after 4 days' });
  assert.strictEqual(flag(open({ 'Urgency': 'Expedited', 'Submitted': d(-3) })).severity, '');
});
test('open request without a submitted date is overdue', () => {
  assert.strictEqual(flag(open({ 'Submitted': '' })).reason, 'Submitted date missing');
});
test('statuses that are not open never get a pending flag', () => {
  ['Not submitted', 'Withdrawn'].forEach(s =>
    assert.strictEqual(flag({ 'Status': s, 'Submitted': d(-60) }).severity, ''));
});

// --- approved ---
const approved = extra => Object.assign({ 'Status': 'Approved', 'Submitted': d(-30), 'Decision date': d(-25),
  'Auth #': 'AUTH-1', 'Expires': d(60) }, extra);
test('approved with a far expiry has no flag', () => {
  assert.strictEqual(flag(approved()).severity, '');
});
test('approved expiring within 14 days is soon; today and past are handled', () => {
  assert.deepStrictEqual(flag(approved({ 'Expires': d(14) })), { severity: 'soon', reason: 'Auth expires in 14 days' });
  assert.strictEqual(flag(approved({ 'Expires': d(1) })).reason, 'Auth expires in 1 day');
  assert.strictEqual(flag(approved({ 'Expires': d(0) })).reason, 'Auth expires today');
  assert.deepStrictEqual(flag(approved({ 'Expires': '2026-11-20' })), { severity: 'overdue', reason: 'Auth expired on Nov 20' });
});
test('approved without auth # or expiry asks for them', () => {
  assert.strictEqual(flag(approved({ 'Auth #': '' })).reason, 'Approved: add auth # and expiry');
  assert.strictEqual(flag(approved({ 'Expires': '' })).reason, 'Approved: add auth # and expiry');
});
test('the worst severity wins when several apply', () => {
  const r = flag(approved({ 'Auth #': '', 'Expires': d(-1) }));
  assert.strictEqual(r.severity, 'overdue');
  assert.ok(r.reason.startsWith('Auth expired'));
});

// --- denied ---
const denied = extra => Object.assign({ 'Status': 'Denied', 'Submitted': d(-30), 'Decision date': d(-10) }, extra);
test('denied without a deadline asks for one', () => {
  assert.deepStrictEqual(flag(denied()), { severity: 'soon', reason: 'Denied: add the appeal deadline' });
});
test('appeal deadline windows', () => {
  assert.deepStrictEqual(flag(denied({ 'Appeal deadline': d(5) })), { severity: 'overdue', reason: 'Appeal due in 5 days' });
  assert.strictEqual(flag(denied({ 'Appeal deadline': d(0) })).reason, 'Appeal due today');
  assert.deepStrictEqual(flag(denied({ 'Appeal deadline': d(12) })), { severity: 'soon', reason: 'Appeal due in 12 days' });
  assert.strictEqual(flag(denied({ 'Appeal deadline': d(40) })).severity, '');
  assert.deepStrictEqual(flag(denied({ 'Appeal deadline': d(-1) })), { severity: '', reason: 'Appeal deadline passed' });
});
test('decision before submitted is caught', () => {
  assert.strictEqual(flag(approved({ 'Decision date': d(-40) })).reason, 'Check dates: decision before submitted');
});

// --- flag text ---
test('flagText prefixes match the sheet colour rules', () => {
  assert.strictEqual(ctx.flagText({ severity: 'overdue', reason: 'X' }), 'Overdue: X');
  assert.strictEqual(ctx.flagText({ severity: 'soon', reason: 'Y' }), 'Soon: Y');
  assert.strictEqual(ctx.flagText({ severity: '', reason: 'Appeal deadline passed' }), 'Appeal deadline passed');
  assert.strictEqual(ctx.flagText({ severity: '', reason: '' }), '');
});

// --- log and IDs ---
test('lastFollowUps keeps the newest date per case, case-insensitively', () => {
  const m = plain(ctx.lastFollowUps([
    { caseId: 'PA-0001', dateKey: '2026-11-10' }, { caseId: 'pa-0001', dateKey: '2026-11-18' },
    { caseId: 'PA-0001', dateKey: '2026-11-12' }, { caseId: 'PA-0002', dateKey: '' }, { caseId: '', dateKey: '2026-11-01' }
  ]));
  assert.deepStrictEqual(m, { 'PA-0001': '2026-11-18' });
});
test('nextCaseId continues after the highest ID', () => {
  assert.strictEqual(ctx.nextCaseId([]), 'PA-0001');
  assert.strictEqual(ctx.nextCaseId(['PA-0003', '', 'PA-0010', 'junk']), 'PA-0011');
});

// --- digest ---
const items = [
  { caseId: 'PA-0001', payer: 'Aetna', service: 'Imaging', code: '70553', severity: 'overdue', reason: 'No update in 8 days' },
  { caseId: 'PA-0002', payer: 'A&B <Health>', service: 'DME', code: 'E0601', severity: 'soon', reason: 'Auth expires in 9 days' }
];
test('digest subject counts each group', () => {
  assert.strictEqual(ctx.buildDigest(items, 'Riverside', 'Tuesday, Nov 24').subject,
    'Prior auth digest: 1 overdue, 1 due soon (Riverside)');
});
test('digest escapes text and carries no account numbers', () => {
  const html = ctx.buildDigest(items.concat([Object.assign({ 'Patient account #': 'TEST-9999' }, items[0])]), 'R', 'x').html;
  assert.ok(html.includes('A&amp;B &lt;Health&gt;'));
  assert.ok(!html.includes('TEST-9999'));
});
test('empty digest says everything is on track', () => {
  const d0 = ctx.buildDigest([], 'R', 'x');
  assert.strictEqual(d0.overdue + d0.soon, 0);
  assert.ok(d0.html.includes('on track'));
});
test('isValidSingleEmail rejects lists', () => {
  assert.ok(ctx.isValidSingleEmail('auths@clinic.example'));
  assert.ok(!ctx.isValidSingleEmail('a@b.com,c@d.com'));
});

// --- sample data ---
test('sample data shows every kind of flag, using TEST accounts only', () => {
  const samples = plain(ctx.sampleRequests(TODAY));
  const latest = plain(ctx.lastFollowUps(plain(ctx.sampleLog(TODAY)).map(l => ({ caseId: 'C' + l.caseIndex, dateKey: l['Date'] }))));
  const flags = samples.map((s, i) => {
    s['Last follow-up'] = latest['C' + i] || '';
    return ctx.flagText(ctx.computeFlag(s, TODAY, {}));
  });
  assert.deepStrictEqual(flags, [
    'Overdue: No update in 8 days',
    'Overdue: No update in 6 days',
    'Overdue: Expedited, no decision after 4 days',
    'Soon: Follow up today',
    '',
    'Soon: Auth expires in 9 days',
    'Overdue: Auth expired on Nov 22',
    'Soon: Approved: add auth # and expiry',
    'Overdue: Appeal due in 5 days',
    'Soon: Denied: add the appeal deadline',
    '',
    ''
  ]);
  assert.ok(samples.every(s => /^TEST-\d{4}$/.test(s['Patient account #'])));
});
test('sample columns all exist in REQ_COLUMNS', () => {
  const cols = Array.from(ctx.REQ_COLUMNS);
  plain(ctx.sampleRequests(TODAY)).forEach(s => Object.keys(s).forEach(k => assert.ok(cols.includes(k), k)));
  plain(ctx.sampleLog(TODAY)).forEach(l => Object.keys(l).filter(k => k !== 'caseIndex')
    .forEach(k => assert.ok(Array.from(ctx.LOG_COLUMNS).includes(k), k)));
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
