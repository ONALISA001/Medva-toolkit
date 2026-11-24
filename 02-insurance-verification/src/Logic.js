/**
 * Pure logic for the Insurance Verification Toolkit. No Google services here,
 * so it can be tested with Node (see test/logic.test.js).
 * The form, the sheet columns and the checks are all built from FIELDS.
 */

var PLAN_TYPES = [
  'Commercial PPO',
  'Commercial HMO',
  'High-deductible (HSA)',
  'Medicare',
  'Medicare Advantage',
  'Medicaid / Medicaid MCO',
  'Secondary / supplemental',
  'Other'
];
var REFERRAL_PLANS = ['Commercial HMO', 'Medicare Advantage', 'Medicaid / Medicaid MCO'];
var YES_NO_UNKNOWN = ['Yes', 'No', 'Unknown'];
var METHODS = ['Payer portal', 'Clearinghouse', 'Phone call'];

var FIELDS = [
  { key: 'account', title: 'Patient account # (from EHR)', type: 'text', required: true,
    help: 'The EHR account or chart number only. No names, dates of birth or member IDs.' },
  { key: 'apptDate', title: 'Appointment date', type: 'date', required: true },
  { key: 'payer', title: 'Payer', type: 'text', required: true },
  { key: 'planType', title: 'Plan type', type: 'list', options: PLAN_TYPES, required: true },
  { key: 'method', title: 'How you verified', type: 'choice', options: METHODS, required: true },
  { key: 'active', title: 'Coverage active on date of service', type: 'choice', options: YES_NO_UNKNOWN, required: true },
  { key: 'inNetwork', title: 'Provider in network', type: 'choice', options: YES_NO_UNKNOWN },
  { key: 'copay', title: 'Copay ($)', type: 'money' },
  { key: 'coinsurance', title: 'Coinsurance (%)', type: 'percent' },
  { key: 'deductible', title: 'Deductible ($)', type: 'money' },
  { key: 'deductibleMet', title: 'Deductible met so far ($)', type: 'money' },
  { key: 'oopMax', title: 'Out-of-pocket max ($)', type: 'money' },
  { key: 'oopMet', title: 'Out-of-pocket met so far ($)', type: 'money' },
  { key: 'priorAuth', title: 'Prior authorization required', type: 'choice', options: YES_NO_UNKNOWN },
  { key: 'referral', title: 'Referral required', type: 'choice', options: ['Yes', 'No', 'Not applicable', 'Unknown'] },
  { key: 'refNumber', title: 'Reference number', type: 'text',
    help: 'Call reference number, or the portal / clearinghouse transaction ID.' },
  { key: 'repName', title: 'Payer rep name', type: 'text', help: 'For phone calls.' },
  { key: 'staff', title: 'Your initials', type: 'text', required: true },
  { key: 'notes', title: 'Notes', type: 'paragraph',
    help: 'Benefit details only, such as visit limits or carve-outs. No diagnoses or clinical information.' }
];

var STATUS_COLUMNS = ['Status', 'Missing info', 'Flags', 'Deductible remaining ($)'];
var STATUS = { problem: 'Problem', missing: 'Missing info', action: 'Action needed', ready: 'Ready' };

function fieldTitle(key) {
  for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].key === key) return FIELDS[i].title;
  throw new Error('Unknown field ' + key);
}

function isBlank_(v) {
  return v === '' || v === null || v === undefined || String(v).trim() === '' || String(v).trim() === 'Unknown';
}

function num_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(String(v).replace(/[$,%\s]/g, ''));
  return isFinite(n) ? n : NaN;
}

/**
 * record: an object keyed by FIELDS keys.
 * Returns {status, missing: [titles], problems: [text], actions: [text], deductibleRemaining: number|''}
 */
function checkVerification(record) {
  var r = record || {};
  var missing = [], problems = [], actions = [];
  var need = function (key) { if (isBlank_(r[key])) missing.push(fieldTitle(key)); };

  ['account', 'apptDate', 'payer', 'planType', 'method', 'active', 'staff', 'refNumber'].forEach(need);
  if (r.method === 'Phone call') need('repName');

  if (r.active === 'No') {
    problems.push('Coverage inactive');
  } else if (r.active === 'Yes') {
    need('inNetwork');
    if (isBlank_(r.copay) && isBlank_(r.coinsurance)) missing.push('Copay or coinsurance');
    need('deductible');
    need('deductibleMet');
    need('priorAuth');
    if (REFERRAL_PLANS.indexOf(r.planType) !== -1 &&
        (isBlank_(r.referral) || r.referral === 'Not applicable')) {
      missing.push(fieldTitle('referral'));
    }
    if (isBlank_(r.oopMax) !== isBlank_(r.oopMet)) {
      missing.push(isBlank_(r.oopMax) ? fieldTitle('oopMax') : fieldTitle('oopMet'));
    }
  }

  if (r.inNetwork === 'No') problems.push('Out of network');

  var nums = {};
  ['copay', 'coinsurance', 'deductible', 'deductibleMet', 'oopMax', 'oopMet'].forEach(function (k) {
    nums[k] = num_(r[k]);
    if (nums[k] !== null && (isNaN(nums[k]) || nums[k] < 0)) problems.push(fieldTitle(k) + ' is not a valid amount');
  });
  if (nums.coinsurance > 100) problems.push('Coinsurance is over 100%');
  if (nums.deductible !== null && nums.deductibleMet > nums.deductible) {
    problems.push('Deductible met is more than the deductible');
  }
  if (nums.oopMax !== null && nums.oopMet > nums.oopMax) {
    problems.push('Out-of-pocket met is more than the max');
  }

  if (r.priorAuth === 'Yes') actions.push('Prior auth required');
  if (r.referral === 'Yes') actions.push('Referral required');

  var remaining = '';
  if (nums.deductible !== null && nums.deductibleMet !== null &&
      !isNaN(nums.deductible) && !isNaN(nums.deductibleMet)) {
    remaining = Math.max(0, Math.round((nums.deductible - nums.deductibleMet) * 100) / 100);
  }

  var status = problems.length ? STATUS.problem
    : missing.length ? STATUS.missing
    : actions.length ? STATUS.action
    : STATUS.ready;

  return { status: status, missing: missing, problems: problems, actions: actions, deductibleRemaining: remaining };
}

