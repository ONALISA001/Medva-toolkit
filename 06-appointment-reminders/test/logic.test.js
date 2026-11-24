// Run with: node test/logic.test.js
// Loads src/Logic.js the way Apps Script does (shared global scope) and checks it with made-up appointments.
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

const TODAY = '2026-11-24'; // a Tuesday
const d = n => ctx.addDays(TODAY, n);
const appt = extra => Object.assign({ 'Appt ID': 'AP-0001', 'Date': d(2), 'Time': '10:30 AM', 'First name': 'Jane',
  'Email': 'jane.test@example.com', 'Mobile phone': '(555) 010-1000', 'Reminders': 'Email', 'Confirmation': 'No reply',
  'Outcome': '', '2-day reminder': '', '1-day reminder': '', 'Rebook sent': '', 'Notes': '' }, extra);
const settings = { clinicName: 'Riverside Family Medicine', clinicPhone: '(555) 010-2200', testTo: 'tester@example.com' };

// --- dates ---
test('date labels and week start', () => {
  assert.strictEqual(ctx.longDate('2026-12-01'), 'Tuesday, December 1');
  assert.strictEqual(ctx.shortDate('2026-12-01'), 'Tue, Dec 1');
  assert.strictEqual(ctx.weekStart('2026-11-24'), '2026-11-23');
  assert.strictEqual(ctx.weekStart('2026-11-23'), '2026-11-23');
  assert.strictEqual(ctx.weekStart('2026-11-29'), '2026-11-23');
});

// --- what is due ---
test('2 days out sends the 2-day reminder once', () => {
  assert.strictEqual(ctx.reminderDue(appt(), TODAY), '2-day');
  assert.strictEqual(ctx.reminderDue(appt({ '2-day reminder': 'Sent x' }), TODAY), '');
});
test('1 day out sends the 1-day reminder, even if the 2-day was missed', () => {
  assert.strictEqual(ctx.reminderDue(appt({ 'Date': d(1) }), TODAY), '1-day');
  assert.strictEqual(ctx.reminderDue(appt({ 'Date': d(1), '1-day reminder': 'Sent' }), TODAY), '');
});
test('nothing is due for other days, cancellations, reschedules or opt-outs', () => {
  [d(0), d(3), d(-1)].forEach(date => assert.strictEqual(ctx.reminderDue(appt({ 'Date': date }), TODAY), ''));
  assert.strictEqual(ctx.reminderDue(appt({ 'Confirmation': 'Cancelled' }), TODAY), '');
  assert.strictEqual(ctx.reminderDue(appt({ 'Confirmation': 'Rescheduled' }), TODAY), '');
  assert.strictEqual(ctx.reminderDue(appt({ 'Reminders': 'No reminders' }), TODAY), '');
  assert.strictEqual(ctx.reminderDue(appt({ 'Date': '' }), TODAY), '');
});
test('confirmed patients still get reminders', () =>
  assert.strictEqual(ctx.reminderDue(appt({ 'Confirmation': 'Confirmed' }), TODAY), '2-day'));
test('emailBlocker explains why email cannot be used', () => {
  assert.strictEqual(ctx.emailBlocker(appt()), '');
  assert.strictEqual(ctx.emailBlocker(appt({ 'Reminders': 'Email and text' })), '');
  assert.strictEqual(ctx.emailBlocker(appt({ 'Reminders': 'Text' })), 'Not sent: text only, call instead');
  assert.strictEqual(ctx.emailBlocker(appt({ 'Email': 'nope' })), 'Not sent: no valid email');
});
test('rebook goes 1 to 7 days after a no-show, only when switched on', () => {
  const ns = appt({ 'Date': d(-1), 'Outcome': 'No-show' });
  assert.strictEqual(ctx.rebookDue(ns, TODAY, true), true);
  assert.strictEqual(ctx.rebookDue(ns, TODAY, false), false);
  assert.strictEqual(ctx.rebookDue(appt({ 'Date': d(-8), 'Outcome': 'No-show' }), TODAY, true), false);
  assert.strictEqual(ctx.rebookDue(appt({ 'Date': d(0), 'Outcome': 'No-show' }), TODAY, true), false);
  assert.strictEqual(ctx.rebookDue(Object.assign(ns, { 'Rebook sent': 'Sent' }), TODAY, true), false);
  assert.strictEqual(ctx.rebookDue(appt({ 'Date': d(-1), 'Outcome': 'Attended' }), TODAY, true), false);
});

