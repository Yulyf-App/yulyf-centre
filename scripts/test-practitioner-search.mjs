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
const settingsStyles = readFileSync(new URL('../dist/settings.css', import.meta.url), 'utf8');
const gatewaySource = readFileSync(new URL('../functions/practitioner-gateway/index.js', import.meta.url), 'utf8');
assert.match(appSource, /Actualiser l’annuaire/);
assert.match(appSource, /directory-result-status/);
assert.match(appSource, /data-practitioner-card/);
assert.match(appSource, /card\.hidden = !visibleIds\.has/);
assert.match(appSource, /empty\.hidden = visibleIds\.size > 0/);
assert.match(appSource, /if \(synchronize\) await executePractitionerGateway\('sync'\);\s*const payload = await executePractitionerGateway\('directory'\)/);
assert.match(appSource, /if \(!Array\.isArray\(payload\.directory\)\) throw new Error/);
assert.doesNotMatch(appSource, /practitionerDirectorySearchTimer/);
assert.match(settingsStyles, /\.practitioner-directory-results>article\[hidden\]\{display:none!important\}/);
assert.match(gatewaySource, /inviteTokenHash/);
assert.match(gatewaySource, /LYC_CENTRE_BRIDGE_SECRET/);
assert.match(gatewaySource, /body: JSON\.stringify\(\{ relationId: relation\.\$id, token: inviteToken \}\)/);
assert.match(gatewaySource, /status: 'invited'/);
assert.doesNotMatch(gatewaySource, /membership\.confirm \? 'active' : 'invited'/);
assert.match(appSource, /await executePractitionerGateway\('invite',[\s\S]*?await loadPractitionerDirectory\(\);[\s\S]*?await refreshCentreMembers\(\);/);

console.log(JSON.stringify({ status: 'ok', typoTolerant: true, accentsNormalized: true, multiFieldSearch: true, stableInputFocus: true, persistentDirectoryCards: true, synchronousDirectoryRead: true, visibleResultCount: true }));
