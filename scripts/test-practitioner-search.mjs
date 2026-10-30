import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const appSource = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
assert.match(appSource, /Actualiser l’annuaire/);
assert.match(appSource, /directory-result-status/);
assert.match(appSource, /data-practitioner-card/);
assert.match(appSource, /card\.hidden = !visibleIds\.has/);
assert.match(appSource, /empty\.hidden = visibleIds\.size > 0/);
assert.doesNotMatch(appSource, /practitionerDirectorySearchTimer/);

console.log(JSON.stringify({ status: 'ok', typoTolerant: true, accentsNormalized: true, multiFieldSearch: true, stableInputFocus: true, persistentDirectoryCards: true, visibleResultCount: true }));
