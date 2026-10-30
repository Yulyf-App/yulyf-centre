import assert from 'node:assert/strict';
import { matchesPractitionerSearch, normalizePractitionerSearch } from '../dist/practitioner-search.js';

const practitioner = {
  name: 'Praticien technique C',
  email: 'auditstructu@outlook.com',
  practitionerNumber: 'YUL-2026-603115',
  activity: 'Coach technique',
};

assert.equal(normalizePractitionerSearch('practicien technique'), 'praticien technique');
assert.equal(matchesPractitionerSearch(practitioner, 'practicien technique'), true);
assert.equal(matchesPractitionerSearch(practitioner, 'YUL-2026-603115'), true);
assert.equal(matchesPractitionerSearch(practitioner, 'auditstructu@outlook.com'), true);
assert.equal(matchesPractitionerSearch(practitioner, 'médecin absent'), false);

console.log(JSON.stringify({ status: 'ok', typoTolerant: true, accentsNormalized: true, multiFieldSearch: true }));
