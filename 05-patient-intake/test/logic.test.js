// Run with: node test/logic.test.js
// Loads src/Logic.js the way Apps Script does (shared global scope) and checks it with made-up patients.
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
const jane = () => plain(ctx.sampleIntakes()[0]);
const flags = (changes) => plain(ctx.validateIntake(Object.assign(jane(), changes), TODAY));

// --- form definition ---
test('every field has a unique title and a known section', () => {
  const titles = Array.from(ctx.FIELDS, f => f.title);
  assert.strictEqual(new Set(titles).size, titles.length);
  ctx.FIELDS.forEach(f => assert.ok(Array.from(ctx.SECTIONS).includes(f.section), f.title));
});
test('the form asks no clinical or SSN questions', () => {
  const titles = Array.from(ctx.FIELDS, f => f.title.toLowerCase()).join(' | ');
  ['social security', 'ssn', 'diagnos', 'medication', 'reason for visit', 'symptom', 'history', 'allerg']
    .forEach(word => assert.ok(!titles.includes(word), word));
});
test('fields are grouped section by section in form order', () => {
  const order = Array.from(ctx.FIELDS, f => Array.from(ctx.SECTIONS).indexOf(f.section));
  assert.deepStrictEqual(order, order.slice().sort((a, b) => a - b));
});
test('sample patients cover every field', () => {
  const keys = Array.from(ctx.FIELDS, f => f.key);
  plain(ctx.sampleIntakes()).forEach(s => keys.forEach(k => assert.ok(k in s, k)));
});

// --- dates and formatting ---
test('ageOn counts birthdays correctly', () => {
  assert.strictEqual(ctx.ageOn('1980-01-01', TODAY), 46);
  assert.strictEqual(ctx.ageOn('2008-11-24', TODAY), 18);
  assert.strictEqual(ctx.ageOn('2008-11-25', TODAY), 17);
  assert.strictEqual(ctx.ageOn('', TODAY), null);
});
test('usDate and formatPhone', () => {
  assert.strictEqual(ctx.usDate('1980-01-01'), '01/01/1980');
  assert.strictEqual(ctx.formatPhone('5550100001'), '(555) 010-0001');
  assert.strictEqual(ctx.formatPhone('+1 555.010.0001'), '(555) 010-0001');
  assert.strictEqual(ctx.formatPhone('12345'), '12345');
});
test('patientLabel is "Last, F."', () => {
  assert.strictEqual(ctx.patientLabel({ firstName: 'jane', lastName: 'Test' }), 'Test, J.');
  assert.strictEqual(ctx.patientLabel({ firstName: '', lastName: '' }), '(no name)');
});
test('safeCell stops patient text from becoming a formula', () => {
  assert.strictEqual(ctx.safeCell('=IMPORTDATA("http://x")'), '\'=IMPORTDATA("http://x")');
  assert.strictEqual(ctx.safeCell('+1'), "'+1");
  assert.strictEqual(ctx.safeCell('@x'), "'@x");
  assert.strictEqual(ctx.safeCell('Test'), 'Test');
  assert.ok(ctx.patientLabel({ firstName: 'a', lastName: '=HYPERLINK("http://x")' }).startsWith("'="));
});

// --- checks ---
test('a complete adult intake has no flags', () => assert.deepStrictEqual(flags({}), []));
test('missing insurance details', () => {
  assert.deepStrictEqual(flags({ memberId: '' }), ['Insurance details missing']);
  assert.deepStrictEqual(flags({ hasInsurance: 'No, I will pay myself', insurer: '', memberId: '' }), []);
});
test('missing policyholder details', () => {
  assert.deepStrictEqual(flags({ isSubscriber: 'No', subscriberName: 'Alex Test', subscriberDob: '' }), ['Policyholder details missing']);
});
test('date of birth checks', () => {
  assert.deepStrictEqual(flags({ dob: '2030-01-01' }), ['Check date of birth']);
  assert.deepStrictEqual(flags({ dob: '1890-01-01' }), ['Check date of birth']);
  assert.deepStrictEqual(flags({ dob: '' }), ['Check date of birth']);
});
test('minors need a guardian, and a guardian signature is not flagged', () => {
  assert.deepStrictEqual(flags({ dob: '2015-05-05', signature: 'Alex Parent' }), ['Minor: guardian consent and ID needed']);
});
test('adult signature must contain the last name, any case', () => {
  assert.deepStrictEqual(flags({ signature: 'jane TEST' }), []);
  assert.deepStrictEqual(flags({ signature: 'J. T.' }), ['Check signature']);
});
test('missing emergency contact', () => {
  assert.deepStrictEqual(flags({ ecPhone: '' }), ['No emergency contact']);
});