/** The four values written into the status columns, in STATUS_COLUMNS order. */
function statusCells(result) {
  return [
    result.status,
    result.missing.join(', '),
    result.problems.concat(result.actions).join('; '),
    result.deductibleRemaining
  ];
}

/** Turns a sheet row into a record, using the header titles to find each field. */
function rowToRecord(headers, row) {
  var rec = {};
  FIELDS.forEach(function (f) {
    var i = headers.indexOf(f.title);
    rec[f.key] = i === -1 ? '' : row[i];
  });
  return rec;
}

/** Rows for the printable Call Script tab: [section, question, answer line]. */
function buildCallScript() {
  var B = '______________________';
  var rows = [];
  var add = function (section, list) { list.forEach(function (q, i) { rows.push([i ? '' : section, q, B]); }); };
  add('Before the call', [
    'Patient account # (from EHR)',
    'Appointment date and visit type',
    'CPT code(s) for the visit, if known',
    'Have the member ID and date of birth open in the EHR. Read them out; do not write them here.'
  ]);
  add('Opening', [
    '"Hi, this is [first name] from [practice], NPI [group NPI]. I am verifying benefits for an upcoming visit."',
    'Rep name',
    'Call reference number'
  ]);
  add('Coverage', [
    '"Is coverage active on the date of service?"  Yes / No',
    '"What are the effective and term dates?"',
    '"What is the plan type?"',
    '"Is our practice and the rendering provider in network?"  Yes / No'
  ]);
  add('Cost share', [
    '"What is the copay for this visit type?"  $',
    '"Is there coinsurance? What percent?"  %',
    '"What is the individual deductible, and how much is met?"  $ / met $',
    '"What is the out-of-pocket max, and how much is met?"  $ / met $',
    'High-deductible plans: "Does the deductible apply before the copay?"  Yes / No'
  ]);
  add('Authorization and referrals', [
    '"Does this service need prior authorization?"  Yes / No',
    'HMO, Medicare Advantage, Medicaid: "Is a referral required? Who is the assigned PCP?"',
    '"Are there visit limits? How many are used?"'
  ]);
  add('Other coverage', [
    'Secondary plans: "Who is primary? What is the coordination-of-benefits date?"',
    'Medicaid: "Is there a share of cost this month?"  $'
  ]);
  add('Close', [
    '"Can you confirm the reference number?" Read it back.',
    'Enter the answers in the verification form, not on paper you keep.'
  ]);
  return rows;
}

/** Made-up verifications for demos. Accounts are TEST-#### and no patient names appear. */
function sampleVerifications() {
  var base = {
    payer: 'Aetna', planType: 'Commercial PPO', method: 'Payer portal', active: 'Yes', inNetwork: 'Yes',
    copay: 30, coinsurance: 20, deductible: 1500, deductibleMet: 400, oopMax: 6000, oopMet: 900,
    priorAuth: 'No', referral: 'No', refNumber: 'ELG-55821', repName: '', staff: 'JM', notes: '(sample)'
  };
  var make = function (account, changes) {
    var r = {};
    Object.keys(base).forEach(function (k) { r[k] = base[k]; });
    Object.keys(changes).forEach(function (k) { r[k] = changes[k]; });
    r.account = account;
    return r;
  };
  return [
    make('TEST-1001', {}),
    make('TEST-1002', { payer: 'UnitedHealthcare', method: 'Phone call', refNumber: 'C-88213', repName: 'Dana' }),
    make('TEST-1003', { payer: 'Humana', planType: 'Medicare Advantage', referral: 'Yes', copay: 0, coinsurance: '' }),
    make('TEST-1004', { payer: 'Cigna', priorAuth: 'Yes', notes: 'MRI needs auth (sample)' }),
    make('TEST-1005', { payer: 'BCBS', active: 'No', inNetwork: '', copay: '', coinsurance: '', deductible: '', deductibleMet: '', oopMax: '', oopMet: '', priorAuth: '', referral: '', notes: 'Plan termed last month (sample)' }),
    make('TEST-1006', { payer: 'Medicaid MCO', planType: 'Medicaid / Medicaid MCO', referral: '', copay: 0, coinsurance: '', deductible: 0, deductibleMet: 0 }),
    make('TEST-1007', { payer: 'Ambetter', inNetwork: 'No' }),
    make('TEST-1008', { method: 'Phone call', refNumber: '', repName: '', deductibleMet: '' })
  ];
}
