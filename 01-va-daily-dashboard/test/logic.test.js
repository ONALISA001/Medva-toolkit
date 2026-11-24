// Run with: node test/logic.test.js
// Loads src/Logic.js the way Apps Script does (shared global scope) and checks it with fake data.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'Logic.js'), 'utf8'), ctx);

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

// --- PHI check: should flag ---
const shouldFlag = {
  'SSN': 'Called about 123-45-6789',
  'DOB keyword': 'Pt DOB on file',
  'birth date': 'Verified 04/12/1987 with payer',
  'phone': 'Left message at (555) 201-3344',
  'phone dashed': 'Call back 555-201-3344',
  'phone missing a digit (found in testing)': 'Called 555-410-023',
  'phone with spaces': 'Called 555 410 0234',
  'phone with dots': 'Called 555.410.0234',
  'international phone': 'Called +254 712 345 678',
  'local 7-digit phone': 'Call back 410-0234',
  'member id keyword': 'Member ID checked',
  'long id number': 'Ref W123456789 pending',
  'MRN': 'MRN pulled for auth',
  'email': 'Sent to jane.test@example.com',
  'titled name': 'Called Mrs Johnson about her auth',
  'patient name': 'patient Smith rescheduled',
  'title with a dot and no space (found in testing)': 'Called Mrs.johnson about her auth',
  'lowercase surname after a title': 'Called Mrs johnson',
  'all capitals': 'Spoke to MR SMITH today',
  'Ms with a dot': 'Ms. lee called back',
  'Dr with a name': 'Faxed to Dr.Patel',
  'pt with a name': 'pt Jones needs a callback',
};
for (const [label, text] of Object.entries(shouldFlag)) {
  test('phiCheck flags ' + label, () => assert.ok(ctx.phiCheck(text).length > 0, text));
}

// --- PHI check: work notes that must pass ---
const shouldPass = [
  'Chased 3 pending UHC auths',
  'Submitted MRI auth through the portal',
  'Verified tomorrow\'s schedule',
  'Auth due back 12/05/2026',
  'Cleared shared inbox to zero',
  'Called Blue Cross about 2 claims',
  'Sent cardiology packet; confirmed receipt',
  'Missed 2 calls from the queue',
  'Called Dr office to confirm the fax',
  'PT notes faxed to the payer',
  'Logged 3 calls, 45 minutes',
  'Auth valid 2026-11-24 to 2026-12-24',
  'Chased 12 of 140 open claims',
];
for (const text of shouldPass) {
  test('phiCheck passes "' + text + '"', () => assert.deepStrictEqual(Array.from(ctx.phiCheck(text)), []));
}

// --- Validation ---
test('validateRows accepts clean rows', () => {
  const rows = [{ rowNumber: 2, dayKey: '2026-11-24', type: 'Prior auth', count: 3, minutes: 45, notes: 'Chased 3 auths' }];
  assert.strictEqual(ctx.validateRows(rows).length, 0);
});
test('validateRows reports bad type, numbers and PHI with the right columns', () => {
  const rows = [
    { rowNumber: 5, type: 'Coffee', count: 1, minutes: 5, notes: '' },
    { rowNumber: 6, type: 'Calls', count: -1, minutes: 5, notes: '' },
    { rowNumber: 7, type: 'Calls', count: 2.5, minutes: 2000, notes: '' },
    { rowNumber: 8, type: 'Calls', count: 1, minutes: 5, notes: 'Mr Jones DOB 01/02/1960' },
  ];
  const p = Array.from(ctx.validateRows(rows), x => x.rowNumber + ':' + x.column);
  assert.deepStrictEqual(p, ['5:Task type', '6:Count', '7:Count', '7:Minutes', '8:Notes']);
});
test('validateRows treats blank count and minutes as 0', () => {
  assert.strictEqual(ctx.validateRows([{ rowNumber: 2, type: 'Calls', count: '', minutes: '', notes: '' }]).length, 0);
});

// --- Summaries ---
const rows = [
  { dayKey: '2026-11-24', type: 'Calls', count: 10, minutes: 40, notes: 'Returned voicemails' },
  { dayKey: '2026-11-24', type: 'Calls', count: 2, minutes: 10, notes: '' },
  { dayKey: '2026-11-24', type: 'Prior auth', count: 3, minutes: 54, notes: 'Chased 3 auths' },
  { dayKey: '2026-11-24', type: 'Mystery', count: 1, minutes: 5, notes: '' },
  { dayKey: '2026-11-23', type: 'Calls', count: 99, minutes: 99, notes: 'yesterday' },
];
test('summarizeDay totals only that day and folds unknown types into Other', () => {
  const s = ctx.summarizeDay(rows, '2026-11-24');
  assert.strictEqual(s.totalCount, 16);
  assert.strictEqual(s.totalMinutes, 109);
  assert.deepStrictEqual(Array.from(s.byType, x => [x.type, x.count, x.minutes]),
    [['Calls', 12, 50], ['Prior auth', 3, 54], ['Other', 1, 5]]);
  assert.strictEqual(s.notes.length, 2);
});
test('summarizeWeek returns one entry per day with every task type', () => {
  const w = ctx.summarizeWeek(rows, ['2026-11-22', '2026-11-23', '2026-11-24']);
  assert.strictEqual(w.length, 3);
  assert.strictEqual(w[0].totalMinutes, 0);
  assert.strictEqual(w[1].minutesByType.Calls, 99);
  assert.strictEqual(Object.keys(w[2].minutesByType).length, ctx.TASK_TYPES.length);
});

// --- Formatting and email ---
test('formatMinutes', () => {
  assert.strictEqual(ctx.formatMinutes(0), '0 min');
  assert.strictEqual(ctx.formatMinutes(45), '45 min');
  assert.strictEqual(ctx.formatMinutes(60), '1 h');
  assert.strictEqual(ctx.formatMinutes(135), '2 h 15 min');
});
test('isValidSingleEmail accepts one address and rejects lists', () => {
  assert.ok(ctx.isValidSingleEmail('manager@clinic.example'));
  assert.ok(!ctx.isValidSingleEmail('a@b.com, c@d.com'));
  assert.ok(!ctx.isValidSingleEmail('a@b.com;c@d.com'));
  assert.ok(!ctx.isValidSingleEmail('not an email'));
  assert.ok(!ctx.isValidSingleEmail(''));
});
test('buildEodHtml escapes notes and settings', () => {
  const s = ctx.summarizeDay([{ dayKey: 'k', type: 'Calls', count: 1, minutes: 5, notes: '<script>alert(1)</script>' }], 'k');
  const html = ctx.buildEodHtml(s, { clinicName: 'A & B <Clinic>', vaName: 'James' }, 'Tuesday, Nov 24');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('A &amp; B &lt;Clinic&gt;'));
  assert.ok(html.includes('1</b> tasks'));
});
test('eodSubject', () => {
  assert.strictEqual(ctx.eodSubject({ clinicName: 'Riverside' }, 'Tuesday, Nov 24'), 'EOD report: Riverside, Tuesday, Nov 24');
});

// --- Sample data ---
test('sampleDay is repeatable, valid and free of patient data', () => {
  const a = ctx.sampleDay('2026-11-24', 20416), b = ctx.sampleDay('2026-11-24', 20416);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  const withRows = a.map((r, i) => Object.assign({ rowNumber: i + 2 }, r));
  assert.deepStrictEqual(Array.from(ctx.validateRows(withRows)), []);
  assert.ok(a.every(r => r.notes.endsWith('(sample)')));
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
