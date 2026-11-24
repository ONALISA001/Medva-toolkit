/**
 * Pure logic for the Patient Intake Pipeline. No Google services here,
 * so it can be tested with Node (see test/logic.test.js).
 * The form, the summary doc and the checks are all built from FIELDS.
 * Dates are 'yyyy-MM-dd' keys.
 */

var SECTIONS = ['About you', 'Contact', 'Insurance', 'Emergency contact', 'Consents'];
var AGREE = 'I agree';
var US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
  'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

var FIELDS = [
  { key: 'firstName', section: 'About you', title: 'Legal first name', type: 'text', required: true },
  { key: 'lastName', section: 'About you', title: 'Legal last name', type: 'text', required: true },
  { key: 'preferredName', section: 'About you', title: 'Preferred name', type: 'text' },
  { key: 'dob', section: 'About you', title: 'Date of birth', type: 'date', required: true },
  { key: 'sex', section: 'About you', title: 'Sex as listed on your insurance', type: 'list', required: true,
    options: ['Female', 'Male', 'X', 'Not listed / no insurance'] },

  { key: 'phone', section: 'Contact', title: 'Mobile phone', type: 'phone', required: true },
  { key: 'email', section: 'Contact', title: 'Email', type: 'email' },
  { key: 'street', section: 'Contact', title: 'Street address', type: 'text', required: true },
  { key: 'city', section: 'Contact', title: 'City', type: 'text', required: true },
  { key: 'state', section: 'Contact', title: 'State', type: 'list', required: true, options: US_STATES },
  { key: 'zip', section: 'Contact', title: 'ZIP code', type: 'zip', required: true },
  { key: 'contactPref', section: 'Contact', title: 'Best way to reach you', type: 'choice', required: true,
    options: ['Phone call', 'Text message', 'Email'] },
  { key: 'reminders', section: 'Contact', title: 'Appointment reminders', type: 'choice', required: true,
    options: ['Text and email', 'Text only', 'Email only', 'No reminders'],
    help: 'Reminders include only the clinic name, date, time and phone number. Never the reason for your visit.' },

  { key: 'hasInsurance', section: 'Insurance', title: 'Do you have health insurance?', type: 'choice', required: true,
    options: ['Yes', 'No, I will pay myself'] },
  { key: 'insurer', section: 'Insurance', title: 'Insurance company', type: 'text' },
  { key: 'memberId', section: 'Insurance', title: 'Member ID', type: 'text' },
  { key: 'groupNumber', section: 'Insurance', title: 'Group number', type: 'text' },
  { key: 'isSubscriber', section: 'Insurance', title: 'Are you the policyholder?', type: 'choice', options: ['Yes', 'No'] },
  { key: 'subscriberName', section: 'Insurance', title: 'Policyholder full name', type: 'text', help: 'Only if you are not the policyholder.' },
  { key: 'subscriberDob', section: 'Insurance', title: 'Policyholder date of birth', type: 'date', help: 'Only if you are not the policyholder.' },
  { key: 'relationship', section: 'Insurance', title: 'Your relationship to the policyholder', type: 'list',
    options: ['Spouse or partner', 'Child', 'Other'] },

  { key: 'ecName', section: 'Emergency contact', title: 'Emergency contact name', type: 'text' },
  { key: 'ecRelationship', section: 'Emergency contact', title: 'Emergency contact relationship', type: 'text' },
  { key: 'ecPhone', section: 'Emergency contact', title: 'Emergency contact phone', type: 'phone' },

  { key: 'consentNpp', section: 'Consents', title: 'I received or was offered the Notice of Privacy Practices', type: 'agree', required: true },
  { key: 'consentTreat', section: 'Consents', title: 'I consent to evaluation and treatment by the clinic', type: 'agree', required: true },
  { key: 'consentFinancial', section: 'Consents', title: 'I have read the financial policy', type: 'agree', required: true },
  { key: 'signature', section: 'Consents', title: 'Signature: type your full legal name', type: 'text', required: true,
    help: 'A parent or guardian signs for patients under 18.' }
];

var CHECKLIST_COLUMNS = ['Intake ID', 'Submitted', 'Patient', 'Summary doc', 'Self-pay', 'Insurance card received',
  'Photo ID received', 'Forms signed', 'Entered in EHR', 'Status', 'Flags', 'Notes'];
var CHECK_ITEMS = ['Insurance card received', 'Photo ID received', 'Forms signed', 'Entered in EHR'];
var ID_PREFIX = 'INT-';

function fieldTitle(key) {
  for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].key === key) return FIELDS[i].title;
  throw new Error('Unknown field ' + key);
}