// --- flags ---
test('row flags', () => {
  assert.strictEqual(ctx.rowFlag(appt(), TODAY, false), '');
  assert.strictEqual(ctx.rowFlag(appt({ 'Reminders': 'Text' }), TODAY, false), 'Text only: call to remind');
  assert.strictEqual(ctx.rowFlag(appt({ 'Email': '' }), TODAY, false), 'Add a valid email');
  assert.strictEqual(ctx.rowFlag(appt({ 'Date': d(-1) }), TODAY, false), 'Mark the outcome');
  assert.strictEqual(ctx.rowFlag(appt({ 'Date': d(-1), 'Confirmation': 'Cancelled' }), TODAY, false), '');
  assert.strictEqual(ctx.rowFlag(appt({ 'Date': d(-2), 'Outcome': 'No-show' }), TODAY, false), 'No-show: call to rebook');
  assert.strictEqual(ctx.rowFlag(appt({ 'Date': d(-2), 'Outcome': 'No-show' }), TODAY, true), '');
});

// --- messages ---
test('reminder holds only first name, date, time and clinic phone', () => {
  const m = plain(ctx.buildReminder(appt({ 'Notes': 'Knee MRI follow-up', 'Mobile phone': '(555) 999-0000' }), settings, '2-day', false));
  assert.strictEqual(m.to, 'jane.test@example.com');
  assert.strictEqual(m.subject, 'Reminder: your appointment on Thu, Nov 26');
  assert.ok(m.text.includes('Hi Jane,'));
  assert.ok(m.text.includes('Thursday, November 26 at 10:30 AM'));
  assert.ok(m.text.includes('(555) 010-2200'));
  assert.ok(!m.text.includes('MRI') && !m.text.includes('999-0000') && !m.text.includes('AP-0001'));
  assert.strictEqual(m.name, 'Riverside Family Medicine');
});
test('1-day reminder says tomorrow', () => {
  const m = plain(ctx.buildReminder(appt({ 'Date': d(1) }), settings, '1-day', false));
  assert.ok(m.text.includes('tomorrow, Wednesday, November 25'));
});
test('test mode sends to the tester and marks the subject', () => {
  const m = plain(ctx.buildReminder(appt(), settings, '2-day', true));
  assert.strictEqual(m.to, 'tester@example.com');
  assert.ok(m.subject.startsWith('[TEST] '));
  const r = plain(ctx.buildRebook(appt({ 'Date': d(-1) }), settings, true));
  assert.strictEqual(r.to, 'tester@example.com');
});
test('a full name typed by mistake is cut to the first name, and HTML is escaped', () => {
  assert.strictEqual(ctx.greetingName('Jane Q Test'), 'Jane');
  assert.strictEqual(ctx.greetingName("  Mary-Kate "), 'Mary-Kate');
  assert.strictEqual(ctx.greetingName('<b>'), 'b');
  const m = plain(ctx.buildReminder(appt(), Object.assign({}, settings, { clinicName: 'A & B <Clinic>' }), '2-day', false));
  assert.ok(m.html.includes('A &amp; B &lt;Clinic&gt;'));
});
test('rebook message names the missed date and nothing clinical', () => {
  const m = plain(ctx.buildRebook(appt({ 'Date': d(-1), 'Notes': 'diabetes check' }), settings, false));
  assert.ok(m.text.includes('Monday, November 23'));
  assert.ok(!m.text.includes('diabetes'));
});

