import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../dist/demo-navigation.css', import.meta.url), 'utf8');

assert.match(html, /class="demo-navigator"/, 'YulyfCentre doit proposer le menu DÉMOS.');
assert.match(html, /https:\/\/yulyf\.me\/backoffice/, 'Le BackofficeLYC doit être accessible.');
assert.match(html, /backoffice-demo\?role=practitioner/, 'La démo praticien doit être accessible avec son entrée technique.');
assert.match(html, /backoffice-demo\?role=patient/, 'La démo accompagné doit être accessible avec son entrée technique.');
assert.match(html, /class="demo-current"/, 'YulyfCentre doit être identifié comme espace actuel.');
assert.match(css, /\.demo-navigator > nav/, 'Le menu doit être présenté comme un vrai sélecteur.');

console.log('PASS: navigation YulyfCentre vers toutes les démonstrations.');