/** Turns a response-sheet row into a record keyed by field key, using header titles. */
function rowToRecord(headers, row) {
  var rec = {};
  FIELDS.forEach(function (f) {
    var i = headers.indexOf(f.title);
    rec[f.key] = i === -1 ? '' : row[i];
  });
  return rec;
}

/* ---------- dates ---------- */

function keyParts_(key) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
/** Whole years between two date keys, or null. */
function ageOn(dobKey, todayKey) {
  var b = keyParts_(dobKey), t = keyParts_(todayKey);
  if (!b || !t) return null;
  var age = t.y - b.y;
  if (t.m < b.m || (t.m === b.m && t.d < b.d)) age--;
  return age;
}
function usDate(key) {
  var p = keyParts_(key);
  if (!p) return '';
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  return two(p.m) + '/' + two(p.d) + '/' + p.y;
}

/* ---------- formatting ---------- */

function formatPhone(v) {
  var digits = String(v || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
  if (digits.length !== 10) return String(v || '').trim();
  return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
}

/**
 * Patient-typed text that is copied into a sheet cell must never start a formula:
 * "=IMPORTDATA(...)" in a last name could send data to an outside site.
 * A leading apostrophe makes Sheets store it as plain text.
 */
function safeCell(v) {
  var s = String(v === null || v === undefined ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function patientLabel(rec) {
  var last = String(rec.lastName || '').trim();
  var first = String(rec.firstName || '').trim();
  return safeCell(last ? last + ', ' + (first ? first.charAt(0).toUpperCase() + '.' : '') : '(no name)');
}

function isSelfPay(rec) { return rec.hasInsurance !== 'Yes'; }

function blank_(v) { return v === '' || v === null || v === undefined || String(v).trim() === ''; }

/* ---------- checks ---------- */

/** rec uses 'yyyy-MM-dd' keys for dob and subscriberDob. Returns a list of flag strings. */
function validateIntake(rec, todayKey) {
  var flags = [];
  if (!isSelfPay(rec) && (blank_(rec.insurer) || blank_(rec.memberId))) flags.push('Insurance details missing');
  if (!isSelfPay(rec) && rec.isSubscriber === 'No' && (blank_(rec.subscriberName) || blank_(rec.subscriberDob))) {
    flags.push('Policyholder details missing');
  }
  var age = ageOn(rec.dob, todayKey);
  if (age === null || age < 0 || age > 120) {
    flags.push('Check date of birth');
  } else if (age < 18) {
    flags.push('Minor: guardian consent and ID needed');
  } else {
    var sig = String(rec.signature || '').toLowerCase();
    var last = String(rec.lastName || '').trim().toLowerCase();
    if (last && sig.indexOf(last) === -1) flags.push('Check signature');
  }
  if (blank_(rec.ecName) || blank_(rec.ecPhone)) flags.push('No emergency contact');
  return flags;
}

/** checks: {item title: true/false}. Returns 'Complete' or 'Waiting: ...'. */
function checklistStatus(checks, selfPay) {
  var waiting = CHECK_ITEMS.filter(function (item) {
    if (item === 'Insurance card received' && selfPay) return false;
    return checks[item] !== true;
  }).map(function (item) {
    return { 'Insurance card received': 'insurance card', 'Photo ID received': 'photo ID',
      'Forms signed': 'signed forms', 'Entered in EHR': 'EHR entry' }[item];
  });
  return waiting.length ? 'Waiting: ' + waiting.join(', ') : 'Complete';
}

function nextIntakeId(existingIds) {
  var max = 0;
  existingIds.forEach(function (id) {
    var m = new RegExp('^' + ID_PREFIX + '(\\d+)$', 'i').exec(String(id || '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  });
  var n = String(max + 1);
  while (n.length < 4) n = '0' + n;
  return ID_PREFIX + n;
}

/** Days since an intake was submitted, for clean-up. */
function daysSince(fromKey, todayKey) {
  var a = keyParts_(fromKey), b = keyParts_(todayKey);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 864e5);
}

/** An intake can be cleaned up once it's in the EHR and old enough. */
function readyForCleanup(enteredInEhr, submittedKey, todayKey, keepDays) {
  var age = daysSince(submittedKey, todayKey);
  return enteredInEhr === true && age !== null && age >= (Number(keepDays) >= 0 ? Number(keepDays) : 30);
}

/* ---------- summary doc ---------- */

/**
 * The summary as plain data; Code.js turns it into a Google Doc.
 * Returns {docName, title, subtitle, flags, sections: [{heading, rows: [[label, value]]}]}.
 */
function buildSummary(rec, intakeId, submittedKey, todayKey) {
  var v = function (key) {
    var f = null;
    for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].key === key) f = FIELDS[i];
    var val = rec[key];
    if (f && f.type === 'date') return usDate(val);
    if (f && f.type === 'phone') return formatPhone(val);
    if (f && f.type === 'agree') return val ? 'Agreed' : 'NOT agreed';
    return blank_(val) ? '' : String(val).trim();
  };
  var age = ageOn(rec.dob, todayKey);
  var sections = [
    { heading: 'About the patient', rows: [
      ['Legal name', v('firstName') + ' ' + v('lastName')],
      ['Preferred name', v('preferredName')],
      ['Date of birth', v('dob') + (age !== null && age >= 0 ? ' (age ' + age + ')' : '')],
      ['Sex on insurance', v('sex')]
    ] },
    { heading: 'Contact', rows: [
      ['Mobile phone', v('phone')],
      ['Email', v('email')],
      ['Address', [v('street'), [v('city'), v('state')].filter(Boolean).join(', ') + ' ' + v('zip')].join('\n').trim()],
      ['Best way to reach', v('contactPref')],
      ['Reminders', v('reminders')]
    ] },
    { heading: 'Insurance', rows: isSelfPay(rec)
      ? [['Coverage', 'Self-pay']]
      : [
        ['Insurance company', v('insurer')],
        ['Member ID', v('memberId')],
        ['Group number', v('groupNumber')],
        ['Patient is policyholder', v('isSubscriber')]
      ].concat(rec.isSubscriber === 'No' ? [
        ['Policyholder', v('subscriberName')],
        ['Policyholder date of birth', v('subscriberDob')],
        ['Relationship', v('relationship')]
      ] : []) },
    { heading: 'Emergency contact', rows: [
      ['Name', v('ecName')],
      ['Relationship', v('ecRelationship')],
      ['Phone', v('ecPhone')]
    ] },
    { heading: 'Consents', rows: [
      ['Notice of Privacy Practices', v('consentNpp')],
      ['Consent to treatment', v('consentTreat')],
      ['Financial policy', v('consentFinancial')],
      ['Signed as', v('signature')],
      ['Signed on', usDate(submittedKey)]
    ] }
  ];
  return {
    docName: 'Intake ' + intakeId + ' (' + submittedKey + ')',
    title: 'New patient intake ' + intakeId,
    subtitle: 'Submitted ' + usDate(submittedKey) + '. Confidential: contains PHI. Delete after EHR entry.',
    flags: validateIntake(rec, todayKey),
    sections: sections
  };
}

/* ---------- sample data ---------- */

/** Made-up patients for demos. Every surname is "Test" and IDs are obviously fake. */
function sampleIntakes() {
  var base = {
    firstName: 'Jane', lastName: 'Test', preferredName: '', dob: '1980-01-01', sex: 'Female',
    phone: '5550100001', email: 'jane.test@example.com', street: '100 Sample St', city: 'Springfield', state: 'IL', zip: '62701',
    contactPref: 'Text message', reminders: 'Text and email', hasInsurance: 'Yes', insurer: 'Demo Health PPO',
    memberId: 'DEMO000001', groupNumber: 'G-1000', isSubscriber: 'Yes', subscriberName: '', subscriberDob: '', relationship: '',
    ecName: 'John Test', ecRelationship: 'Spouse', ecPhone: '5550100002',
    consentNpp: AGREE, consentTreat: AGREE, consentFinancial: AGREE, signature: 'Jane Test'
  };
  var make = function (changes) {
    var r = {};
    Object.keys(base).forEach(function (k) { r[k] = base[k]; });
    Object.keys(changes).forEach(function (k) { r[k] = changes[k]; });
    return r;
  };
  return [
    make({}),
    make({ firstName: 'Sam', dob: '1975-06-15', sex: 'Male', phone: '5550100011', email: '', hasInsurance: 'No, I will pay myself',
      insurer: '', memberId: '', groupNumber: '', isSubscriber: '', signature: 'Sam Test' }),
    make({ firstName: 'Maya', dob: '2014-03-09', phone: '5550100021', email: 'parent.test@example.com', isSubscriber: 'No',
      subscriberName: 'Alex Test', subscriberDob: '1984-02-02', relationship: 'Child', signature: 'Alex Test (parent)', ecName: 'Alex Test' }),
    make({ firstName: 'Lee', dob: '1990-11-30', phone: '5550100031', insurer: '', memberId: '', signature: 'Lee Test' }),
    make({ firstName: 'Rosa', dob: '1962-08-20', phone: '5550100041', ecName: '', ecRelationship: '', ecPhone: '', reminders: 'No reminders', signature: 'Rosa T.' })
  ];
}