// --- weekly report ---
test('weekStats counts and rates', () => {
  const week = '2026-11-16';
  const rows = [
    appt({ 'Date': '2026-11-16', 'Outcome': 'Attended', 'Confirmation': 'Confirmed' }),
    appt({ 'Date': '2026-11-17', 'Outcome': 'Attended' }),
    appt({ 'Date': '2026-11-18', 'Outcome': 'No-show' }),
    appt({ 'Date': '2026-11-19', 'Outcome': 'No-show', 'Confirmation': 'Confirmed' }),
    appt({ 'Date': '2026-11-20', 'Outcome': 'Cancelled' }),
    appt({ 'Date': '2026-11-21', 'Confirmation': 'Rescheduled' }),
    appt({ 'Date': '2026-11-22', 'Outcome': '' }),
    appt({ 'Date': '2026-11-23', 'Outcome': 'No-show' }) // next week
  ];
  const s = plain(ctx.weekStats(rows, week));
  assert.deepStrictEqual([s.appointments, s.attended, s.noShow, s.cancelled, s.rescheduled, s.notMarked], [7, 2, 2, 1, 1, 1]);
  assert.strictEqual(s.noShowRate, 50);
  assert.strictEqual(s.confirmedRate, 50);
  assert.strictEqual(s.unconfirmedRate, 50);
});
test('empty weeks report n/a, not 0%', () => {
  const s = plain(ctx.weekStats([], '2026-11-16'));
  assert.strictEqual(s.noShowRate, null);
});
test('weeklyReport returns 8 weeks, oldest first, ending this week', () => {
  const weeks = plain(ctx.weeklyReport([], TODAY, 8));
  assert.strictEqual(weeks.length, 8);
  assert.strictEqual(weeks[7].week, '2026-11-23');
  assert.strictEqual(weeks[0].week, '2026-10-05');
});
test('weekly email has counts only', () => {
  const samples = plain(ctx.sampleAppointments(TODAY));
  const e = plain(ctx.buildWeeklyEmail(plain(ctx.weeklyReport(samples, TODAY, 8)), 'Riverside'));
  assert.ok(e.subject.startsWith('No-show report: '));
  ['Jane', 'Sam', '@example.com', '555'].forEach(s => assert.ok(!e.html.includes(s), s));
});

// --- sample data ---
test('sample upcoming appointments hit every sending case', () => {
  const s = plain(ctx.sampleAppointments(TODAY)).filter(a => a['Date'] >= TODAY);
  const due = s.map(a => {
    const k = ctx.reminderDue(a, TODAY);
    return k ? k + (ctx.emailBlocker(a) ? ' blocked' : '') : '';
  });
  assert.deepStrictEqual(due, ['1-day', '1-day blocked', '2-day', '2-day', '2-day blocked', '', '', '']);
});
test('sample recent rows show the no-show and mark-outcome flags', () => {
  const s = plain(ctx.sampleAppointments(TODAY));
  assert.ok(s.some(a => ctx.rowFlag(a, TODAY, false) === 'No-show: call to rebook'));
  assert.ok(s.some(a => ctx.rowFlag(a, TODAY, false) === 'Mark the outcome'));
});
test('sample history shows confirmations lowering no-shows over time', () => {
  const weeks = plain(ctx.weeklyReport(plain(ctx.sampleAppointments(TODAY)), TODAY, 9)).slice(0, 8);
  const early = weeks[0].noShowRate, late = weeks[7].noShowRate;
  assert.ok(early !== null && late !== null && late < early, `early ${early}% vs late ${late}%`);
  const tot = weeks.reduce((t, w) => ({ cs: t.cs + w.confirmedSeen, cn: t.cn + w.confirmedNoShow, us: t.us + w.unconfirmedSeen, un: t.un + w.unconfirmedNoShow }), { cs: 0, cn: 0, us: 0, un: 0 });
  assert.ok(tot.cn / tot.cs < tot.un / tot.us);
});
test('sample emails all go to example.com', () => {
  plain(ctx.sampleAppointments(TODAY)).forEach(a => assert.ok(!a['Email'] || /@example\.com$|^not-an-email$/.test(a['Email']), a['Email']));
});
test('next IDs count up', () => assert.strictEqual(ctx.nextApptId(['AP-0041', '']), 'AP-0042'));

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