// --- checklist ---
test('checklist status lists what is left', () => {
  const none = {};
  assert.strictEqual(ctx.checklistStatus(none, false), 'Waiting: insurance card, photo ID, signed forms, EHR entry');
  assert.strictEqual(ctx.checklistStatus(none, true), 'Waiting: photo ID, signed forms, EHR entry');
  const all = { 'Insurance card received': true, 'Photo ID received': true, 'Forms signed': true, 'Entered in EHR': true };
  assert.strictEqual(ctx.checklistStatus(all, false), 'Complete');
  assert.strictEqual(ctx.checklistStatus(Object.assign({}, all, { 'Insurance card received': false }), true), 'Complete');
});
test('intake IDs count up', () => {
  assert.strictEqual(ctx.nextIntakeId([]), 'INT-0001');
  assert.strictEqual(ctx.nextIntakeId(['INT-0004', 'x', 'INT-0002']), 'INT-0005');
});
test('clean-up waits for EHR entry and the keep period', () => {
  assert.strictEqual(ctx.readyForCleanup(true, '2026-10-01', TODAY, 30), true);
  assert.strictEqual(ctx.readyForCleanup(true, '2026-11-20', TODAY, 30), false);
  assert.strictEqual(ctx.readyForCleanup(false, '2026-01-01', TODAY, 30), false);
  assert.strictEqual(ctx.readyForCleanup(true, TODAY, TODAY, 0), true);
  assert.strictEqual(ctx.readyForCleanup(true, '', TODAY, 0), false);
});

// --- summary doc ---
test('summary is named by intake ID, not patient name', () => {
  const s = plain(ctx.buildSummary(jane(), 'INT-0007', '2026-11-24', TODAY));
  assert.strictEqual(s.docName, 'Intake INT-0007 (2026-11-24)');
  assert.ok(!s.docName.includes('Test'));
  assert.ok(s.subtitle.includes('Confidential'));
});
test('summary shows age, formatted phone and consents', () => {
  const s = plain(ctx.buildSummary(jane(), 'INT-0001', '2026-11-24', TODAY));
  const rows = Object.fromEntries(s.sections.flatMap(x => x.rows));
  assert.strictEqual(rows['Date of birth'], '01/01/1980 (age 46)');
  assert.strictEqual(rows['Mobile phone'], '(555) 010-0001');
  assert.strictEqual(rows['Address'], '100 Sample St\nSpringfield, IL 62701');
  assert.strictEqual(rows['Notice of Privacy Practices'], 'Agreed');
  assert.strictEqual(rows['Signed on'], '11/24/2026');
});
test('summary for self-pay hides insurance rows; dependants show the policyholder', () => {
  const self = plain(ctx.buildSummary(plain(ctx.sampleIntakes()[1]), 'INT-2', TODAY, TODAY));
  assert.deepStrictEqual(self.sections[2].rows, [['Coverage', 'Self-pay']]);
  const child = plain(ctx.buildSummary(plain(ctx.sampleIntakes()[2]), 'INT-3', TODAY, TODAY));
  assert.ok(child.sections[2].rows.some(r => r[0] === 'Policyholder' && r[1] === 'Alex Test'));
});
test('a missing consent shows NOT agreed', () => {
  const s = plain(ctx.buildSummary(Object.assign(jane(), { consentFinancial: '' }), 'INT-1', TODAY, TODAY));
  assert.ok(s.sections[4].rows.some(r => r[0] === 'Financial policy' && r[1] === 'NOT agreed'));
});

// --- sample data ---
test('sample patients are obviously fake and show each kind of flag', () => {
  const samples = plain(ctx.sampleIntakes());
  assert.ok(samples.every(s => s.lastName === 'Test' && s.phone.startsWith('555') && /^DEMO|^$/.test(s.memberId)));
  assert.deepStrictEqual(samples.map(s => plain(ctx.validateIntake(s, TODAY))), [
    [],
    [],
    ['Minor: guardian consent and ID needed'],
    ['Insurance details missing'],
    ['Check signature', 'No emergency contact']
  ]);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
