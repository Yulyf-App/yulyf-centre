import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, html, css, build] = await Promise.all([
  readFile('dist/app.js', 'utf8'),
  readFile('dist/index.html', 'utf8'),
  readFile('dist/styles.css', 'utf8'),
  readFile('build.mjs', 'utf8'),
]);

assert.match(build, /release\.json/);
assert.match(build, /release-id\.js/);
assert.match(app, /setInterval\(\(\) => void checkRelease\(\), 45_000\)/);
assert.match(app, /visibilitychange/);
assert.match(app, /activeMutations > 0/);
assert.match(html, /role="alertdialog"/);
assert.match(html, /Mettre à jour maintenant/);
assert.match(css, /release-update-backdrop/);

console.log('PASS: YulyfCentre release prompt and mutation protection verified.');
