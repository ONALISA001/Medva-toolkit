/**
 * Clinic HIPAA Security Checklist: questions, weights, fixes and scoring.
 * Works in the browser (window.Checklist) and in Node (module.exports), so it can be tested.
 * No patient data is involved anywhere in this file.
 */
(function (root) {
  'use strict';

  var AREAS = [
    { id: 'pw', name: 'Passwords and sign-in' },
    { id: 'dev', name: 'Computers and phones' },
    { id: 'acc', name: 'Shared logins and access' },
    { id: 'net', name: 'Wi-Fi and network' },
    { id: 'mail', name: 'Email' },
    { id: 'bak', name: 'Backups' },
    { id: 'baa', name: 'Vendors and BAAs' },
    { id: 'train', name: 'Training and policies' },
    { id: 'phish', name: 'Phishing' }
  ];

  // weight: 3 = critical, 2 = important, 1 = good practice
  var QUESTIONS = [
    { id: 'pw1', area: 'pw', weight: 3, q: 'Two-step sign-in (2FA) is turned on for every clinic email account.',
      fix: 'Turn on two-step sign-in for every email account. It blocks most account takeovers, even when a password leaks.' },
    { id: 'pw2', area: 'pw', weight: 3, q: 'Two-step sign-in is turned on for the EHR and practice management system.',
      fix: 'Turn on two-step sign-in in the EHR and practice management system. Ask the vendor if you can\'t find the setting.' },
    { id: 'pw3', area: 'pw', weight: 2, q: 'Staff use a password manager or unique passwords, not one password everywhere.',
      fix: 'Give staff a password manager so every system gets its own strong password.' },
    { id: 'pw4', area: 'pw', weight: 2, q: 'Default passwords on the router, printers and office software have been changed.',
      fix: 'Change the factory passwords on the router, printers, fax and any office software.' },

    { id: 'dev1', area: 'dev', weight: 3, q: 'Every laptop and desktop that touches patient data has full-disk encryption on (BitLocker or FileVault).',
      fix: 'Turn on BitLocker (Windows) or FileVault (Mac) on every work computer. A lost encrypted laptop is usually not a reportable breach; an unencrypted one is.' },
    { id: 'dev2', area: 'dev', weight: 2, q: 'Phones that get work email have a passcode and can be wiped remotely.',
      fix: 'Require a passcode on any phone with work email, and set up remote wipe in Google Workspace or Microsoft 365.' },
    { id: 'dev3', area: 'dev', weight: 2, q: 'Computers lock automatically after a few minutes of no use.',
      fix: 'Set every computer to lock after 5 minutes idle so an open screen at the front desk can\'t be read or used.' },
    { id: 'dev4', area: 'dev', weight: 2, q: 'Computers and browsers install security updates automatically.',
      fix: 'Turn on automatic updates for Windows or macOS and for browsers. Most attacks use holes that already have a fix.' },

    { id: 'acc1', area: 'acc', weight: 3, q: 'Every person has their own login. Nobody shares a username.',
      fix: 'Give every person their own login. Shared logins make it impossible to tell who opened a record.' },
    { id: 'acc2', area: 'acc', weight: 2, q: 'Staff can only see the systems and records their job needs.',
      fix: 'Review each role and remove access people don\'t need, such as billing access for clinical staff.' },
    { id: 'acc3', area: 'acc', weight: 3, q: 'When someone leaves, all their access is removed the same day.',
      fix: 'Make a leaver checklist (email, EHR, portals, building, shared drives) and finish it on the person\'s last day.' },
    { id: 'acc4', area: 'acc', weight: 1, q: 'Someone reviews who has access to what at least every 3 months.',
      fix: 'Put a quarterly access review on the calendar and check every account still belongs to a current staff member.' },

    { id: 'net1', area: 'net', weight: 2, q: 'Office Wi-Fi uses WPA2 or WPA3 with a strong password.',
      fix: 'Switch office Wi-Fi to WPA2 or WPA3 and give it a long password that isn\'t posted on the wall.' },
    { id: 'net2', area: 'net', weight: 2, q: 'Patients and visitors use a separate guest Wi-Fi network.',
      fix: 'Set up a separate guest network so visitors\' devices can\'t reach clinic computers.' },
    { id: 'net3', area: 'net', weight: 2, q: 'Remote staff never handle patient data on public Wi-Fi without a VPN.',
      fix: 'Tell remote staff to use home Wi-Fi or a VPN for patient data, never coffee-shop or airport Wi-Fi.' },

    { id: 'mail1', area: 'mail', weight: 3, q: 'Clinic email is a business account covered by a BAA (Google Workspace or Microsoft 365), not personal Gmail or Yahoo.',
      fix: 'Move clinic email to Google Workspace or Microsoft 365 and sign their BAA. Personal email accounts aren\'t covered.' },
    { id: 'mail2', area: 'mail', weight: 3, q: 'Patient information is sent only by encrypted email or the patient portal.',
      fix: 'Turn on encrypted email (or use the patient portal) for anything containing patient information.' },
    { id: 'mail3', area: 'mail', weight: 2, q: 'Staff never forward work email to personal accounts.',
      fix: 'Write down a "no forwarding to personal email" rule and turn off automatic forwarding in the email admin settings.' },

    { id: 'bak1', area: 'bak', weight: 3, q: 'Patient data and key files are backed up automatically.',
      fix: 'Set up automatic daily backups. If the EHR is cloud-based, confirm in writing what the vendor backs up.' },
    { id: 'bak2', area: 'bak', weight: 2, q: 'At least one backup copy is kept off-site or in the cloud.',
      fix: 'Keep one backup copy away from the office, so a fire, theft or ransomware can\'t take every copy.' },
    { id: 'bak3', area: 'bak', weight: 2, q: 'Someone has tested restoring from backup in the last 12 months.',
      fix: 'Restore a few files from backup as a test. A backup that has never been restored may not work.' },

    { id: 'baa1', area: 'baa', weight: 2, q: 'There is a list of every outside company or person that handles patient data (EHR, billing, IT, answering service, VAs).',
      fix: 'List every vendor and contractor that sees patient data. You can\'t manage BAAs you don\'t know you need.' },
    { id: 'baa2', area: 'baa', weight: 3, q: 'Every vendor on that list has a signed Business Associate Agreement (BAA) on file.',
      fix: 'Get a signed BAA from every vendor on the list before they handle any more patient data.' },
    { id: 'baa3', area: 'baa', weight: 3, q: 'Nobody puts patient data into tools without a BAA (free AI chatbots, personal Dropbox, regular texting apps).',
      fix: 'Tell staff which tools are approved for patient data, and ban free AI chatbots, personal cloud storage and regular texting for it.' },

    { id: 'train1', area: 'train', weight: 2, q: 'Every staff member has HIPAA training when hired and again every year.',
      fix: 'Run short HIPAA training for new hires and once a year for everyone, and keep a record of who completed it.' },
    { id: 'train2', area: 'train', weight: 3, q: 'Staff know who to tell, and how fast, when something goes wrong (lost laptop, email to the wrong person).',
      fix: 'Name one person to report incidents to and tell staff to report the same day. Breach deadlines start from when you find out.' },
    { id: 'train3', area: 'train', weight: 1, q: 'There is a written security policy that staff have read.',
      fix: 'Write a short security policy covering the basics above and have every staff member sign that they read it.' },
    { id: 'train4', area: 'train', weight: 3, q: 'A HIPAA security risk analysis has been done in the last 12 months.',
      fix: 'Do a formal security risk analysis. HIPAA requires one, and it is the first document asked for in an audit. The free SRA Tool from HHS is a good start.' },

    { id: 'phish1', area: 'phish', weight: 2, q: 'Email has spam and phishing filtering turned on.',
      fix: 'Check that spam and phishing protection is on in Google Workspace or Microsoft 365, including attachment scanning.' },
    { id: 'phish2', area: 'phish', weight: 2, q: 'Staff have practiced spotting phishing emails in the last 12 months.',
      fix: 'Run a short phishing exercise or training so staff know what fake login pages and urgent payment requests look like.' },
    { id: 'phish3', area: 'phish', weight: 2, q: 'Requests to change payment details or send records are confirmed by calling a known number.',
      fix: 'Make it a rule: any request to change bank details or send records is confirmed by phone, using a number you already have.' }
  ];

  var ANSWERS = ['yes', 'no', 'unsure'];

  function band(pct) {
    if (pct === null) return 'Not started';
    if (pct >= 80) return 'Strong';
    if (pct >= 50) return 'Needs work';
    return 'At risk';
  }

  function pct_(earned, possible) {
    return possible ? Math.round((earned / possible) * 100) : null;
  }

  /**
   * answers: {questionId: 'yes' | 'no' | 'unsure'}; anything else is unanswered.
   * Returns {overall: {pct, band, earned, possible, answered, unanswered}, areas: [...], fixes: [...], complete}.
   */
  function score(answers) {
    answers = answers || {};
    var areas = AREAS.map(function (a) {
      return { id: a.id, name: a.name, earned: 0, possible: 0, unanswered: 0, gaps: 0 };
    });
    var byId = {};
    areas.forEach(function (a) { byId[a.id] = a; });
    var earned = 0, possible = 0, answered = 0, gapList = [];

    QUESTIONS.forEach(function (q, order) {
      var a = byId[q.area];
      var ans = answers[q.id];
      a.possible += q.weight;
      possible += q.weight;
      if (ANSWERS.indexOf(ans) === -1) { a.unanswered++; return; }
      answered++;
      if (ans === 'yes') { a.earned += q.weight; earned += q.weight; return; }
      a.gaps++;
      gapList.push({ id: q.id, area: a.name, weight: q.weight, order: order, unsure: ans === 'unsure',
        text: (ans === 'unsure' ? 'Find out: ' : '') + q.fix });
    });

    areas.forEach(function (a) {
      a.pct = pct_(a.earned, a.possible);
      a.band = a.unanswered === questionsIn(a.id).length ? 'Not started' : band(a.pct);
    });
    gapList.sort(function (x, y) { return y.weight - x.weight || x.order - y.order; });

    var overallPct = answered ? pct_(earned, possible) : null;
    return {
      overall: { pct: overallPct, band: band(overallPct), earned: earned, possible: possible,
        answered: answered, unanswered: QUESTIONS.length - answered },
      areas: areas,
      fixes: gapList.slice(0, 5),
      allGaps: gapList,
      complete: answered === QUESTIONS.length
    };
  }

  function questionsIn(areaId) {
    return QUESTIONS.filter(function (q) { return q.area === areaId; });
  }

  /** Plain-text report for the Copy button. */
  function reportText(result, clinicName, dateLabel) {
    var lines = [];
    lines.push('HIPAA security checklist' + (clinicName ? ': ' + clinicName : ''));
    if (dateLabel) lines.push(dateLabel);
    lines.push('');
    lines.push('Overall: ' + (result.overall.pct === null ? 'not started' : result.overall.pct + '% (' + result.overall.band + ')') +
      (result.overall.unanswered ? ', ' + result.overall.unanswered + ' question(s) unanswered' : ''));
    lines.push('');
    lines.push('By area:');
    result.areas.forEach(function (a) {
      lines.push('- ' + a.name + ': ' + (a.band === 'Not started' ? 'not started' : a.pct + '% (' + a.band + ')') +
        (a.unanswered && a.band !== 'Not started' ? ', ' + a.unanswered + ' unanswered' : ''));
    });
    lines.push('');
    if (result.fixes.length) {
      lines.push('Top ' + result.fixes.length + ' fixes:');
      result.fixes.forEach(function (f, i) { lines.push((i + 1) + '. ' + f.text); });
    } else if (result.complete) {
      lines.push('No gaps found. Keep reviewing these every year.');
    }
    lines.push('');
    lines.push('This checklist is a starting point, not legal advice and not a formal HIPAA security risk analysis.');
    return lines.join('\n');
  }

  var api = { AREAS: AREAS, QUESTIONS: QUESTIONS, ANSWERS: ANSWERS, score: score, band: band,
    questionsIn: questionsIn, reportText: reportText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Checklist = api;
})(this);
