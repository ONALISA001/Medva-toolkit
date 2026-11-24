// Run with: node test/checklist.test.js
const assert = require('assert');
const C = require('../checklist.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}
const all = ans => Object.fromEntries(C.QUESTIONS.map(q => [q.id, ans]));

test('31 questions across 9 areas, every area has at least 3', () => {
  assert.strictEqual(C.QUESTIONS.length, 31);
  assert.strictEqual(C.AREAS.length, 9);
  C.AREAS.forEach(a => assert.ok(C.questionsIn(a.id).length >= 3, a.name));
});
test('ids are unique, weights are 1-3, every question has a fix', () => {
  assert.strictEqual(new Set(C.QUESTIONS.map(q => q.id)).size, C.QUESTIONS.length);
  C.QUESTIONS.forEach(q => {
    assert.ok([1, 2, 3].includes(q.weight), q.id);
    assert.ok(q.fix && q.fix.length > 20, q.id);
    assert.ok(C.AREAS.some(a => a.id === q.area), q.id);
  });
});
test('no question asks for patient information', () => {
  const text = C.QUESTIONS.map(q => q.q).join(' ').toLowerCase();
  ['date of birth', 'patient name', 'ssn', 'diagnos', 'medical record number'].forEach(w => assert.ok(!text.includes(w), w));
});
test('nothing answered: not started, no fixes', () => {
  const r = C.score({});
  assert.strictEqual(r.overall.pct, null);
  assert.strictEqual(r.overall.band, 'Not started');
  assert.strictEqual(r.fixes.length, 0);
  assert.ok(r.areas.every(a => a.band === 'Not started'));
});
test('all yes is 100% Strong with no fixes', () => {
  const r = C.score(all('yes'));
  assert.strictEqual(r.overall.pct, 100);
  assert.strictEqual(r.overall.band, 'Strong');
  assert.ok(r.complete);
  assert.strictEqual(r.fixes.length, 0);
});
test('all no is 0% At risk and the top 5 are all critical', () => {
  const r = C.score(all('no'));
  assert.strictEqual(r.overall.pct, 0);
  assert.strictEqual(r.overall.band, 'At risk');
  assert.strictEqual(r.fixes.length, 5);
  assert.ok(r.fixes.every(f => f.weight === 3));
  assert.deepStrictEqual(r.fixes.map(f => f.id), ['pw1', 'pw2', 'dev1', 'acc1', 'acc3']);
});
test('not sure scores 0 and its fix starts with Find out', () => {
  const r = C.score(Object.assign(all('yes'), { baa2: 'unsure' }));
  assert.strictEqual(r.fixes.length, 1);
  assert.ok(r.fixes[0].text.startsWith('Find out: '));
  assert.ok(r.overall.pct < 100);
});
test('weights decide order: a critical gap beats an earlier minor one', () => {
  const r = C.score(Object.assign(all('yes'), { acc4: 'no', phish3: 'no', train4: 'no' }));
  assert.deepStrictEqual(r.fixes.map(f => f.id), ['train4', 'phish3', 'acc4']);
});
test('weighted overall percentage', () => {
  const total = C.QUESTIONS.reduce((t, q) => t + q.weight, 0);
  const r = C.score(Object.assign(all('yes'), { dev1: 'no' }));
  assert.strictEqual(r.overall.possible, total);
  assert.strictEqual(r.overall.pct, Math.round((total - 3) / total * 100));
});
test('unanswered questions count as gaps in the score but are not listed as fixes', () => {
  const answers = all('yes'); delete answers.pw1;
  const r = C.score(answers);
  assert.strictEqual(r.overall.unanswered, 1);
  assert.ok(r.overall.pct < 100);
  assert.strictEqual(r.fixes.length, 0);
  assert.strictEqual(r.complete, false);
});
test('junk answer values are ignored', () => {
  const r = C.score({ pw1: 'maybe', pw2: 'YES', pw3: 'yes' });
  assert.strictEqual(r.overall.answered, 1);
});
test('band thresholds', () => {
  assert.strictEqual(C.band(80), 'Strong');
  assert.strictEqual(C.band(79), 'Needs work');
  assert.strictEqual(C.band(50), 'Needs work');
  assert.strictEqual(C.band(49), 'At risk');
  assert.strictEqual(C.band(null), 'Not started');
});
test('area scores', () => {
  const r = C.score(Object.assign(all('yes'), { bak1: 'no' }));
  const bak = r.areas.find(a => a.id === 'bak');
  assert.strictEqual(bak.pct, Math.round(4 / 7 * 100));
  assert.strictEqual(bak.band, 'Needs work');
  assert.strictEqual(r.areas.find(a => a.id === 'pw').pct, 100);
});
test('report text has overall, every area, the fixes and the disclaimer', () => {
  const r = C.score(Object.assign(all('yes'), { mail1: 'no', bak3: 'unsure' }));
  const t = C.reportText(r, 'Example Family Clinic', 'November 24, 2026');
  assert.ok(t.startsWith('HIPAA security checklist: Example Family Clinic\nNovember 24, 2026'));
  C.AREAS.forEach(a => assert.ok(t.includes('- ' + a.name + ': '), a.name));
  assert.ok(t.includes('Top 2 fixes:\n1. Move clinic email'));
  assert.ok(t.includes('2. Find out: Restore a few files'));
  assert.ok(t.includes('not legal advice'));
});
test('report for a clean sheet says no gaps', () => {
  assert.ok(C.reportText(C.score(all('yes'))).includes('No gaps found'));
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
