// Run with: node test/logic.test.js
// Loads src/Logic.js the way Apps Script does (shared global scope) and checks it with made-up data.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'Logic.js'), 'utf8'), ctx);
const plain = v => JSON.parse(JSON.stringify(v)); // arrays from the sandbox compare cleanly after this

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

const complete = {
  account: 'TEST-2001', apptDate: '2026-12-01', payer: 'Aetna', planType: 'Commercial PPO',
  method: 'Payer portal', active: 'Yes', inNetwork: 'Yes', copay: 30, coinsurance: 20,
  deductible: 1500, deductibleMet: 400, oopMax: 6000, oopMet: 900, priorAuth: 'No',
  referral: 'No', refNumber: 'ELG-1', repName: '', staff: 'JM', notes: ''
};
const withChanges = ch => Object.assign({}, complete, ch);

test('a complete PPO check is Ready with deductible remaining', () => {
  const r = ctx.checkVerification(complete);
  assert.strictEqual(r.status, 'Ready');
  assert.strictEqual(r.deductibleRemaining, 1100);
  assert.deepStrictEqual(plain(r.missing), []);
});
test('inactive coverage is a Problem and skips benefit questions', () => {
  const r = ctx.checkVerification(withChanges({ active: 'No', inNetwork: '', copay: '', coinsurance: '', deductible: '', deductibleMet: '', priorAuth: '' }));
  assert.strictEqual(r.status, 'Problem');
  assert.deepStrictEqual(plain(r.problems), ['Coverage inactive']);
  assert.deepStrictEqual(plain(r.missing), []);
});
test('out of network is a Problem', () => {
  assert.strictEqual(ctx.checkVerification(withChanges({ inNetwork: 'No' })).status, 'Problem');
});
test('Unknown counts as missing', () => {
  const r = ctx.checkVerification(withChanges({ priorAuth: 'Unknown' }));
  assert.strictEqual(r.status, 'Missing info');
  assert.deepStrictEqual(plain(r.missing), ['Prior authorization required']);
});
test('phone calls need a rep name; every check needs a reference number', () => {
  const r = ctx.checkVerification(withChanges({ method: 'Phone call', refNumber: '' }));
  assert.deepStrictEqual(plain(r.missing), ['Reference number', 'Payer rep name']);
});
test('copay OR coinsurance is enough, and 0 is a real answer', () => {
  assert.strictEqual(ctx.checkVerification(withChanges({ copay: 0, coinsurance: '' })).status, 'Ready');
  const r = ctx.checkVerification(withChanges({ copay: '', coinsurance: '' }));
  assert.deepStrictEqual(plain(r.missing), ['Copay or coinsurance']);
});
test('referral plans need a referral answer; Not applicable is missing for them only', () => {
  const hmo = ctx.checkVerification(withChanges({ planType: 'Commercial HMO', referral: 'Not applicable' }));
  assert.deepStrictEqual(plain(hmo.missing), ['Referral required']);
  const ppo = ctx.checkVerification(withChanges({ referral: 'Not applicable' }));
  assert.strictEqual(ppo.status, 'Ready');
});
test('prior auth and referral Yes are Action needed', () => {
  const r = ctx.checkVerification(withChanges({ planType: 'Medicare Advantage', priorAuth: 'Yes', referral: 'Yes' }));
  assert.strictEqual(r.status, 'Action needed');
  assert.deepStrictEqual(plain(r.actions), ['Prior auth required', 'Referral required']);
});
test('number sanity checks', () => {
  const r = ctx.checkVerification(withChanges({ deductibleMet: 2000, oopMet: 7000, coinsurance: 120, copay: -5 }));
  assert.strictEqual(r.status, 'Problem');
  assert.deepStrictEqual(plain(r.problems).sort(), [
    'Coinsurance is over 100%', 'Copay ($) is not a valid amount',
    'Deductible met is more than the deductible', 'Out-of-pocket met is more than the max'
  ].sort());
  assert.strictEqual(r.deductibleRemaining, 0);
});
test('amounts typed with $ and commas are read', () => {
  const r = ctx.checkVerification(withChanges({ deductible: '$1,500', deductibleMet: '$250' }));
  assert.strictEqual(r.deductibleRemaining, 1250);
});
test('out-of-pocket needs both or neither', () => {
  assert.deepStrictEqual(plain(ctx.checkVerification(withChanges({ oopMet: '' })).missing), ['Out-of-pocket met so far ($)']);
  assert.strictEqual(ctx.checkVerification(withChanges({ oopMax: '', oopMet: '' })).status, 'Ready');
});
test('rowToRecord maps by header title, ignoring column order', () => {
  const headers = ['Timestamp', 'Payer', 'Patient account # (from EHR)', 'Status'];
  const rec = ctx.rowToRecord(headers, ['t', 'Cigna', 'TEST-9', 'x']);
  assert.strictEqual(rec.payer, 'Cigna');
  assert.strictEqual(rec.account, 'TEST-9');
  assert.strictEqual(rec.copay, '');
});
test('statusCells order matches STATUS_COLUMNS', () => {
  const cells = plain(ctx.statusCells(ctx.checkVerification(withChanges({ priorAuth: 'Yes' }))));
  assert.deepStrictEqual(cells, ['Action needed', '', 'Prior auth required', 1100]);
  assert.strictEqual(ctx.STATUS_COLUMNS.length, cells.length);
});
test('every field title is unique and no field asks for name, DOB or member ID', () => {
  const titles = Array.from(ctx.FIELDS, f => f.title);
  assert.strictEqual(new Set(titles).size, titles.length);
  assert.ok(!titles.some(t => /name/i.test(t) && !/rep name/i.test(t)));
  assert.ok(!titles.some(t => /birth|DOB|member id/i.test(t)));
});
test('call script has three columns and blank answer lines', () => {
  const rows = plain(ctx.buildCallScript());
  assert.ok(rows.length > 15);
  assert.ok(rows.every(r => r.length === 3 && /^_+$/.test(r[2])));
});
test('sample data covers every status and uses TEST accounts only', () => {
  const samples = plain(ctx.sampleVerifications()).map(s => Object.assign(s, { apptDate: '2026-12-01' }));
  const statuses = samples.map(s => ctx.checkVerification(s).status);
  assert.deepStrictEqual(statuses, ['Ready', 'Ready', 'Action needed', 'Action needed', 'Problem', 'Missing info', 'Problem', 'Missing info']);
  assert.ok(samples.every(s => /^TEST-\d{4}$/.test(s.account)));
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
