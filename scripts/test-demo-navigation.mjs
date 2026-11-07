import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../dist/demo-navigation.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
const gateway = fs.readFileSync(new URL('../functions/practitioner-gateway/index.js', import.meta.url), 'utf8');

assert.match(html, /class="demo-navigator"/, 'YulyfCentre doit proposer le menu DÉMOS.');
assert.match(html, /https:\/\/yulyf\.me\/backoffice/, 'Le BackofficeLYC doit être accessible.');
assert.match(html, /data-demo-role="practitioner"/, 'La démo praticien doit utiliser le passage technique du centre.');
assert.match(html, /data-demo-role="patient"/, 'La démo accompagné doit utiliser le passage technique du centre.');
assert.doesNotMatch(html, /backoffice-demo\?role=/, 'Le Centre ne doit pas dépendre du cookie BackofficeLYC.');
assert.match(html, /class="demo-current"/, 'YulyfCentre doit être identifié comme espace actuel.');
assert.match(css, /\.demo-navigator > nav/, 'Le menu doit être présenté comme un vrai sélecteur.');
assert.match(app, /executePractitionerGateway\('demo_handoff'/, 'Le navigateur doit demander un transfert sécurisé à la passerelle interne.');
assert.match(app, /#technical-demo=/, 'Le transfert doit rester dans le fragment afin de ne pas apparaître dans les journaux HTTP.');
assert.match(gateway, /demoCentres/, 'La passerelle doit limiter le transfert aux centres de démonstration.');
assert.match(gateway, /expire: 120/, 'Le transfert doit expirer rapidement.');

console.log('PASS: navigation YulyfCentre vers toutes les démonstrations.');
